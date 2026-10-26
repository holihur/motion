import { expect, test } from "../helpers/fixtures"
import { authHeaders, signIn } from "../helpers/account"
import { createPage, listWorkspaces, textBlock } from "../helpers/api"

test.describe("version history", () => {
  test("saves a version and restores it from the page", async ({ page, request }) => {
    const account = await signIn(page, request)
    const workspaces = await listWorkspaces(request, account.token)
    const created = await createPage(request, account.token, workspaces[0].id, {
      title: "History Test",
      blocks: [textBlock("Version one content")],
    })
    const revision = await request.post(`/api/pages/${created.id}/revisions`, {
      headers: authHeaders(account.token),
    })
    expect(revision.ok()).toBeTruthy()

    await request.patch(`/api/pages/${created.id}`, {
      headers: authHeaders(account.token),
      data: { title: "Different Title" },
    })
    await request.put(`/api/pages/${created.id}/blocks`, {
      headers: authHeaders(account.token),
      data: { blocks: [textBlock("Version two content")] },
    })

    await page.goto(`/page/${created.id}`)
    await expect(page.locator("[data-editor-title=true]")).toHaveValue("Different Title")
    await page.locator("header").getByLabel("Version history").click()
    await page.getByRole("button", { name: "Save current version" }).click()
    await page.waitForTimeout(500)
    await page.getByRole("dialog").getByRole("button", { name: /History Test/ }).first().click()
    await page.getByRole("button", { name: "Restore this version" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Restore version" }).click()

    await expect(page.getByText("Version restored")).toBeVisible()
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.locator("[data-editor-title=true]")).toHaveValue("History Test")
    await expect(
      page.locator("main [data-block-input]").getByText("Version one content", { exact: true }),
    ).toBeVisible()
  })
})
