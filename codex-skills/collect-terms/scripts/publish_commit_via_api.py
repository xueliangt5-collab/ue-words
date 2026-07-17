#!/usr/bin/env python3

import argparse
import base64
import json
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Publish one exact fast-forward Git commit through the GitHub Git Data API.")
    parser.add_argument("--repo", required=True, help="Local repository path")
    parser.add_argument("--target", default="HEAD", help="Commit to publish")
    parser.add_argument("--branch", default="main", help="Remote branch")
    parser.add_argument("--remote", default="origin", help="Git remote")
    parser.add_argument("--repository", help="GitHub owner/repository override")
    parser.add_argument("--dry-run", action="store_true", help="Verify readiness without writing to GitHub")
    parser.add_argument("--confirm-push", action="store_true", help="Required for a remote branch update")
    return parser.parse_args()


def run_git(repo, *args, binary=False, input_bytes=None):
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        input=input_bytes,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ).stdout
    return result if binary else result.decode("utf-8").strip()


def repository_from_remote(url):
    patterns = [
        r"^https://github\.com/([^/]+/[^/]+?)(?:\.git)?$",
        r"^git@github\.com:([^/]+/[^/]+?)(?:\.git)?$",
        r"^ssh://git@github\.com/([^/]+/[^/]+?)(?:\.git)?$",
    ]
    for pattern in patterns:
        match = re.match(pattern, url.strip())
        if match:
            return match.group(1)
    raise RuntimeError(f"Unsupported GitHub remote URL: {url}")


def github_token(repo):
    environment = os.environ.copy()
    environment["GIT_TERMINAL_PROMPT"] = "0"
    credentials = subprocess.run(
        ["git", "-C", str(repo), "-c", "credential.interactive=never", "credential", "fill"],
        input=b"protocol=https\nhost=github.com\n\n",
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=environment,
        timeout=15,
    ).stdout.decode("utf-8")
    values = dict(line.split("=", 1) for line in credentials.splitlines() if "=" in line)
    token = values.get("password")
    if not token:
        raise RuntimeError("Git credential manager returned no stored GitHub token; interactive login is disabled")
    return token


class GitHubApi:
    def __init__(self, repository, token=None):
        self.base = f"https://api.github.com/repos/{repository}"
        self.token = token

    def call(self, method, path, payload=None):
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "collect-terms",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(
            f"{self.base}{path}",
            data=data,
            method=method,
            headers=headers,
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"GitHub API {method} {path} failed with {error.code}: {body}") from error


def changed_paths(repo, target):
    changes = []
    output = run_git(repo, "diff-tree", "--no-commit-id", "--name-status", "-r", target)
    for line in output.splitlines():
        fields = line.split("\t")
        status = fields[0][:1]
        if status not in {"A", "M", "D"} or len(fields) != 2:
            raise RuntimeError(f"Unsupported commit change: {line}")
        changes.append((status, fields[1]))
    if not changes:
        raise RuntimeError("Target commit contains no file changes")
    return changes


def commit_metadata(repo, target):
    format_string = "%B%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI"
    output = subprocess.run(
        ["git", "-C", str(repo), "show", "-s", f"--format={format_string}", target],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ).stdout.decode("utf-8")
    values = output.rstrip("\n").split("\x00")
    if len(values) != 7:
        raise RuntimeError("Could not parse local commit metadata")
    return values


def main():
    args = parse_args()
    repo = Path(args.repo).resolve()
    if not (repo / ".git").exists():
        raise RuntimeError(f"Not a Git repository: {repo}")
    if not args.dry_run and not args.confirm_push:
        raise RuntimeError("Use --confirm-push for a remote update, or --dry-run for verification")

    target = run_git(repo, "rev-parse", args.target)
    parent = run_git(repo, "rev-parse", f"{target}^")
    repository = args.repository or repository_from_remote(run_git(repo, "remote", "get-url", args.remote))
    api = GitHubApi(repository)
    branch_path = urllib.parse.quote(args.branch, safe="")
    remote = api.call("GET", f"/git/ref/heads/{branch_path}")["object"]["sha"]

    if remote == target:
        print(json.dumps({"status": "already_published", "branch": args.branch, "sha": target}))
        return
    if remote != parent:
        raise RuntimeError(f"Remote {args.branch} is {remote}, expected target parent {parent}; refusing update")

    changes = changed_paths(repo, target)
    local_tree = run_git(repo, "rev-parse", f"{target}^{{tree}}")
    if args.dry_run:
        print(json.dumps({
            "status": "ready",
            "repository": repository,
            "branch": args.branch,
            "parent": parent,
            "target": target,
            "tree": local_tree,
            "files": [path for _, path in changes],
        }))
        return

    api = GitHubApi(repository, github_token(repo))

    tree_entries = []
    for status, path in changes:
        if status == "D":
            tree_entries.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
            continue
        tree_line = run_git(repo, "ls-tree", target, "--", path)
        metadata, _ = tree_line.split("\t", 1)
        mode, object_type, local_blob = metadata.split()
        content = run_git(repo, "show", f"{target}:{path}", binary=True)
        uploaded = api.call("POST", "/git/blobs", {
            "content": base64.b64encode(content).decode("ascii"),
            "encoding": "base64",
        })["sha"]
        if uploaded != local_blob:
            raise RuntimeError(f"Blob mismatch for {path}: GitHub returned {uploaded}, expected {local_blob}")
        tree_entries.append({"path": path, "mode": mode, "type": object_type, "sha": uploaded})

    parent_tree = run_git(repo, "rev-parse", f"{parent}^{{tree}}")
    created_tree = api.call("POST", "/git/trees", {"base_tree": parent_tree, "tree": tree_entries})["sha"]
    if created_tree != local_tree:
        raise RuntimeError(f"Tree mismatch: GitHub returned {created_tree}, expected {local_tree}")

    message, author_name, author_email, author_date, committer_name, committer_email, committer_date = commit_metadata(repo, target)
    created_commit = api.call("POST", "/git/commits", {
        "message": message,
        "tree": created_tree,
        "parents": [parent],
        "author": {"name": author_name, "email": author_email, "date": author_date},
        "committer": {"name": committer_name, "email": committer_email, "date": committer_date},
    })["sha"]
    if created_commit != target:
        raise RuntimeError(f"Commit mismatch: GitHub returned {created_commit}, expected {target}; remote ref was not changed")

    api.call("PATCH", f"/git/refs/heads/{branch_path}", {"sha": target, "force": False})
    verified = api.call("GET", f"/git/ref/heads/{branch_path}")["object"]["sha"]
    if verified != target:
        raise RuntimeError(f"Remote verification failed: found {verified}, expected {target}")
    run_git(repo, "update-ref", f"refs/remotes/{args.remote}/{args.branch}", target)
    print(json.dumps({"status": "published", "branch": args.branch, "previous": remote, "sha": verified, "files": len(changes)}))


if __name__ == "__main__":
    main()
