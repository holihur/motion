import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage, getPage } from "../helpers/api"

test("password areas encrypt locally and require the password after reload", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const created = await createPage(request, account.token, workspace.id, { title: "Secrets" })
  await page.goto(`/page/${created.id}`)

  await page.getByRole("button", { name: "Add a block" }).click()
  await page.keyboard.type("/pass")
  await expect(page.getByText("Turn into", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: /Password area/ }).click()

  const block = page.locator("[data-block-row]").last()
  await expect(block.getByText("Password-protected area")).toBeVisible()
  await block.getByLabel("Area name").fill("Production credentials")
  await block.getByLabel("Protected content").fill("sk-live-123456")
  await block.getByLabel("Password", { exact: true }).fill("correct-horse")
  await block.getByRole("button", { name: "Encrypt & lock" }).click()
  await expect(block.getByText("Unlocked area")).toBeVisible()

  await expect
    .poll(async () => {
      const saved = await getPage(request, account.token, created.id)
      const password = saved.blocks.find((item) => item.type === "password") as
        | { ciphertext?: string; text?: string }
        | undefined
      return Boolean(password?.ciphertext) && password?.text === "Production credentials"
    })
    .toBe(true)

  const saved = await getPage(request, account.token, created.id)
  expect(JSON.stringify(saved.blocks)).not.toContain("sk-live-123456")

  await page.reload()
  await expect(page.getByText("Password-protected area")).toBeVisible()
  const locked = page.locator("[data-block-row]").last()
  await locked.getByPlaceholder("Enter password to unlock").fill("wrong-password")
  await locked.getByRole("button", { name: "Unlock" }).click()
  await expect(locked.getByText("That password did not unlock this area.")).toBeVisible()

  await locked.getByPlaceholder("Enter password to unlock").fill("correct-horse")
  await locked.getByRole("button", { name: "Unlock" }).click()
  await expect(locked.getByText("Unlocked area")).toBeVisible()
  await locked.getByRole("button", { name: "Reveal protected content" }).click()
  await expect(locked.getByText("sk-live-123456")).toBeVisible()
})
