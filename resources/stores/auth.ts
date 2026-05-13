import type { NotificationItem, UserProfile } from '~/resources/types'
import { defineStore, derived, state } from '@stacksjs/stx'

interface LoginResponse {
  token?: string
  user?: UserProfile
  errors?: Array<{ message: string }>
  message?: string
}

// Cookie name read by stx-serve's page-level auth gate (see
// `definePageMeta({ middleware: ['auth'] })` in protected views).
// Matches `config/auth.ts.defaultTokenName` — change in both places
// together if it ever needs to be renamed.
const AUTH_COOKIE = 'auth-token'
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function setAuthCookie(token: string): void {
  if (typeof document === 'undefined') return
  // Same-site Lax so navigations from external referrers still send it
  // (so the server-side auth gate can see the session on a deep-link
  // back into /profile). Not Secure-flagged because dev runs on http;
  // production should layer `; Secure` on top via APP_URL detection.
  document.cookie = `${AUTH_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${AUTH_COOKIE_MAX_AGE}; SameSite=Lax`
}

function clearAuthCookie(): void {
  if (typeof document === 'undefined') return
  // max-age=0 expires the cookie immediately.
  document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}

function readAuthCookie(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(new RegExp(`(?:^|; )${AUTH_COOKIE}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ''
}

defineStore('auth', () => {
  const user = state<UserProfile | null>(null)
  const token = state<string>('')
  const isAuthenticated = derived<boolean>(() => !!user())
  const notifications = state<NotificationItem[]>([])

  const unreadCount = derived<number>(() => {
    return notifications().filter(n => n.unread).length
  })

  // Hydrate from localStorage on first import. The login/register/reset
  // views write `auth_token` + `auth_user` after a successful response,
  // and consumers (BenchHeader, profile guards) need that state to be
  // available immediately on subsequent page loads — without this the
  // navbar shows "Log in / Sign up" for an authenticated user until
  // they re-login.
  if (typeof window !== 'undefined') {
    try {
      // Prefer the cookie when present so a session that's only being
      // tracked server-side (no localStorage write yet) still hydrates
      // the SPA. Fall back to localStorage for legacy sessions.
      const cookieToken = readAuthCookie()
      const storedToken = cookieToken || localStorage.getItem('auth_token')
      const storedUser = localStorage.getItem('auth_user')
      if (storedToken)
        token.set(storedToken)
      if (storedUser)
        user.set(JSON.parse(storedUser))
    }
    catch {
      // Private-mode browsers or corrupted JSON — drop silently.
    }
  }

  async function login(email: string, password: string): Promise<LoginResponse> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => ({})) as LoginResponse
    if (!res.ok) {
      const msg = data?.errors?.[0]?.message || data?.message || 'Login failed'
      throw new Error(msg)
    }
    if (data?.user) {
      user.set(data.user)
      try { localStorage.setItem('auth_user', JSON.stringify(data.user)) }
      catch {}
    }
    if (data?.token) {
      token.set(data.token)
      try { localStorage.setItem('auth_token', data.token) }
      catch {}
      // Mirror into the cookie stx-serve's auth middleware reads.
      // Without this, hard-navigating to a `definePageMeta({ middleware:
      // ['auth'] })` page right after login still 302s back to /login.
      setAuthCookie(data.token)
    }
    return data
  }

  async function logout(): Promise<void> {
    // Best-effort server-side invalidation. Even if it fails (network
    // hiccup, expired token), we still clear local state so the user
    // ends up on /login as expected.
    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (token())
        headers.Authorization = `Bearer ${token()}`
      await fetch('/api/auth/logout', { method: 'POST', headers })
    }
    catch {}

    user.set(null)
    token.set('')
    notifications.set([])
    try {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
    }
    catch {}
    clearAuthCookie()

    navigate('/login', true)
  }

  function setNotifications(notifs: NotificationItem[]): void {
    notifications.set(notifs)
  }

  function markAllRead(): void {
    notifications.set(notifications().map(n => ({ ...n, unread: false })))
  }

  function dismissNotification(id: number | string): void {
    notifications.set(notifications().filter(n => n.id !== id))
  }

  return {
    user,
    token,
    isAuthenticated,
    notifications,
    unreadCount,
    login,
    logout,
    setNotifications,
    markAllRead,
    dismissNotification,
    // Exported so the standalone login.stx / register.stx views (which
    // hit /login and /register directly rather than via the store)
    // can persist the cookie consistently after they handle the
    // response themselves.
    setAuthCookie,
    clearAuthCookie,
  }
})
