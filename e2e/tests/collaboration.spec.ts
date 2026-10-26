import { expect, test } from "../helpers/fixtures"
import { trackConsole } from "../helpers/fixtures"
import { authHeaders, registerAccount } from "../helpers/account"
import { createPage, listWorkspaces, textBlock } from "../helpers/api"

test.describe("real-time collaboration", () => {
  test("two people edit the same page live and comment on text", async ({ page, request, browser }) => {
    const alice = await registerAccount(request, { name: "Alice" })
    const bob = await registerAccount(request, { name: "Bob" })
    const workspaces = await listWorkspaces(request, alice.token)
    const workspace = workspaces[0]
    const shared = await createPage(request, alice.token, workspace.id, {
      title: "Shared Document",
      blocks: [textBlock("A shared starting point.")],
    })
    const invite = await request.post(`/api/workspaces/${workspace.id}/members`, {
      headers: authHeaders(alice.token),
      data: { email: bob.email, role: "editor" },
    })
    expect(invite.ok()).toBeTruthy()

    const contextB = await browser.newContext({ viewport: { width: 1440, height: 960 } })
    const pageB = await contextB.newPage()
    const consoleB = trackConsole(pageB)
    try {
      await page.addInitScript((token) => localStorage.setItem("motion.token", token), alice.token)
      await pageB.addInitScript((token) => localStorage.setItem("motion.token", token), bob.token)
      await page.goto(`/page/${shared.id}`)
      await pageB.goto(`/page/${shared.id}`)
      await page.waitForTimeout(1200)

      await expect(page.getByLabel("Bob is here")).toBeVisible()
      await expect(pageB.getByLabel("Alice is here")).toBeVisible()

      await page.getByRole("button", { name: "Add a block" }).click()
      await page.waitForTimeout(100)
      await page.keyboard.type("Alice edited this live")
      await expect(pageB.getByText("Alice edited this live", { exact: true })).toBeVisible({ timeout: 10_000 })

      await pageB.getByRole("button", { name: "Add a block" }).click()
      await pageB.waitForTimeout(100)
      await pageB.keyboard.type("Bob replied live")
      await expect(page.getByText("Bob replied live", { exact: true })).toBeVisible({ timeout: 10_000 })

      const bobBlock = pageB.locator("[data-block-row]").filter({ hasText: "Bob replied live" }).locator("[data-block-input]")
      await bobBlock.click()
      await pageB.keyboard.press("Home")
      await pageB.keyboard.press("Shift+End")
      await pageB.waitForTimeout(300)
      await pageB.getByRole("button", { name: "Comment", exact: true }).click()
      await pageB.getByPlaceholder("Write a comment…").fill("Live comment from Bob")
      await pageB.getByRole("dialog").getByRole("button", { name: "Comment", exact: true }).click()
      await pageB.waitForTimeout(800)

      await expect(page.locator("[aria-label*='comment']").first()).toBeVisible({ timeout: 10_000 })
      await page.locator("header").getByLabel("Comments").click()
      await expect(page.getByText("Live comment from Bob")).toBeVisible()

      const saved = await request.get(`/api/pages/${shared.id}`, {
        headers: authHeaders(alice.token),
      })
      const blocks = (await saved.json()).blocks as { text: string }[]
      expect(blocks.map((block) => block.text)).toEqual(
        expect.arrayContaining(["Alice edited this live", "Bob replied live"]),
      )
    } finally {
      consoleB.assertClean()
      await contextB.close()
    }
  })
})
