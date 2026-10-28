import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { getPage } from "../helpers/api"

test.describe("rich blocks", () => {
  test("tables and Mermaid diagrams persist and render", async ({ page, request }) => {
    test.setTimeout(120_000)
    const account = await signIn(page, request)
    await page.locator("aside").getByRole("button", { name: "New page" }).first().click()
    await expect(page).toHaveURL(/\/page\//)
    const pageId = page.url().split("/").pop()!
    await page.locator("[data-editor-title=true]").fill("Blocks Lab")

    await page.locator("[data-block-input]").first().click()
    await page.keyboard.type("/")
    await page.waitForTimeout(250)
    await page.keyboard.type("tab")
    await page.getByRole("button", { name: /Table Organize information/ }).click()
    await page.waitForTimeout(300)
    const cells = page.locator("table input")
    await cells.nth(0).fill("Name")
    await cells.nth(1).fill("Status")
    await cells.nth(2).fill("Owner")
    await cells.nth(3).fill("Search")
    await cells.nth(4).fill("Live")
    await cells.nth(5).fill("Ada")
    await page.getByRole("button", { name: /Row/ }).click()
    const firstHeader = page.locator("table th").first()
    await firstHeader.hover()
    await firstHeader.getByLabel("Align column").click()
    await expect(page.locator("table input").first()).toHaveCSS("text-align", "center")
    const resize = await firstHeader.getByRole("separator", { name: "Resize column" }).boundingBox()
    if (resize) {
      await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2)
      await page.mouse.down()
      await page.mouse.move(resize.x + 60, resize.y + resize.height / 2)
      await page.mouse.up()
    }
    await expect
      .poll(async () => {
        const saved = await getPage(request, account.token, pageId)
        const table = saved.blocks.find((block) => block.type === "table")
        return table?.table?.widths?.[0] ?? 0
      })
      .toBeGreaterThan(160)

    await page.getByRole("button", { name: "Add a block" }).click()
    await page.waitForTimeout(300)
    await page.keyboard.type("/")
    await page.waitForTimeout(300)
    await page.keyboard.type("dia")
    await page.getByRole("button", { name: /Diagram/ }).click()
    await page.waitForTimeout(700)
    await page.getByRole("button", { name: "Preview" }).click()
    await expect(page.locator(".mermaid-frame svg")).toBeVisible({ timeout: 15_000 })

    await page.waitForTimeout(1200)
    await page.reload()
    await expect(page.locator("[data-editor-title=true]")).toHaveValue("Blocks Lab")
    await expect(page.locator("table input").nth(0)).toHaveValue("Name")
    await expect(page.locator("table input").nth(5)).toHaveValue("Ada")
    await expect(page.locator(".mermaid-frame svg")).toBeVisible({ timeout: 15_000 })
  })

  test("comments can be attached to a whole block and to a text selection", async ({ page, request }) => {
    const account = await signIn(page, request)
    await page.locator("aside").getByRole("button", { name: "New page" }).first().click()
    await expect(page).toHaveURL(/\/page\//)
    await page.locator("[data-editor-title=true]").fill("Comment Lab")
    const input = page.locator("[data-block-input]").first()
    await input.click()
    await page.keyboard.type("A paragraph worth discussing.")

    const row = page.locator("[data-block-row]").first()
    await row.hover()
    await row.getByLabel("Block options").first().click()
    await page.getByRole("menuitem", { name: "Comment" }).click()
    await page.getByPlaceholder("Write a comment…").fill("This whole block needs a review.")
    await page.getByRole("dialog").getByRole("button", { name: "Comment", exact: true }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    const panel = page.getByLabel("Comments panel")
    await expect(panel.getByText("On this block")).toBeVisible()
    await expect(panel.getByText("This whole block needs a review.")).toBeVisible()
    await page.getByLabel("Close comments").click()

    await input.click()
    await page.keyboard.press("Home")
    for (let i = 0; i < 2; i += 1) await page.keyboard.press("Shift+ArrowRight")
    await page.waitForTimeout(300)
    await page.getByRole("button", { name: "Comment", exact: true }).click()
    await page.getByPlaceholder("Write a comment…").fill("A focused inline note.")
    await page.getByRole("dialog").getByRole("button", { name: "Comment", exact: true }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await page.waitForTimeout(500)
    await page.locator("[data-editor-title=true]").click()
    await expect(page.getByLabel("Comments panel").getByText("A focused inline note.")).toBeVisible()
    expect(await page.evaluate(() => window.CSS?.highlights?.get?.("motion-comment")?.size ?? 0)).toBeGreaterThan(0)
  })
})
