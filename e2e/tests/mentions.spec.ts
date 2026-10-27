import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage, getPage } from "../helpers/api"

test("@ mentions insert workspace members and survive reload", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const created = await createPage(request, account.token, workspace.id, { title: "Mentions" })
  await page.goto(`/page/${created.id}`)

  await page.getByRole("button", { name: "Add a block" }).click()
  await expect(page.locator("[data-block-input]").last()).toBeFocused()
  await page.keyboard.type("Ask ")
  await page.keyboard.type("@")
  const popup = page.locator("[data-mention-popup]")
  await expect(popup).toBeVisible()
  await expect(popup.getByText("E2E Tester", { exact: true })).toBeVisible()
  await popup.getByRole("button", { name: /E2E Tester/ }).click()
  await expect(page.locator(".lexical-mention").filter({ hasText: "@E2E Tester" })).toBeVisible()

  await expect
    .poll(async () => {
      const saved = await getPage(request, account.token, created.id)
      return saved.blocks.some((block) => block.text.includes("@E2E Tester")) && Boolean(saved.blocks.find((block) => block.type === "paragraph")?.rich)
    })
    .toBe(true)

  await page.reload()
  await expect(page.locator(".lexical-mention").filter({ hasText: "@E2E Tester" })).toBeVisible()
})
