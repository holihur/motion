import { expect, type APIRequestContext } from "@playwright/test"
import { authHeaders } from "./account"

export interface ApiPageSummary {
  id: string
  parentId?: string | null
  title: string
  icon: string
  cover: string
  favorite: boolean
  archived: boolean
  updatedAt: string
}

export interface ApiBlock {
  id: string
  type: string
  text: string
  checked?: boolean
  indent?: number
  color?: string
  textColor?: string
  bgColor?: string
  align?: string
  width?: string
  url?: string
  caption?: string
  map?: { lat: number; lng: number; zoom?: number; label?: string; provider?: string }
  table?: { widths?: number[]; align?: string[] }
}

export interface ApiPage extends ApiPageSummary {
  workspaceId: string
  blocks: ApiBlock[]
}

export interface ApiWorkspace {
  id: string
  name: string
  icon: string
}

export async function listWorkspaces(request: APIRequestContext, token: string) {
  const response = await request.get("/api/workspaces", { headers: authHeaders(token) })
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as ApiWorkspace[]
}

export async function listPages(request: APIRequestContext, token: string, workspaceId: string) {
  const response = await request.get(`/api/workspaces/${workspaceId}/pages`, {
    headers: authHeaders(token),
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as ApiPageSummary[]
}

export async function getPage(request: APIRequestContext, token: string, pageId: string) {
  const response = await request.get(`/api/pages/${pageId}`, { headers: authHeaders(token) })
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as ApiPage
}

export async function createPage(
  request: APIRequestContext,
  token: string,
  workspaceId: string,
  input: { title: string; parentId?: string | null; blocks?: ApiBlock[] },
) {
  const response = await request.post("/api/pages", {
    headers: authHeaders(token),
    data: { workspaceId, title: input.title, parentId: input.parentId ?? null },
  })
  expect(response.ok()).toBeTruthy()
  const page = (await response.json()) as ApiPage
  if (input.blocks?.length) {
    const save = await request.put(`/api/pages/${page.id}/blocks`, {
      headers: authHeaders(token),
      data: { blocks: input.blocks },
    })
    expect(save.ok(), `save blocks failed: ${save.status()} ${await save.text()}`).toBeTruthy()
  }
  return { ...page, blocks: input.blocks ?? [] }
}

export async function workspaceAndPages(request: APIRequestContext, token: string) {
  const workspaces = await listWorkspaces(request, token)
  expect(workspaces.length).toBeGreaterThan(0)
  const workspace = workspaces[0]
  const pages = await listPages(request, token, workspace.id)
  return { workspace, pages }
}

export async function findPageByTitle(
  request: APIRequestContext,
  token: string,
  title: string,
) {
  const { workspace, pages } = await workspaceAndPages(request, token)
  const page = pages.find((item) => item.title === title)
  expect(page, `page "${title}" not found`).toBeTruthy()
  return { workspace, page: page! }
}

export async function waitForBlockText(
  request: APIRequestContext,
  token: string,
  pageId: string,
  text: string,
  timeout = 10_000,
) {
  await expect
    .poll(
      async () => {
        const page = await getPage(request, token, pageId)
        return page.blocks.map((block) => block.text).join("\n")
      },
      { timeout },
    )
    .toContain(text)
}

export async function waitForPageTitle(
  request: APIRequestContext,
  token: string,
  pageId: string,
  title: string,
  timeout = 10_000,
) {
  await expect
    .poll(async () => (await getPage(request, token, pageId)).title, { timeout })
    .toBe(title)
}

export function textBlock(text: string): ApiBlock {
  return { id: crypto.randomUUID(), type: "paragraph", text }
}
