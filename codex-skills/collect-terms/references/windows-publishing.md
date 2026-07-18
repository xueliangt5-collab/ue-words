# Windows incremental publishing

Use this path for the glossary repository on Windows. Keep permission requests predictable and preserve unrelated worktree changes.

## Contents

- Stable locations and speech dependencies
- Preflight and local checks
- Permission and Git scope
- Concurrent remote updates
- Single-command publication and verification

## Stable locations and runtime discovery

- Repository: `C:\Users\tianxueliang\Documents\UE学习`
- Skill source: `<repo>\codex-skills\collect-terms`
- Installed Skill: `C:\Users\tianxueliang\.codex\skills\collect-terms`
- Public glossary: `<repo>\src\imported-terms.json`
- Public audio: `<repo>\public\audio` and `<repo>\src\speech-assets.json`
- Generated release fingerprint: `<repo>\public\release.json` and deployed `/release.json`
- Persistent speech dependencies: `<repo>\.tts-deps`

Resolve Node, Python, and pnpm once with the workspace dependency loader. Do not hardcode a versioned cache path when the loader is available. Keep the resolved absolute paths for the whole task.

When a Python helper reads UTF-8 Skill or glossary files on Windows, invoke it with `python -X utf8`. The default GBK locale can otherwise produce a misleading `UnicodeDecodeError` during validation.

For a syntax-only Python check, read the source and call Python's in-memory `compile()` function. Do not use a check that creates `scripts\__pycache__`, and do not request permission to recursively delete Python bytecode caches. They are ignored by Git and may be left in place.

## Persistent speech dependencies

Before every audio generation, run `python -X utf8 scripts/generate_speech_assets.py --check-dependencies`. A successful result with `"ready": true` is authoritative: reuse `<repo>\.tts-deps` and do not invoke `pip` or request dependency permission.

The speech requirements are pinned. Install or upgrade them only when the check exits with code 2, and always target the fixed `<repo>\.tts-deps` directory. Never use `$env:TEMP`, a date-stamped directory, or a task-specific dependency directory; those paths cause repeated downloads and approvals. Do not set `TIMER_TTS_DEPS`, `PYTHONPATH`, or another override to load speech dependencies. After the one-time installation, rerun the check before generating audio.

Run `python -X utf8 scripts/generate_speech_assets.py --plan --node <node>` before generation. The plan is read-only and reports `total`, `reusable`, and `missing`. A zero `missing` count means the generation command must not access the speech service; it only refreshes the manifest. A nonzero count is the exact maximum number of files that may be downloaded.

Run only `scripts/generate_speech_assets.py` for generation. Do not assemble an inline Python command or a batch-specific generator. The repository script imports from `<repo>\.tts-deps`, skips valid existing MP3 files, downloads only missing audio, and writes only repository audio outputs; with normal workspace access this must not request an extra dependency-directory permission.

## Preflight

1. Run `git status --short --branch`, `git rev-parse HEAD`, and `git remote -v`.
2. Record all existing modified and untracked paths before writing. Assume they belong to the user.
3. Decide whether this is a term-only update, an application update, or a Skill update.
4. Put generated input JSON in the system temporary directory so it cannot be staged accidentally.
5. Use `merge_terms.mjs --dry-run` before the real merge. Stop if added, updated, or skipped counts contradict the intended batch.
6. Refresh and compare `origin/main` again immediately before committing. Another glossary task may publish audio, terms, or generated data while the current task is validating.

## Minimal local checks

For a term-only update, do not reinstall dependencies and do not run the Skill validator. Run the application checks once after all terms and generated assets are final. When only Skill documentation or its publishing helpers changed, skip the application build.

Do not run `Remove-Item` on `dist`, and do not request escalation to clean or build it. `dist` is ignored disposable output, Vite manages it during the build, and normal workspace permission is sufficient.

Use the resolved Node executable directly:

```powershell
& <node> --check src\main.js
& <node> --check src\db.js
& <node> --check src\review.js
& <node> --check src\sync.js
& <node> scripts\build.mjs
```

The build writes ignored `public\release.json` before Vite runs. It records the commit, term and audio counts, and hashes of the glossary and speech manifest for small, deterministic online verification.

If `node_modules\vite\bin\vite.js` is missing, install once from the frozen lockfile. Ensure the Node directory is in the command-local `PATH` so the `esbuild` lifecycle script can find it. The repository must keep `allowBuilds.esbuild: true` and `onlyBuiltDependencies: [esbuild]`; do not use a broad allow-all-builds flag.

If a pnpm wrapper repeatedly tries to reinstall dependencies or requires a TTY, call the resolved Node and project Vite entry directly after the frozen install succeeds.

## Permission gates

Do not request escalation for repository reads, merge scripts, diffs, syntax checks, builds, or normal workspace writes.

Request one narrow escalation only when the action reaches one of these gates:

- **Dependency gate**: install missing locked dependencies only after their deterministic check fails. Scope approval to the exact pnpm command or the pinned speech install targeting `<repo>\.tts-deps`. A missing task-local or temporary directory is not evidence that speech dependencies are missing.
- **Skill install gate**: copy the validated Skill from the repository to `C:\Users\tianxueliang\.codex\skills\collect-terms`. Skip this gate for ordinary vocabulary batches.
- **Publication gate**: request one approval for the exact `publish_and_verify.py` command after the commit is ready. It owns the Git push, API fallback, Actions polling, Pages fingerprint check, and audio sampling. Do not split those operations into separate approvals.
- **Concurrent-update gate**: fetch `origin/main` with a narrow Git command only when the remote moved during the task. If `.git` is read-only in the sandbox, request one exact local-metadata escalation for the verified fast-forward rather than broad filesystem access.

Never request a blanket PowerShell, Python, or filesystem prefix. Prefer an exact executable plus script or subcommand. Before recursive cleanup, resolve the absolute target and prove it remains under the intended temporary or workspace directory.

## Skill validation updates

Skip this section for ordinary vocabulary batches. When the Skill itself changes, run the official `skill-creator/scripts/quick_validate.py` with `python -X utf8`.

If PyYAML is missing, install it into a unique directory under `$env:TEMP`, set `PYTHONPATH` only for the validation command, and remove that exact directory in a `finally` block. Do not install validation dependencies inside the repository: an elevated `pip --target` can create child directories that the sandbox cannot read or clean. If the sandbox cannot reach PyPI or the user's pip cache, request one narrow escalation covering only the temporary install, validation, and cleanup operation.

## Git scope

Use explicit paths with `git add`. Review `git diff --cached --name-only` and `git diff --cached --check` before committing. Do not stage pre-existing glossary, audio, UI, or generated files merely because they are present.

For a public term batch, the usual scope is:

- `src/imported-terms.json`
- `src/speech-assets.json`
- only the newly referenced files under `public/audio`

Add Skill or application files only when the user asked to change those systems.

## Concurrent remote updates

If the remote advances after the initial snapshot, inspect every intervening commit before staging current work. When remote files correspond to pre-existing local worktree files, compare their Git blob hashes to the fetched tree; filenames and byte counts alone are insufficient.

Fast-forward local `main` only when all of these are true:

- the old local `HEAD` is an ancestor of `origin/main`;
- the index has no staged changes;
- every overlapping worktree file is byte-identical to its remote blob;
- unrelated local modifications remain outside the remote commits.

Update only the local branch ref and index so matching worktree files are recognized as published without rewriting them. If any overlapping file differs, do not reset, overwrite, force-push, or guess; preserve the worktree and resolve the merge explicitly.

## Publish and fallback

After the commit is ready, run exactly one network entry point:

```powershell
python -X utf8 <skill-dir>\scripts\publish_and_verify.py --repo <repo> --target HEAD --branch main --site-url "https://xueliangt5-collab.github.io/ue-words/" --git <git> --node <node> --confirm-push
```

Do not precede or follow it with separate `git ls-remote`, `Invoke-RestMethod`, branch API, Actions API, Pages, or app-bundle queries. The command attempts normal Git transport once. On transport failure it checks the remote parent and invokes the exact-commit API fallback internally.

The fallback:

- uploads blobs concurrently;
- retries temporary network and GitHub 5xx failures;
- records every completed blob and tree batch under `<repo>\.git\codex-publish\<target-sha>.json`;
- creates the target tree in batches of 50 paths to avoid large-tree timeouts;
- resumes without re-uploading recorded blobs after interruption;
- verifies blob, tree, commit, parent, and final branch SHA;
- never force-pushes.

Use `publish_commit_via_api.py --dry-run` only while developing or diagnosing the publisher itself, not during an ordinary glossary release.

## Verification and cleanup

- Treat the final JSON from `publish_and_verify.py` as the release evidence. It includes the workflow URL, live release metadata, and sampled audio URLs.
- The live `/release.json` must match the target commit, term counts, audio counts, term-data hash, and speech-manifest hash. Do not download the full `app.js` to count terms.
- Delete only temporary inputs and validation dependencies created by the current task.
- Keep a local preview server only when the application UI changed and the user needs an inspection URL.
- Report remaining unrelated changes rather than cleaning or committing them.
