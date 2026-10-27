import { expect, test } from "../helpers/fixtures"
import { authHeaders, signIn } from "../helpers/account"
import { workspaceAndPages } from "../helpers/api"

test("workspace owners can configure agent skills and MCP servers", async ({ page, request }) => {
  const account = await signIn(page, request)
  const { workspace } = await workspaceAndPages(request, account.token)

  await page.locator("aside").getByLabel("Settings").click()
  await page.getByRole("tab", { name: "Agent" }).click()
  await expect(page.getByText("Workspace skills & MCP")).toBeVisible()
  await page.getByRole("button", { name: "Add skill" }).click()
  await page.getByPlaceholder("Skill name").fill("Release notes")
  await page.getByPlaceholder("Short description").fill("How to write release notes")
  await page.getByPlaceholder("Instructions the agent should follow…").fill("Use short headings and a changelog.")
  await page.getByRole("button", { name: "Add MCP server" }).click()
  await page.getByPlaceholder("Server name").fill("Docs MCP")
  await page.getByPlaceholder("https://mcp.example.com/mcp").fill("https://mcp.example.com/mcp")
  await page.getByPlaceholder("Authorization: Bearer …").fill("Authorization: Bearer test-token")
  await page.getByRole("button", { name: "Save agent settings" }).click()
  await expect(page.getByText("Workspace agent settings saved")).toBeVisible()

  const saved = await request.get(`/api/workspaces/${workspace.id}/agent-config`, {
    headers: authHeaders(account.token),
  })
  expect(saved.ok()).toBeTruthy()
  const config = await saved.json()
  expect(config.skills[0].name).toBe("Release notes")
  expect(config.mcpServers[0].url).toBe("https://mcp.example.com/mcp")
  expect(config.mcpServers[0].headers.Authorization).toBe("Bearer test-token")
})
