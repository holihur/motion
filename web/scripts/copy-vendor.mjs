import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const source = resolve(root, "node_modules/mermaid/dist/mermaid.min.js")
const target = resolve(root, "public/vendor/mermaid.min.js")

if (!existsSync(source)) {
  console.warn("[vendor] mermaid is not installed; skipping diagram runtime")
  process.exit(0)
}
mkdirSync(dirname(target), { recursive: true })
copyFileSync(source, target)
console.log("[vendor] copied mermaid runtime")
