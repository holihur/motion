import { expect, test } from "../helpers/fixtures"
import { createPage, getPage, listWorkspaces } from "../helpers/api"
import { signIn } from "../helpers/account"
import { modKey } from "../helpers/ui"

test("undoes and redoes table block changes", async ({ page, request }) => {
  const account = await signIn(page, request)
  const [workspace] = await listWorkspaces(request, account.token)
  const target = await createPage(request, account.token, workspace.id, {
    title: "Undo lab",
    blocks: [
      {
        id: "undo-table",
        type: "table",
        text: "",
        table: {
          columns: ["Name", "Status"],
          rows: [["Alpha", "Todo"]],
          header: true,
        },
      } as never,
    ],
  })

  await page.goto(`/page/${target.id}`)
  const rows = page.locator("table tbody tr")
  await expect(rows).toHaveCount(1)

  await page.getByRole("button", { name: "Row", exact: true }).click()
  await expect(rows).toHaveCount(2)
  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(rows).toHaveCount(1)
  await page.getByRole("button", { name: "Redo", exact: true }).click()
  await expect(rows).toHaveCount(2)

  await page.getByRole("button", { name: "Row", exact: true }).click()
  await expect(rows).toHaveCount(3)
  await page.keyboard.press(`${modKey()}+z`)
  await expect(rows).toHaveCount(2)

  await expect
    .poll(async () => (await getPage(request, account.token, target.id)).blocks[0]?.table?.rows?.length)
    .toBe(2)
})
