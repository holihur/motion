import http from "node:http"
import type { AddressInfo } from "node:net"
import { expect, test } from "../helpers/fixtures"
import { authHeaders, signIn } from "../helpers/account"
import { createPage, workspaceAndPages } from "../helpers/api"

test("workspace webhook receives signed comment events", async ({ page, request }) => {
  let received: { headers: http.IncomingHttpHeaders; body: string } | null = null
  const server = http.createServer((req, res) => {
    let body = ""
    req.on("data", (chunk) => (body += chunk))
    req.on("end", () => {
      received = { headers: req.headers, body }
      res.writeHead(200)
      res.end("ok")
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as AddressInfo).port
  try {
    const account = await signIn(page, request)
    const { workspace } = await workspaceAndPages(request, account.token)
    const created = await createPage(request, account.token, workspace.id, {
      title: "Webhook Lab",
      blocks: [{ id: "hook-block", type: "paragraph", text: "Hello" }],
    })

    await page.locator("aside").getByLabel("Settings").click()
    await page.getByRole("tab", { name: "Integrations" }).click()
    await page.getByPlaceholder("https://hooks.example.com/motion").fill(`http://127.0.0.1:${port}/hook`)
    await page.getByPlaceholder("Optional signing secret").fill("test-secret")
    await page.getByRole("button", { name: "Save webhook" }).click()
    await expect(page.getByText("Webhook saved")).toBeVisible()

    await page.getByPlaceholder("Group name, e.g. Release everywhere").fill("Publish everywhere")
    await page.getByRole("button", { name: "Add group" }).click()
    await expect(page.getByText("Publish everywhere", { exact: true })).toBeVisible()
    const groups = await request.get(`/api/workspaces/${workspace.id}/publish-groups`, {
      headers: authHeaders(account.token),
    })
    expect(groups.ok()).toBeTruthy()
    expect((await groups.json())[0].name).toBe("Publish everywhere")

    const comment = await request.post(`/api/pages/${created.id}/comments`, {
      headers: authHeaders(account.token),
      data: { blockId: "hook-block", body: "Ping", quote: "", startOffset: 0, endOffset: 0 },
    })
    expect(comment.ok()).toBeTruthy()

    await expect.poll(() => Boolean(received)).toBe(true)
    expect(received!.headers["x-motion-event"]).toBe("comment.created")
    expect(received!.headers["x-motion-signature"]).toMatch(/^sha256=/)
    const payload = JSON.parse(received!.body)
    expect(payload.event).toBe("comment.created")
    expect(payload.data.body).toBe("Ping")
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
