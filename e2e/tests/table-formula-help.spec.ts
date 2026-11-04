import { expect, test } from "../helpers/fixtures"
import { createPage, listWorkspaces } from "../helpers/api"
import { signIn } from "../helpers/account"

test("shows table formula documentation from the formula menu", async ({ page, request }) => {
  const account = await signIn(page, request)
  const [workspace] = await listWorkspaces(request, account.token)
  const target = await createPage(request, account.token, workspace.id, {
    title: "Formula help lab",
    blocks: [
      {
        id: "formula-help-table",
        type: "table",
        text: "",
        table: {
          columns: ["Name", "Score"],
          rows: [["Alpha", "10"], ["Beta", "20"]],
          header: true,
        },
      } as never,
    ],
  })

  await page.goto(`/page/${target.id}`)
  await page.getByRole("button", { name: "Formula", exact: true }).click()
  await page.getByRole("menuitem", { name: "Formula help" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "Formula help" })).toBeVisible()
  await expect(dialog.getByText("Select a text cell and type = to start a formula", { exact: false })).toBeVisible()
  await expect(dialog.getByText("=SUM(A1:A10)")).toBeVisible()
  await expect(dialog.getByText("Supported functions")).toBeVisible()
  await expect(dialog.getByText("#CYCLE!")).toBeVisible()
})
