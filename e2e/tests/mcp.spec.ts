import { expect, test } from "../helpers/fixtures"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { authHeaders, registerAccount } from "../helpers/account"
import { createPage, listWorkspaces, textBlock } from "../helpers/api"

test.describe("MCP", () => {
  test("scoped personal access tokens can read and write documents over MCP", async ({ request }, testInfo) => {
    const account = await registerAccount(request, { name: "MCP Tester" })
    const workspaces = await listWorkspaces(request, account.token)
    const page = await createPage(request, account.token, workspaces[0].id, {
      title: "MCP Document",
      blocks: [textBlock("MCP initial content about nebulas.")],
    })
    const tokenResponse = await request.post("/api/tokens", {
      headers: authHeaders(account.token),
      data: {
        name: "e2e-mcp",
        scopes: ["pages:read", "pages:write", "workspace:read"],
        expiresInDays: 1,
      },
    })
    expect(tokenResponse.ok()).toBeTruthy()
    const { token } = (await tokenResponse.json()) as { token: string }

    const baseURL = testInfo.project.use.baseURL as string
    const transport = new StreamableHTTPClientTransport(new URL("/mcp", baseURL), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    })
    const client = new Client({ name: "motion-e2e", version: "1.0.0" })
    await client.connect(transport)
    try {
      const tools = await client.listTools()
      const names = tools.tools.map((tool) => tool.name)
      expect(names).toEqual(
        expect.arrayContaining(["search_pages", "read_page", "create_page", "append_blocks", "update_page"]),
      )

      const search = await client.callTool({
        name: "search_pages",
        arguments: { query: "nebulas", limit: 5 },
      })
      expect(JSON.stringify(search.content)).toContain("MCP Document")

      const appended = await client.callTool({
        name: "append_blocks",
        arguments: {
          pageId: page.id,
          blocks: [
            { type: "heading2", text: "From MCP" },
            { type: "todo", text: "Review the generated note" },
          ],
        },
      })
      expect(appended.isError).toBeFalsy()

      const read = await client.callTool({
        name: "read_page",
        arguments: { pageId: page.id },
      })
      expect(JSON.stringify(read.content)).toContain("From MCP")

      const disposable = await createPage(request, account.token, workspaces[0].id, {
        title: "MCP Delete Me",
      })
      const deleted = await client.callTool({
        name: "delete_page",
        arguments: { pageId: disposable.id, permanent: true },
      })
      expect(deleted.isError).toBeFalsy()
      const gone = await request.get(`/api/pages/${disposable.id}`, { headers: authHeaders(account.token) })
      expect(gone.status()).toBe(404)
    } finally {
      await client.close()
    }
  })

  test("read-only tokens cannot write", async ({ request }, testInfo) => {
    const account = await registerAccount(request)
    const workspaces = await listWorkspaces(request, account.token)
    const page = await createPage(request, account.token, workspaces[0].id, {
      title: "Read Only",
    })
    const tokenResponse = await request.post("/api/tokens", {
      headers: authHeaders(account.token),
      data: { name: "read-only", scopes: ["pages:read"], expiresInDays: 1 },
    })
    const { token } = (await tokenResponse.json()) as { token: string }
    const transport = new StreamableHTTPClientTransport(
      new URL("/mcp", testInfo.project.use.baseURL as string),
      { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
    )
    const client = new Client({ name: "motion-e2e-read", version: "1.0.0" })
    await client.connect(transport)
    try {
      const result = await client.callTool({
        name: "append_blocks",
        arguments: { pageId: page.id, blocks: [{ type: "paragraph", text: "should fail" }] },
      })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result.content)).toContain("pages:write")
    } finally {
      await client.close()
    }
  })
})
