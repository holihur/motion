import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage, getPage, textBlock } from "../helpers/api"

test("block colors, alignment, insert, duplicate and move are persisted", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const created = await createPage(request, account.token, workspace.id, {
    title: "Block polish",
    blocks: [textBlock("One"), textBlock("Two"), textBlock("Three")],
  })
  await page.goto(`/page/${created.id}`)

  const rows = page.locator("[data-block-row]")
  await rows.first().hover()
  await rows.first().getByLabel("Block options").first().click()

  await page.getByRole("menuitem", { name: "Color" }).hover()
  await page.getByRole("button", { name: "Text color: Red" }).click()
  await page.getByRole("button", { name: "Background: Blue" }).click()
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")

  await expect
    .poll(async () => {
      const saved = await getPage(request, account.token, created.id)
      return [saved.blocks[0].textColor, saved.blocks[0].bgColor]
    })
    .toEqual(["red", "blue"])

  await rows.first().hover()
  await rows.first().getByLabel("Block options").first().click()
  await page.getByRole("menuitem", { name: "Align" }).hover()
  await page.getByRole("menuitem", { name: "Center" }).click()
  await expect
    .poll(async () => (await getPage(request, account.token, created.id)).blocks[0].align)
    .toBe("center")

  await rows.first().hover()
  await rows.first().getByLabel("Block options").first().click()
  await page.getByRole("menuitem", { name: "Duplicate" }).click()
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(1)).toContainText("One")

  await rows.first().hover()
  await rows.first().getByLabel("Block options").first().click()
  await page.getByRole("menuitem", { name: "Insert above" }).click()
  await expect(rows).toHaveCount(5)
  await rows.first().locator("[data-block-input]").click()
  await page.keyboard.type("Zero")
  await expect(rows.first()).toContainText("Zero")

  await rows.first().hover()
  await rows.first().getByLabel("Block options").first().click()
  await page.getByRole("menuitem", { name: "Move down" }).click()
  await expect
    .poll(async () => (await getPage(request, account.token, created.id)).blocks.map((block) => block.text))
    .toEqual(["One", "Zero", "One", "Two", "Three"])
})

test("subtree-aware delete and duplicate keep child blocks together", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const created = await createPage(request, account.token, workspace.id, {
    title: "Nested blocks",
    blocks: [
      { ...textBlock("Parent"), type: "toggle" },
      { ...textBlock("Child"), indent: 1 },
      { ...textBlock("Sibling") },
      { ...textBlock("Parent 2"), type: "toggle" },
      { ...textBlock("Child 2"), indent: 1 },
    ],
  })
  await page.goto(`/page/${created.id}`)

  // Deleting the parent also removes its indented child, not just the parent line.
  const parent = page.locator("[data-block-row]").filter({ hasText: "Parent" }).first()
  await parent.hover()
  await parent.getByLabel("Block options").first().click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect
    .poll(async () => (await getPage(request, account.token, created.id)).blocks.map((block) => block.text))
    .toEqual(["Sibling", "Parent 2", "Child 2"])

  // Duplicating the toggle copies its entire subtree.
  const parent2 = page.locator("[data-block-row]").filter({ hasText: "Parent 2" })
  await parent2.hover()
  await parent2.getByLabel("Block options").first().click()
  await page.getByRole("menuitem", { name: "Duplicate" }).click()
  await expect
    .poll(async () => (await getPage(request, account.token, created.id)).blocks.map((block) => `${block.indent ?? 0}:${block.text}`))
    .toEqual(["0:Sibling", "0:Parent 2", "1:Child 2", "0:Parent 2", "1:Child 2"])
})

test("nested list Enter and Backspace outdent before merging or changing type", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)

  const backspacePage = await createPage(request, account.token, workspace.id, {
    title: "Nested backspace",
    blocks: [
      { id: crypto.randomUUID(), type: "bulleted", text: "Parent" },
      { id: crypto.randomUUID(), type: "bulleted", text: "Nested", indent: 1 },
    ],
  })
  await page.goto(`/page/${backspacePage.id}`)
  const nested = page.locator("[data-block-row]").filter({ hasText: "Nested" })
  await nested.locator("[data-block-input]").click()
  await page.keyboard.press("Home")
  await page.keyboard.press("Backspace")
  await expect
    .poll(async () => {
      const saved = await getPage(request, account.token, backspacePage.id)
      return saved.blocks.map((block) => `${block.indent ?? 0}:${block.text}`)
    })
    .toEqual(["0:Parent", "0:Nested"])

  const enterPage = await createPage(request, account.token, workspace.id, {
    title: "Nested enter",
    blocks: [
      { id: crypto.randomUUID(), type: "bulleted", text: "", indent: 1 },
      { id: crypto.randomUUID(), type: "paragraph", text: "Tail" },
    ],
  })
  await page.goto(`/page/${enterPage.id}`)
  await page.locator("[data-block-row]").first().locator("[data-block-input]").click()
  await page.keyboard.press("Enter")
  await expect
    .poll(async () => {
      const saved = await getPage(request, account.token, enterPage.id)
      return saved.blocks.map((block) => `${block.type}:${block.indent ?? 0}:${block.text}`)
    })
    .toEqual(["bulleted:0:", "paragraph:0:Tail"])
})
