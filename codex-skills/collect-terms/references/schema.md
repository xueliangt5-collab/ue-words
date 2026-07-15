# Glossary record schema

Use UTF-8 JSON. A term record has this shape:

```json
{
  "id": "imported-render-thread",
  "term": "Render Thread",
  "spokenForm": "Render Thread",
  "ipa": "",
  "zh": "渲染线程",
  "category": "图形与渲染",
  "threadCategory": "RenderThread",
  "definition": "负责向图形接口准备和提交渲染工作的线程。",
  "example": "The Render Thread is waiting for the GPU.",
  "exampleZh": "渲染线程正在等待 GPU。",
  "tags": "渲染 性能 GPU thread",
  "aliases": ["RenderThread"],
  "relatedTerms": [
    {
      "term": "Game Thread",
      "relation": "并行线程",
      "explanation": "游戏线程准备状态，渲染线程生成渲染命令。"
    }
  ],
  "contexts": [
    {
      "phrase": "Unreal Insights · RenderThread",
      "explanation": "该计时项位于渲染线程轨道。",
      "experience": "持续偏高时展开子事件查找可见性或场景更新开销。"
    }
  ],
  "usageNotes": ["不要把顶层计时范围直接当作根因。"],
  "source": "UE5_Timer_Glossary.csv"
}
```

Required fields: `term`, `zh`, `definition`.

Optional fields: `id`, `spokenForm`, `ipa`, `category`, `threadCategory`, `example`, `exampleZh`, `tags`, `aliases`, `relatedTerms`, `contexts`, `usageNotes`, `source`.

Use a stable lowercase `imported-` ID with ASCII letters, digits, and hyphens. The merge script generates one when omitted.

## Category guidance

Prefer these existing categories when they fit:

- `UE 基础`, `蓝图逻辑`, `资源与渲染`, `动画与碰撞`, `构建与网络`
- `游戏测试`, `故障与性能`, `游戏开发`
- `软件工程`, `图形与渲染`, `AI 与数据`, `项目管理`, `通用英语`

Create a new category only for a meaningful reusable subject area. Do not use a product name as a category when an existing technical category is clearer.

Use `性能分析` for profiler timers. Preserve thread or track values such as `GameThread`, `GPU`, `RenderThread`, `RHIThread`, and `IO` in `threadCategory` rather than using them as the topic category.

## Relations and experience

- `aliases`: alternate spellings or UI names that should participate in search and deduplication.
- `relatedTerms`: semantic or pipeline relationships only; do not create a relation merely because two CSV fields are adjacent.
- `contexts`: source environments or phrases with their explanation and diagnostic experience.
- `usageNotes`: additional cautions or practical observations.
- `spokenForm`: readable words for a code symbol, for example `F Engine Loop Tick`.

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
