#!/usr/bin/env python3

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


GIT_EXECUTABLE = None


def parse_args():
    parser = argparse.ArgumentParser(description="Publish one exact fast-forward Git commit through the GitHub Git Data API.")
    parser.add_argument("--repo", required=True, help="Local repository path")
    parser.add_argument("--target", default="HEAD", help="Commit to publish")
    parser.add_argument("--branch", default="main", help="Remote branch")
    parser.add_argument("--remote", default="origin", help="Git remote")
    parser.add_argument("--repository", help="GitHub owner/repository override")
    parser.add_argument("--git", help="Git executable path")
    parser.add_argument("--jobs", type=int, default=8, help="Concurrent blob uploads")
    parser.add_argument("--tree-batch-size", type=int, default=50, help="Tree entries per GitHub request")
    parser.add_argument("--state-file", help="Resume-state path override")
    parser.add_argument("--dry-run", action="store_true", help="Verify readiness without writing to GitHub")
    parser.add_argument("--confirm-push", action="store_true", help="Required for a remote branch update")
    return parser.parse_args()


def configure_git(executable=None):
    global GIT_EXECUTABLE
    candidate = executable or os.environ.get("GIT_EXECUTABLE") or shutil.which("git")
    if not candidate:
        raise RuntimeError("Git was not found; pass --git with its full path")
    GIT_EXECUTABLE = candidate
    return candidate


def run_git(repo, *args, binary=False, input_bytes=None, timeout=120):
    if not GIT_EXECUTABLE:
        configure_git()
    result = subprocess.run(
        [GIT_EXECUTABLE, "-C", str(repo), *args],
        input=input_bytes,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
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
        [GIT_EXECUTABLE, "-C", str(repo), "-c", "credential.interactive=never", "credential", "fill"],
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
    def __init__(self, repository, token=None, timeout=60, attempts=6):
        self.base = f"https://api.github.com/repos/{repository}"
        self.token = token
        self.timeout = timeout
        self.attempts = attempts

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

        last_error = None
        for attempt in range(self.attempts):
            request = urllib.request.Request(
                f"{self.base}{path}",
                data=data,
                method=method,
                headers=headers,
            )
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    body = response.read()
                    return json.loads(body.decode("utf-8")) if body else {}
            except urllib.error.HTTPError as error:
                body = error.read().decode("utf-8", errors="replace")
                retry_after = error.headers.get("Retry-After")
                retryable = error.code == 429 or 500 <= error.code < 600 or (error.code == 403 and retry_after)
                last_error = RuntimeError(f"GitHub API {method} {path} failed with {error.code}: {body}")
                if not retryable or attempt + 1 == self.attempts:
                    raise last_error from error
                delay = float(retry_after) if retry_after else min(30, 2 ** attempt)
            except (urllib.error.URLError, TimeoutError) as error:
                last_error = RuntimeError(f"GitHub API {method} {path} failed: {error}")
                if attempt + 1 == self.attempts:
                    raise last_error from error
                delay = min(30, 2 ** attempt)
            time.sleep(delay)
        raise last_error


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


def tree_entries_by_path(repo, revision):
    entries = {}
    output = run_git(repo, "ls-tree", "-r", revision)
    for line in output.splitlines():
        metadata, path = line.split("\t", 1)
        mode, object_type, sha = metadata.split()
        if object_type == "blob":
            entries[path] = (mode, object_type, sha)
    return entries


def prepare_tree_entries(repo, target, parent, changes):
    target_entries = tree_entries_by_path(repo, target)
    parent_entries = tree_entries_by_path(repo, parent) if any(status == "D" for status, _ in changes) else {}
    entries = []
    for status, path in changes:
        if status == "D":
            if path not in parent_entries:
                raise RuntimeError(f"Git tree entry was not found: {parent}:{path}")
            mode, object_type, _ = parent_entries[path]
            entries.append({"path": path, "mode": mode, "type": object_type, "sha": None, "status": status})
            continue
        if path not in target_entries:
            raise RuntimeError(f"Git tree entry was not found: {target}:{path}")
        mode, object_type, sha = target_entries[path]
        entries.append({"path": path, "mode": mode, "type": object_type, "sha": sha, "status": status})
    return entries


def commit_metadata(repo, target):
    format_string = "%B%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI"
    output = subprocess.run(
        [GIT_EXECUTABLE, "-C", str(repo), "show", "-s", f"--format={format_string}", target],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    ).stdout.decode("utf-8")
    values = output.rstrip("\n").split("\x00")
    if len(values) != 7:
        raise RuntimeError("Could not parse local commit metadata")
    return values


def entries_digest(entries):
    payload = [{key: entry[key] for key in ("path", "mode", "type", "sha", "status")} for entry in entries]
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def blob_sizes(repo, shas):
    ordered = sorted(shas)
    if not ordered:
        return {}
    output = run_git(
        repo,
        "cat-file",
        "--batch-check=%(objectname) %(objecttype) %(objectsize)",
        input_bytes=("\n".join(ordered) + "\n").encode("ascii"),
    )
    sizes = {}
    for line in output.splitlines():
        sha, object_type, size = line.split()
        if object_type != "blob":
            raise RuntimeError(f"Expected blob object, found {object_type}: {sha}")
        sizes[sha] = int(size)
    if set(sizes) != set(ordered):
        raise RuntimeError("Git batch size query did not return every requested blob")
    return sizes


def read_blobs(repo, shas):
    ordered = sorted(shas)
    if not ordered:
        return {}
    result = subprocess.run(
        [GIT_EXECUTABLE, "-C", str(repo), "cat-file", "--batch"],
        input=("\n".join(ordered) + "\n").encode("ascii"),
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=120,
    )
    stream = io.BytesIO(result.stdout)
    contents = {}
    for expected in ordered:
        header = stream.readline().decode("ascii").strip().split()
        if len(header) != 3:
            raise RuntimeError(f"Invalid Git batch header for {expected}: {header}")
        actual, object_type, size = header
        if actual != expected or object_type != "blob":
            raise RuntimeError(f"Unexpected Git object for {expected}: {' '.join(header)}")
        content = stream.read(int(size))
        if len(content) != int(size) or stream.read(1) != b"\n":
            raise RuntimeError(f"Incomplete Git blob data for {expected}")
        contents[expected] = content
    return contents


class PublishState:
    def __init__(self, path, target, parent, parent_tree, digest):
        self.path = path
        self.lock = threading.Lock()
        self.identity = {
            "target": target,
            "parent": parent,
            "parentTree": parent_tree,
            "entriesDigest": digest,
        }
        self.data = self._load()

    def _load(self):
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                if all(data.get(key) == value for key, value in self.identity.items()):
                    data.setdefault("uploadedBlobs", [])
                    data.setdefault("treeIndex", 0)
                    data.setdefault("treeSha", self.identity["parentTree"])
                    return data
            except (OSError, ValueError):
                pass
        return {
            **self.identity,
            "uploadedBlobs": [],
            "treeIndex": 0,
            "treeSha": self.identity["parentTree"],
        }

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(json.dumps(self.data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(temporary, self.path)

    def uploaded(self):
        return set(self.data["uploadedBlobs"])

    def mark_blob(self, sha):
        with self.lock:
            uploaded = set(self.data["uploadedBlobs"])
            if sha not in uploaded:
                uploaded.add(sha)
                self.data["uploadedBlobs"] = sorted(uploaded)
                self.save()

    def tree_progress(self):
        return int(self.data["treeIndex"]), self.data["treeSha"]

    def mark_tree(self, index, sha):
        with self.lock:
            self.data["treeIndex"] = index
            self.data["treeSha"] = sha
            self.save()

    def clear(self):
        self.path.unlink(missing_ok=True)


def upload_blobs(api, repo, entries, state, jobs):
    unique = {}
    for entry in entries:
        if entry["sha"]:
            unique.setdefault(entry["sha"], entry["path"])
    pending = [(sha, path) for sha, path in unique.items() if sha not in state.uploaded()]
    if not pending:
        return len(unique), 0

    contents = read_blobs(repo, [sha for sha, _ in pending])
    completed = 0

    def upload(item):
        sha, path = item
        uploaded = api.call("POST", "/git/blobs", {
            "content": base64.b64encode(contents[sha]).decode("ascii"),
            "encoding": "base64",
        })["sha"]
        if uploaded != sha:
            raise RuntimeError(f"Blob mismatch for {path}: GitHub returned {uploaded}, expected {sha}")
        state.mark_blob(sha)
        return sha

    with ThreadPoolExecutor(max_workers=max(1, jobs)) as executor:
        futures = [executor.submit(upload, item) for item in pending]
        for future in as_completed(futures):
            future.result()
            completed += 1
            if completed == len(pending) or completed % 25 == 0:
                print(f"Uploaded blobs: {completed}/{len(pending)}", flush=True)
    return len(unique), len(pending)


def create_tree_in_batches(api, entries, parent_tree, local_tree, state, batch_size):
    start, current_tree = state.tree_progress()
    if start < 0 or start > len(entries):
        raise RuntimeError(f"Invalid saved tree index: {start}")
    if start == 0:
        current_tree = parent_tree

    for index in range(start, len(entries), max(1, batch_size)):
        end = min(len(entries), index + max(1, batch_size))
        batch = [
            {key: entry[key] for key in ("path", "mode", "type", "sha")}
            for entry in entries[index:end]
        ]
        current_tree = api.call("POST", "/git/trees", {
            "base_tree": current_tree,
            "tree": batch,
        })["sha"]
        state.mark_tree(end, current_tree)
        print(f"Created tree entries: {end}/{len(entries)}", flush=True)

    if current_tree != local_tree:
        raise RuntimeError(f"Tree mismatch: GitHub returned {current_tree}, expected {local_tree}")
    return current_tree


def publish_commit(
    repo,
    target="HEAD",
    branch="main",
    remote="origin",
    repository=None,
    git=None,
    jobs=8,
    tree_batch_size=50,
    state_file=None,
    dry_run=False,
    confirm_push=False,
):
    configure_git(git)
    repo = Path(repo).resolve()
    if not (repo / ".git").exists():
        raise RuntimeError(f"Not a Git repository: {repo}")
    if not dry_run and not confirm_push:
        raise RuntimeError("Use --confirm-push for a remote update, or --dry-run for verification")

    target = run_git(repo, "rev-parse", target)
    parent = run_git(repo, "rev-parse", f"{target}^")
    repository = repository or repository_from_remote(run_git(repo, "remote", "get-url", remote))
    branch_path = urllib.parse.quote(branch, safe="")
    public_api = GitHubApi(repository)
    remote_sha = public_api.call("GET", f"/git/ref/heads/{branch_path}")["object"]["sha"]

    state_path = Path(state_file).resolve() if state_file else repo / ".git" / "codex-publish" / f"{target}.json"
    if remote_sha == target:
        if not dry_run:
            state_path.unlink(missing_ok=True)
        return {"status": "already_published", "branch": branch, "sha": target}
    if remote_sha != parent:
        raise RuntimeError(f"Remote {branch} is {remote_sha}, expected target parent {parent}; refusing update")

    changes = changed_paths(repo, target)
    entries = prepare_tree_entries(repo, target, parent, changes)
    local_tree = run_git(repo, "rev-parse", f"{target}^{{tree}}")
    parent_tree = run_git(repo, "rev-parse", f"{parent}^{{tree}}")
    blob_shas = {entry["sha"] for entry in entries if entry["sha"]}
    total_bytes = sum(blob_sizes(repo, blob_shas).values())

    if dry_run:
        return {
            "status": "ready",
            "repository": repository,
            "branch": branch,
            "parent": parent,
            "target": target,
            "tree": local_tree,
            "files": len(entries),
            "blobs": len(blob_shas),
            "bytes": total_bytes,
            "stateFile": str(state_path),
        }

    api = GitHubApi(repository, github_token(repo))
    state = PublishState(state_path, target, parent, parent_tree, entries_digest(entries))
    state.save()
    blob_count, uploaded_now = upload_blobs(api, repo, entries, state, jobs)
    created_tree = create_tree_in_batches(api, entries, parent_tree, local_tree, state, tree_batch_size)

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
    state.clear()

    tracking_updated = True
    try:
        run_git(repo, "update-ref", f"refs/remotes/{remote}/{branch}", target)
    except (subprocess.CalledProcessError, PermissionError):
        tracking_updated = False

    return {
        "status": "published",
        "branch": branch,
        "previous": remote_sha,
        "sha": verified,
        "files": len(entries),
        "blobs": blob_count,
        "uploadedNow": uploaded_now,
        "bytes": total_bytes,
        "trackingUpdated": tracking_updated,
    }


def main():
    args = parse_args()
    result = publish_commit(
        repo=args.repo,
        target=args.target,
        branch=args.branch,
        remote=args.remote,
        repository=args.repository,
        git=args.git,
        jobs=args.jobs,
        tree_batch_size=args.tree_batch_size,
        state_file=args.state_file,
        dry_run=args.dry_run,
        confirm_push=args.confirm_push,
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
