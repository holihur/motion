import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage, getPage, workspaceAndPages } from "../helpers/api"

test("drags pages to change their parent and order", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await workspaceAndPages(request, account.token)
  const parent = await createPage(request, account.token, workspace.id, { title: "Drag parent" })
  const child = await createPage(request, account.token, workspace.id, { title: "Drag child", parentId: parent.id })
  const moving = await createPage(request, account.token, workspace.id, { title: "Drag moving" })
  await page.goto(`/page/${moving.id}`)

  const movingRow = page.locator(`aside [data-page-id="${moving.id}"]`)
  const parentRow = page.locator(`aside [data-page-id="${parent.id}"]`)
  await expect(movingRow).toBeVisible()
  await movingRow.dragTo(parentRow, { targetPosition: { x: 30, y: 15 } })
  await expect.poll(async () => (await getPage(request, account.token, moving.id)).parentId).toBe(parent.id)

  const childRow = page.locator(`aside [data-page-id="${child.id}"]`)
  await expect(childRow).toBeVisible()
  await movingRow.dragTo(childRow, { targetPosition: { x: 30, y: 3 } })
  await expect
    .poll(async () => {
      const pages = await workspaceAndPages(request, account.token)
      const current = pages.pages.find((item) => item.id === moving.id)
      const sibling = pages.pages.find((item) => item.id === child.id)
      return current?.parentId === parent.id && (current.order ?? 0) < (sibling?.order ?? 0)
    })
    .toBe(true)
})
