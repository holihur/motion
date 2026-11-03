import fs from "node:fs"
import path from "node:path"

const dist = path.resolve("dist")
const assetsDir = path.join(dist, "assets")
const files = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (!/\.(?:map|gz|br)$/.test(entry.name)) {
      files.push("/" + path.relative(dist, full).split(path.sep).join("/"))
    }
  }
}

if (fs.existsSync(assetsDir)) walk(assetsDir)
const core = ["/", "/manifest.webmanifest", ...files.sort()]
const swPath = path.join(dist, "sw.js")
if (!fs.existsSync(swPath)) process.exit(0)
let source = fs.readFileSync(swPath, "utf8")
source = source.replace(
  /const CORE = \[[^\]]*\]/,
  `const CORE = ${JSON.stringify(core)}`,
)
fs.writeFileSync(swPath, source)
console.log(`[sw] precache ${core.length} entries`)
