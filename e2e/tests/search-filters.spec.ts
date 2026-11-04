import { expect, test } from "../helpers/fixtures"
import { createPage, listWorkspaces } from "../helpers/api"
import { signIn } from "../helpers/account"
import { openSearch } from "../helpers/ui"

test.describe("search filters", () => {
  test("filters by block type and sorts by title", async ({ page, request }) => {
    const account = await signIn(page, request)
    const [workspace] = await listWorkspaces(request, account.token)
    const pages = [
      { title: "Filterterm Database", type: "database" },
      { title: "Filterterm Table", type: "table" },
      { title: "Filterterm Text", type: "paragraph" },
    ]
    for (const item of pages) {
      await createPage(request, account.token, workspace.id, {
        title: item.title,
        blocks: [{ id: `search-${item.type}-block`, type: item.type, text: "" } as never],
      })
    }
    await page.reload()

    const input = await openSearch(page)
    await input.fill("Filterterm")
    const list = page.locator("[cmdk-list]")
    await expect(list.getByText("Filterterm Database", { exact: true })).toBeVisible()
    await expect(list.getByText("Filterterm Table", { exact: true })).toBeVisible()
    await expect(list.getByText("Filterterm Text", { exact: true })).toBeVisible()

    await page.getByLabel("Filter by type").selectOption("database")
    await expect(list.getByText("Filterterm Database", { exact: true })).toBeVisible()
    await expect(list.getByText("Filterterm Table", { exact: true })).toHaveCount(0)
    await expect(list.getByText("Filterterm Text", { exact: true })).toHaveCount(0)

    await page.getByLabel("Filter by type").selectOption("")
    await page.getByLabel("Sort results").selectOption("title")
    const results = list.locator("[cmdk-item]").filter({ hasText: "Filterterm" })
    await expect(results).toHaveCount(3)
    await expect(results.nth(0)).toContainText("Filterterm Database")
    await expect(results.nth(1)).toContainText("Filterterm Table")
    await expect(results.nth(2)).toContainText("Filterterm Text")

    const author = page.getByLabel("Filter by author")
    await expect(author.locator("option", { hasText: account.name })).toHaveCount(1)
  })
})
