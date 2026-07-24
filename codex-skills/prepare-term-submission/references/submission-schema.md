# Term submission schema

Use UTF-8. JSON is the canonical format; CSV is a lossless table representation produced by `scripts/submission_tool.py`.

## JSON envelope

```json
{
  "format": "ue-words-term-submission",
  "version": 1,
  "contributor": "optional display name",
  "visibility": "public-review",
  "terms": [
    {
      "term": "RHI",
      "abbreviation": "RHI",
      "fullForm": "Render Hardware Interface",
      "spokenForm": "R H I",
      "ipa": "",
      "zh": "渲染硬件接口",
      "category": "图形与渲染",
      "threadCategory": "",
      "definition": "Unreal Engine 用于抽象 Direct3D、Vulkan、Metal 等底层图形 API 的接口层。",
      "example": "The RHI translates rendering commands for the active graphics API.",
      "exampleZh": "RHI 会为当前图形 API 转换渲染命令。",
      "tags": "RHI Render Hardware Interface 渲染硬件接口 graphics API",
      "aliases": [],
      "wordParts": [
        { "word": "Render", "zh": "渲染" },
        { "word": "Hardware", "zh": "硬件" },
        { "word": "Interface", "zh": "接口" }
      ],
      "relatedTerms": [
        {
          "term": "RHI Thread",
          "relation": "执行线程",
          "explanation": "RHI Thread 可以异步处理和提交部分 RHI 命令。"
        }
      ],
      "contexts": [
        {
          "phrase": "Unreal Engine rendering pipeline",
          "explanation": "RHI 位于引擎渲染器与平台图形 API 之间。",
          "experience": "分析 RHI 开销时要区分命令生成、驱动提交和 GPU 执行时间。"
        }
      ],
      "usageNotes": ["RHI 在 Unreal Engine 语境中指 Render Hardware Interface。"],
      "source": "Unreal Engine documentation"
    }
  ]
}
```

`format` must be `ue-words-term-submission`. `version` must be `1`.

Use `visibility: public-review` for material suitable for the public glossary. Use `private-review` when a human must remove or approve sensitive details before any publication.

## Term fields

Required:

- `term`: canonical English, official UI name, or exact code/profiler identifier.
- `zh`: concise Chinese meaning.
- `definition`: plain-Chinese explanation of the selected technical sense.

Optional strings:

- `abbreviation`, `fullForm`, `spokenForm`, `ipa`
- `category`, `threadCategory`
- `example`, `exampleZh`, `tags`, `source`

Optional arrays:

- `aliases`: alternate English spellings or official names.
- `wordParts`: `{ "word", "zh" }` objects in full-form order.
- `relatedTerms`: `{ "term", "relation", "explanation" }` objects.
- `contexts`: `{ "phrase", "explanation", "experience" }` objects.
- `usageNotes`: practical distinctions or cautions as strings.

Do not include `id`. The owner assigns it after master-library deduplication.

## CSV representation

Use these exact columns:

```text
submissionFormat,submissionVersion,contributor,visibility,term,abbreviation,fullForm,spokenForm,ipa,zh,category,threadCategory,definition,example,exampleZh,tags,aliases,wordParts,relatedTerms,contexts,usageNotes,source
```

Repeat submission metadata in each row. Store `aliases`, `wordParts`, `relatedTerms`, `contexts`, and `usageNotes` as compact JSON arrays inside their cells. Use UTF-8 with BOM so Excel displays Chinese correctly. Generate or convert CSV with the bundled helper rather than assembling nested cells manually.

## Classification

Prefer an existing learning category when it fits:

- `UE 基础`, `蓝图逻辑`, `资源与渲染`, `动画与碰撞`, `构建与网络`
- `游戏测试`, `故障与性能`, `游戏开发`, `性能分析`
- `软件工程`, `图形与渲染`, `AI 与数据`, `项目管理`, `硬件`, `通用英语`

For profiler timers, use `性能分析` as `category`. Store `GameThread`, `GPU`, `RenderThread`, `RHIThread`, `IO`, or another source thread/track in `threadCategory`.

## Quality rules

- Use official spelling and capitalization when known.
- Pair established abbreviations with authoritative full forms; do not guess.
- Make `exampleZh` translate the exact English example.
- Preserve exact identifiers in `term`; use `spokenForm` instead of fake IPA.
- Add relations only when semantic, pipeline, contrast, or cause-effect evidence exists.
- Keep project-specific diagnostic evidence in `contexts`; remove confidential identifiers.
- Merge equivalent records within the submission. Leave master-library deduplication to the owner.
