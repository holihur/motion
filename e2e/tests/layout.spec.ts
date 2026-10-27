import { expect, test } from "../helpers/fixtures"
import { authHeaders, signIn } from "../helpers/account"
import { createPage, getPage } from "../helpers/api"

test("a layout page shares its header and footer with another page", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const layout = await createPage(request, account.token, workspace.id, {
    title: "Shared Layout",
    blocks: [
      { id: crypto.randomUUID(), type: "paragraph", text: "ACME header" },
      { id: crypto.randomUUID(), type: "content", text: "" },
      { id: crypto.randomUUID(), type: "paragraph", text: "ACME footer" },
    ],
  })
  const marked = await request.patch(`/api/pages/${layout.id}`, {
    headers: authHeaders(account.token),
    data: { isLayout: true },
  })
  expect(marked.ok()).toBeTruthy()
  const target = await createPage(request, account.token, workspace.id, {
    title: "Layout consumer",
    blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "Body copy" }],
  })

  await page.goto(`/page/${target.id}`)
  await page.getByLabel("Page options").last().click()
  await page.getByRole("menuitem", { name: "Page layout" }).click()
  await expect(page.getByRole("button", { name: /Shared Layout/ })).toBeVisible()
  await page.getByRole("button", { name: /Shared Layout/ }).click()
  await page.getByRole("button", { name: "Apply layout" }).click()

  await expect
    .poll(async () => (await getPage(request, account.token, target.id)).layoutId)
    .toBe(layout.id)
  await expect(page.getByText("ACME header", { exact: true })).toBeVisible()
  await expect(page.getByText("ACME footer", { exact: true })).toBeVisible()
  await expect(page.locator("[data-block-row]").filter({ hasText: "Body copy" })).toBeVisible()
  await page.reload()
  await expect(page.getByText("ACME header", { exact: true })).toBeVisible()
  await expect(page.getByText("Body copy", { exact: true })).toBeVisible()

  const exported = await request.get(`/api/pages/${target.id}/export?format=html`, {
    headers: authHeaders(account.token),
  })
  expect(exported.ok()).toBeTruthy()
  const html = await exported.text()
  expect(html).toContain("ACME header")
  expect(html).toContain("Body copy")
  expect(html).toContain("ACME footer")
})
