import http from "node:http"
import type { AddressInfo } from "node:net"
import { expect, test } from "../helpers/fixtures"
import { authHeaders, signIn } from "../helpers/account"
import { createPage, listWorkspaces } from "../helpers/api"

test("submits feedback as a Git issue with version and client context", async ({ page, request }) => {
  let issueBody = ""
  let authorization = ""
  const mock = http.createServer((req, res) => {
    let raw = ""
    req.on("data", (chunk) => (raw += chunk))
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/repos/acme/docs/issues") {
        authorization = String(req.headers.authorization ?? "")
        issueBody = raw
        res.writeHead(201, { "content-type": "application/json" })
        res.end(JSON.stringify({ html_url: "https://github.com/acme/docs/issues/42" }))
        return
      }
      res.writeHead(404)
      res.end()
    })
  })
  await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve))
  const port = (mock.address() as AddressInfo).port

  try {
    const account = await signIn(page, request)
    const [workspace] = await listWorkspaces(request, account.token)
    const target = await createPage(request, account.token, workspace.id, {
      title: "Feedback context page",
      blocks: [{ id: "feedback-context-block", type: "paragraph", text: "Context" }],
    })
    const integration = await request.put(`/api/workspaces/${workspace.id}/integrations/git`, {
      headers: authHeaders(account.token),
      data: {
        config: {
          kind: "github",
          baseUrl: `http://127.0.0.1:${port}`,
          owner: "acme",
          repo: "docs",
          branch: "main",
          path: "docs",
        },
        secret: "ghp_test_token",
        enabled: true,
      },
    })
    expect(integration.ok()).toBeTruthy()

    await page.goto(`/page/${target.id}`)
    await page.getByRole("button", { name: "Send feedback" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: "Send feedback" })).toBeVisible()
    await dialog.getByLabel("Title").fill("Feedback title")
    await dialog.getByLabel("Description").fill("Something should be better.")
    await dialog.getByRole("button", { name: "Submit feedback" }).click()

    await expect.poll(() => issueBody).not.toBe("")
    expect(authorization).toBe("Bearer ghp_test_token")
    const payload = JSON.parse(issueBody) as { title: string; body: string }
    expect(payload.title).toBe("[Feedback] Feedback title")
    expect(payload.body).toContain("Something should be better.")
    expect(payload.body).toContain("Feedback context page")
    expect(payload.body).toContain("**Version:**")
    expect(payload.body).toContain("**OS:**")
    expect(payload.body).toContain("**Browser:**")
    expect(payload.body).toContain("**Viewport:**")
    expect(payload.body).toContain(`/page/${target.id}`)
  } finally {
    await new Promise<void>((resolve) => mock.close(() => resolve()))
  }
})
