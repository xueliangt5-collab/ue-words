---
name: collect-terms
description: Normalize Chinese nouns, descriptions, mixed Chinese-English notes, abbreviations with their full forms, English words, technical phrases, profiler markers, or Unreal Insights CSV rows into standard English glossary records, then explain, classify, relate, deduplicate, enrich, and publish them to the user's terminology learning PWA. Use when the user asks to translate technical concepts into English, expand or collect acronyms, or add, save, import, organize, enrich, or publish vocabulary, including "这个名词英文怎么说", "缩写与原词", "把这些中文名词整理成英文", "加入词库", "收录这个词", "导入术语", "把这些词分类", raw profiler text, and TimerName/Category/Explanation_CN CSV files. Supports UE, game development, QA, software engineering, graphics, AI, project management, and general English.
---

# Collect Terms

Use the glossary repository at `C:\Users\tianxueliang\Documents\UE学习`. Locate it by its `src/imported-terms.json` file if the path changes.

On Windows, read [references/windows-publishing.md](references/windows-publishing.md) before any published-mode mutation. Follow its preflight, runtime, permission, Git, and fallback paths. A skill cannot grant or bypass permissions; request only the narrow escalation required at the documented gate and reuse an existing approved prefix when available.

## Choose the destination

- Default to **published mode** for non-sensitive technical vocabulary because the owner has authorized automatic enrichment and publication to this repository. Do not pause to request approval for each unambiguous batch.
- Use **private package mode** when the user says the terms are private, should not be public, or only need to enter their personal synced library.
- Switch to private package mode when the source contains personal, confidential, or project-sensitive details. Do not put those details in the public repository.

## Decompose automatically

Treat structured columns as authoritative. Do not infer field meaning from commas when headers or a schema are available.

For Unreal Insights CSV exports with `TimerName`, `Category`, and `Explanation_CN`:

1. Map `TimerName` to the term exactly as exported.
2. Map `Category` to `threadCategory`; it is a thread or track classification, not a second term.
3. Use `Explanation_CN` as source knowledge. Separate the basic definition from diagnostic advice without deleting the original meaning.
4. Use `category: 性能分析` for the learning topic.
5. Generate `spokenForm` for code identifiers. Use IPA only for ordinary English with a reliable pronunciation.
6. Generate aliases, examples, translations, tags, analysis experience, and only defensible semantic relations.
7. Use the spreadsheet skill and `@oai/artifact-tool` to extract CSV rows into `{ headers, rows }` JSON, then run `scripts/enrich_insights_rows.mjs` to produce term records.

For unstructured text, identify symbols, ordinary terms, Chinese concepts, context, and experience from meaning rather than delimiter position. Keep one learnable concept per record and preserve useful combinations in `contexts`.

## Normalize Chinese-first input

When any source concept is Chinese or mixed Chinese-English, read [references/chinese-intake.md](references/chinese-intake.md) before preparing records.

1. Infer the domain and intended sense from the surrounding sentence, source, UI, code, or profiler context.
2. Choose the canonical English term, not a word-for-word translation. Prefer official product wording, API or code spelling, then established industry usage.
3. Distinguish a dictionary concept from a symptom, command, UI label, code identifier, or complete phrase. Keep canonical multiword terms intact.
4. Use the original Chinese wording as evidence: make `zh` concise, and preserve useful source wording in `tags`, `contexts`, or `usageNotes`.
5. Proceed automatically for a dominant, well-supported sense. Ask only when competing senses would create materially different records and context cannot resolve them.
6. Search English identities and Chinese meanings before adding. If the concept already exists, enrich the existing imported record instead of creating a translated duplicate.

## Prepare each term

Read [references/schema.md](references/schema.md) before producing records. For every term:

1. Preserve or derive the standard English spelling and capitalization. Use the base or singular form unless an official term is conventionally plural.
2. Pair an established abbreviation with its authoritative `fullForm` in the same record. Set `abbreviation`, add ordered `wordParts` when the expansion is useful for learning, and use `spokenForm` for the displayed form's pronunciation. Keep different domain meanings as separate records.
3. Provide a concise canonical Chinese meaning and a plain-Chinese explanation for the user's learning level.
4. Use an existing category when it fits; create a short new category only when necessary.
5. Add one natural English example and Chinese translation.
6. Add useful Chinese and English search tags, including the user's original Chinese noun when it improves retrieval.
7. Add IPA only when confident or verified. Leave it empty instead of inventing pronunciation.
8. Generate `spokenForm` for code symbols so pronunciation remains available without fake IPA.
9. Add `threadCategory` when the source identifies an execution thread or profiler track.
10. Add `relatedTerms`, `contexts`, and `usageNotes` only when their relationship or experience is supported by the source or strong domain knowledge.
11. Search `src/terms.js` and `src/imported-terms.json` using compact, case-insensitive identities across English names, abbreviations, full forms, Chinese meanings, spoken forms, aliases, and tags. Confirm semantic equivalence before treating a Chinese match as a duplicate. Update an imported record when refining it; do not duplicate a core record.
12. Check that the English example demonstrates the intended sense, and that `exampleZh` translates that exact example rather than merely repeating the definition.

Proceed automatically when the source is unambiguous. Ask only when spelling, column meaning, or intended sense would materially change the record.

## Published mode

1. Snapshot `git status --short --branch`, the current commit, and all pre-existing changes. Treat them as user-owned and stage only files created or intentionally updated by this batch.
2. Create the prepared-record JSON under the system temporary directory rather than the repository. Run a dry merge first, inspect the counts, then run the real merge:

```powershell
node <skill-dir>\scripts\merge_terms.mjs --repo "C:\Users\tianxueliang\Documents\UE学习" --input <temporary-json> --dry-run
node <skill-dir>\scripts\merge_terms.mjs --repo "C:\Users\tianxueliang\Documents\UE学习" --input <temporary-json>
```

Resolve the bundled Node executable when `node` is not available on `PATH`.

3. When a public term, `fullForm`, `spokenForm`, or example changes, regenerate the same-origin audio assets before building. Resolve the bundled Python and Node executables. If `.tts-deps/edge_tts` is missing, install `scripts/speech-requirements.txt` into `.tts-deps`, then run:

```powershell
python scripts/generate_speech_assets.py --node <node-executable>
```

Stage the generated `src/speech-assets.json` and `public/audio` files with the term changes. Existing audio files are reused.
4. Run syntax checks and the Vite build through the resolved Node executable as described in `windows-publishing.md`. Do not install dependencies unless the required executable is actually missing.
5. Review `git diff --check`, the exact diff, and the staged file list. Commit only the glossary, generated speech assets, and any explicitly requested Skill or application files. Never use `git add -A` in a dirty worktree.
6. Push `main` normally. If Git transport repeatedly resets but `api.github.com` is reachable, use `scripts/publish_commit_via_api.py` only after its dry run succeeds. The fallback refuses force pushes and only publishes one exact fast-forward commit whose parent is the remote branch.
7. Verify that the GitHub Pages workflow completed for the expected SHA, then verify one live version marker such as the Service Worker cache name or a unique application string. Use browser testing only when the UI changed.

Do not edit the large core array in `src/terms.js`; public additions belong in `src/imported-terms.json`.

## Private package mode

1. Create a temporary JSON file containing an array of prepared records.
2. Write a user-visible package into the repository's `imports` folder:

```powershell
node <skill-dir>\scripts\merge_terms.mjs --input <temporary-json> --package-output <output-json>
```

Resolve the bundled Node executable when `node` is not available on `PATH`.

3. Tell the user to open the PWA and choose `设置 -> 导入词库或备份`. If they are logged in, the imported terms sync through their account.
4. Do not commit or upload the package unless the user explicitly asks.

## Report

State how many terms were added, updated, or skipped, list their categories, and say whether the result was published or kept private.
