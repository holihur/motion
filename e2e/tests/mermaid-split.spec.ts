import { expect, test } from "../helpers/fixtures"
import { createPage, listWorkspaces } from "../helpers/api"
import { signIn } from "../helpers/account"

test("shows Mermaid source and preview side by side", async ({ page, request }) => {
  const account = await signIn(page, request)
  const [workspace] = await listWorkspaces(request, account.token)
  const target = await createPage(request, account.token, workspace.id, {
    title: "Mermaid split lab",
    blocks: [{
      id: "mermaid-split-block",
      type: "diagram",
      text: "flowchart LR\n  A[Start] --> B[Finish]",
    }],
  })

  await page.goto(`/page/${target.id}`)
  const source = page.locator('textarea[placeholder*="flowchart"]')
  await expect(source).toBeVisible()
  await expect(page.locator(".mermaid-frame svg")).toBeVisible({ timeout: 15_000 })

  await page.getByRole("button", { name: "Source", exact: true }).click()
  await expect(source).toBeVisible()
  await expect(page.locator(".mermaid-frame svg")).toHaveCount(0)

  await page.getByRole("button", { name: "Preview", exact: true }).click()
  await expect(page.locator(".mermaid-frame svg")).toBeVisible({ timeout: 15_000 })
})
