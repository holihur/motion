import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage, waitForPageTitle } from "../helpers/api"

test("manual page-tree collapse survives autosave refreshes", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const parent = await createPage(request, account.token, workspace.id, { title: "Fold parent" })
  const child = await createPage(request, account.token, workspace.id, {
    title: "Fold child",
    parentId: parent.id,
  })
  await page.goto(`/page/${child.id}`)

  const parentRow = page.locator(`aside [data-page-id="${parent.id}"]`)
  const childRow = page.locator(`aside [data-page-id="${child.id}"]`)
  await expect(parentRow).toBeVisible()
  await expect(childRow).toBeVisible()

  await parentRow.getByRole("button", { name: "Collapse" }).click()
  await expect(childRow).toHaveCount(0)

  // Autosave updates the page list; the old tree reopened the active branch here.
  await page.locator("[data-editor-title=true]").fill("Fold child renamed")
  await waitForPageTitle(request, account.token, child.id, "Fold child renamed")
  await expect(childRow).toHaveCount(0)
  await expect(parentRow.getByRole("button", { name: "Expand" })).toBeVisible()
})
