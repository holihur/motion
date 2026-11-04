import fs from "node:fs/promises"
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

  await page.locator(".mermaid-frame svg").click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  const pngDownload = page.waitForEvent("download")
  await dialog.getByRole("button", { name: "PNG", exact: true }).click()
  const download = await pngDownload
  const path = await download.path()
  expect(path).toBeTruthy()
  const buffer = await fs.readFile(path!)
  expect(buffer.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  expect(buffer.readUInt32BE(16)).toBeGreaterThan(100)
  expect(buffer.readUInt32BE(20)).toBeGreaterThan(100)
})
