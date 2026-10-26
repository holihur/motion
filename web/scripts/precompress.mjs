import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { extname, join, resolve } from "node:path"
import { brotliCompressSync, constants, gzipSync } from "node:zlib"

const dist = resolve("dist")
const compressible = new Set([".html", ".js", ".mjs", ".css", ".svg", ".json", ".txt", ".xml"])
const minSize = 1024

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(path)
      continue
    }
    if (!compressible.has(extname(entry.name))) continue
    const size = statSync(path).size
    if (size < minSize) continue
    const source = readFileSync(path)
    writeFileSync(`${path}.gz`, gzipSync(source, { level: 9 }))
    writeFileSync(
      `${path}.br`,
      brotliCompressSync(source, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 9 },
      }),
    )
  }
}

walk(dist)
console.log("[precompress] wrote .gz and .br assets")
