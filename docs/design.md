# Motion Design Language

目标不是“更花”，而是让长时间使用的人**轻松、舒适、不焦虑**。界面用留白、层级和柔和表面表达结构，而不是用大量边框和高对比阴影制造噪音。

## 原则

1. **留白优先**：能靠间距区分的地方，不加线。
2. **表面优先**：卡片、菜单、输入框用浅色表面/阴影建立层级，避免硬边框。
3. **一个强调色**：品牌紫只用于主操作、选中态、焦点和少量提示，不大面积铺色。
4. **低对比噪音**：正文、辅助文字和占位符保持清晰，但不要用纯黑/高饱和色制造紧张感。
5. **一致的节奏**：圆角、间距、阴影、动效使用 token，不在组件里随手写新值。
6. **内容优先**：编辑器、表格、代码等数据密集区域可以保留细线，但线要浅（`border-border/60`），且只用于表达数据关系。

## Tokens

定义在 `web/src/index.css`：

- `--radius`：基础圆角。控件用 `rounded-lg`，块/卡片用 `rounded-xl`，弹窗用 `rounded-2xl`。
- `--background` / `--card` / `--popover` / `--sidebar`：表面层级。
- `--muted` / `--accent`：低对比填充和悬停。
- `--border`：只在必要时使用；默认比正文弱很多。
- `--brand` / `--brand-soft` / `--brand-two`：强调色。
- `--shadow-card` / `--shadow-soft` / `--shadow-pop`：卡片、悬浮和弹层阴影。
- `--motion-fast` / `--motion-base` / `--motion-slow` + `--motion-ease`：动效节奏。

## 组件约定

### 输入框

- 默认无边框、浅填充：`rounded-lg bg-muted/50`
- 聚焦时填充变亮并显示品牌色 ring：`focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-brand/25`
- 不要新增 `border border-input` 式输入框；需要强调时用背景/ring。

### 按钮

- 主按钮：`bg-primary`，用于页面唯一主动作。
- 次按钮：`bg-muted/50`，不再使用 outline 边框作为默认次级样式。
- 图标按钮：ghost + 悬停背景，不加边框。
- 统一圆角 `rounded-lg`。

### 卡片 / Block

- 页面级卡片、编辑器 block：`rounded-xl bg-card shadow-[var(--shadow-card)]`，默认无外边框。
- 表格、代码、数据区内部可以保留浅色分隔线。
- 空状态用浅填充（`bg-muted/40`）和留白，不用 dashed border。

### 弹层

- Dialog：`rounded-2xl` + `--shadow-pop`，无边框。
- Dropdown / Popover：`rounded-xl`，半透明 `bg-popover/95` + `backdrop-blur-xl` + `--shadow-pop`。
- Tooltip：`rounded-lg bg-foreground text-background`。

### 页面 chrome

- 顶部工具栏、侧边栏、移动底栏用背景/模糊/阴影区分，不用 `border-b` / `border-r`。
- 侧边栏和主内容至少有一个表面色差；浅色模式不要只靠一条线。
- 内容区优先用 `mb-* / mt-*` 留白分组。

### 文字

- UI 字号以 `text-xs` / `text-sm` 为主，正文编辑器 15px。
- 标题使用负字距；辅助信息用 `text-muted-foreground`，不要过淡。
- 所有用户可见文案走 `tr()`，中文必须提供真实翻译。

## 深色模式

- 不要硬编码黑色/白色表面；使用 `bg-background`、`bg-card`、`bg-muted/50`、`text-foreground`。
- 边框在深色模式自动使用 `--border`，不要新增 `border-white/10` 之类一次性值。
- 品牌色在深色模式由 token 自动提亮。

## 新增 UI 检查清单

- 是否可以用留白或表面色替代 border？
- 圆角是否落在 `lg / xl / 2xl` 三档？
- 是否使用了现有颜色和阴影 token？
- 主操作是否只有一处品牌色强调？
- 键盘焦点是否可见？
- 深色模式下是否仍然有层级？
