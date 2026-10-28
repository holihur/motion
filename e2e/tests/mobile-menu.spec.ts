import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage, workspaceAndPages } from "../helpers/api"

test.use({ viewport: { width: 390, height: 360 } })

test("long menus stay inside a phone viewport and scroll vertically", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await workspaceAndPages(request, account.token)
  const created = await createPage(request, account.token, workspace.id, {
    title: "Menu lab",
    blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "Open the block menu" }],
  })
  await page.goto(`/page/${created.id}`)

  await page.locator("[data-block-row]").first().getByRole("button", { name: "Block options" }).click()
  const menu = page.getByRole("menu").first()
  await expect(menu).toBeVisible()

  await expect.poll(async () => menu.evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto")
  const metrics = await menu.evaluate((element) => ({
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
    viewport: window.innerHeight,
  }))
  expect(metrics.height).toBeLessThan(metrics.viewport)
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.height)

  await menu.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
  await expect(menu.getByRole("menuitem").last()).toBeVisible()
})
