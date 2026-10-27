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

## Git Pages 发布

支持 GitHub、GitLab、Gitea：

- 静态 HTML 提交到指定 branch / 子目录
- GitHub 会尝试自动开启 Pages
- 支持自定义 API base URL 和公开访问地址
- Access token 加密保存

## Jira / Confluence

- 页面转换为 **ADF**
- Jira：创建新 issue，或填写 `Existing issue key` 更新已有 issue
- Confluence：创建页面，或填写 `Page ID` 更新已有页面
- 使用 Atlassian 邮箱 + API Token
- 页面菜单可直接发布到 Jira / Confluence

## S3 / MinIO / R2 存储

- 工作区可选择 S3 兼容存储替代 GridFS
- 支持 endpoint、bucket、region、prefix、public base URL
- Access key / secret key 加密保存
- Bucket 需允许公开读取，页面内图片才能直接加载

## 暂不支持

- SMTP 邮件
