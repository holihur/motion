# 第三方集成

工作区所有者可以在 **Settings → Integrations** 配置。

## Outgoing Webhook

- 支持事件：`comment.created`、`proposal.created`、`proposal.approved`、`page.published`
- 支持 `*` 订阅全部
- 请求头：
  - `X-Motion-Event`
  - `X-Motion-Delivery`
  - `X-Motion-Signature: sha256=<HMAC-SHA256(body, secret)>`
- 3 次重试，投递记录保存在 `webhook_deliveries`
- 可在设置页查看最近投递状态

## SSH 静态发布

- 通过 SFTP 把页面渲染为静态 HTML 写入远程目录
- 根页面写入 `index.html`，子页面写入 `<slug>.html`
- 私钥使用 AES-GCM 加密存储
- 建议配置 `SHA256:...` 主机指纹；留空会跳过校验
- 配置 `Public base URL` 后，发布结果会返回可访问地址
- 页面菜单 **Publish via SSH** 可一键发布当前页面及子页面

## 工作区 Skills 与 MCP

**Settings → Agent**：

- Skills：名称、描述、指令；AI Agent 在需要时通过 `load_skill` 加载
- MCP servers：远程 Streamable HTTP MCP Server，可配置请求头（如 Authorization）
- 工作区内所有 AI Agent 自动获得这些工具
- 仅工作区所有者可编辑；非所有者读取时 MCP 请求头会被隐藏

## 当前未实现

- GitHub / GitLab / Gitea Pages 发布
- Jira / Confluence ADF 发布
- S3 / MinIO / R2 对象存储
- SMTP 邮件
