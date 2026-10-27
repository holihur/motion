# 导出

页面菜单支持：

- **Export as Markdown**：浏览器端生成 `.md`
- **Export as HTML**：服务端生成带样式的独立 HTML
- **Export as PDF**：A4 PDF，内嵌 Noto Sans SC 字体，支持中文
- **Export as Word**：`.docx`，包含标题、段落、列表、代码和表格

导出接口：

```text
GET /api/pages/{pageID}/export?format=html
GET /api/pages/{pageID}/export?format=pdf
GET /api/pages/{pageID}/export?format=docx
```

需要 `pages:read` 权限，并使用页面所在工作区的访问权限校验。

静态 HTML/PDF/Word 会保留表单标题、字段和二维码/条形码文本，但表单是只读快照；需要收集回答时请在 Motion 中打开页面。

PDF 使用 [gopdf](https://github.com/signintech/gopdf) 生成；字体为 Noto Sans SC，按 SIL Open Font License 授权，许可证见 `server/internal/export/OFL.txt`。
