import { expect, test } from "../helpers/fixtures"
import { createPage, getPage, listWorkspaces } from "../helpers/api"
import { signIn } from "../helpers/account"

function monthDay(day: number): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

test("adds events to a calendar block and persists them", async ({ page, request }) => {
  const account = await signIn(page, request)
  const [workspace] = await listWorkspaces(request, account.token)
  const start = monthDay(10)
  const target = await createPage(request, account.token, workspace.id, {
    title: "Calendar lab",
    blocks: [
      {
        id: "calendar-block-e2e",
        type: "calendar",
        text: "",
        language: "month",
        table: {
          columns: ["Event", "Start", "End", "Color"],
          rows: [["Kickoff", start, start, "violet"]],
          header: true,
        },
      } as never,
    ],
  })

  await page.goto(`/page/${target.id}`)
  await expect(page.getByText("Calendar", { exact: true })).toBeVisible()
  await expect(page.getByText("Kickoff", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Event", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "New event" })).toBeVisible()
  await dialog.getByLabel("Title").fill("Launch review")
  await dialog.getByLabel("Start").fill(monthDay(15))
  await dialog.getByLabel("End").fill(monthDay(16))
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Launch review", { exact: true }).first()).toBeVisible()

  await page.getByRole("button", { name: "List", exact: true }).click()
  await expect(page.getByText("Kickoff", { exact: true })).toBeVisible()
  await expect(page.getByText("Launch review", { exact: true }).first()).toBeVisible()

  await expect
    .poll(async () => (await getPage(request, account.token, target.id)).blocks[0]?.table?.rows?.length)
    .toBe(2)

  await page.reload()
  await expect(page.getByText("Calendar", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "List", exact: true })).toBeVisible()
  await expect(page.getByText("Launch review", { exact: true }).first()).toBeVisible()

  const exported = await request.get(`/api/pages/${target.id}/export?format=html`, {
    headers: { Authorization: `Bearer ${account.token}` },
  })
  expect(exported.ok()).toBeTruthy()
  expect(await exported.text()).toContain("Kickoff")
  expect(await exported.text()).toContain("Launch review")
})
