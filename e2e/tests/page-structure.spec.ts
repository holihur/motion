import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage, getPage } from "../helpers/api"

test("splits a page into heading sections and leaves a page index", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const parent = await createPage(request, account.token, workspace.id, {
    title: "Split source",
    blocks: [
      { id: crypto.randomUUID(), type: "paragraph", text: "Overview" },
      { id: crypto.randomUUID(), type: "heading1", text: "Alpha" },
      { id: crypto.randomUUID(), type: "paragraph", text: "Alpha body" },
      { id: crypto.randomUUID(), type: "heading1", text: "Beta" },
      { id: crypto.randomUUID(), type: "paragraph", text: "Beta body" },
    ],
  })
  await page.goto(`/page/${parent.id}`)
  await page.getByLabel("Page options").last().click()
  await page.getByRole("menuitem", { name: "Split into sub-pages" }).click()
  await page.getByRole("button", { name: /^H1/ }).click()
  await expect(page.getByText("Alpha body", { exact: true }).last()).toBeVisible()
  await page.getByRole("button", { name: "Split into 2 pages" }).click()

  await expect
    .poll(async () => {
      const saved = await getPage(request, account.token, parent.id)
      return saved.blocks.map((block) => block.type)
    })
    .toEqual(["paragraph", "pageLink", "pageLink"])

  const saved = await getPage(request, account.token, parent.id)
  expect(saved.blocks[0].text).toBe("Overview")
  const childIDs = saved.blocks.filter((block) => block.type === "pageLink").map((block) => block.url!)
  expect(childIDs).toHaveLength(2)
  const alpha = await getPage(request, account.token, childIDs[0])
  const beta = await getPage(request, account.token, childIDs[1])
  expect(alpha.title).toBe("Alpha")
  expect(alpha.blocks.map((block) => block.text)).toEqual(["Alpha", "Alpha body"])
  expect(beta.title).toBe("Beta")
  expect(beta.blocks.map((block) => block.text)).toEqual(["Beta", "Beta body"])

  await expect(page.locator("[data-block-row]").filter({ hasText: "Alpha" }).first()).toBeVisible()
})

test("merges direct sub-pages into the current page and archives them", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const parent = await createPage(request, account.token, workspace.id, {
    title: "Merge target",
    blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "Intro" }],
  })
  const alpha = await createPage(request, account.token, workspace.id, {
    title: "Alpha",
    parentId: parent.id,
    blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "Alpha body" }],
  })
  const beta = await createPage(request, account.token, workspace.id, {
    title: "Beta",
    parentId: parent.id,
    blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "Beta body" }],
  })
  await page.goto(`/page/${parent.id}`)
  await page.getByLabel("Page options").last().click()
  await page.getByRole("menuitem", { name: "Merge sub-pages" }).click()
  await expect(page.getByText("Alpha", { exact: true }).last()).toBeVisible()
  await page.getByRole("button", { name: "Merge 2 pages" }).click()

  await expect
    .poll(async () => {
      const saved = await getPage(request, account.token, parent.id)
      return saved.blocks.map((block) => `${block.type}:${block.text}`)
    })
    .toEqual([
      "paragraph:Intro",
      "heading2:Alpha",
      "paragraph:Alpha body",
      "heading2:Beta",
      "paragraph:Beta body",
    ])
  await expect
    .poll(async () => {
      const [a, b] = await Promise.all([
        getPage(request, account.token, alpha.id),
        getPage(request, account.token, beta.id),
      ])
      return [a.archived, b.archived]
    })
    .toEqual([true, true])
  await expect(page.locator("[data-block-row]").filter({ hasText: "Alpha body" })).toBeVisible()
})
