// Offline draft queue: persist pending ops in localStorage, replay on reconnect.
export type OfflineOp = {
  id: string
  pageId: string
  url: string
  method: string
  body: string
  createdAt: number
}

const KEY = "motion:offline-queue"

function load(): OfflineOp[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return JSON.parse(raw) as OfflineOp[]
  } catch {
    return []
  }
}

function save(queue: OfflineOp[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(queue.slice(0, 100)))
  } catch {}
}

export function enqueue(op: OfflineOp) {
  const q = load()
  q.push(op)
  save(q)
}

export function dequeue(id: string) {
  save(load().filter((o) => o.id !== id))
}

export function peekAll(): OfflineOp[] {
  return load()
}

export function clearAll(pageId?: string) {
  if (!pageId) {
    localStorage.removeItem(KEY)
    return
  }
  save(load().filter((o) => o.pageId !== pageId))
}

// Draft persistence per page (auto-save content while offline)
export function saveDraft(pageId: string, data: unknown) {
  try {
    localStorage.setItem(`motion:draft:${pageId}`, JSON.stringify({ data, at: Date.now() }))
  } catch {}
}

export function loadDraft<T>(pageId: string): T | null {
  try {
    const raw = localStorage.getItem(`motion:draft:${pageId}`)
    if (!raw) return null
    return (JSON.parse(raw) as { data: T }).data
  } catch {
    return null
  }
}

export function clearDraft(pageId: string) {
  localStorage.removeItem(`motion:draft:${pageId}`)
}

// Replays queued ops using fetch with Bearer taken from caller.
export async function replayQueue(getToken: () => string | null, onProgress?: (op: OfflineOp) => void) {
  if (!navigator.onLine) return
  const queue = peekAll()
  for (const op of queue) {
    try {
      onProgress?.(op)
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      const token = getToken()
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(op.url, { method: op.method, headers, body: op.body })
      if (res.ok) dequeue(op.id)
    } catch {
      // keep for next try
    }
  }
}
