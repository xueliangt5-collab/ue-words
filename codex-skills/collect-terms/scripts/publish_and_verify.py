#!/usr/bin/env python3

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.dont_write_bytecode = True
import publish_commit_via_api as publisher


def parse_args():
    parser = argparse.ArgumentParser(description="Publish one glossary commit and verify its GitHub Pages deployment.")
    parser.add_argument("--repo", required=True, help="Local repository path")
    parser.add_argument("--target", default="HEAD", help="Commit to publish and verify")
    parser.add_argument("--branch", default="main", help="Remote branch")
    parser.add_argument("--remote", default="origin", help="Git remote")
    parser.add_argument("--repository", help="GitHub owner/repository override")
    parser.add_argument("--site-url", default="https://xueliangt5-collab.github.io/ue-words/", help="GitHub Pages base URL")
    parser.add_argument("--git", help="Git executable path")
    parser.add_argument("--node", help="Node.js executable path")
    parser.add_argument("--jobs", type=int, default=8, help="Concurrent API blob uploads")
    parser.add_argument("--tree-batch-size", type=int, default=50, help="Tree entries per API request")
    parser.add_argument("--git-timeout", type=int, default=45, help="Seconds allowed for the single Git push attempt")
    parser.add_argument("--timeout", type=int, default=900, help="Total deployment verification timeout")
    parser.add_argument("--poll-interval", type=int, default=5, help="Seconds between verification polls")
    parser.add_argument("--audio-samples", type=int, default=2, help="Changed audio files to sample online")
    parser.add_argument("--verify-only", action="store_true", help="Skip publication and verify an already published commit")
    parser.add_argument("--confirm-push", action="store_true", help="Required unless --verify-only is used")
    return parser.parse_args()


def resolve_node(value=None):
    candidate = value or os.environ.get("NODE_EXECUTABLE") or shutil.which("node")
    if not candidate:
        raise RuntimeError("Node.js was not found; pass --node with its full path")
    return candidate


def expected_release_metadata(repo, node, target):
    relevant = [
        "src/terms.js",
        "src/imported-terms.json",
        "src/articles.js",
        "src/imported-articles.json",
        "src/speech-assets.json",
    ]
    dirty = publisher.run_git(repo, "diff", "--name-only", target, "--", *relevant)
    if dirty:
        raise RuntimeError(f"Release metadata files differ from target {target}: {dirty}")
    environment = os.environ.copy()
    environment["RELEASE_COMMIT"] = target
    result = subprocess.run(
        [node, "scripts/release_metadata.mjs"],
        cwd=repo,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        env=environment,
        timeout=60,
    )
    return json.loads(result.stdout)


def try_git_push(repo, git, remote, branch, target, timeout):
    environment = os.environ.copy()
    environment["GIT_TERMINAL_PROMPT"] = "0"
    try:
        result = subprocess.run(
            [git, "-C", str(repo), "push", remote, f"{target}:refs/heads/{branch}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=environment,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as error:
        return False, f"Git push timed out after {timeout}s: {error}"
    output = "\n".join(part.strip() for part in (result.stdout, result.stderr) if part.strip())
    return result.returncode == 0, output


def wait_for_workflow(api, target, deadline, poll_interval):
    encoded = urllib.parse.quote(target, safe="")
    last = None
    while time.time() < deadline:
        result = api.call("GET", f"/actions/runs?head_sha={encoded}&per_page=20")
        runs = [run for run in result.get("workflow_runs", []) if run.get("head_sha") == target]
        if runs:
            run = max(runs, key=lambda item: item.get("run_number", 0))
            last = {
                "id": run["id"],
                "status": run["status"],
                "conclusion": run.get("conclusion"),
                "url": run["html_url"],
            }
            if run["status"] == "completed":
                if run.get("conclusion") != "success":
                    raise RuntimeError(f"GitHub Actions failed for {target}: {last}")
                return last
        time.sleep(poll_interval)
    raise RuntimeError(f"Timed out waiting for GitHub Actions for {target}; last state: {last}")


def fetch_json(url):
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "User-Agent": "collect-terms",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_release(site_url, expected, target, deadline, poll_interval):
    release_url = urllib.parse.urljoin(site_url, "release.json")
    comparable = [
        "schemaVersion",
        "commit",
        "termCount",
        "importedTermCount",
        "articleCount",
        "importedArticleCount",
        "categoryCount",
        "speechTextCount",
        "audioFileCount",
        "termDataHash",
        "articleDataHash",
        "speechManifestHash",
    ]
    last = None
    while time.time() < deadline:
        url = f"{release_url}?v={urllib.parse.quote(target, safe='')}"
        try:
            last = fetch_json(url)
            if all(last.get(key) == expected.get(key) for key in comparable):
                return {"url": release_url, **last}
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError):
            pass
        time.sleep(poll_interval)
    raise RuntimeError(f"Timed out waiting for Pages release metadata for {target}; last metadata: {last}")


def choose_audio_samples(repo, target, count):
    paths = sorted(
        path
        for status, path in publisher.changed_paths(repo, target)
        if status in {"A", "M"} and path.startswith("public/audio/") and path.endswith(".mp3")
    )
    if count <= 0 or not paths:
        return []
    if len(paths) <= count:
        return paths
    if count == 1:
        return [paths[0]]
    indexes = sorted({round(index * (len(paths) - 1) / (count - 1)) for index in range(count)})
    return [paths[index] for index in indexes]


def verify_audio(site_url, target, paths):
    verified = []
    for path in paths:
        relative = path.removeprefix("public/")
        url = urllib.parse.urljoin(site_url, relative)
        request = urllib.request.Request(
            f"{url}?v={urllib.parse.quote(target, safe='')}",
            headers={"Cache-Control": "no-cache", "Range": "bytes=0-1023", "User-Agent": "collect-terms"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            content = response.read()
            if response.status not in {200, 206} or not content:
                raise RuntimeError(f"Online audio verification failed: {url}")
        verified.append(url)
    return verified


def main():
    args = parse_args()
    if not args.verify_only and not args.confirm_push:
        raise RuntimeError("Use --confirm-push for publication, or --verify-only for read-only verification")

    repo = Path(args.repo).resolve()
    git = publisher.configure_git(args.git)
    node = resolve_node(args.node)
    target = publisher.run_git(repo, "rev-parse", args.target)
    repository = args.repository or publisher.repository_from_remote(
        publisher.run_git(repo, "remote", "get-url", args.remote)
    )
    expected = expected_release_metadata(repo, node, target)
    site_url = args.site_url.rstrip("/") + "/"

    if args.verify_only:
        branch_path = urllib.parse.quote(args.branch, safe="")
        remote_sha = publisher.GitHubApi(repository).call("GET", f"/git/ref/heads/{branch_path}")["object"]["sha"]
        if remote_sha != target:
            raise RuntimeError(f"Remote {args.branch} is {remote_sha}, expected {target}")
        publish_result = {"status": "already_published", "sha": target}
    else:
        pushed, push_output = try_git_push(repo, git, args.remote, args.branch, target, args.git_timeout)
        if pushed:
            publish_result = {"status": "git_pushed", "sha": target, "output": push_output}
        else:
            publish_result = publisher.publish_commit(
                repo=repo,
                target=target,
                branch=args.branch,
                remote=args.remote,
                repository=repository,
                git=git,
                jobs=args.jobs,
                tree_batch_size=args.tree_batch_size,
                confirm_push=True,
            )
            publish_result["gitPushError"] = push_output

    deadline = time.time() + max(30, args.timeout)
    api = publisher.GitHubApi(repository)
    workflow = wait_for_workflow(api, target, deadline, max(1, args.poll_interval))
    release = wait_for_release(site_url, expected, target, deadline, max(1, args.poll_interval))
    audio = verify_audio(site_url, target, choose_audio_samples(repo, target, args.audio_samples))
    print(json.dumps({
        "status": "published_and_verified" if not args.verify_only else "verified",
        "publish": publish_result,
        "workflow": workflow,
        "release": release,
        "audioSamples": audio,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
