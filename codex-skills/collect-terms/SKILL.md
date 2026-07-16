---
name: collect-terms
description: Automatically decompose, explain, classify, relate, deduplicate, and publish English words, technical terms, profiler markers, or Unreal Insights CSV rows into the user's terminology learning PWA. Use when the user asks to add, collect, save, import, organize, enrich, or publish vocabulary, including "加入词库", "收录这个词", "导入术语", "把这些词分类", raw profiler text, and TimerName/Category/Explanation_CN CSV files. Supports UE, game development, QA, software engineering, graphics, AI, project management, and general English.
---

# Collect Terms

Use the glossary repository at `C:\Users\tianxueliang\Documents\UE学习`. Locate it by its `src/imported-terms.json` file if the path changes.

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

For unstructured text, identify symbols, ordinary terms, context, and experience from meaning rather than delimiter position. Keep one learnable concept per record and preserve useful combinations in `contexts`.

## Prepare each term

Read [references/schema.md](references/schema.md) before producing records. For every term:

1. Preserve the standard English spelling and capitalization.
2. Provide a concise Chinese meaning and a plain-Chinese explanation for the user's learning level.
3. Use an existing category when it fits; create a short new category only when necessary.
4. Add one natural English example and Chinese translation.
5. Add useful Chinese and English search tags.
6. Add IPA only when confident or verified. Leave it empty instead of inventing pronunciation.
7. Generate `spokenForm` for code symbols so pronunciation remains available without fake IPA.
8. Add `threadCategory` when the source identifies an execution thread or profiler track.
9. Add `relatedTerms`, `contexts`, and `usageNotes` only when their relationship or experience is supported by the source or strong domain knowledge.
10. Search `src/terms.js` and `src/imported-terms.json` using compact, case-insensitive identities across names, spoken forms, and aliases. Update an imported record when refining it; do not duplicate a core record.

Proceed automatically when the source is unambiguous. Ask only when spelling, column meaning, or intended sense would materially change the record.

## Published mode

1. Create a temporary JSON file containing an array of prepared records.
2. Run:

```powershell
node <skill-dir>\scripts\merge_terms.mjs --repo "C:\Users\tianxueliang\Documents\UE学习" --input <temporary-json>
```

Resolve the bundled Node executable when `node` is not available on `PATH`.

3. When a public term, `spokenForm`, or example changes, regenerate the same-origin audio assets before building. Resolve the bundled Python and Node executables. If `.tts-deps/edge_tts` is missing, install `scripts/speech-requirements.txt` into `.tts-deps`, then run:

```powershell
python scripts/generate_speech_assets.py --node <node-executable>
```

Stage the generated `src/speech-assets.json` and `public/audio` files with the term changes. Existing audio files are reused.
4. Run the repository's `pnpm run check` and `pnpm run build` commands.
5. Review the diff. Commit only the glossary and generated speech changes, then push `main` when the user requested publication.
6. Verify the GitHub Pages workflow and report the live URL.

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
