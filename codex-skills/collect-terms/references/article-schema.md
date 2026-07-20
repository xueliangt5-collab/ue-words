# Bilingual article schema

Use UTF-8 JSON. Store public imported articles in `src/imported-articles.json`.

```json
{
  "id": "understanding-game-thread",
  "titleEn": "Understanding the Game Thread",
  "titleZh": "理解游戏线程",
  "summaryEn": "A short English summary.",
  "summaryZh": "对应的中文摘要。",
  "category": "性能分析",
  "level": "入门",
  "tags": ["Unreal Insights", "GameThread"],
  "source": "source-file.md",
  "sections": [
    {
      "id": "main-loop",
      "headingEn": "Start with the main loop",
      "headingZh": "从主循环开始",
      "en": "FEngineLoop::Tick runs once per frame.",
      "zh": "FEngineLoop::Tick 每帧执行一次。",
      "termLinks": [
        {
          "termId": "imported-fengineloop-tick",
          "textEn": "FEngineLoop::Tick",
          "textZh": "FEngineLoop::Tick",
          "note": "引擎主循环入口。"
        }
      ]
    }
  ]
}
```

Required article fields: `titleEn`, `titleZh`, `summaryEn`, `summaryZh`, `category`, and at least one `section`.

Required section fields: `headingEn`, `headingZh`, `en`, and `zh`. Keep each English paragraph aligned with its Chinese translation in one section. Split long Markdown sections into several records instead of storing Markdown or HTML inside `en` and `zh`.

## Markdown intake

- Treat headings as candidate sections and paragraphs as source units.
- Use the first H1 as the article title. When no H1 exists, derive a readable title from the filename and confirm it against the article's dominant topic.
- Create one section record per source paragraph. When several paragraphs share one H2, repeat the bilingual heading and add stable `-p1`, `-p2` suffixes to the section IDs.
- Preserve code identifiers, commands, file paths, and product spelling exactly.
- When the Markdown is monolingual, translate each paragraph without adding facts. Keep code blocks out of prose unless the article reader gains an explicit code-block field.
- Set `source` to the original filename or public URL. Do not publish confidential project names, paths, metrics, or incident details.

## Term links

- Link only to an exact existing term ID from `src/terms.js` or `src/imported-terms.json`.
- Record links on the section where the term actually appears.
- Use `textEn` and `textZh` for the exact visible text to highlight. Longest explicit labels take precedence in the reader.
- Add a concise `note` that explains the term in this paragraph, not a duplicate dictionary definition.
- Do not link every common word. Prefer terms that materially help understand the article.
- When a required term does not exist, prepare and merge the term first, then reference its final ID.
- When the user requests a link but the term does not actually appear in a paragraph, do not insert or fabricate it merely to satisfy the requested count. Report it as unlinked or ask whether the prose should be edited.

## Audio policy

Do not generate article audio by default. Article audio requires explicit user approval, paragraph-level pronunciation review, and a separate asset workflow. Continue using verified term-level audio for linked glossary entries.
