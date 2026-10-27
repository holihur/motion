import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage, getPage, workspaceAndPages } from "../helpers/api"

test("collects form responses and renders QR codes and barcodes", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await workspaceAndPages(request, account.token)
  const created = await createPage(request, account.token, workspace.id, { title: "Forms" })
  await page.goto(`/page/${created.id}`)

  await page.getByRole("button", { name: "Add a block" }).click()
  await expect(page.locator("[data-block-input]").last()).toBeFocused()
  await page.keyboard.type("/form")
  await page.getByRole("button", { name: /^Form Collect/ }).click()
  const formBlock = page.locator("[data-block-row]").last()
  await formBlock.getByRole("button", { name: "Preview" }).click()
  await expect
    .poll(async () => (await getPage(request, account.token, created.id)).blocks.some((block) => block.type === "form"))
    .toBe(true)
  const nameInput = formBlock.getByLabel(/Name/)
  const emailInput = formBlock.getByLabel(/Email/)
  await nameInput.fill("Ada")
  await emailInput.fill("ada@example.com")
  await expect(nameInput).toHaveValue("Ada")
  await expect(emailInput).toHaveValue("ada@example.com")
  await formBlock.getByRole("button", { name: "Submit" }).click()
  await expect(formBlock.getByText(/Thanks! Your response/)).toBeVisible()

  const saved = await getPage(request, account.token, created.id)
  const form = saved.blocks.find((block) => block.type === "form")
  expect(form).toBeTruthy()
  const submissions = await request.get(`/api/pages/${created.id}/form-submissions?blockId=${form!.id}`, {
    headers: { Authorization: `Bearer ${account.token}` },
  })
  expect(submissions.ok()).toBeTruthy()
  const submission = (await submissions.json())[0]
  expect(Object.values(submission.values)).toContain("Ada")
  expect(Object.values(submission.values)).toContain("ada@example.com")

  await formBlock.getByRole("button", { name: "Responses" }).click()
  await expect(page.getByRole("dialog").getByText("Ada", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Add a block" }).click()
  await expect(page.locator("[data-block-input]").last()).toBeFocused()
  await page.keyboard.type("/qr code")
  await page.getByRole("button", { name: /^QR code Generate/ }).click()
  const qr = page.locator("[data-block-row]").last()
  await qr.getByPlaceholder("URL or text to encode…").fill("https://motion.app")
  await expect(qr.locator('img[alt="QR code"]')).toBeVisible()

  await page.getByRole("button", { name: "Add a block" }).click()
  await expect(page.locator("[data-block-input]").last()).toBeFocused()
  await page.keyboard.type("/barcode")
  await page.getByRole("button", { name: /^Barcode Generate/ }).click()
  const barcode = page.locator("[data-block-row]").last()
  await barcode.getByPlaceholder("Value to encode…").fill("ABC-123")
  await expect(barcode.locator('svg[viewBox="0 0 240 104"]')).toBeVisible()
})
