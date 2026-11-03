import fs from "node:fs"
import path from "node:path"

const localesDir = path.resolve("src/lib/i18n/locales")
const files = fs.readdirSync(localesDir).filter((file) => file.endsWith(".json"))
if (files.length === 0) {
  console.error("No locale files found")
  process.exit(1)
}

const zhKeys = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(localesDir, "zh.json"), "utf8"))))
let hasError = false

// Duplicate keys in a JSON object silently overwrite each other, so catch them
// before JSON.parse hides the problem.
for (const file of files) {
  const raw = fs.readFileSync(path.join(localesDir, file), "utf8")
  const seen = new Set()
  for (const match of raw.matchAll(/^\s*"((?:\\.|[^"\\])*)"\s*:/gm)) {
    if (seen.has(match[1])) {
      console.error(`[${file}] duplicate key: ${match[1]}`)
      hasError = true
    }
    seen.add(match[1])
  }
}

// Placeholders such as {version} must survive translation; a missing or renamed
// one renders the raw template to users.
const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(",")
const dicts = Object.fromEntries(
  files.map((file) => [file, JSON.parse(fs.readFileSync(path.join(localesDir, file), "utf8"))]),
)
for (const [file, dict] of Object.entries(dicts)) {
  for (const [key, value] of Object.entries(dict)) {
    if (placeholders(key) !== placeholders(String(value))) {
      console.error(`[${file}] placeholder mismatch: ${key} -> ${value}`)
      hasError = true
    }
  }
}

for (const file of files) {
  if (file === "en.json") continue
  const dict = dicts[file]
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

// Ensure every statically written tr("...") key exists in zh.json. This catches
// new UI copy that would otherwise silently fall back to English forever.
const sourceFiles = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(full)
  }
}
walk(path.resolve("src"))

const trPattern = /\btr\(\s*"((?:\\.|[^"\\])*)"/g
const missing = new Set()
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8")
  for (const match of source.matchAll(trPattern)) {
    let key = match[1]
    try {
      key = JSON.parse(`"${key}"`)
    } catch {}
    if (!zhKeys.has(key)) missing.add(key)
  }
}
for (const key of [...missing].sort()) {
  console.error(`[source] missing zh translation: ${key}`)
  hasError = true
}

if (hasError) {
  console.error("i18n check failed")
  process.exit(1)
}
console.log(`i18n check passed: ${zhKeys.size} keys across ${files.length} locales`)
