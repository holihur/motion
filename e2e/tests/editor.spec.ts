import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import {
  createPage,
  findPageByTitle,
  getPage,
  textBlock,
  waitForBlockText,
  waitForPageTitle,
} from "../helpers/api"
import { appendBlock, expectSaved, openSearch, pressEnter } from "../helpers/ui"

test.describe("page editor", () => {
  test("edits the title and content, autosaves, and restores after reload", async ({
    page,
    request,
  }) => {
    const account = await signIn(page, request)
    const { page: welcome } = await findPageByTitle(request, account.token, "Welcome to Motion")
    await page.goto(`/page/${welcome.id}`)

    const title = page.locator("[data-editor-title=true]")
    await expect(title).toHaveValue("Welcome to Motion")

    await title.fill("Field Notes")
    await waitForPageTitle(request, account.token, welcome.id, "Field Notes")

    await page.getByRole("button", { name: "Add a block" }).click()
    await expect(page.locator("[data-block-input]").last()).toBeFocused()
    await page.keyboard.type("#")
    await page.keyboard.press(" ")
    await page.waitForTimeout(100)
    await page.keyboard.type("Reflections")
    await pressEnter(page)
    await page.keyboard.type("Today I wrote a test.")

    await waitForBlockText(request, account.token, welcome.id, "Reflections")
    await waitForBlockText(request, account.token, welcome.id, "Today I wrote a test.")
    await expectSaved(page)

    await page.reload()
    await expect(page.locator("[data-editor-title=true]")).toHaveValue("Field Notes")
    await expect(page.getByText("Reflections", { exact: true })).toBeVisible()
    await expect(page.getByText("Today I wrote a test.", { exact: true })).toBeVisible()
  })

  test("creates code and to-do blocks with slash commands and markdown shortcuts", async ({
    page,
    request,
  }) => {
    const account = await signIn(page, request)
    const { page: welcome } = await findPageByTitle(request, account.token, "Welcome to Motion")
    await page.goto(`/page/${welcome.id}`)

    await page.getByRole("button", { name: "Add a block" }).click()
    await expect(page.locator("[data-block-input]").last()).toBeFocused()
    await page.keyboard.type("/")
    await expect(page.getByText("Turn into", { exact: true })).toBeVisible()
    await page.keyboard.type("co")
    await page.getByRole("button", { name: /Code/ }).click()
    const code = page.locator('textarea[data-block-input]').last()
    await expect(code).toBeVisible()
    await code.fill("const answer = 42;")

    await page.getByRole("button", { name: "Add a block" }).click()
    const todoInput = page.locator("[data-block-input]").last()
    await expect(todoInput).toBeFocused()
    await page.keyboard.type("[]")
    await page.keyboard.press(" ")
    const firstTodo = page.locator("[data-block-row]").last()
    await expect(firstTodo.getByRole("checkbox")).toBeVisible()
    await firstTodo.locator("[data-block-input]").fill("Ship the release")
    await pressEnter(page)
    const secondTodo = page.locator("[data-block-row]").last()
    await expect(secondTodo.getByRole("checkbox")).toBeVisible()
    await secondTodo.locator("[data-block-input]").fill("Tell everyone")

    await waitForBlockText(request, account.token, welcome.id, "const answer = 42;")
    await waitForBlockText(request, account.token, welcome.id, "Ship the release")
    await expectSaved(page)

    const todoRow = page.locator("[data-block-row]").filter({ hasText: "Ship the release" })
    await todoRow.getByRole("checkbox").click()
    await expect(todoRow.getByRole("checkbox")).toHaveAttribute("aria-checked", "true")
    await page.waitForTimeout(800)

    const codeBlock = page.locator('textarea[data-block-input]').last()
    await expect(codeBlock).toHaveValue("const answer = 42;")

    await page.reload()
    const restoredTodo = page.locator("[data-block-row]").filter({ hasText: "Ship the release" })
    await expect(restoredTodo.getByRole("checkbox")).toHaveAttribute("aria-checked", "true")
    await expect(page.locator('textarea[data-block-input]').last()).toHaveValue("const answer = 42;")
  })

  test("searches across pages and opens the selected result with the keyboard", async ({
    page,
    request,
  }) => {
    const account = await signIn(page, request)
    const { workspace } = await findPageByTitle(request, account.token, "Welcome to Motion")
    const orion = await createPage(request, account.token, workspace.id, {
      title: "Orion Notes",
      blocks: [textBlock("The nebula is bright tonight.")],
    })

    await page.reload()
    await expect(page.locator("aside").getByText("Orion Notes", { exact: true })).toBeVisible()

    const input = await openSearch(page)
    await input.fill("nebula")
    await expect(page.locator("[cmdk-list]").getByText("Orion Notes", { exact: true })).toBeVisible()
    await page.keyboard.press("Enter")

    await expect(page).toHaveURL(new RegExp(`/page/${orion.id}$`))
    await expect(page.locator("[data-editor-title=true]")).toHaveValue("Orion Notes")

    const emptySearch = await openSearch(page)
    await emptySearch.fill("zzzzzzzz")
    await expect(page.getByText(/No pages found for/)).toBeVisible()
  })

  test("drags blocks to reorder them and turns a block into a heading", async ({
    page,
    request,
  }) => {
    const account = await signIn(page, request)
    const { workspace } = await findPageByTitle(request, account.token, "Welcome to Motion")
    const target = await createPage(request, account.token, workspace.id, {
      title: "Drag Lab",
      blocks: [textBlock("One"), textBlock("Two"), textBlock("Three")],
    })
    await page.goto(`/page/${target.id}`)

    const rows = page.locator("[data-block-row]")
    await rows.nth(2).hover()
    await rows.nth(2).getByLabel("Drag block").dragTo(rows.nth(0), {
      targetPosition: { x: 80, y: 4 },
    })

    await expect
      .poll(async () => (await getPage(request, account.token, target.id)).blocks.map((block) => block.text))
      .toEqual(["Three", "One", "Two"])

    const firstRow = page.locator("[data-block-row]").first()
    await firstRow.hover()
    await firstRow.getByLabel("Block options").first().click()
    await page.getByRole("menuitem", { name: "Turn into" }).hover()
    await page.getByRole("menuitem", { name: "Heading 1" }).click()

    await expect
      .poll(async () => (await getPage(request, account.token, target.id)).blocks[0]?.type)
      .toBe("heading1")
  })
})
