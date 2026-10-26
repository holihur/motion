import { expect, test } from "../helpers/fixtures"
import { registerAccount } from "../helpers/account"

const OPS_TOKEN = process.env.OPS_TOKEN ?? "e2e-ops-token"

test.describe("ops console", () => {
  test("opens with the independent Ops access token and persists settings", async ({ page }) => {
    await page.goto("/ops")
    await expect(page.getByRole("heading", { name: "Ops console" })).toBeVisible()
    await expect(page.getByText("Ops uses a dedicated access token")).toBeVisible()

    await page.getByLabel("Ops access token").fill(OPS_TOKEN)
    await page.getByRole("button", { name: "Unlock Ops" }).click()
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

    await page.getByRole("button", { name: "Lock Ops" }).click()
    await expect(page.getByRole("heading", { name: "Ops console" })).toBeVisible()
  })

  test("a signed-in workspace account cannot open Ops without the token", async ({ page, request }) => {
    const account = await registerAccount(request)
    await page.addInitScript((token) => localStorage.setItem("motion.token", token), account.token)
    await page.goto("/ops")
    await expect(page.getByRole("heading", { name: "Ops console" })).toBeVisible()
    await expect(page.getByLabel("Ops access token")).toBeVisible()
    await expect(page.getByText("Instance health")).toHaveCount(0)
  })
})
