import { expect, test } from "../helpers/fixtures"
import { createPage, getPage, listWorkspaces } from "../helpers/api"
import { signIn } from "../helpers/account"

test.describe("offline drafts", () => {
  test("restores an offline edit after reload and syncs it on reconnect", async ({ page, request, consoleGuard }) => {
    consoleGuard.allow(/ERR_INTERNET_DISCONNECTED/)
    consoleGuard.allow(/WebSocket connection .* failed/)
    const account = await signIn(page, request)
    const [workspace] = await listWorkspaces(request, account.token)
    const target = await createPage(request, account.token, workspace.id, {
      title: "Offline draft page",
      blocks: [{ id: "offline-paragraph-01", type: "paragraph", text: "Saved baseline" }],
    })

    await page.goto(`/page/${target.id}`)
    await expect(page.getByRole("textbox", { name: "Untitled" })).toHaveValue("Offline draft page")
    await page.evaluate(async () => {
      if ("serviceWorker" in navigator) await navigator.serviceWorker.ready
    })

    await page.context().setOffline(true)
    const input = page.locator("[data-block-input]").first()
    await input.click()
    await page.keyboard.press("End")
    await page.keyboard.type(" + offline edit")
    await expect
      .poll(async () => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("motion:draft:"))))
      .toHaveLength(1)

    await page.reload()
    await expect(page.getByRole("textbox", { name: "Untitled" })).toHaveValue("Offline draft page")
    await expect(page.locator("[data-block-input]").first()).toContainText("+ offline edit")

    await page.context().setOffline(false)
    await expect
      .poll(async () => (await getPage(request, account.token, target.id)).blocks.map((block) => block.text).join(" "), { timeout: 15_000 })
      .toContain("+ offline edit")
  })
})

test.describe("offline queue", () => {
  test("syncs drafts after leaving the page and reconnecting", async ({ page, request, consoleGuard }) => {
    consoleGuard.allow(/ERR_INTERNET_DISCONNECTED/)
    consoleGuard.allow(/WebSocket connection .* failed/)
    const account = await signIn(page, request)
    const [workspace] = await listWorkspaces(request, account.token)
    const first = await createPage(request, account.token, workspace.id, {
      title: "Offline queue one",
      blocks: [{ id: "offline-queue-one", type: "paragraph", text: "First baseline" }],
    })
    const second = await createPage(request, account.token, workspace.id, {
      title: "Offline queue two",
      blocks: [{ id: "offline-queue-two", type: "paragraph", text: "Second baseline" }],
    })
    await page.evaluate(async () => {
      if ("serviceWorker" in navigator) await navigator.serviceWorker.ready
    })

    await page.goto(`/page/${first.id}`)
    await expect(page.getByRole("textbox", { name: "Untitled" })).toHaveValue("Offline queue one")
    await page.goto(`/page/${second.id}`)
    await expect(page.getByRole("textbox", { name: "Untitled" })).toHaveValue("Offline queue two")

    await page.goto(`/page/${first.id}`)
    await expect(page.getByRole("textbox", { name: "Untitled" })).toHaveValue("Offline queue one")
    await page.context().setOffline(true)
    await page.locator("[data-block-input]").first().click()
    await page.keyboard.press("End")
    await page.keyboard.type(" one offline")
    await expect
      .poll(async () => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("motion:draft:")).length))
      .toBe(1)

    await page.goto(`/page/${second.id}`)
    await expect(page.getByRole("textbox", { name: "Untitled" })).toHaveValue("Offline queue two")
    await page.locator("[data-block-input]").first().click()
    await page.keyboard.press("End")
    await page.keyboard.type(" two offline")
    await expect
      .poll(async () => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("motion:draft:")).length))
      .toBe(2)

    await page.goto("/")
    await page.context().setOffline(false)
    await expect
      .poll(async () => (await getPage(request, account.token, first.id)).blocks.map((block) => block.text).join(" "), { timeout: 15_000 })
      .toContain("one offline")
    await expect
      .poll(async () => (await getPage(request, account.token, second.id)).blocks.map((block) => block.text).join(" "), { timeout: 15_000 })
      .toContain("two offline")
    await expect
      .poll(async () => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("motion:draft:")).length))
      .toBe(0)
  })
})

test.describe("offline page cache", () => {
  test("opens a recently viewed page without a draft", async ({ page, request, consoleGuard }) => {
    consoleGuard.allow(/ERR_INTERNET_DISCONNECTED/)
    consoleGuard.allow(/WebSocket connection .* failed/)
    const account = await signIn(page, request)
    const [workspace] = await listWorkspaces(request, account.token)
    const cached = await createPage(request, account.token, workspace.id, {
      title: "Cached reading page",
      blocks: [{ id: "offline-cache-block", type: "paragraph", text: "Cached paragraph" }],
    })
    await page.evaluate(async () => {
      if ("serviceWorker" in navigator) await navigator.serviceWorker.ready
    })
    await page.goto(`/page/${cached.id}`)
    await expect(page.getByRole("textbox", { name: "Untitled" })).toHaveValue("Cached reading page")
    await expect(page.locator("[data-block-input]").first()).toContainText("Cached paragraph")
    await page.goto("/")
    await page.context().setOffline(true)
    await page.goto(`/page/${cached.id}`)
    await expect(page.getByRole("textbox", { name: "Untitled" })).toHaveValue("Cached reading page")
    await expect(page.locator("[data-block-input]").first()).toContainText("Cached paragraph")
    await expect
      .poll(async () => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("motion:draft:")).length))
      .toBe(0)
  })
})
