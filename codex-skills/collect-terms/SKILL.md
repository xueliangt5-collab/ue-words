---
name: collect-terms
description: Collect, explain, classify, deduplicate, and import English words or technical terms into the user's UE terminology learning PWA. Use when the user asks to add, collect, save, import, organize, or publish vocabulary, including phrases such as "加入词库", "收录这个词", "导入术语", or "把这些词分类". Supports UE, game development, QA, software engineering, graphics, AI, project management, and general English.
---

# Collect Terms

Use the glossary repository at `C:\Users\tianxueliang\Documents\UE学习`. Locate it by its `src/imported-terms.json` file if the path changes.

## Choose the destination

- Use **published mode** when the user asks to publish, deploy, or make the terms available automatically on every device. Explain before the first write that published entries become visible in the public GitHub repository.
- Use **private package mode** when the user says the terms are private, should not be public, or only need to enter their personal synced library.
- If the destination is ambiguous and the distinction matters, ask whether the terms may be public. Do not put personal notes or confidential vocabulary in the public repository.

## Prepare each term

Read [references/schema.md](references/schema.md) before producing records. For every term:

1. Preserve the standard English spelling and capitalization.
2. Provide a concise Chinese meaning and a plain-Chinese explanation for the user's learning level.
3. Use an existing category when it fits; create a short new category only when necessary.
4. Add one natural English example and Chinese translation.
5. Add useful Chinese and English search tags.
6. Add IPA only when confident or verified. Leave it empty instead of inventing pronunciation.
7. Search `src/terms.js` and `src/imported-terms.json` case-insensitively for duplicates and variants. Update an imported record when the user is refining it; do not duplicate a core record.

Show the proposed term, Chinese meaning, and category before importing when the user's spelling or intended meaning is ambiguous.

## Published mode

1. Create a temporary JSON file containing an array of prepared records.
2. Run:

```powershell
node <skill-dir>\scripts\merge_terms.mjs --repo "C:\Users\tianxueliang\Documents\UE学习" --input <temporary-json>
```

Resolve the bundled Node executable when `node` is not available on `PATH`.

3. Run the repository's `pnpm run check` and `pnpm run build` commands.
4. Review the diff. Commit only the glossary-related changes and push `main` when the user requested publication.
5. Verify the GitHub Pages workflow and report the live URL.

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
