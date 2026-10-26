import { expect, test } from "../helpers/fixtures"
import { authHeaders, registerAccount } from "../helpers/account"
import { createPage, getPage, listWorkspaces, textBlock } from "../helpers/api"

test.describe("permissions and rich text", () => {
  test("viewers get a real read-only editor", async ({ page, request }) => {
    const owner = await registerAccount(request, { name: "Owner" })
    const viewer = await registerAccount(request, { name: "Viewer" })
    const workspace = (await listWorkspaces(request, owner.token))[0]
    const shared = await createPage(request, owner.token, workspace.id, {
      title: "Read Only",
      blocks: [textBlock("A shared plan.")],
    })
    const invite = await request.post(`/api/workspaces/${workspace.id}/members`, {
      headers: authHeaders(owner.token),
      data: { email: viewer.email, role: "viewer" },
    })
    expect(invite.ok()).toBeTruthy()

    await page.addInitScript((token) => localStorage.setItem("motion.token", token), viewer.token)
    await page.goto(`/page/${shared.id}`)
    await expect(page.getByText("View only")).toBeVisible()
    await expect(page.locator("[data-editor-title=true]")).toHaveAttribute("readonly", "")
    await expect(page.locator("[data-block-input]").first()).toHaveAttribute("contenteditable", "false")
    await expect(page.locator("[data-block-input]").first()).toHaveAttribute("aria-readonly", "true")
    await expect(page.getByRole("button", { name: "Add a block" })).toHaveCount(0)
    await expect(page.locator("header").getByLabel("Ask Motion AI")).toHaveCount(0)

    await page.locator("[data-block-input]").first().click()
    await page.keyboard.type("Hacked")
    await page.waitForTimeout(800)
    const saved = await getPage(request, owner.token, shared.id)
    expect(saved.blocks[0].text).toBe("A shared plan.")
  })

  test("bold formatting survives save and reload through Lexical", async ({ page, request }) => {
    const account = await registerAccount(request)
    const workspace = (await listWorkspaces(request, account.token))[0]
    const pageData = await createPage(request, account.token, workspace.id, {
      title: "Rich Text",
      blocks: [textBlock("Format me")],
    })
    await page.addInitScript((token) => localStorage.setItem("motion.token", token), account.token)
    await page.goto(`/page/${pageData.id}`)

    const input = page.locator("[data-block-input]").first()
    await input.click()
    await page.keyboard.press("Home")
    await page.keyboard.press("Shift+End")
    await expect(page.getByRole("button", { name: "Bold" })).toBeVisible()
    await page.getByRole("button", { name: "Bold" }).click()
    await expect(input.locator("strong")).toContainText("Format me")

    await page.waitForTimeout(900)
    const saved = await getPage(request, account.token, pageData.id)
    expect(saved.blocks[0].rich).toBeTruthy()

    await page.reload()
    await expect(page.locator("[data-block-input]").first().locator("strong")).toContainText("Format me")
  })
})
