import { create } from "zustand"

export interface Task {
  id: string
  label: string
  /** 0-100; null = indeterminate */
  progress: number | null
  status: "running" | "done" | "error"
  detail?: string
  createdAt: number
}

interface TasksState {
  tasks: Task[]
  start: (label: string) => string
  update: (id: string, patch: Partial<Task>) => void
  finish: (id: string, detail?: string) => void
  fail: (id: string, detail?: string) => void
  dismiss: (id: string) => void
  clearFinished: () => void
}

let seq = 0

export const useTasksStore = create<TasksState>((set) => ({
  tasks: [],
  start: (label) => {
    const id = `task-${Date.now()}-${seq++}`
    set((s) => ({ tasks: [{ id, label, progress: null, status: "running", createdAt: Date.now() }, ...s.tasks].slice(0, 20) }))
    return id
  },
  update: (id, patch) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  finish: (id, detail) =>
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: "done", progress: 100, detail } : t)) })),
  fail: (id, detail) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: "error", detail } : t)) })),
  dismiss: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  clearFinished: () => set((s) => ({ tasks: s.tasks.filter((t) => t.status === "running") })),
}))
