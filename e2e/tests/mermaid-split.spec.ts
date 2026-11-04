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
      text: "flowchart TB\n  A[Start] --> B[One]\n  B --> C[Two]\n  C --> D[Three]\n  D --> E[Four]\n  E --> F[Five]\n  F --> G[Six]\n  G --> H[Seven]\n  H --> I[Finish]",
    }],
  })

  await page.goto(`/page/${target.id}`)
  const source = page.locator('textarea[placeholder*="flowchart"]')
  await expect(source).toBeVisible()
  await expect(page.locator(".mermaid-frame svg")).toBeVisible({ timeout: 15_000 })
  await expect(page.locator("[data-mermaid-highlight] .mermaid-token-keyword").first()).toHaveText("flowchart")
  await expect(page.locator("[data-mermaid-highlight] .mermaid-token-edge").first()).toContainText("-->")
  await expect.poll(async () => {
    const editor = await source.boundingBox()
    const preview = await page.locator(".mermaid-frame").boundingBox()
    return editor && preview ? editor.height >= preview.height - 8 : false
  }).toBe(true)

  const before = await source.boundingBox()
  const gutter = await page.getByRole("separator", { name: "Resize split" }).boundingBox()
  expect(before).toBeTruthy()
  expect(gutter).toBeTruthy()
  await page.mouse.move(gutter!.x + gutter!.width / 2, gutter!.y + gutter!.height / 2)
  await page.mouse.down()
  await page.mouse.move(gutter!.x + gutter!.width / 2 + 120, gutter!.y + gutter!.height / 2)
  await page.mouse.up()
  await expect.poll(async () => (await source.boundingBox())?.width ?? 0).toBeGreaterThan((before?.width ?? 0) + 50)

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
