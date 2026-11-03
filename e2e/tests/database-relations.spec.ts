import { expect, test } from "../helpers/fixtures"
import { authHeaders } from "../helpers/account"
import { createPage, listWorkspaces } from "../helpers/api"
import { signIn } from "../helpers/account"

test.describe("database relations and rollups", () => {
  test("links rows across pages and computes rollups", async ({ page, request }) => {
    const account = await signIn(page, request)
    const [workspace] = await listWorkspaces(request, account.token)
    expect(workspace).toBeTruthy()

    const target = await createPage(request, account.token, workspace.id, {
      title: "Target database",
      blocks: [
        {
          id: "target-database-0001",
          type: "database",
          text: "",
          database: {
            columns: [
              { id: "name", name: "Name", type: "text" },
              { id: "score", name: "Score", type: "number" },
            ],
            rows: [
              { name: "Alpha", score: "10" },
              { name: "Beta", score: "25" },
            ],
            rowIds: ["relation-row-alpha", "relation-row-beta"],
            viewMode: "table",
          },
        } as never,
      ],
    })

    const source = await createPage(request, account.token, workspace.id, {
      title: "Source database",
      blocks: [
        {
          id: "source-database-001",
          type: "database",
          text: "",
          database: {
            columns: [
              { id: "name", name: "Task", type: "text" },
              {
                id: "related",
                name: "Related",
                type: "relation",
                relation: { pageId: target.id, databaseBlockId: "target-database-0001" },
              },
              {
                id: "points",
                name: "Points",
                type: "rollup",
                rollup: { relationColumnId: "related", targetColumnId: "score", function: "sum" },
              },
            ],
            rows: [
              { name: "One", related: "relation-row-alpha" },
              { name: "Two", related: "relation-row-beta" },
            ],
            rowIds: ["source-row-one", "source-row-two"],
            viewMode: "table",
          },
        } as never,
      ],
    })

    const databases = await request.get(`/api/workspaces/${workspace.id}/databases`, {
      headers: authHeaders(account.token),
    })
    expect(databases.ok()).toBeTruthy()
    const listed = (await databases.json()) as Array<{ pageId: string; rowIds: string[] }>
    expect(listed.find((item) => item.pageId === target.id)?.rowIds).toEqual([
      "relation-row-alpha",
      "relation-row-beta",
    ])

    await page.goto(`/page/${source.id}`)
    await expect(page.getByRole("textbox", { name: "Untitled" })).toHaveValue("Source database")
    const rows = page.locator("table tbody tr")
    await expect(rows.nth(0)).toContainText("Alpha")
    await expect(rows.nth(0)).toContainText("10")
    await expect(rows.nth(1)).toContainText("Beta")
    await expect(rows.nth(1)).toContainText("25")
  })
})
