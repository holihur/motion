import { stat } from "node:fs/promises"
import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage } from "../helpers/api"

test("exports pages as HTML, PDF and Word", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const created = await createPage(request, account.token, workspace.id, {
    title: "Export lab",
    blocks: [
      { id: "", type: "heading1", text: "Export title" },
      { id: "", type: "paragraph", text: "中文内容 and English content." },
      { id: "", type: "todo", text: "A task" },
    ],
  })
  await page.goto(`/page/${created.id}`)

  for (const [label, extension] of [["Export as HTML", ".html"], ["Export as PDF", ".pdf"], ["Export as Word", ".docx"]] as const) {
    await page.locator("header").getByRole("button", { name: "Page options" }).click()
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("menuitem", { name: label }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\${extension}$`))
    const path = await download.path()
    expect(path).toBeTruthy()
    expect((await stat(path!)).size).toBeGreaterThan(300)
  }
})
