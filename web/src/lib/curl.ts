export interface ParsedCurl {
  method: string
  url: string
  headers: [string, string][]
  body: string
  auth: string
  cookies: string
}

function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ""
  let quote: "'" | '"' | null = null
  let escaped = false
  for (const char of input) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === "\\" && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ""
      }
      continue
    }
    current += char
  }
  if (current) tokens.push(current)
  return tokens
}

function addHeader(headers: [string, string][], value: string) {
  const index = value.indexOf(":")
  if (index > 0) headers.push([value.slice(0, index).trim(), value.slice(index + 1).trim()])
  else if (value.trim()) headers.push([value.trim(), ""])
}

/** Parses the common curl flags used in API docs. It never executes a request. */
export function parseCurl(command: string): ParsedCurl | null {
  const normalized = command.replace(/\\\r?\n/g, " ").replace(/^\s*\$\s*/, "").trim()
  if (!normalized) return null
  const tokens = tokenize(normalized)
  if (tokens.length === 0 || !/^curl(?:\.exe)?$/i.test(tokens[0])) return null

  let method = ""
  let url = ""
  let body = ""
  let auth = ""
  let cookies = ""
  const headers: [string, string][] = []

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    const next = () => tokens[++index] ?? ""
    if (token === "-X" || token === "--request") method = next()
    else if (token.startsWith("--request=")) method = token.slice("--request=".length)
    else if (token.startsWith("-X") && token.length > 2) method = token.slice(2)
    else if (token === "-H" || token === "--header") addHeader(headers, next())
    else if (token.startsWith("--header=")) addHeader(headers, token.slice("--header=".length))
    else if (token === "-d" || token === "--data" || token === "--data-raw" || token === "--data-binary" || token === "--data-urlencode") body = body ? `${body}&${next()}` : next()
    else if (token.startsWith("--data-raw=") || token.startsWith("--data=") || token.startsWith("--data-binary=")) {
      const value = token.slice(token.indexOf("=") + 1)
      body = body ? `${body}&${value}` : value
    } else if (token === "-F" || token === "--form") body = body ? `${body}\n${next()}` : next()
    else if (token === "-u" || token === "--user") auth = next()
    else if (token === "-b" || token === "--cookie") cookies = next()
    else if (token === "--url") url = next()
    else if (token === "-A" || token === "--user-agent") addHeader(headers, `User-Agent: ${next()}`)
    else if (token === "-e" || token === "--referer") addHeader(headers, `Referer: ${next()}`)
    else if (!token.startsWith("-") && !url) url = token
  }

  if (!url) return null
  return {
    method: (method || (body ? "POST" : "GET")).toUpperCase(),
    url,
    headers,
    body,
    auth,
    cookies,
  }
}
