# UE Words 跨电脑迁移

本项目以 GitHub 仓库作为应用源码、正式词库、文章、术语音频和 Skill 的唯一正式来源。新电脑应从 GitHub 克隆，不要复制整个旧工作目录。

## GitHub 已包含

- PWA 源码、构建配置和 GitHub Pages 工作流
- 正式术语、双语文章、语音清单和 `public/audio` 音频
- Supabase 数据库结构和不含密钥的环境变量示例
- `collect-terms` 与 `prepare-term-submission` Skill 及其安装包
- Windows 初始化脚本 `scripts/setup_windows.ps1`

## 不通过 Git 迁移

- `.env.local`：可能包含 Supabase 配置，不应提交；当前电脑没有该文件
- 浏览器、PWA 和 Codex 的登录状态：在新设备重新登录
- IndexedDB 本机学习记录：登录同一账号同步，或先在网页“设置”中导出备份
- `node_modules`、`.pnpm-store`、`dist`、`.tts-deps`：均为可重新生成的依赖或缓存
- `imports`：临时投稿和私人导入文件，按需单独备份
- 未提交的项目文档：单独保存在私人迁移包，不进入公开仓库

## 家里电脑首次安装

先安装 Git、Node.js 22 或更新版本、pnpm 10，以及 Codex。然后打开 PowerShell：

```powershell
git clone https://github.com/xueliangt5-collab/ue-words.git "$HOME\Documents\UE学习"
Set-Location "$HOME\Documents\UE学习"
powershell -ExecutionPolicy Bypass -File .\scripts\setup_windows.ps1
```

初始化脚本会执行以下操作：

1. 验证当前目录确实是 UE Words 仓库。
2. 使用锁文件安装前端依赖。
3. 执行语法检查和生产构建。
4. 将两个 Skill 安装到 `%USERPROFILE%\.codex\skills`。

完成后重启 Codex，并把克隆目录作为项目打开。

## 日常切换电脑

开始工作前：

```powershell
git status --short --branch
git pull --ff-only
```

完成修改后，让 `collect-terms` 完成检查、提交、推送和线上验证。离开电脑前确认：

```powershell
git status --short --branch
```

两台电脑不要同时保留未提交的词库或音频修改。若状态中存在不认识的文件，先保留并检查，不要使用 `git reset --hard` 或批量清理。

## 学习进度迁移

正式词库在 GitHub 中，个人收藏、复习进度和自定义词条不在 Git 仓库中。优先在新设备登录同一个网页账号并执行“立即同步”。作为额外保险，可在旧设备打开网页：

```text
设置 -> 导出备份
```

然后在新设备使用：

```text
设置 -> 导入词库或备份
```

## Supabase 与 GitHub

GitHub Pages 部署所需的 Supabase URL 和 anon key 存放在 GitHub Actions Secrets 中，不需要复制到家里电脑。只有本地开发需要登录功能时，才把 `.env.example` 复制为 `.env.local` 并填写相同项目的公开配置。

GitHub 凭据、Codex 权限批准和浏览器登录状态都必须在新电脑重新建立，不应放入迁移压缩包。
