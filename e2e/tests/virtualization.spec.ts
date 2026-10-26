import { expect, test } from "../helpers/fixtures"
import { authHeaders, registerAccount } from "../helpers/account"
import { createPage, getPage, listWorkspaces, waitForBlockText } from "../helpers/api"

test.describe("large page rendering", () => {
  test("virtualizes long block lists and keeps append/focus working", async ({ page, request }) => {
    const account = await registerAccount(request)
    const workspace = (await listWorkspaces(request, account.token))[0]
    const blocks = Array.from({ length: 120 }, (_, index) => ({
      id: `virtual-${index}-${Math.random().toString(36).slice(2)}`,
      type: "paragraph" as const,
      text: `Virtual block ${index}`,
    }))
    const created = await createPage(request, account.token, workspace.id, {
      title: "Virtual Lab",
      blocks,
    })
    await page.addInitScript((token) => localStorage.setItem("motion.token", token), account.token)
    await page.goto(`/page/${created.id}`)
    await expect(page.locator("[data-block-input]").first()).toBeVisible()

    const rendered = await page.locator("[data-block-row]").count()
    expect(rendered).toBeLessThan(90)
    await expect(page.locator("[data-block-row]").first()).toContainText("Virtual block 0")

    const scroller = page.locator("main div.overflow-y-auto").first()
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(page.getByText("Virtual block 119", { exact: true })).toBeVisible()

    await page.getByRole("button", { name: "Add a block" }).click()
    await page.keyboard.type("Appended after virtualization")
    await waitForBlockText(request, account.token, created.id, "Appended after virtualization")
    const saved = await getPage(request, account.token, created.id)
    expect(saved.blocks).toHaveLength(121)
  })
})
