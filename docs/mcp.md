# MCP

Motion 在 `/mcp` 暴露 Streamable HTTP MCP Server。

## 1. 创建 Token

登录后打开 **Settings → Developer**，创建 PAT：

- 建议最小权限：`pages:read`、`pages:write`（按需 `workspace:read`、`ai:use`）
- Token 只显示一次
- 页面会生成 MCP JSON，可直接复制

## 2. 客户端配置

远程 HTTP 客户端：

```json
{
  "mcpServers": {
    "motion": {
      "type": "http",
      "url": "http://localhost:8787/mcp",
      "headers": {
        "Authorization": "Bearer motion_pat_xxx"
      }
    }
  }
}
```

Claude Desktop 等使用 stdio 的客户端可以借助 `mcp-remote`：

```bash
npx -y mcp-remote http://localhost:8787/mcp \
  --header "Authorization: Bearer motion_pat_xxx"
```

## 3. 工具

| 工具 | 说明 | Scope |
| --- | --- | --- |
| `list_workspaces` | 列出可访问工作区与角色 | `pages:read` |
| `search_pages` | 搜索标题/正文/表格，空查询列出最近页面 | `pages:read` |
| `read_page` | 读取页面块、块 ID 和 Markdown | `pages:read` |
| `create_page` | 用 Markdown 创建页面 | `pages:write` |
| `append_blocks` | 追加段落、标题、列表、待办、表格、Mermaid | `pages:write` |
| `update_page` | 修改标题/Emoji | `pages:write` |
| `update_block` | 替换某个块的文本 | `pages:write` |
| `add_comment` | 给块添加评论 | `pages:write` |

PAT 的 Scope 和用户在目标工作区中的角色都会校验。只读 Token 无法写入，viewer 角色也无法写入。

## 4. 实时同步

MCP 写入页面后会通过 WebSocket 广播，正在打开该页面的浏览器会实时更新，并记录历史版本。
