import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage, getPage } from "../helpers/api"

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
)

test("toggles, columns, code highlighting, page links, backlinks, breadcrumbs and uploads", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const created = await createPage(request, account.token, workspace.id, { title: "Advanced blocks" })
  const target = await createPage(request, account.token, workspace.id, { title: "Linked target" })
  const parent = await createPage(request, account.token, workspace.id, { title: "Breadcrumb parent" })
  const child = await createPage(request, account.token, workspace.id, { title: "Breadcrumb child", parentId: parent.id })
  await page.goto(`/page/${created.id}`)

  // Toggle with an indented child, collapse/expand and persist the state.
  await page.getByRole("button", { name: "Add a block" }).click()
  await expect(page.locator("[data-block-input]").last()).toBeFocused()
  await page.keyboard.type("/toggle")
  await page.getByRole("button", { name: /^Toggle Collapsible text section/ }).click()
  await page.keyboard.type("Toggle title")
  await page.keyboard.press("Enter")
  await page.keyboard.type("Hidden child")
  await expect(page.getByText("Hidden child", { exact: true })).toBeVisible()
  const toggleRow = page.locator("[data-block-row]").filter({ hasText: "Toggle title" }).first()
  await toggleRow.getByRole("button", { name: "Collapse" }).click()
  await expect(page.getByText("Hidden child", { exact: true })).toHaveCount(0)
  await expect
    .poll(async () => {
      const saved = await getPage(request, account.token, created.id)
      return saved.blocks.some((block) => block.type === "toggle" && block.collapsed)
    })
    .toBe(true)
  await page.reload()
  await expect(page.getByText("Hidden child", { exact: true })).toHaveCount(0)
  await page.locator("[data-block-row]").filter({ hasText: "Toggle title" }).getByRole("button", { name: "Expand" }).click()
  await expect(page.getByText("Hidden child", { exact: true })).toBeVisible()

  // Columns.
  await page.getByRole("button", { name: "Add a block" }).click()
  await expect(page.locator("[data-block-input]").last()).toBeFocused()
  await page.keyboard.type("/columns")
  await page.getByRole("button", { name: /^Columns Place text/ }).click()
  const columns = page.locator("[data-block-row]").last()
  await columns.locator("textarea").nth(0).fill("Left")
  await columns.locator("textarea").nth(1).fill("Right")
  await columns.getByRole("button", { name: "Column", exact: true }).click()
  await columns.locator("textarea").nth(2).fill("Third")
  await expect(columns.locator("textarea")).toHaveCount(3)

  // Code highlighting.
  await page.getByRole("button", { name: "Add a block" }).click()
  await expect(page.locator("[data-block-input]").last()).toBeFocused()
  await page.keyboard.type("/code")
  await page.getByRole("button", { name: /^Code Capture/ }).click()
  const code = page.locator("[data-block-row]").last()
  await code.getByLabel("Code language").selectOption("typescript")
  await code.locator("textarea").fill("const answer = 42;")
  await expect(code.locator(".hljs-keyword")).toBeVisible()

  // Page link + backlinks.
  await page.getByRole("button", { name: "Add a block" }).click()
  await expect(page.locator("[data-block-input]").last()).toBeFocused()
  await page.keyboard.type("/page link")
  await page.getByRole("button", { name: /^Page link Mention/ }).click()
  await page.getByPlaceholder("Search pages…").fill("Linked target")
  await page.getByRole("button", { name: /Linked target/ }).last().click()
  await expect(page.locator("[data-block-row]").filter({ hasText: "Linked target" })).toBeVisible()
  await expect
    .poll(async () => {
      const saved = await getPage(request, account.token, created.id)
      return saved.blocks.some((block) => block.type === "pageLink" && block.url === target.id)
    })
    .toBe(true)
  await page.goto(`/page/${target.id}`)
  const backlinks = page.locator("section").filter({ hasText: "Linked from" })
  await expect(backlinks).toBeVisible()
  await expect(backlinks.getByText("Advanced blocks", { exact: true })).toBeVisible()

  // Breadcrumb block.
  await page.goto(`/page/${child.id}`)
  await page.getByRole("button", { name: "Add a block" }).click()
  await expect(page.locator("[data-block-input]").last()).toBeFocused()
  await page.keyboard.type("/breadcrumb")
  await page.getByRole("button", { name: /^Breadcrumb Show this page/ }).click()
  await expect(page.locator("[data-block-row]").getByRole("button", { name: /Breadcrumb parent/ })).toBeVisible()

  // Image upload through the block's file picker.
  await page.goto(`/page/${created.id}`)
  await page.getByRole("button", { name: "Add a block" }).click()
  await expect(page.locator("[data-block-input]").last()).toBeFocused()
  await page.keyboard.type("/image")
  await page.getByRole("button", { name: /^Image / }).click()
  await page.locator('input[type="file"][accept="image/*"]').last().setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: pixel,
  })
  await expect(page.locator('img[src^="/api/files/"]')).toBeVisible()
})
