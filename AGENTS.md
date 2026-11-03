# AGENTS.md

给在本仓库里干活的 AI / 人类协作者的最小约定。

## 必须：工具链由 mise 管理

`mise.toml` 是本仓库工具链的**唯一来源**（Go、Node、pnpm 的版本都写在这里）。
不要用系统包管理器或全局安装替代它。

- 禁止：`apt install golang`、`npm i -g pnpm`、`curl … | sh` 装 Go/Node、`brew install go` 等
- 禁止：把 `/usr/local/go`、`~/.nvm` 之类的路径写进文档或脚本
- 允许：`mise install`（按 `mise.toml` 安装固定版本）

首次准备环境：

```bash
mise install
cp .env.example .env      # 填 JWT_SECRET / ENCRYPTION_KEY
cd web && mise exec -- pnpm install --frozen-lockfile
```

## 命令写法

所有语言工具链命令都通过 mise 执行，保证用的是 `mise.toml` 里的版本：

```bash
mise exec -- go build ./...        # 而不是直接 go build
mise exec -- pnpm typecheck        # 而不是直接 pnpm typecheck
```

`Makefile` 已经封装好（`MISE_EXEC ?= $(MISE) exec --`），能直接用目标就别手搓命令：

```bash
make install      # mise install + 前端/e2e 依赖
make typecheck    # cd web && mise exec -- pnpm typecheck
make build        # 前端构建 + 单二进制
make test         # Go 测试 + 前端类型检查
```

## 本地验证范围

本机资源有限（内存/磁盘），跑全量 Go 测试与 e2e 又慢又容易失败，因此：

- **本地只跑**：`mise exec -- pnpm typecheck`、`mise exec -- pnpm i18n:check`
- **交给 GitHub CI 跑**：`go vet ./...`、`go test ./...`、`go build ./...`、`pnpm build:fast`、Playwright
  （`.github/workflows/ci.yml`，`push` 到 `main` 与 `pull_request` 都会触发）

## i18n

- 源文案 key 使用英文；`en.json` 只是部分覆盖，命中不到时 `tr()` 直接回退到 key 本身，所以英文界面不依赖 `en.json`。
- **只有 `zh.json` 是全量维护的翻译**。其余 8 个 locale（ar/de/es/fr/hi/ja/pt/ru）目前大多数条目是与 key 相同的英文占位，真正的多语言翻译属于单独的翻译专项，不要把它们视为已完成本地化。
- 新增 key 必须同时补进 10 个 locale（`pnpm i18n:check` 强制二者 key 集合一致），并保留 `{placeholder}`；中文必须给出真实翻译，其他 locale 暂用英文占位。
- `pnpm i18n:check` 同时会检查重复 key 和占位符丢失。

## 版本升级

升级工具链只改 `mise.toml`，并保持与 CI 的 `jdx/mise-action` 一致：

```bash
# 1. 编辑 mise.toml 里的版本
# 2. 重新安装并验证
mise install
mise exec -- go version
mise exec -- pnpm -v
```

不要在 Dockerfile、CI、脚本里再写死一套版本号；需要时从 `mise.toml` 引用。

## 不要提交

`node_modules/`、`web/dist/`、`server/bin/`、`e2e/test-results/`、`.env`、`.pi/`。
