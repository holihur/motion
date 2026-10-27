import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"

test("onboarding card can be dismissed permanently", async ({ page, request }) => {
  await signIn(page, request)
  await page.goto("/")
  await expect(page.getByText(/A 60-second tour/)).toBeVisible()
  await page.getByRole("button", { name: "Dismiss" }).click()
  await expect(page.getByText(/A 60-second tour/)).toHaveCount(0)
  await page.reload()
  await expect(page.getByText(/A 60-second tour/)).toHaveCount(0)
})
