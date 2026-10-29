# Contributing to Motion

## Quick Start
```bash
mise install
cp .env.example .env
# Edit JWT_SECRET / ENCRYPTION_KEY
make dev # Go server + Vite build watch
```

## Block Development
- Add type to `web/src/lib/types.ts` `BlockType` and `BLOCK_LABELS`
- Implement renderer in `web/src/components/editor/block-row.tsx` or `rich-blocks.tsx` / `data-blocks.tsx`
- Add slash command in `web/src/components/editor/commands.ts`
- Update `server/internal/model/model.go` `Block` if new persisted fields (e.g. `Icon`)
- Ensure `richtext`, `staticpublish/render.go`, `export/*` handle new type
- Add `e2e` case

## i18n
- Source language is `en` (key = English text)
- Add new keys to `web/src/lib/i18n/locales/zh.json` and run `pnpm i18n:check` (checks zh parity across 10 locales)
- Top10: `en/zh/es/hi/ar/pt/fr/de/ja/ru` (on-demand `import()` chunks, `en` default fallback, `ar` RTL)
- `pnpm i18n:check` is required in CI (`typecheck` → `i18n:check` → `build:fast`)

## Code Style
- `block-row.tsx` >1000 lines → extract to `use-*` hooks (see `use-table-block.ts`, `page-helpers.tsx`)
- `docagent` markdown logic in `docagent/markdown.go`, not `agent.go`
- `page-editor` helpers in `page-save.ts` / `page-helpers.tsx` / `page-breadcrumbs.tsx`
- No hard-coded user-facing strings; use `tr()` with `zh` fallback
- No `any`, prefer `Block`/`Page` types

## CI
- `pnpm typecheck` → `pnpm i18n:check` → `pnpm build:fast`
- `go vet/test/build` (server)
- `Playwright 2 shard` (e2e)
- All via GitHub Actions, no local `make` required for verification
