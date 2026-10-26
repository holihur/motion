import { expect, test } from "../helpers/fixtures"
import { registerAccount } from "../helpers/account"

test.describe("ops console", () => {
  test("admin can open Ops and persist runtime settings", async ({ page, request }) => {
    const account = await registerAccount(request, {
      name: "Ops Admin",
      email: "e2e-admin@example.com",
    })
    await page.addInitScript((token) => localStorage.setItem("motion.token", token), account.token)
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()

    await page.locator("aside").getByLabel("Ops console").click()
    await expect(page.getByRole("heading", { name: /Ops/ })).toBeVisible()
    await expect(page.getByText("Instance health")).toBeVisible()
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible()

    const name = page.getByLabel("Instance name")
    await expect(name).toHaveValue("Motion")
    await name.fill("Motion E2E")
    await page.getByRole("button", { name: /Save changes/ }).click()
    await expect(page.getByText("Ops settings saved")).toBeVisible()

    await page.reload()
    await expect(page.getByLabel("Instance name")).toHaveValue("Motion E2E")
    await expect(page.getByText("Instance health")).toBeVisible()
  })

  test("non-admin users cannot reach Ops", async ({ page, request }) => {
    const account = await registerAccount(request)
    await page.addInitScript((token) => localStorage.setItem("motion.token", token), account.token)
    await page.goto("/ops")
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  })
})
