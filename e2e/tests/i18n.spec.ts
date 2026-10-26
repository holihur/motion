import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"

test.describe("internationalization", () => {
  test("switches between English and Chinese without reload errors", async ({ page, request }) => {
    await signIn(page, request)
    await page.locator("aside").getByLabel("Settings").click()
    await page.getByRole("tab", { name: "Appearance" }).click()
    await page.getByLabel("Language").selectOption("zh")
    await page.waitForLoadState("networkidle")
    await expect(page.getByText("最近编辑")).toBeVisible()
    await expect(page.locator("aside").getByText("搜索", { exact: true })).toBeVisible()

    await page.locator("aside").getByLabel("设置").click()
    await page.getByRole("tab", { name: "外观" }).click()
    await page.getByLabel("语言").selectOption("en")
    await page.waitForLoadState("networkidle")
    await expect(page.getByText("Recently edited")).toBeVisible()
    await expect(page.locator("aside").getByText("Search", { exact: true })).toBeVisible()
  })
})
