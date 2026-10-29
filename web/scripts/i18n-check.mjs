import fs from "node:fs"
import path from "node:path"

const localesDir = path.resolve("src/lib/i18n/locales")
const files = fs.readdirSync(localesDir).filter((f) => f.endsWith(".json"))
if (files.length === 0) {
  console.error("No locale files found")
  process.exit(1)
}
let zhKeys = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(localesDir, "zh.json"), "utf8"))))
let hasError = false
for (const file of files) {
  if (file === "en.json") continue
  const dict = JSON.parse(fs.readFileSync(path.join(localesDir, file), "utf8"))
  const keys = new Set(Object.keys(dict))
  for (const key of zhKeys) {
    if (!keys.has(key)) {
      console.error(`[${file}] missing key: ${key}`)
      hasError = true
    }
  }
  for (const key of keys) {
    if (!zhKeys.has(key) && file !== "zh.json") {
      console.warn(`[${file}] extra key (not in zh): ${key}`)
    }
  }
}
if (hasError) {
  console.error("i18n check failed: missing keys")
  process.exit(1)
}
console.log(`i18n check passed: ${zhKeys.size} keys across ${files.length} locales`)
