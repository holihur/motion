import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage, getPage } from "../helpers/api"

test("inserts bookmark, equation and table-of-contents blocks and restores them", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const created = await createPage(request, account.token, workspace.id, {
    title: "Rich blocks",
    blocks: [
      { id: "", type: "heading1", text: "Overview" },
      { id: "", type: "paragraph", text: "A page with richer blocks." },
      { id: "", type: "heading2", text: "Details" },
    ],
  })
  await page.goto(`/page/${created.id}`)

  await page.getByRole("button", { name: "Add a block" }).click()
  await page.keyboard.type("/bookmark")
  await expect(page.getByText("Turn into", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: /Bookmark/ }).click()
  await page.getByPlaceholder("https://example.com").fill("https://example.com")
  await page.getByPlaceholder("Title (optional)").fill("Example site")
  await page.getByRole("button", { name: "Add bookmark" }).click()
  await expect(page.getByText("Example site", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Add a block" }).click()
  await page.keyboard.type("/equation")
  await page.getByRole("button", { name: /Equation/ }).click()
  const equation = page.locator("[data-block-row]").last()
  await equation.locator("textarea").fill("a^2 + b^2 = c^2")
  await expect(equation.locator(".katex")).toBeVisible()

  await page.getByRole("button", { name: "Add a block" }).click()
  await page.keyboard.type("/toc")
  await page.getByRole("button", { name: /Table of contents/ }).click()
  const toc = page.locator("[data-block-row]").last()
  await expect(toc.getByRole("button", { name: /Overview/ })).toBeVisible()
  await expect(toc.getByRole("button", { name: /Details/ })).toBeVisible()

  await expect
    .poll(async () => {
      const saved = await getPage(request, account.token, created.id)
      return saved.blocks.some((block) => block.type === "bookmark") &&
        saved.blocks.some((block) => block.type === "equation") &&
        saved.blocks.some((block) => block.type === "toc")
    })
    .toBe(true)

  await page.reload()
  await expect(page.getByText("Example site", { exact: true })).toBeVisible()
  await expect(page.locator(".katex")).toBeVisible()
  await expect(page.getByRole("button", { name: /Overview/ })).toBeVisible()
})
