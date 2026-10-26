# Block 加载性能优化方案

## 当前实现与瓶颈

当前页面内容以 `blocks[]` 内嵌在 `pages` 文档中：

- `GET /api/pages/:id` 一次性返回全部块
- 自动保存 `PUT /api/pages/:id/blocks` 同时发送 `blocks` 和 `base` 快照（约 2 倍数据）
- WebSocket 每次保存广播完整块数组
- 前端一次性渲染所有 `BlockRow`
- 打开页面即请求评论；每次输入都会重新扫描评论锚点
- 页面打开会立即渲染所有 Mermaid 图（已改为临近视口才渲染）

数据量较小时体验良好，但 500+ 块、多张流程图、多人同时编辑时会放大为：

- 首屏 JSON 大、解析慢
- 保存流量与 Mongo 写入量随页面大小线性增长
- React DOM 节点过多，输入与滚动卡顿
- WebSocket 每帧携带整页内容

## P0：已经落地的快速优化

这些改动风险低，已经包含在当前代码中：

1. **Mermaid 懒渲染**：`IntersectionObserver` + `rootMargin: 600px`，图表接近视口才加载 5.3MB 运行时并渲染。
2. **图片懒加载**：`loading="lazy"` / `decoding="async"`。
3. **API JSON 压缩**：页面、版本、评论接口使用 gzip。
4. **静态资源预压缩**：构建时生成 `.gz` / `.br`，Go 直接按 `Accept-Encoding` 发送。
5. **路由级代码分割**：登录、首页、编辑器、Ops、评论/AI 等按需加载。
6. **选择注释锚点**：CSS Custom Highlight API，不修改可编辑 DOM。

## P1：低风险增强（建议下一步）

### 1. 评论与历史延迟加载

- 页面首屏只渲染编辑器；`requestIdleCallback` 之后再加载评论。
- 评论面板、历史面板、Share、AI 面板改为 `React.lazy`，首次打开再加载 chunk。
- 评论高亮按 `blockId` 建索引，仅在评论或对应块变化时重建 Range，并做 120ms 防抖。

### 2. 减少全量序列化

当前每次保存会 `JSON.stringify` 整页块做签名和 base 比较。改为：

- 维护 `dirtyBlockIds: Set<string>`；
- 只为脏块计算签名；
- 保存成功后只更新脏块的 base；
- 远端更新只应用变更块。

### 3. 加载指标

前端 Performance marks：

```text
page-load-start
page-shell-painted
first-block-painted
blocks-loaded (count)
save-start / save-end (payload bytes)
ws-event (bytes, latency)
```

服务端日志增加 `blocksCount`、`responseBytes`、`saveDuration`。

## P2：增量块操作（核心改造）

### 数据模型

将块从 `pages` 文档拆到独立集合：

```js
page_blocks {
  _id,
  pageId,
  blockId,
  workspaceId,
  order,          // fractional index
  type,
  text,
  data,           // table / url / language / color ...
  rev,            // 单块版本号，服务端自增
  updatedAt,
  updatedBy
}
```

索引：

```js
{ pageId: 1, order: 1 }        // 分页/窗口查询
{ pageId: 1, blockId: 1 }      // 单块更新，唯一
```

`pages` 只保留标题、图标、封面、统计信息、`blocksRev`。

### API

```http
GET /api/pages/:id                 # 页面壳 + blocksTotal + blocksRev
GET /api/pages/:id/blocks?cursor=&limit=80
POST /api/pages/:id/ops            # 批量增量操作
```

批量操作示例：

```json
{
  "opId": "client-uuid",
  "baseRev": 42,
  "ops": [
    { "type": "update", "blockId": "b1", "patch": { "text": "hello" } },
    { "type": "insert", "afterId": "b1", "tempId": "tmp1", "block": { "type": "paragraph", "text": "" } },
    { "type": "move", "blockId": "b3", "afterId": "tmp1" },
    { "type": "delete", "blockId": "b4" }
  ]
}
```

- `opId` 幂等，断线重试不会重复插入。
- 服务端按 `block.rev` 做单块 LWW；返回新 `rev` 与最终 `order`。
- WebSocket 广播 `ops` + `rev`，而不是整页块数组。
- MCP / ADK / REST 写入复用同一套 op service。

### 兼容与迁移

1. 上线时双写：embedded blocks + `page_blocks`。
2. 双读：优先 `page_blocks`，为空时读 embedded 并异步回填。
3. 全量迁移脚本按页分批（每批 100 页），可重复执行。
4. 稳定后删除 embedded `blocks` 字段，保留 `blocksRev`。
5. `PUT /blocks` 保留为导入/兼容接口，内部转换为 ops。

### 预期收益

- 保存 payload 从 `O(page size)` 降到 `O(changed blocks)`
- WS 事件通常 < 2KB
- 大页面写入 Mongo 不再重写整页文档
- 为分页加载和虚拟化提供基础

## P3：编辑器虚拟化

使用 `@tanstack/react-virtual`：

- 按块类型估算高度，`measureElement` 实测
- 只渲染视口 + 上下缓冲（约 20-40 块）
- 聚焦块、正在编辑块、评论跳转目标永不卸载
- 滚动到远距离块使用 `scrollToIndex`
- Mermaid / 表格 / 图片在虚拟列表内继续使用 IntersectionObserver 延迟渲染

需要重点处理的边界：

- contentEditable 焦点与光标在重新挂载后恢复
- 拖拽排序与虚拟列表坐标
- 选择评论文本跨块（建议限制单块选择，现有实现已限制）
- 评论锚点 Range 只对已挂载块构建

## P4：历史与搜索

- 版本快照从整页块数组改为**块级 diff**或 zstd 压缩快照
- 历史列表只读元数据，预览按需加载
- 搜索继续使用 `pages.text` 物化字段；表格单元格已纳入
- 历史保留策略：最近 N 个 + 每天一个 + 手动版本

## 指标与验收

| 指标 | 目标 |
| --- | --- |
| 1000 块页面首屏壳 + 前 50 块 | < 300ms |
| 首块可输入 | < 500ms |
| 一次输入保存 payload | < 4KB |
| WS 增量事件 | < 2KB |
| 1000 块滚动 FPS | > 50 |
| 保存 P95 | < 80ms |
| 页面 DOM 节点 | 只保留可见 + 缓冲块 |

测试方式：

- 生成 1k / 5k 块的合成页面
- Playwright 滚动、输入、评论跳转、拖拽
- 服务端并发保存与断线重连测试
- 记录 payload、WS 帧大小、首屏时间与内存

## 建议执行顺序

1. P0（已完成）
2. P1：延迟面板 + 脏块签名 + 指标
3. P2：`page_blocks` + 增量 ops + WS delta（最高收益）
4. P3：虚拟列表
5. P4：历史 diff 与保留策略

不建议在没有增量 ops 之前直接做虚拟化：否则滚动时仍会触发全页保存和全量广播，收益有限，且 contentEditable 聚焦问题会显著增加复杂度。
