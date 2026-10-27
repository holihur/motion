import { expect, test } from "../helpers/fixtures"
import { signIn } from "../helpers/account"
import { createPage } from "../helpers/api"

test("renders map blocks with Mapbox fallback, Google, Amap and Baidu providers", async ({ page, request, consoleGuard }) => {
  consoleGuard.allow(/Access is denied for this document/)
  const account = await signIn(page, request)
  const { workspace } = await (await import("../helpers/api")).workspaceAndPages(request, account.token)
  const created = await createPage(request, account.token, workspace.id, {
    title: "Map lab",
    blocks: [{
      id: crypto.randomUUID(), type: "map", text: "",
      map: { lat: 31.2304, lng: 121.4737, zoom: 12, label: "Shanghai", provider: "mapbox" },
    }],
  })
  await page.goto(`/page/${created.id}`)
  const map = page.locator("[data-block-row]").filter({ hasText: "Mapbox" })
  const provider = map.getByLabel("Map provider")
  await expect(provider).toHaveValue("mapbox")
  await expect(map.locator("iframe")).toHaveAttribute("src", /openstreetmap\.org/)

  await provider.selectOption("google")
  await expect(map.locator("iframe")).toHaveAttribute("src", /google\.com\/maps/)
  await provider.selectOption("amap")
  await expect(map.locator("iframe")).toHaveAttribute("src", /uri\.amap\.com/)
  await provider.selectOption("baidu")
  await expect(map.locator("iframe")).toHaveAttribute("src", /api\.map\.baidu\.com/)
})
