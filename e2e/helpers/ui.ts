import { expect, type Page } from "@playwright/test"

export function modKey() {
  return process.platform === "darwin" ? "Meta" : "Control"
}

export async function appendBlock(page: Page, text: string) {
  await page.getByRole("button", { name: "Add a block" }).click()
  await page.waitForTimeout(60)
  await page.keyboard.type(text)
}

export async function pressEnter(page: Page) {
  await page.keyboard.press("Enter")
  await page.waitForTimeout(60)
}

export async function openSearch(page: Page) {
  await page.keyboard.press(`${modKey()}+k`)
  const input = page.locator("[cmdk-input]")
  await expect(input).toBeVisible()
  return input
}

export async function expectSaved(page: Page) {
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 })
}

export async function pageRow(page: Page, pageId: string) {
  return page.locator(`aside [data-page-id="${pageId}"]`).first()
}
