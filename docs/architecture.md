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
- 所有管理员接口检查邮箱/Ops 管理员列表

## 构建

- `make build`：前端 → 内嵌 → 单二进制
- 没有 `embedweb` tag 时前端从 `web/dist` 读取，便于开发
- GitHub Actions：Go test、前端 typecheck/build、Playwright E2E、Release、GHCR 镜像
