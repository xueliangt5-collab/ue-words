# Glossary record schema

Use UTF-8 JSON. A term record has this shape:

```json
{
  "id": "imported-rhi",
  "term": "RHI",
  "abbreviation": "RHI",
  "fullForm": "Render Hardware Interface",
  "spokenForm": "R H I",
  "ipa": "",
  "zh": "渲染硬件接口",
  "category": "图形与渲染",
  "threadCategory": "",
  "definition": "Unreal Engine 用来抽象 Direct3D、Vulkan、Metal 等底层图形 API 的接口层。",
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
      "experience": "分析 RHI 开销时区分命令生成、驱动提交和 GPU 执行时间。"
    }
  ],
  "usageNotes": ["RHI 在 Unreal Engine 语境中指 Render Hardware Interface。"],
  "source": "Unreal Engine terminology"
}
```

Required fields: `term`, `zh`, `definition`.

Optional fields: `id`, `abbreviation`, `fullForm`, `wordParts`, `spokenForm`, `ipa`, `category`, `threadCategory`, `example`, `exampleZh`, `tags`, `aliases`, `relatedTerms`, `contexts`, `usageNotes`, `source`.

Use a stable lowercase `imported-` ID with ASCII letters, digits, and hyphens. The merge script generates one when omitted.

## Collaborator submission envelope

The distributable `prepare-term-submission` Skill wraps draft records as:

```json
{
  "format": "ue-words-term-submission",
  "version": 1,
  "contributor": "optional display name",
  "visibility": "public-review",
  "terms": []
}
```

Accept only version `1`. Validate the package before semantic review. `public-review` means the batch may be considered for the public glossary; it is not publication authorization. Route `private-review` to private handling. The merge script reads the `terms` array and ignores envelope metadata, so retain contributor and visibility separately for review and reporting.

## Category guidance

Prefer these existing categories when they fit:

- `UE 基础`, `蓝图逻辑`, `资源与渲染`, `动画与碰撞`, `构建与网络`
- `游戏测试`, `故障与性能`, `游戏开发`
- `软件工程`, `图形与渲染`, `AI 与数据`, `项目管理`, `通用英语`

Create a new category only for a meaningful reusable subject area. Do not use a product name as a category when an existing technical category is clearer.

Use `性能分析` for profiler timers. Preserve thread or track values such as `GameThread`, `GPU`, `RenderThread`, `RHIThread`, and `IO` in `threadCategory` rather than using them as the topic category.

## Relations and experience

- `abbreviation`: established abbreviation or acronym, such as `RHI` or `tRFC`.
- `fullForm`: exact expansion used in the selected domain, such as `Render Hardware Interface`.
- `wordParts`: ordered words from `fullForm` with concise Chinese meanings. Do not split code identifiers or fabricate expansions.
- `aliases`: alternate spellings or UI names that should participate in search and deduplication.
- `relatedTerms`: semantic or pipeline relationships only; do not create a relation merely because two CSV fields are adjacent.
- `contexts`: source environments or phrases with their explanation and diagnostic experience.
- `usageNotes`: additional cautions or practical observations.
- `spokenForm`: readable words for a code symbol, for example `F Engine Loop Tick`.

## Abbreviations and full forms

- Keep one record when an abbreviation and its full form express the same concept in the same domain.
- Set `term` to the form users most often encounter in the product or workflow. It may be the abbreviation or the full form.
- Always set both `abbreviation` and `fullForm` when the expansion is authoritative.
- Put established variants in `aliases`; do not repeat `abbreviation` or `fullForm` there.
- Use `spokenForm` for how to read the displayed `term`, for example `R H I`.
- Create separate records when the same abbreviation has different meanings across domains, and state the domain boundary in `usageNotes` and tags.

## Private import package

Wrap records as:

```json
{
  "format": "ue-game-glossary",
  "version": 1,
  "terms": []
}
```

The PWA treats these as personal terms, skips duplicates from its built-in library, and updates matching personal terms.
