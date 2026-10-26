import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("opens the sidebar as an overlay and closes it after navigation", async ({
    page,
    request,
  }) => {
    await signIn(page, request)
    const sidebar = page.locator("aside").first()
    await expect(sidebar).toHaveClass(/-translate-x-full/)

    await page.locator("header").getByRole("button", { name: "Toggle sidebar" }).click()
    await expect(sidebar).toHaveClass(/translate-x-0/)

    await sidebar.getByRole("button", { name: "New page" }).first().click()
    await expect(page).toHaveURL(/\/page\/[a-f0-9]+$/)
    await expect(sidebar).toHaveClass(/-translate-x-full/)
    await expect(page.locator("[data-editor-title=true]")).toBeVisible()
  })
})
