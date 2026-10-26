import { test as base, expect } from "@playwright/test"

export interface ConsoleGuard {
  allow: (pattern: RegExp) => void
}

type Fixtures = { consoleGuard: ConsoleGuard }

// Every test fails if the browser logs a warning, error or uncaught exception.
// Tests can explicitly allow a known-expected message (for example the 401
// produced by the invalid-password test) without hiding anything else.
export const test = base.extend<Fixtures>({
  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = []
      const allowed: RegExp[] = []
      page.on("console", (message) => {
        if (message.type() === "warning" || message.type() === "error") {
          problems.push(`${message.type()}: ${message.text()}`)
        }
      })
      page.on("pageerror", (error) => {
        problems.push(`pageerror: ${error.message}`)
      })
      await use({ allow: (pattern) => allowed.push(pattern) })
      const unexpected = problems.filter(
        (problem) => !allowed.some((pattern) => pattern.test(problem)),
      )
      expect(
        unexpected,
        `Browser console must stay clean. Found:\n${unexpected.join("\n")}`,
      ).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

// Attach the same clean-console policy to extra browser pages (for example a
// second collaborator). Call assertClean at the end of the test.
export function trackConsole(page: import("@playwright/test").Page) {
  const problems: string[] = []
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      problems.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`))
  return {
    problems,
    assertClean() {
      expect(problems, `Browser console must stay clean. Found:\n${problems.join("\n")}`).toEqual([])
    },
  }
}
