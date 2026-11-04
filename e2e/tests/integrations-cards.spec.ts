import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"

test("opens integration details from overview cards", async ({ page, request }) => {
  await signIn(page, request)
  await page.locator("aside").getByRole("button", { name: "Settings" }).click()
  await page.getByRole("tab", { name: /Integrations/ }).click()
  await expect(page.getByText("Workspace integrations")).toBeVisible()
  await expect(page.getByRole("button", { name: /Git Pages publishing/ })).toBeVisible()

  await page.getByRole("button", { name: /Git Pages publishing/ }).click()
  await expect(page.getByRole("button", { name: "All integrations" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "acme", exact: true })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "GitHub / GitLab / Gitea token", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "All integrations" }).click()
  await expect(page.getByRole("button", { name: /Jira publishing/ })).toBeVisible()
})
