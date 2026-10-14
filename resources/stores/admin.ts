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
  /** Set by step one: the password was right, now the emailed code is needed. */
  mfa_required?: boolean
  challenge?: string
  sent_to?: string
  expires_in?: number
}

/**
 * What a password submission produced (bench-review#56):
 *   'mfa'    — credentials accepted, a code is in the admin's inbox
 *   'ok'     — a session exists (only reachable from the code step)
 *   'failed' — see `loginError`
 */
export type AdminLoginOutcome = 'ok' | 'mfa' | 'failed'

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

  // The in-flight second factor. `mfaChallenge` is the opaque handle from step
  // one; `mfaSentTo` is the masked address, shown so an admin knows which
  // inbox to open. Both clear when a session is established or the attempt is
  // abandoned.
  const mfaChallenge = state<string>('')
  const mfaSentTo = state<string>('')

  /**
   * Step one: the password. A correct admin password no longer produces a
   * session (bench-review#56) — it produces a challenge and an emailed code,
   * which `verifyAdminCode` exchanges for one.
   */
  async function adminLogin(email: string, password: string): Promise<AdminLoginOutcome> {
    loginError.set('')
    loginLoading.set(true)
    mfaChallenge.set('')
    mfaSentTo.set('')
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
        return 'failed'
      }
      if (!data.mfa_required || !data.challenge) {
        // The server is the only thing that decides whether a factor is
        // required, and this client has no path that skips it. A 200 without
        // a challenge means the two sides disagree about the flow, so refuse
        // rather than guess.
        loginError.set('Unexpected sign-in response. Please try again.')
        return 'failed'
      }
      mfaChallenge.set(data.challenge)
      mfaSentTo.set(data.sent_to || 'your email')
      return 'mfa'
    }
    catch (err) {
      loginError.set(err instanceof Error ? err.message : 'Network error')
      return 'failed'
    }
    finally {
      loginLoading.set(false)
    }
  }

  /**
   * Step two: the emailed code, exchanged for a session.
   */
  async function verifyAdminCode(code: string): Promise<AdminLoginOutcome> {
    const challenge = mfaChallenge()
    if (!challenge) {
      loginError.set('That sign-in attempt is no longer valid. Sign in again.')
      return 'failed'
    }
    loginError.set('')
    loginLoading.set(true)
    try {
      const res = await fetch('/api/admin/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ challenge, code }),
      })
      const data = await res.json().catch(() => ({})) as AdminLoginResponse
      if (!res.ok) {
        loginError.set(data?.error || 'That code is not right.')
        // A dead challenge (expired, already used, out of attempts) cannot be
        // retried, so drop it and send them back to the password step rather
        // than letting them type into a field that can no longer work.
        if (res.status === 409) {
          mfaChallenge.set('')
          mfaSentTo.set('')
        }
        return 'failed'
      }
      const token = data.access_token || data.token || ''
      if (!token) {
        loginError.set('Server returned no access token.')
        return 'failed'
      }
      // The server set the HttpOnly session cookie on this response; this
      // mirrors the token in memory for the Authorization header and the user
      // onto the auth store so the topbar reflects the admin's identity.
      useStore('auth').persistAuth(token, data.user as any)
      mfaChallenge.set('')
      mfaSentTo.set('')
      // Eager fetch of the role-hydrated profile so `isAdmin` resolves
      // synchronously after this call. Without this the admin store's
      // `currentUser` would stay null until the next /admin/users call
      // populates it, and the redirect logic would bounce the admin
      // off the page they just successfully signed into.
      await fetchMe()
      return 'ok'
    }
    catch (err) {
      loginError.set(err instanceof Error ? err.message : 'Network error')
      return 'failed'
    }
    finally {
      loginLoading.set(false)
    }
  }

  /** Abandon an in-flight second factor and go back to the password step. */
  function cancelMfa(): void {
    mfaChallenge.set('')
    mfaSentTo.set('')
    loginError.set('')
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
    verifyAdminCode,
    cancelMfa,
    mfaChallenge,
    mfaSentTo,
    fetchMe,
    signOut,
  }
})
