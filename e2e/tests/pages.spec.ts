import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import {
  getPage,
  waitForBlockText,
  waitForPageTitle,
  workspaceAndPages,
} from "../helpers/api"

test.describe("page management", () => {
  test("creates, favorites, archives, restores and permanently deletes a page", async ({
    page,
    request,
  }) => {
    const account = await signIn(page, request)

    await page.locator("aside").getByRole("button", { name: "New page" }).first().click()
    await expect(page).toHaveURL(/\/page\/[a-f0-9]+$/)
    const pageId = page.url().split("/").pop()!

    const title = page.locator("[data-editor-title=true]")
    await expect(title).toHaveValue("")
    await title.fill("Project Atlas")
    await waitForPageTitle(request, account.token, pageId, "Project Atlas")

    await page.locator("[data-block-input]").first().click()
    await page.keyboard.type("A north star for the team.")
    await waitForBlockText(request, account.token, pageId, "A north star for the team.")

    const row = page.locator(`aside [data-page-id="${pageId}"]`).first()
    await expect(row).toContainText("Project Atlas")

    await page.locator("header").getByLabel("Add to favorites").click()
    await expect(page.locator(`aside [data-page-id="${pageId}"]`)).toHaveCount(2)
    await expect(page.locator("header").getByLabel("Remove from favorites")).toBeVisible()

    await page.locator("header").getByLabel("Page options").click()
    await page.getByRole("menuitem", { name: "Move to Trash" }).click()
    await expect(page).toHaveURL(/\/$/)

    await page.locator("aside").getByRole("button", { name: "Trash" }).click()
    await expect(page).toHaveURL(/\/trash$/)
    const trashRow = page.locator(`main [data-page-id="${pageId}"]`)
    await expect(trashRow).toContainText("Project Atlas")
    await trashRow.getByRole("button", { name: /Restore/ }).click()
    await expect(page.locator(`main [data-page-id="${pageId}"]`)).toHaveCount(0)

    await page.locator("aside").getByRole("button", { name: "Home" }).click()
    await expect(page.locator(`aside [data-page-id="${pageId}"]`).first()).toContainText("Project Atlas")

    await page
      .locator(`aside [data-page-id="${pageId}"]`)
      .first()
      .getByRole("button", { name: "Project Atlas" })
      .click()
    await expect(page).toHaveURL(new RegExp(`/page/${pageId}$`))
    await page.locator("header").getByLabel("Page options").click()
    await page.getByRole("menuitem", { name: "Move to Trash" }).click()
    await expect(page).toHaveURL(/\/$/)

    await page.locator("aside").getByRole("button", { name: "Trash" }).click()
    const rowToDelete = page.locator(`main [data-page-id="${pageId}"]`)
    await expect(rowToDelete).toBeVisible()
    await rowToDelete.getByLabel("Delete forever").click()
    await page.getByRole("dialog").getByRole("button", { name: "Delete forever" }).click()
    await expect(page.locator(`main [data-page-id="${pageId}"]`)).toHaveCount(0)
  })

  test("creates a nested page and renames it from the sidebar", async ({ page, request }) => {
    const account = await signIn(page, request)
    const { workspace } = await workspaceAndPages(request, account.token)

    await page.locator("aside").getByRole("button", { name: "New page" }).first().click()
    await expect(page).toHaveURL(/\/page\/[a-f0-9]+$/)
    const parentId = page.url().split("/").pop()!
    await page.locator("[data-editor-title=true]").fill("Parent Page")
    await waitForPageTitle(request, account.token, parentId, "Parent Page")

    const parentRow = page.locator(`aside [data-page-id="${parentId}"]`).first()
    await expect(parentRow).toContainText("Parent Page")
    await parentRow.hover()
    await parentRow.getByLabel("Page options").click()
    await page.getByRole("menuitem", { name: "Add sub-page" }).click()

    await expect
      .poll(async () => page.url().match(/\/page\/([a-f0-9]+)$/)?.[1] ?? "")
      .not.toBe(parentId)
    const childId = page.url().split("/").pop()!
    const childTitle = page.locator("[data-editor-title=true]")
    await expect(childTitle).toHaveValue("")
    await childTitle.fill("Child Page")
    await waitForPageTitle(request, account.token, childId, "Child Page")

    const child = await getPage(request, account.token, childId)
    expect(child.parentId).toBe(parentId)
    expect(child.workspaceId).toBe(workspace.id)
    await expect(page.locator("aside").getByText("Child Page", { exact: true })).toBeVisible()

    await parentRow.hover()
    await parentRow.getByLabel("Page options").click()
    await page.getByRole("menuitem", { name: "Rename" }).click()
    await page.getByLabel("Title").fill("Parent Renamed")
    await page.getByRole("button", { name: "Save" }).click()
    await waitForPageTitle(request, account.token, parentId, "Parent Renamed")
    await expect(page.locator("aside").getByText("Parent Renamed", { exact: true }).first()).toBeVisible()
  })
})
