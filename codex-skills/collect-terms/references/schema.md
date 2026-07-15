# Glossary record schema

Use UTF-8 JSON. A term record has this shape:

```json
{
  "id": "imported-render-thread",
  "term": "Render Thread",
  "ipa": "",
  "zh": "渲染线程",
  "category": "图形与渲染",
  "definition": "负责向图形接口准备和提交渲染工作的线程。",
  "example": "The Render Thread is waiting for the GPU.",
  "exampleZh": "渲染线程正在等待 GPU。",
  "tags": "渲染 性能 GPU thread"
}
```

Required fields: `term`, `zh`, `definition`.

Optional fields: `id`, `ipa`, `category`, `example`, `exampleZh`, `tags`.

Use a stable lowercase `imported-` ID with ASCII letters, digits, and hyphens. The merge script generates one when omitted.

## Category guidance

Prefer these existing categories when they fit:

- `UE 基础`, `蓝图逻辑`, `资源与渲染`, `动画与碰撞`, `构建与网络`
- `游戏测试`, `故障与性能`, `游戏开发`
- `软件工程`, `图形与渲染`, `AI 与数据`, `项目管理`, `通用英语`

Create a new category only for a meaningful reusable subject area. Do not use a product name as a category when an existing technical category is clearer.

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
