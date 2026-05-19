import type { NotificationItem, UserProfile } from '~/resources/types'
import { defineStore, derived, state } from '@stacksjs/stx'

export interface AuthResult {
  ok: boolean
  error?: string
  user?: UserProfile
  token?: string
}

interface AuthResponse {
  token?: string
  user?: UserProfile
  errors?: Array<{ message: string }>
  message?: string
}

interface RegisterPayload {
  name: string
  email: string
  password: string
  password_confirmation?: string
}

// Cookies read by stx-serve's page-level auth gate. `AUTH_COOKIE` must
// stay in lock-step with `config/auth.ts.defaultTokenName` — the
// framework default in `helpers/utils.ts:78` passes that name into
// `serve({ auth: { cookieName: ... } })` so the built-in `auth`
// middleware redirects unauthenticated requests to /login. The
// USER cookie is a project-side mirror so `<script server>` blocks
// and the pre-paint auth-guard.stx can read user data without an
// extra API roundtrip.
const AUTH_COOKIE = 'auth-token'
const USER_COOKIE = 'auth-user'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function setAuthCookie(token: string): void {
  if (typeof document === 'undefined') return
  // SameSite=Lax so navigations from external referrers still send it
  // (so the server-side auth gate can see the session on a deep-link
  // back into /profile). Not Secure-flagged because dev runs on http;
  // production should layer `; Secure` on top via APP_URL detection.
  document.cookie = `${AUTH_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

function setUserCookie(user: UserProfile): void {
  if (typeof document === 'undefined') return
  document.cookie = `${USER_COOKIE}=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

function clearAuthCookies(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; SameSite=Lax`
  document.cookie = `${USER_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}

function readCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ''
}

defineStore('auth', () => {
  const user = state<UserProfile | null>(null)
  const token = state<string>('')
  // Derive from token, NOT user — the server may issue a token before
  // we've fetched user details (or return an empty user object on
  // register), and the UI should treat token presence as "logged in".
  // This matches training's pattern.
  const isAuthenticated = derived<boolean>(() => !!token())
  const notifications = state<NotificationItem[]>([])

  const unreadCount = derived<number>(() => {
    return notifications().filter(n => n.unread).length
  })

  // Hydrate from cookies on first import. Cookies (not localStorage)
  // are the source of truth so SSR + the pre-paint auth-guard see the
  // same session as the SPA. Migrated from prior localStorage scheme.
  if (typeof window !== 'undefined') {
    try {
      const storedToken = readCookie(AUTH_COOKIE)
      const storedUser = readCookie(USER_COOKIE)
      if (storedToken)
        token.set(storedToken)
      if (storedUser)
        user.set(JSON.parse(storedUser))
    }
    catch {
      // Private-mode browsers or corrupted JSON — drop silently.
    }
  }

  // Internal: stash credentials in state + cookies. Both signIn/signUp
  // delegate here so the success path is identical regardless of the
  // entry point.
  function persistAuth(authToken: string, userData?: UserProfile): void {
    if (authToken) {
      token.set(authToken)
      setAuthCookie(authToken)
    }
    if (userData) {
      user.set(userData)
      setUserCookie(userData)
    }
  }

  async function signIn(email: string, password: string): Promise<AuthResult> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({})) as AuthResponse
      if (!res.ok) {
        const msg = data?.errors?.[0]?.message
          || data?.message
          || (res.status === 401 ? 'Incorrect email or password' : 'Login failed')
        return { ok: false, error: msg }
      }
      persistAuth(data.token ?? '', data.user)
      return { ok: true, user: data.user, token: data.token }
    }
    catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
  }

  async function signUp(payload: RegisterPayload): Promise<AuthResult> {
    try {
      const body: RegisterPayload = {
        name: payload.name,
        email: payload.email,
        password: payload.password,
        password_confirmation: payload.password_confirmation ?? payload.password,
      }
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({})) as AuthResponse
      if (!res.ok) {
        const msg = data?.errors?.[0]?.message || data?.message || 'Registration failed'
        return { ok: false, error: msg }
      }
      persistAuth(data.token ?? '', data.user)
      return { ok: true, user: data.user, token: data.token }
    }
    catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
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
    clearAuthCookies()
    navigate('/login', true)
  }

  // Lazy user lookup — pages that mount before the SPA hydrate (or that
  // run before signIn has populated state) can still get the cached
  // user object from the cookie. Matches training's auth.getUser().
  function getUser(): UserProfile | null {
    if (user()) return user()
    const raw = readCookie(USER_COOKIE)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as UserProfile
      user.set(parsed)
      return parsed
    }
    catch { return null }
  }

  // Attach the bearer token to fetches that hit our API. 401s clear the
  // session and bounce the user back to /login automatically so a
  // long-idle tab doesn't sit on a stale page rendering "Welcome back".
  async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const t = token() || readCookie(AUTH_COOKIE)
    if (t) {
      const headers = new Headers(options.headers)
      if (!headers.has('Authorization'))
        headers.set('Authorization', `Bearer ${t}`)
      options.headers = headers
    }
    const res = await fetch(url, options)
    if (res.status === 401 && !url.endsWith('/api/auth/login')) {
      user.set(null)
      token.set('')
      clearAuthCookies()
      navigate('/login', true)
    }
    return res
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

  function setUser(next: UserProfile | null): void {
    user.set(next)
    if (next)
      setUserCookie(next)
  }

  return {
    user,
    token,
    isAuthenticated,
    notifications,
    unreadCount,
    signIn,
    signUp,
    logout,
    getUser,
    setUser,
    authFetch,
    setNotifications,
    markAllRead,
    dismissNotification,
  }
})
