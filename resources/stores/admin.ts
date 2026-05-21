import { defineStore, derived, state, useStore } from '@stacksjs/stx'

export interface AdminRole {
  id: number
  name: string
  guard_name: string
}

export interface AdminUser {
  id: number
  email: string
  name: string
  roles: AdminRole[]
}

interface AdminLoginResponse {
  token?: string
  access_token?: string
  user?: { id: number, email: string, name: string }
  error?: string
}

defineStore('admin', () => {
  // Mirror of the signed-in admin's profile + roles. Kept separate
  // from the public auth store's `user` because the admin surface
  // wants role hydration that the regular login response doesn't
  // include — and we don't want to bloat the public auth payload
  // with role data every other view doesn't need.
  const currentUser = state<AdminUser | null>(null)

  // True when the current admin actually has the 'admin' role.
  // Drives client-side UI guards (sidebar visibility, redirect on
  // page mount). The server-side `admin` middleware is the actual
  // gate; this is just for UX.
  const isAdmin = derived<boolean>(() => {
    const u = currentUser()
    if (!u) return false
    return u.roles.some(r => r.name === 'admin')
  })

  const loginError = state<string>('')
  const loginLoading = state<boolean>(false)

  async function adminLogin(email: string, password: string): Promise<boolean> {
    loginError.set('')
    loginLoading.set(true)
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({})) as AdminLoginResponse
      if (!res.ok) {
        loginError.set(
          data?.error
          || (res.status === 401 ? 'Incorrect email or password'
            : res.status === 403 ? 'This account does not have admin access.'
              : 'Login failed'),
        )
        return false
      }
      const token = data.access_token || data.token || ''
      if (!token) {
        loginError.set('Server returned no access token.')
        return false
      }
      // Reuse the public auth store's cookie plumbing so a single
      // bearer token covers every authenticated API call regardless
      // of which login surface produced it. `persistAuth` writes both
      // the auth-token cookie (so the server sees us) AND mirrors the
      // user to the auth store's `user` signal (so the topbar avatar
      // stays in sync with the admin's identity).
      useStore('auth').persistAuth(token, data.user as any)
      // Eager fetch of the role-hydrated profile so `isAdmin` resolves
      // synchronously after this call. Without this the admin store's
      // `currentUser` would stay null until the next /admin/users call
      // populates it, and the redirect logic would bounce the admin
      // off the page they just successfully logged into.
      await fetchMe()
      return true
    }
    catch (err) {
      loginError.set(err instanceof Error ? err.message : 'Network error')
      return false
    }
    finally {
      loginLoading.set(false)
    }
  }

  /**
   * Refresh the admin profile by hitting `/api/admin/users?q=<own-email>&perPage=1`.
   * The dedicated `/me`-style admin endpoint would be cleaner; this
   * piggybacks on the existing index so we don't ship another action
   * for the single use case of "who am I and what are my roles."
   *
   * Returns true if the call landed and we're confirmed admin, false
   * otherwise. Callers that need the binding to act on a known-good
   * state should await this before reading `isAdmin`.
   */
  async function fetchMe(): Promise<boolean> {
    const authStore = useStore('auth')
    const cached = authStore.getUser?.()
    if (!cached?.email) {
      currentUser.set(null)
      return false
    }
    try {
      const res = await authStore.authFetch(`/api/admin/users?q=${encodeURIComponent(cached.email)}&perPage=5`)
      if (!res.ok) {
        currentUser.set(null)
        return false
      }
      const data = await res.json() as { users: AdminUser[] }
      const mine = data.users.find(u => u.email === cached.email) || null
      currentUser.set(mine)
      return !!mine && mine.roles.some(r => r.name === 'admin')
    }
    catch {
      currentUser.set(null)
      return false
    }
  }

  async function signOut(): Promise<void> {
    currentUser.set(null)
    await useStore('auth').logout()
    // useStore('auth').logout() already routes to /login. The admin
    // shell wants /admin/login instead — override after the fact.
    if (typeof window !== 'undefined')
      window.location.assign('/admin/login')
  }

  return {
    currentUser,
    isAdmin,
    loginError,
    loginLoading,
    adminLogin,
    fetchMe,
    signOut,
  }
})
