import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage, getPage, textBlock } from "../helpers/api"

test("IME composition Enter never splits a block or duplicates text", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const created = await createPage(request, account.token, workspace.id, {
    title: "IME lab",
    blocks: [textBlock("Hanzi")],
  })
  await page.goto(`/page/${created.id}`)

  const input = page.locator("[data-block-input]").first()
  const rows = page.locator("[data-block-row]")
  await input.click()
  await page.keyboard.press("End")
  await page.keyboard.type("hello")
  await expect(rows).toHaveCount(1)
  await expect(input).toContainText("Hanzihello")

  // Some browsers only expose IME state through composition events, while
  // others report the confirming Enter with keyCode 229. Both paths must be
  // ignored by the block editor.
  await input.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }))
    element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    }))
    element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "hello" }))
  })
  await page.waitForTimeout(80)
  await expect(rows).toHaveCount(1)
  await expect(input).toContainText("Hanzihello")

  await input.evaluate((element) => {
    element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 229,
      which: 229,
      bubbles: true,
      cancelable: true,
    }))
  })
  await page.waitForTimeout(80)
  await expect(rows).toHaveCount(1)
  await expect(input).toContainText("Hanzihello")

  // After composition, a real Enter must still create a new block.
  await page.keyboard.press("Enter")
  await expect(rows).toHaveCount(2)

  await expect
    .poll(async () => {
      const blocks = (await getPage(request, account.token, created.id)).blocks
      return { count: blocks.length, text: blocks[0]?.text }
    })
    .toEqual({ count: 2, text: expect.stringMatching(/^Hanzihello/) })
})
