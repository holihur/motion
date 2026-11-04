import http from "node:http"
import type { AddressInfo } from "node:net"
import { expect, test } from "../helpers/fixtures"
import { authHeaders, signIn } from "../helpers/account"
import { createPage, listWorkspaces, textBlock } from "../helpers/api"

test.describe("agent sessions", () => {
  test("persists a conversation in MongoDB and continues it", async ({ page, request }) => {
    let calls = 0
    let target: { pageId: string; blockId: string } | null = null
    const mock = http.createServer((req, res) => {
      let raw = ""
      req.on("data", (chunk) => (raw += chunk))
      req.on("end", () => {
        calls += 1
        const body = JSON.parse(raw || "{}")
        let message: Record<string, unknown>
        if (calls === 1) {
          message = {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_session_update",
              type: "function",
              function: {
                name: "update_block",
                arguments: JSON.stringify({
                  pageId: target!.pageId,
                  blockId: target!.blockId,
                  text: "Session updated block",
                }),
              },
            }],
          }
        } else {
          message = {
            role: "assistant",
            content: calls === 2 ? "First answer from the stored session." : "Second answer using the persisted history.",
          }
        }
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({
          choices: [{ message, finish_reason: calls === 1 ? "tool_calls" : "stop" }],
        }))
      })
    })
    await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve))
    const port = (mock.address() as AddressInfo).port

    try {
      const account = await signIn(page, request)
      const [workspace] = await listWorkspaces(request, account.token)
      const created = await createPage(request, account.token, workspace.id, {
        title: "Session Lab",
        blocks: [textBlock("Original session text")],
      })
      target = { pageId: created.id, blockId: created.blocks[0].id }

      const saved = await request.put("/api/ai/settings", {
        headers: authHeaders(account.token),
        data: {
          provider: "custom",
          apiKey: "sk-session",
          model: "session-model",
          baseUrl: `http://127.0.0.1:${port}/v1`,
        },
      })
      expect(saved.ok()).toBeTruthy()

      const agentsResponse = await request.get(`/api/workspaces/${workspace.id}/agents`, {
        headers: authHeaders(account.token),
      })
      expect(agentsResponse.ok()).toBeTruthy()
      const agents = (await agentsResponse.json()) as Array<{ id: string; enabled: boolean }>
      const agent = agents.find((item) => item.enabled) ?? agents[0]
      expect(agent).toBeTruthy()

      const prompt = "Session test prompt about the launch"
      const first = await request.post(`/api/workspaces/${workspace.id}/agents/${agent.id}/run`, {
        headers: authHeaders(account.token),
        data: { prompt, pageId: created.id },
      })
      expect(first.ok()).toBeTruthy()
      const firstRun = (await first.json()) as { runId: string }

      let sessionId = ""
      await expect.poll(async () => {
        const response = await request.get(`/api/workspaces/${workspace.id}/agent-runs/${firstRun.runId}`, {
          headers: authHeaders(account.token),
        })
        const run = (await response.json()) as { status: string; sessionId?: string; reply?: string }
        if (run.sessionId) sessionId = run.sessionId
        return run.status
      }, { timeout: 20_000 }).toBe("succeeded")
      expect(sessionId).toBeTruthy()

      const sessionResponse = await request.get(`/api/workspaces/${workspace.id}/agent-sessions/${sessionId}`, {
        headers: authHeaders(account.token),
      })
      expect(sessionResponse.ok()).toBeTruthy()
      const firstSession = (await sessionResponse.json()) as {
        runCount: number
        messages: Array<{ role: string; content: string }>
      }
      expect(firstSession.runCount).toBe(1)
      expect(firstSession.messages.map((message) => message.role)).toEqual(["user", "tool", "assistant"])
      expect(firstSession.messages.find((message) => message.role === "assistant")?.content).toContain("First answer")

      const second = await request.post(`/api/workspaces/${workspace.id}/agents/${agent.id}/run`, {
        headers: authHeaders(account.token),
        data: { prompt: "Continue the same conversation", pageId: created.id, sessionId },
      })
      expect(second.ok()).toBeTruthy()
      const secondRun = (await second.json()) as { runId: string }
      await expect.poll(async () => {
        const response = await request.get(`/api/workspaces/${workspace.id}/agent-runs/${secondRun.runId}`, {
          headers: authHeaders(account.token),
        })
        return ((await response.json()) as { status: string }).status
      }, { timeout: 20_000 }).toBe("succeeded")

      const continuedResponse = await request.get(`/api/workspaces/${workspace.id}/agent-sessions/${sessionId}`, {
        headers: authHeaders(account.token),
      })
      const continued = (await continuedResponse.json()) as {
        runCount: number
        messageCount: number
        messages: Array<{ role: string; content: string }>
      }
      expect(continued.runCount).toBe(2)
      expect(continued.messageCount).toBe(5)
      expect(continued.messages.filter((message) => message.role === "assistant").map((message) => message.content)).toEqual([
        "First answer from the stored session.",
        "Second answer using the persisted history.",
      ])

      await page.goto("/ai")
      await page.getByRole("tab", { name: "Sessions" }).click()
      await page.getByRole("button", { name: new RegExp(prompt) }).click()
      const dialog = page.getByRole("dialog")
      await expect(dialog.getByText("First answer from the stored session.")).toBeVisible()
      await expect(dialog.getByText("Second answer using the persisted history.")).toBeVisible()
      await expect(dialog.getByText("Updated a block in", { exact: false })).toBeVisible()
    } finally {
      await new Promise<void>((resolve) => mock.close(() => resolve()))
    }
  })
})
