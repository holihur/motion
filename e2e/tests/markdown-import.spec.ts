import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage, getPage } from "../helpers/api"

const markdown = `# Imported title

- [ ] First task
- [x] Done task

| Name | Status |
| --- | --- |
| Alpha | Live |

\`\`\`ts
const x = 1
\`\`\`

> A quote
`

test("imports Markdown files and parses pasted Markdown into blocks", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const created = await createPage(request, account.token, workspace.id, { title: "Import lab" })
  await page.goto(`/page/${created.id}`)

  await page.locator("header").getByRole("button", { name: "Page options" }).click()
  await page.getByRole("menuitem", { name: "Import Markdown" }).click()
  await page.locator('header input[type="file"][accept*=".md"]').setInputFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(markdown),
  })

  await expect(page.getByText("Imported title", { exact: true })).toBeVisible()
  await expect(page.getByText("First task", { exact: true })).toBeVisible()
  await expect(page.locator("table input").first()).toHaveValue("Name")
  await expect(page.getByRole("textbox", { name: "Code" })).toHaveValue("const x = 1")

  await expect
    .poll(async () => {
      const saved = await getPage(request, account.token, created.id)
      return saved.blocks.some((block) => block.type === "heading1" && block.text === "Imported title") &&
        saved.blocks.some((block) => block.type === "todo") &&
        saved.blocks.some((block) => block.type === "table")
    })
    .toBe(true)

  await page.getByRole("button", { name: "Add a block" }).click()
  await expect(page.locator("[data-block-input]").last()).toBeFocused()
  await page.locator("[data-lexical-input]").last().evaluate((element, text) => {
    const data = new DataTransfer()
    data.setData("text/plain", text)
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
  }, "## Pasted heading\n\n- Pasted item")

  await expect(page.getByText("Pasted heading", { exact: true })).toBeVisible()
  await expect(page.getByText("Pasted item", { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText("Imported title", { exact: true })).toBeVisible()
  await expect(page.getByText("Pasted heading", { exact: true })).toBeVisible()
})
