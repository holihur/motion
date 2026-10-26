import { expect, test } from "../helpers/fixtures"
import { uniqueEmail } from "../helpers/account"

test.describe("authentication", () => {
  test("registers through the UI, signs out and signs back in", async ({ page }) => {
    const email = uniqueEmail("ui-auth")
    const password = "motion1234"

    await page.goto("/login")
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible()

    await page.getByRole("button", { name: "Create an account" }).click()
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible()

    await page.getByLabel("Name").fill("Ada Lovelace")
    await page.getByLabel("Email").fill(email)
    await page.getByRole("textbox", { name: "Password" }).fill(password)
    await page.getByRole("button", { name: "Create account" }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening|night)/)
    await expect(page.locator("aside").getByText("Ada Lovelace", { exact: true })).toBeVisible()

    await page.getByLabel("Account menu").click()
    await page.getByRole("menuitem", { name: "Sign out" }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible()

    await page.getByLabel("Email").fill(email)
    await page.getByRole("textbox", { name: "Password" }).fill(password)
    await page.getByRole("button", { name: "Sign in" }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ada")
  })

  test("validates empty and malformed credentials", async ({ page, consoleGuard }) => {
    await page.goto("/login")
    await page.getByLabel("Email").fill("not-an-email")
    await page.getByRole("textbox", { name: "Password" }).fill("short")
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page.getByText("Please enter a valid email address.")).toBeVisible()

    await page.getByLabel("Email").fill("nobody@example.com")
    await page.getByRole("textbox", { name: "Password" }).fill("wrong-password")
    consoleGuard.allow(/Failed to load resource.*401/)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page.getByText(/email or password is incorrect/i)).toBeVisible()
  })
})
