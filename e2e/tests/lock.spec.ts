import { expect, test } from "../helpers/fixtures"
import { authHeaders, signIn } from "../helpers/account"
import { createPage, getPage } from "../helpers/api"

test("page and block locks prevent accidental edits and can be released", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const created = await createPage(request, account.token, workspace.id, { title: "Lock lab" })
  await page.goto(`/page/${created.id}`)

  await page.locator("[data-editor-title=true]").fill("Lock lab")
  const title = page.locator("[data-editor-title=true]")
  await page.locator("header").getByRole("button", { name: "Page options" }).click()
  await page.getByRole("menuitem", { name: "Lock page" }).click()
  const banner = page.getByText(/This page is locked by/)
  await expect(banner).toBeVisible()
  await expect(title).toHaveAttribute("readonly", "")

  const blocked = await request.patch(`/api/pages/${created.id}`, {
    headers: authHeaders(account.token),
    data: { title: "Should fail" },
  })
  expect(blocked.status()).toBe(403)

  await page.getByRole("button", { name: "Unlock", exact: true }).click()
  await expect(banner).toHaveCount(0)
  await expect(title).not.toHaveAttribute("readonly", "")

  const row = page.locator("[data-block-row]").first()
  await row.locator("[data-block-input]").fill("Locked content")
  await expect
    .poll(async () => (await getPage(request, account.token, created.id)).blocks[0]?.text)
    .toBe("Locked content")
  await row.hover()
  await row.getByLabel("Block options").first().click()
  await page.getByRole("menuitem", { name: "Lock block" }).click()
  await expect(row.getByRole("button", { name: "Unlock block" })).toBeVisible()
  await expect(row.locator("[data-lexical-input]")).toHaveAttribute("contenteditable", "false")
  await row.getByRole("button", { name: "Unlock block" }).click()
  await expect(row.locator("[data-lexical-input]")).toHaveAttribute("contenteditable", "true")

  const saved = await getPage(request, account.token, created.id)
  expect(saved.locked).toBe(false)
  expect(saved.blocks[0].text).toBe("Locked content")
})
