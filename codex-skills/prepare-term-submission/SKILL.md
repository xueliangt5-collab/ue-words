---
name: prepare-term-submission
description: Turn raw Chinese or English nouns, abbreviations, technical phrases, code identifiers, profiler markers, screenshots, notes, CSV rows, or JSON data into a validated UE Words glossary contribution file. Use when someone wants to 整理名词, 补全术语信息, 生成术语投稿, 导出词库 CSV/JSON, prepare vocabulary for another person to review, or contribute terms without accessing the owner's repository or publishing workflow. Supports UE, game development, testing, graphics, software engineering, AI, project management, hardware, and general English.
---

# Prepare Term Submission

Create a reviewable contribution package for the UE Words glossary. Do not access the owner's glossary repository, account, deployment, or publishing credentials.

Read [references/submission-schema.md](references/submission-schema.md) before creating a file.

## Process the source

1. Extract one learnable concept per record from notes, screenshots, tables, CSV, JSON, or mixed Chinese-English text.
2. Treat named columns as authoritative. For Unreal Insights input, map `TimerName` to `term`, map `Category` to `threadCategory`, and use `Explanation_CN` as source knowledge. Do not treat the thread category as another term.
3. Select the canonical English term used in official UI, documentation, code, or established industry practice. Preserve exact code and profiler identifiers.
4. Pair an abbreviation with its authoritative `fullForm` in the same record. Never guess an expansion. Add `wordParts` when the expansion helps learning.
5. Add concise Chinese, a plain-Chinese definition, a natural English example and aligned translation, useful tags, pronunciation, supported relations, context, and practical experience.
6. Use IPA only for reliable ordinary-English pronunciation. Use `spokenForm` for acronyms and code symbols.
7. Merge semantic duplicates within the current batch. Keep separate records for the same abbreviation in genuinely different domains and explain the boundary in `usageNotes`.
8. Ask only when unresolved ambiguity would change the English identity or technical meaning. Otherwise proceed and record a useful distinction.

## Protect the handoff

- Treat `source` as evidence, not proof. Do not invent official attribution.
- Set `visibility` to `private-review` if the source contains confidential project names, paths, incidents, people, unreleased features, or other sensitive details. Remove unnecessary sensitive text from examples and tags.
- Never claim that a submission is deduplicated against the owner's master glossary. Only the owner's import Skill can perform master-library deduplication.
- Do not publish, generate production audio, commit, push, or request the owner's credentials.

## Choose the output

- Default to JSON because it preserves aliases, word decomposition, relations, contexts, and usage notes without loss.
- Produce CSV when the user asks for Excel, Feishu, table editing, or CSV. Nested values remain JSON text inside their CSV cells.
- When both formats are requested, create JSON first and convert it with the bundled tool so both contain the same records.
- Name files `term-submission-YYYY-MM-DD.json` or `term-submission-YYYY-MM-DD.csv`; append a short contributor name when supplied.

Wrap JSON records with `format: ue-words-term-submission` and `version: 1`. Repeat this metadata in every CSV row. Do not add a glossary `id`; the owner generates stable IDs during import.

## Validate and convert

Use the standard-library-only helper before delivery:

```powershell
python scripts/submission_tool.py validate --input <submission.json-or-csv>
python scripts/submission_tool.py convert --input <submission.json> --output <submission.csv>
```

Resolve another available Python executable if `python` is unavailable. Fix every reported error. Review warnings and keep them only when technically justified.

Create an empty template only when requested:

```powershell
python scripts/submission_tool.py template --format csv --output <template.csv>
python scripts/submission_tool.py template --format json --output <template.json>
```

## Report the result

State the output path and format, term count, categories, visibility, merged duplicates, and unresolved warnings. Tell the recipient to send the resulting file to the glossary owner for final master deduplication, review, audio generation, and publication.
