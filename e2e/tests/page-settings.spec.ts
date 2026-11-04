import { expect, test } from "../helpers/fixtures"
import { createPage, getPage, listWorkspaces } from "../helpers/api"
import { signIn } from "../helpers/account"

test.describe("page settings", () => {
  test("edits page details, appearance and access", async ({ page, request }) => {
    const account = await signIn(page, request)
    const [workspace] = await listWorkspaces(request, account.token)
    const target = await createPage(request, account.token, workspace.id, {
      title: "Settings Lab",
      blocks: [{ id: "settings-block-01", type: "paragraph", text: "Settings body" }],
    })

    await page.goto(`/page/${target.id}`)
    await page.locator("header").getByRole("button", { name: "Page options" }).click()
    await page.getByRole("menuitem", { name: "Page settings" }).click()
    await expect(page).toHaveURL(new RegExp(`/page/${target.id}/settings$`))

    await page.getByLabel("Page title").fill("Settings Lab Renamed")
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect
      .poll(async () => (await getPage(request, account.token, target.id)).title)
      .toBe("Settings Lab Renamed")

    await page.getByRole("button", { name: /Full width/ }).click()
    await expect.poll(async () => (await getPage(request, account.token, target.id)).width).toBe("full")

    await page.getByRole("button", { name: "Blue", exact: true }).click()
    await expect.poll(async () => (await getPage(request, account.token, target.id)).theme).toBe("blue")

    await page.getByRole("switch").click()
    await expect.poll(async () => (await getPage(request, account.token, target.id)).watermark).toBe(true)

    await page.getByRole("button", { name: "Lock page" }).click()
    await expect.poll(async () => (await getPage(request, account.token, target.id)).locked).toBe(true)
    await page.getByRole("button", { name: "Unlock page" }).click()
    await expect.poll(async () => (await getPage(request, account.token, target.id)).locked).toBe(false)

    await page.getByRole("button", { name: "Manage access" }).click()
    await expect(page.getByRole("dialog").getByText(/Share “Settings Lab Renamed”/)).toBeVisible()
    await page.keyboard.press("Escape")

    await page.getByRole("button", { name: "Back to page" }).click()
    await expect(page).toHaveURL(new RegExp(`/page/${target.id}$`))
    await expect(page.getByRole("textbox", { name: "Untitled" })).toHaveValue("Settings Lab Renamed")
  })
})
