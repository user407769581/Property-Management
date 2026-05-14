import { create } from 'zustand'

export const AUTH_STORAGE_KEY = 'property-admin-auth'

export interface AdminSessionUser {
  id: string
  username: string
  role: string
  name: string
}

interface AuthState {
  token: string
  user: AdminSessionUser | null
  hydrated: boolean
  hydrate: () => void
  setSession: (token: string, user: AdminSessionUser) => void
  logout: () => void
}

const persistSession = (token: string, user: AdminSessionUser | null) => {
  if (!token || !user) {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    return
  }

  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      token,
      user,
    }),
  )
}

export const useAuthStore = create<AuthState>((set) => ({
  token: '',
  user: null,
  hydrated: false,
  hydrate: () => {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) {
      set({ hydrated: true })
      return
    }

    try {
      const parsed = JSON.parse(raw) as { token: string; user: AdminSessionUser }
      set({
        token: parsed.token,
        user: parsed.user,
        hydrated: true,
      })
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      set({ token: '', user: null, hydrated: true })
    }
  },
  setSession: (token, user) => {
    persistSession(token, user)
    set({ token, user, hydrated: true })
  },
  logout: () => {
    persistSession('', null)
    set({ token: '', user: null, hydrated: true })
  },
}))
