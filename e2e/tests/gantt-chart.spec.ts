import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage, getPage } from "../helpers/api"

test("inserts and edits Gantt and chart blocks, and the insert menu is searchable", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const created = await createPage(request, account.token, workspace.id, { title: "Planning" })
  await page.goto(`/page/${created.id}`)

  await page.getByRole("button", { name: "Add a block" }).click()
  await expect(page.locator("[data-block-input]").last()).toBeFocused()
  await page.keyboard.type("/")
  await expect(page.getByLabel("Search blocks")).toBeVisible()
  await page.getByLabel("Search blocks").fill("gantt")
  await page.getByRole("button", { name: /Gantt/ }).click()

  const gantt = page.locator("[data-block-row]").last()
  await expect(gantt.getByText("Gantt", { exact: true })).toBeVisible()
  await gantt.getByRole("button", { name: "Edit data" }).click()
  await gantt.getByPlaceholder("Project timeline").fill("Release plan")
  await gantt.getByRole("button", { name: "Add task" }).click()
  await gantt.getByRole("button", { name: "Done" }).click()
  await expect(gantt.getByText("Release plan")).toBeVisible()
  await expect(gantt.getByText("New task")).toBeVisible()

  await page.getByRole("button", { name: "Add a block" }).click()
  await expect(page.locator("[data-block-input]").last()).toBeFocused()
  await page.keyboard.type("/")
  await expect(page.getByLabel("Search blocks")).toBeVisible()
  await page.getByLabel("Search blocks").fill("chart")
  await page.getByRole("button", { name: /^Chart/ }).click()

  const chart = page.locator("[data-block-row]").last()
  await expect(chart.getByRole("img", { name: "Bar chart" })).toBeVisible()
  await chart.locator("select").selectOption("pie")
  await expect(chart.getByRole("img", { name: "Pie chart" })).toBeVisible()

  await expect
    .poll(async () => {
      const saved = await getPage(request, account.token, created.id)
      return saved.blocks.some((block) => block.type === "gantt") &&
        saved.blocks.some((block) => block.type === "chart" && (block as { language?: string }).language === "pie")
    })
    .toBe(true)

  await page.reload()
  await expect(page.getByText("Release plan")).toBeVisible()
  await expect(page.getByText("New task")).toBeVisible()
  await expect(page.getByRole("img", { name: "Pie chart" })).toBeVisible()
})
