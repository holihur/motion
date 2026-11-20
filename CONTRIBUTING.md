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
- Implement the renderer under `web/src/components/editor/block-renderers/`
  (`text-blocks.tsx`, `content-blocks.tsx`, or `data-blocks.tsx`)
- Register it in `block-renderers/index.ts` with `registerBlockRenderer(type, Component)`.
  `BlockRow` is a shell: do not add new `case` branches to it.
- Renderers receive the shared `BlockRenderProps` context (block, selection,
  focus, comments, `renderEditable`, etc.). Reuse `useTableBlock`-style hooks
  for self-contained state instead of growing the context.
- Add slash command in `web/src/components/editor/commands.ts`
- Update `server/internal/model/model.go` `Block` if new persisted fields (e.g. `Icon`)
- Ensure `richtext`, `staticpublish/render.go`, `export/*` handle new type
- Add `e2e` case

## i18n
- Source language is `en` (key = English text)
- Add new keys to `web/src/lib/i18n/locales/zh.json` and run `pnpm i18n:check` (checks zh parity across 10 locales)
- Top10: `en/zh/es/hi/ar/pt/fr/de/ja/ru` (on-demand `import()` chunks, `en` default fallback, `ar` RTL)
- `pnpm i18n:check` is required in CI (`typecheck` → `i18n:check` → `build:fast`)

## Design
- Visual language and component rules live in `docs/design.md`.
- Default to whitespace and soft surfaces over borders. Use the tokens in
  `web/src/index.css` instead of adding one-off colors, radii or shadows.
- Inputs are borderless with a muted fill; dialogs/popovers use `--shadow-pop`;
  page chrome uses background/blur instead of divider lines.

## Code Style
- Keep `block-row.tsx` as layout/selection/menu wiring only. New block UI belongs
  in `block-renderers/`; table and diagram views already live in
  `table-block-view.tsx` / `diagram-block-view.tsx`.
- Keep files under ~800 lines. When a component passes that, split a cohesive
  view or `use-*` hook out instead of adding another branch.
- `docagent` markdown logic in `docagent/markdown.go`, not `agent.go`
- `page-editor` helpers in `page-save.ts` / `page-helpers.tsx` / `page-breadcrumbs.tsx`
- No hard-coded user-facing strings; use `tr()` with `zh` fallback
- No `any`, prefer `Block`/`Page` types

## CI
- `pnpm typecheck` → `pnpm i18n:check` → `pnpm build:fast`
- `go vet/test/build` (server)
- `Playwright 2 shard` (e2e)
- All via GitHub Actions, no local `make` required for verification
