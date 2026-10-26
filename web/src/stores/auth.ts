import { create } from "zustand"
import { api, getToken, setToken } from "@/lib/api"
import type { User } from "@/lib/types"
import { useWorkspaceStore } from "@/stores/workspace"

type AuthStatus = "loading" | "guest" | "authed"

interface AuthState {
  status: AuthStatus
  user: User | null
  bootstrap: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  completeOIDC: () => Promise<void>
  logout: () => void
  setUser: (user: User) => void
}

let bootstrapPromise: Promise<void> | null = null

export const useAuthStore = create<AuthState>((set) => ({
  status: getToken() ? "loading" : "guest",
  user: null,

  bootstrap: () => {
    if (bootstrapPromise) return bootstrapPromise
    bootstrapPromise = (async () => {
      if (!getToken()) {
        set({ status: "guest", user: null })
        return
      }
      try {
        const user = await api.auth.me()
        set({ status: "authed", user })
      } catch {
        setToken(null)
        set({ status: "guest", user: null })
      }
    })()
    return bootstrapPromise
  },

  login: async (email, password) => {
    const { token, user } = await api.auth.login(email, password)
    setToken(token)
    bootstrapPromise = Promise.resolve()
    set({ status: "authed", user })
  },

  register: async (name, email, password) => {
    const { token, user } = await api.auth.register(name, email, password)
    setToken(token)
    bootstrapPromise = Promise.resolve()
    set({ status: "authed", user })
  },

  completeOIDC: async () => {
    const { token, user } = await api.auth.oidcExchange()
    setToken(token)
    bootstrapPromise = Promise.resolve()
    set({ status: "authed", user })
  },

  logout: () => {
    setToken(null)
    bootstrapPromise = Promise.resolve()
    useWorkspaceStore.getState().reset()
    set({ status: "guest", user: null })
  },

  setUser: (user) => set({ user }),
}))

if (typeof window !== "undefined") {
  window.addEventListener("motion:unauthorized", () => {
    useAuthStore.getState().logout()
  })
}
