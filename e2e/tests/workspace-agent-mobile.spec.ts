import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"

test("mobile can add skills and MCP servers without a secure-context randomUUID", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  // Reproduce a phone opening the app over plain HTTP on the local network,
  // where crypto.randomUUID is unavailable.
  await page.addInitScript(() => {
    try {
      Object.defineProperty(Crypto.prototype, "randomUUID", {
        configurable: true,
        value: undefined,
      })
    } catch {
      // Ignore browsers that make the property non-configurable.
    }
  })
  await signIn(page, request)
  await page.keyboard.press("Escape")
  await page.getByRole("main").getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByRole("tab", { name: "Agent" }).click()
  await expect(page.getByText("Workspace skills & MCP")).toBeVisible()

  await page.getByRole("button", { name: "Add skill" }).click()
  await expect(page.getByPlaceholder("Skill name")).toBeVisible()
  await page.getByPlaceholder("Skill name").fill("Mobile skill")

  await page.getByRole("button", { name: "Add MCP server" }).click()
  await expect(page.getByPlaceholder("Server name")).toBeVisible()
  await page.getByPlaceholder("Server name").fill("Mobile MCP")
  await expect(page.getByText("Workspace skills & MCP")).toBeVisible()
})
