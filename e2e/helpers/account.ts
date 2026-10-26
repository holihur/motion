import { expect, type APIRequestContext, type Page } from "@playwright/test"

let counter = 0

export interface TestAccount {
  token: string
  email: string
  password: string
  name: string
  userId: string
}

export function uniqueEmail(prefix = "e2e") {
  counter += 1
  return `${prefix}-${Date.now()}-${process.pid}-${counter}-${Math.random().toString(36).slice(2, 7)}@example.com`
}

export async function registerAccount(
  request: APIRequestContext,
  overrides: Partial<Pick<TestAccount, "email" | "password" | "name">> = {},
): Promise<TestAccount> {
  const email = overrides.email ?? uniqueEmail()
  const password = overrides.password ?? "motion1234"
  const name = overrides.name ?? "E2E Tester"

  const response = await request.post("/api/auth/register", {
    data: { name, email, password },
  })
  expect(response.ok(), `register failed: ${response.status()} ${await response.text()}`).toBeTruthy()
  const payload = (await response.json()) as { token: string; user: { id: string } }

  return { token: payload.token, email, password, name, userId: payload.user.id }
}

export async function signIn(page: Page, request: APIRequestContext) {
  const account = await registerAccount(request)
  await page.addInitScript((token) => {
    window.localStorage.setItem("motion.token", token)
  }, account.token)
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening|night)/)
  return account
}

export function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` }
}
