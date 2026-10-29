# 架构

## 数据模型

- `users`：账号、管理员标记、OIDC 关联
- `workspaces`：所有者 + `members[]`（editor/viewer）
- `pages`：树结构、块数组、标题/图标/封面、归档、收藏、全文搜索文本
- `page_revisions`：历史快照
- `comments`：根评论 + 单层回复，含块 ID、引用文本、字符偏移
- `api_tokens`：SHA-256 哈希、前缀、Scope、过期时间
- `ai_settings`：Provider/Model/BaseURL + 加密 Key
- `settings`：Ops 单例运行时配置
- `users` / `workspaces` / `pages` 等均建立必要索引

## 实时协作

- WebSocket `/api/ws?token=...&pageId=...&clientId=...`
- Hub 按页面和 Workspace 分组
- 在线状态、正在编辑的块、评论/页面树事件广播
- 保存块时发送 `base` 快照，服务端做块级三方合并：
  - 别人改了本客户端没改的块 → 保留别人的修改
  - 本客户端改了 → 本地优先
  - 双方改同一块 → 最后写入
- 前端在本地有未保存修改时暂存远端更新，保存后再应用，避免打断输入
- 评论锚点保存 `blockId + quote + startOffset/endOffset`，使用 CSS Custom Highlight API 渲染，不修改可编辑 DOM

## 前端加载

- 路由级懒加载 + 按需加载搜索/设置/评论/AI 面板
- Mermaid 使用独立运行时脚本，仅在页面含流程图时加载
- 构建时生成 `.gz` / `.br`，Go 静态服务器按 `Accept-Encoding` 直接发送压缩文件
- 生产二进制内嵌前端，安装后无静态目录依赖

## 安全

- JWT + PAT 双认证，PAT 使用 SHA-256 哈希存储并校验 Scope
- 工作区 owner/member/role 三层校验
- BYOK Key 与 OIDC Secret 使用 AES-256-GCM 加密
- OIDC state + nonce + 一次性 HttpOnly Cookie 交换
- 更新包校验 SHA256
- Ops 接口使用独立 `X-Ops-Token`，与用户 JWT / 管理员邮箱完全分离

## 构建

- `make dev`：快速打包前端 + API，然后只用 Go server 提供服务（默认，低内存）
- `make dev-watch`：Go server + Vite build watch（自动重建，仍有 Node 进程）
- `make dev-hmr`：Go server + Vite dev server（HMR，需要更多内存）
- `make build-fast`：内嵌前端但不做 gzip/brotli，适合本地验证单二进制
- `make build`：前端 → 预压缩 → 内嵌 → 单二进制（发布用）
- 没有 `embedweb` tag 时前端从 `web/dist` 读取，便于开发
- GitHub Actions：Go test、前端 typecheck/build、Playwright E2E（2 shard 并行）、Release、GHCR 镜像

## 国际化

- 支持 Top 10 语言：`en/zh/es/hi/ar/pt/fr/de/ja/ru`，`en` 默认兜底
- 文案全量 `943 key` 落 `web/src/lib/i18n/locales/*.json`，`en+zh` 外其余按需动态 `import()` 切块（首屏 `en` 仅 `2KB`）
- `pnpm i18n:check` 以 `zh.json` 为基线校验缺漏，CI 在 `typecheck` 后执行
- `ar` 自动 `dir=rtl`，`LANGUAGES` 统一 `native/label`，`LanguageToggle` 下拉全量

## 块系统

- 30+ `BlockType`（段落/标题/列表/表格/代码/图片/文件 PDF 预览/图表等）均一轮增强：`table` 排序/`toc` 高亮/`columns` 拖拽/`map` 点选/`password` 强度/`callout` 图标/`qrcode` 批量/`paste` 智能感知等
- `block-row 1269→1190` 抽 `useTableBlock`，`docagent 1241→990` 抽 `markdown.go`，`page-editor 1713→1640` 抽 `page-helpers/page-save` 等

## API 版本

- 稳定入口：`/api/v1/...`
- 兼容入口：`/api/...`
- 响应头：`X-Motion-API-Version: 1`
- 破坏性变更通过新版本路径引入，旧路径至少保留一个发布周期。
