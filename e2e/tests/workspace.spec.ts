import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"

test.describe("workspace and settings", () => {
  test("creates a workspace and renames the workspace and profile", async ({ page, request }) => {
    await signIn(page, request)

    await page.locator("aside").getByLabel("Workspace menu").click()
    await page.getByRole("menuitem", { name: "New workspace" }).click()

    await page.getByLabel("Name").fill("Studio")
    await page.getByRole("button", { name: "Create workspace" }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator("aside").getByText("Studio", { exact: true })).toBeVisible()

    await page.locator("aside").getByLabel("Settings").click()
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
    await page.getByRole("tab", { name: "Workspace" }).click()
    await page.getByLabel("Workspace name").fill("Studio Renamed")
    await page.getByRole("button", { name: "Save workspace" }).click()
    await expect(page.locator("aside").getByText("Studio Renamed", { exact: true })).toBeVisible()

    await page.getByRole("tab", { name: "Profile" }).click()
    await page.getByLabel("Display name").fill("Grace Hopper")
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(page.locator("aside").getByText("Grace Hopper", { exact: true })).toBeVisible()

    await page.getByRole("tab", { name: "Appearance" }).click()
    await page.getByRole("button", { name: /Dark/ }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
  })
})
