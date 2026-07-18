# Windows incremental publishing

Use this path for the glossary repository on Windows. Keep permission requests predictable and preserve unrelated worktree changes.

## Stable locations and runtime discovery

- Repository: `C:\Users\tianxueliang\Documents\UE学习`
- Skill source: `<repo>\codex-skills\collect-terms`
- Installed Skill: `C:\Users\tianxueliang\.codex\skills\collect-terms`
- Public glossary: `<repo>\src\imported-terms.json`
- Public audio: `<repo>\public\audio` and `<repo>\src\speech-assets.json`
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

For a term-only update, do not reinstall dependencies and do not run the Skill validator.

Use the resolved Node executable directly:

```powershell
& <node> --check src\main.js
& <node> --check src\db.js
& <node> --check src\review.js
& <node> --check src\sync.js
& <node> node_modules\vite\bin\vite.js build --configLoader native
```

If `node_modules\vite\bin\vite.js` is missing, install once from the frozen lockfile. Ensure the Node directory is in the command-local `PATH` so the `esbuild` lifecycle script can find it. The repository must keep `allowBuilds.esbuild: true` and `onlyBuiltDependencies: [esbuild]`; do not use a broad allow-all-builds flag.

If a pnpm wrapper repeatedly tries to reinstall dependencies or requires a TTY, call the resolved Node and project Vite entry directly after the frozen install succeeds.

## Permission gates

Do not request escalation for repository reads, merge scripts, diffs, syntax checks, builds, or normal workspace writes.

Request one narrow escalation only when the action reaches one of these gates:

- **Dependency gate**: install missing locked dependencies only after their deterministic check fails. Scope approval to the exact pnpm command or the pinned speech install targeting `<repo>\.tts-deps`. A missing task-local or temporary directory is not evidence that speech dependencies are missing.
- **Skill install gate**: copy the validated Skill from the repository to `C:\Users\tianxueliang\.codex\skills\collect-terms`. Skip this gate for ordinary vocabulary batches.
- **Remote mutation gate**: retry an approved `git push` outside the sandbox only after a sandbox or transport failure.
- **Network verification gate**: query GitHub Actions or Pages outside the sandbox only when the normal network request fails.
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

1. Run normal `git push origin main` once.
2. On a connection reset, retry once with a narrow approved Git push command.
3. If Git transport still fails, test the API fallback without mutation:

```powershell
python <skill-dir>\scripts\publish_commit_via_api.py --repo <repo> --target HEAD --branch main --dry-run
```

The dry run reads the public branch ref without loading a GitHub credential. The credential manager is consulted only after `--confirm-push` passes all fast-forward checks. Credential lookup is non-interactive and times out; the fallback must fail clearly instead of opening a login prompt or waiting indefinitely.

4. Publish only when the dry run reports either `already_published` or `ready`:

```powershell
python <skill-dir>\scripts\publish_commit_via_api.py --repo <repo> --target HEAD --branch main --confirm-push
```

The fallback rejects multiple-commit gaps, non-fast-forward updates, unsupported change types, tree mismatches, and commit SHA mismatches. Never add a force option.

## Verification and cleanup

- Confirm the workflow SHA equals the committed SHA and the conclusion is `success`.
- Confirm one live marker from `sw.js` or `assets/app.js`; avoid repeated full downloads.
- Delete only temporary inputs and validation dependencies created by the current task.
- Keep a local preview server only when the application UI changed and the user needs an inspection URL.
- Report remaining unrelated changes rather than cleaning or committing them.
