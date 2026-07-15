# UE 术语随身学

面向 Unreal Engine 与游戏测试英语学习的可安装 PWA。

正式地址（发布后）：`https://xueliangt5-collab.github.io/ue-words/`

## 已实现

- 69 条 UE、蓝图、渲染、动画、游戏测试、性能与网络基础术语
- 中英文全文搜索、分类筛选、收藏和个人词条
- 系统英语语音、可调语速、术语与例句朗读
- FSRS 间隔重复、英中/中英双向复习、每日新词数量
- 学习进度、连续学习天数和最近复习记录
- IndexedDB 本机持久化、JSON 导入导出
- Service Worker 离线启动和 PWA 安装
- 可选 Supabase 邮箱登录和多设备同步

## 本地运行

```powershell
pnpm install
pnpm run dev
```

生产构建：

```powershell
pnpm run build
pnpm run preview
```

## 云同步

1. 创建 Supabase 项目。
2. 在 SQL Editor 执行 `supabase/schema.sql`。
3. 复制 `.env.example` 为 `.env.local`，填写项目 URL 和 anon key。
4. 在 Supabase Authentication 中启用 Email 登录，并添加部署域名到 Redirect URLs。
5. 重新构建并部署 `dist` 目录。

数据库已启用 Row Level Security，每个登录账号只能访问自己的词条、复习进度、设置和活动记录。
