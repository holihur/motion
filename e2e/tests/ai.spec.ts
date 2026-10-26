import http from "node:http"
import type { AddressInfo } from "node:net"
import { expect, test } from "../helpers/fixtures"
import { authHeaders, signIn } from "../helpers/account"
import { findPageByTitle } from "../helpers/api"

test.describe("BYOK AI agent", () => {
  test("configures a provider and chats with the document agent through an OpenAI-compatible model", async ({
    page,
    request,
  }) => {
    let calls = 0
    const mock = http.createServer((req, res) => {
      let raw = ""
      req.on("data", (chunk) => (raw += chunk))
      req.on("end", () => {
        calls += 1
        const requestBody = JSON.parse(raw || "{}")
        const message =
          calls === 1
            ? {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_mock_1",
                    type: "function",
                    function: {
                      name: "search_pages",
                      arguments: JSON.stringify({ query: "Welcome", limit: 3 }),
                    },
                  },
                ],
              }
            : {
                role: "assistant",
                content: "I found the Welcome page. It is the best place to start.",
              }
        const payload = JSON.stringify({
          id: "chatcmpl-e2e",
          object: "chat.completion",
          model: requestBody.model,
          choices: [
            {
              index: 0,
              message,
              finish_reason: calls === 1 ? "tool_calls" : "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        })
        res.writeHead(200, { "content-type": "application/json" })
        res.end(payload)
      })
    })
    await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve))
    const port = (mock.address() as AddressInfo).port

    try {
      const account = await signIn(page, request)

      // The BYOK form defaults to DeepSeek and never exposes stored keys.
      await page.locator("aside").getByLabel("Settings").click()
      await page.getByRole("tab", { name: "AI" }).click()
      await expect(page.getByLabel("Provider")).toHaveValue("deepseek")
      await expect(page.getByLabel("Model")).toHaveValue("deepseek-chat")
      await page.keyboard.press("Escape")

      const saved = await request.put("/api/ai/settings", {
        headers: authHeaders(account.token),
        data: {
          provider: "custom",
          apiKey: "sk-e2e-deepseek",
          model: "deepseek-chat",
          baseUrl: `http://127.0.0.1:${port}/v1`,
        },
      })
      expect(saved.ok()).toBeTruthy()

      const { page: welcome } = await findPageByTitle(request, account.token, "Welcome to Motion")
      await page.goto(`/page/${welcome.id}`)
      await page.locator("header").getByLabel("Ask Motion AI").click()
      await expect(page.getByText(/I can answer questions about your workspace/)).toBeVisible()
      await expect(page.getByText("No workspace AGENTS.md yet")).toBeVisible()
      await page.getByRole("button", { name: "Create", exact: true }).click()
      await expect(page.getByText("Using workspace instructions from AGENTS.md")).toBeVisible()
      await page.getByPlaceholder(/Ask about your documents/).fill("Find the welcome page")
      await page.getByLabel("Send message").click()
      await expect(page.getByText(/I found the Welcome page/)).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole("button", { name: "Undo AI changes" })).toBeVisible()
      await page.getByRole("button", { name: "Undo AI changes" }).click()
      await expect(page.getByText("AI changes undone")).toBeVisible()
      expect(calls).toBeGreaterThanOrEqual(2)
    } finally {
      await new Promise<void>((resolve) => mock.close(() => resolve()))
    }
  })

  test("streams tokens over SSE and renders the final answer", async ({ page, request }) => {
    const mock = http.createServer((req, res) => {
      let raw = ""
      req.on("data", (chunk) => (raw += chunk))
      req.on("end", () => {
        const payload = JSON.parse(raw || "{}")
        if (payload.stream) {
          res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
          for (const piece of ["Streamed ", "answer ", "from ", "Motion"]) {
            res.write(
              `data: ${JSON.stringify({
                id: "chatcmpl-stream",
                object: "chat.completion.chunk",
                model: payload.model,
                choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
              })}\n\n`,
            )
          }
          res.end("data: [DONE]\n\n")
          return
        }
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "fallback" } }] }))
      })
    })
    await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve))
    const port = (mock.address() as AddressInfo).port
    try {
      const account = await signIn(page, request)
      const saved = await request.put("/api/ai/settings", {
        headers: authHeaders(account.token),
        data: {
          provider: "custom",
          apiKey: "sk-stream",
          model: "stream-model",
          baseUrl: `http://127.0.0.1:${port}/v1`,
        },
      })
      expect(saved.ok()).toBeTruthy()
      const { page: welcome } = await findPageByTitle(request, account.token, "Welcome to Motion")
      await page.goto(`/page/${welcome.id}`)
      await page.locator("header").getByLabel("Ask Motion AI").click()
      await page.getByPlaceholder(/Ask about your documents/).fill("Stream this")
      await page.getByLabel("Send message").click()
      await expect(page.getByText("Streamed answer from Motion")).toBeVisible({ timeout: 20_000 })
    } finally {
      await new Promise<void>((resolve) => mock.close(() => resolve()))
    }
  })
})
