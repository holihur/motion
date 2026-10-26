import http from "node:http"
import type { AddressInfo } from "node:net"
import { expect, test } from "../helpers/fixtures"
import { authHeaders, signIn } from "../helpers/account"
import { createPage, getPage, listWorkspaces, textBlock } from "../helpers/api"

test.describe("agent approval workflow", () => {
  test("stages agent edits, applies them after approval, and audits the run", async ({
    page,
    request,
  }) => {
    let calls = 0
    let target: { pageId: string; blockId: string } | null = null
    const mock = http.createServer((req, res) => {
      let raw = ""
      req.on("data", (chunk) => (raw += chunk))
      req.on("end", () => {
        calls += 1
        const body = JSON.parse(raw || "{}")
        const hasTool = (body.messages ?? []).some((message: { role?: string }) => message.role === "tool")
        let message: Record<string, unknown>
        if (!hasTool) {
          message = {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_update",
                type: "function",
                function: {
                  name: "update_block",
                  arguments: JSON.stringify({
                    pageId: target!.pageId,
                    blockId: target!.blockId,
                    text: "Approved by a human",
                  }),
                },
              },
            ],
          }
        } else {
          message = {
            role: "assistant",
            content: "I staged the edit. Please review it in Agent Inbox.",
          }
        }
        res.writeHead(200, { "content-type": "application/json" })
        res.end(
          JSON.stringify({
            choices: [
              {
                message,
                finish_reason: hasTool ? "stop" : "tool_calls",
              },
            ],
          }),
        )
      })
    })
    await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve))
    const port = (mock.address() as AddressInfo).port

    try {
      const account = await signIn(page, request)
      const workspace = (await listWorkspaces(request, account.token))[0]
      const created = await createPage(request, account.token, workspace.id, {
        title: "Inbox Test",
        blocks: [textBlock("Original text")],
      })
      target = { pageId: created.id, blockId: created.blocks[0].id }

      const saved = await request.put("/api/ai/settings", {
        headers: authHeaders(account.token),
        data: {
          provider: "custom",
          apiKey: "sk-approval",
          model: "approval-model",
          baseUrl: `http://127.0.0.1:${port}/v1`,
        },
      })
      expect(saved.ok()).toBeTruthy()

      await page.goto(`/page/${created.id}`)
      await page.locator("header").getByLabel("Ask Motion AI").click()
      await expect(page.getByText(/Approval/)).toBeVisible()
      await page.getByPlaceholder(/Ask about your documents/).fill("Update the block")
      await page.getByLabel("Send message").click()
      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible({ timeout: 20_000 })
      await expect(dialog.getByText("Approved by a human")).toBeVisible()
      await expect
        .poll(async () => (await getPage(request, account.token, created.id)).blocks[0].text)
        .toBe("Original text")

      await dialog.getByRole("button", { name: "Approve & apply" }).click()
      await expect
        .poll(async () => (await getPage(request, account.token, created.id)).blocks[0].text)
        .toBe("Approved by a human")

      await page.goto("/inbox")
      await expect(page.getByRole("heading", { name: "Agent Inbox" })).toBeVisible()
      await page.getByRole("tab", { name: "Activity" }).click()
      await expect(page.getByText(/Approved changes to/)).toBeVisible()
      expect(calls).toBeGreaterThanOrEqual(2)
    } finally {
      await new Promise<void>((resolve) => mock.close(() => resolve()))
    }
  })
})
