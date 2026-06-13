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

// Append `; Secure` whenever the page is served over https, so the
// auth/user cookies never travel in cleartext in production. Omitted on
// http (dev/localhost) because browsers drop Secure cookies on http,
// which would silently break the session locally.
function secureAttr(): string {
  return (typeof window !== 'undefined' && window.location?.protocol === 'https:') ? '; Secure' : ''
}

function setAuthCookie(token: string): void {
  if (typeof document === 'undefined') return
  // SameSite=Lax so navigations from external referrers still send it
  // (so the server-side auth gate can see the session on a deep-link
  // back into /profile).
  document.cookie = `${AUTH_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secureAttr()}`
}

function setUserCookie(user: UserProfile): void {
  if (typeof document === 'undefined') return
  document.cookie = `${USER_COOKIE}=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secureAttr()}`
}

function clearAuthCookies(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; SameSite=Lax`
  document.cookie = `${USER_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}

function readCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match && match[1] !== undefined ? decodeURIComponent(match[1]) : ''
}

// Endpoints where a 401 means "wrong credentials," not "session
// expired" — we must NOT bounce the user, otherwise the inline form-
// error UX gets short-circuited by a redirect to /login itself.
const AUTH_EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  // Admin login is its own credential-verification surface — a 401
  // here means "wrong creds for an admin account," not "session
  // expired." Treat it like the normal /auth/login above so the
  // inline form-error UX isn't short-circuited by a redirect.
  '/api/admin/auth/login',
]

// One-shot guard so a burst of parallel 401s after a long idle
// (home page kicks off four fetches at once) only triggers ONE
// cleanup + navigation, not four.
let signingOut = false

function signOutAndRedirect(): void {
  if (signingOut) return
  signingOut = true
  clearAuthCookies()
  if (typeof document !== 'undefined')
    document.dispatchEvent(new CustomEvent('auth:expired', { bubbles: true }))
  if (typeof window !== 'undefined') {
    // Bounce back to whichever login surface the user came from.
    // An admin whose session expires mid-action lands at /admin/login;
    // a regular user lands at /login. Without this branch, an admin
    // gets dumped on the public login page, signs in there, and is
    // then redirected to the homepage instead of resuming admin work.
    const onAdmin = typeof window.location !== 'undefined'
      && window.location.pathname.startsWith('/admin')
    const target = onAdmin ? '/admin/login?expired=1' : '/login?expired=1'
    if (typeof (globalThis as any).navigate === 'function')
      (globalThis as any).navigate(target, true)
    else
      window.location.assign(target)
  }
}

function isAuthExempt(url: string): boolean {
  return AUTH_EXEMPT_PATHS.some(p => url.endsWith(p) || url.includes(`${p}?`))
}

/**
 * Centralised fetch for authenticated /api/* calls.
 *
 * Reads the auth-token cookie, attaches the Bearer header, and on a
 * 401 from a request that carried a token (the server rejected the
 * session) clears local auth state and bounces to /login. Lives in
 * the auth store module so it ships in the same bundle as the store
 * — the stx store compiler doesn't follow cross-directory value
 * imports cleanly, and the previous attempt at extracting this into
 * `resources/lib/` blew up with `apiFetch is not defined` at scope-
 * setup time.
 *
 * Stores reach this lazily via `useStore('auth').authFetch(...)` so
 * the cross-store dependency is resolved at call time, never at
 * module-load.
 */
async function _apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = readCookie(AUTH_COOKIE)
  const carriedToken = !!token

  if (token) {
    const headers = new Headers(options.headers)
    if (!headers.has('Authorization'))
      headers.set('Authorization', `Bearer ${token}`)
    if (!headers.has('Accept'))
      headers.set('Accept', 'application/json')
    options.headers = headers
  }

  const res = await fetch(url, options)

  // Only treat 401 as "session expired" when we actually sent a
  // token. A 401 on an anonymous request is just "you need to log
  // in" — that's not a logout trigger.
  if (res.status === 401 && carriedToken && !isAuthExempt(url))
    signOutAndRedirect()

  return res
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

    // Drop in-memory state the moment apiFetch detects an expired or
    // invalidated token. apiFetch already clears the cookies + bounces
    // to /login; this listener keeps the signals in lock-step so any
    // component still bound to `user`/`token` doesn't render a stale
    // session while the navigation is in flight.
    document.addEventListener('auth:expired', () => {
      user.set(null)
      token.set('')
      notifications.set([])
    })
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
      // Best-effort role hydration so isAdmin flips immediately after
      // a regular login. fetchMe is idempotent + cheap; on failure the
      // header just won't show the admin link until next mount.
      await fetchMe().catch(() => {})
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

  // Public handle for other stores. They reach this via
  // `useStore('auth').authFetch(...)` inside their async methods so
  // the cross-store reference resolves lazily, not at module load.
  const authFetch = _apiFetch

  /**
   * Hydrate role names onto the cached user via `/api/me`. Used by
   * BenchHeader to conditionally render the "Admin" link. Idempotent:
   * cheap to call on every mount; skipped silently when no token is
   * present.
   *
   * Updates both the `user` signal AND the auth-user cookie so a
   * subsequent hard reload sees the roles without re-fetching.
   */
  async function fetchMe(): Promise<void> {
    if (!token()) return
    try {
      const res = await _apiFetch('/api/me')
      if (!res.ok) return
      const data = await res.json() as UserProfile & { roles?: string[] }
      const merged: UserProfile = { ...(user() ?? {}), ...data }
      user.set(merged)
      setUserCookie(merged)
    }
    catch {
      // Network blip — skip silently; isAdmin will stay false until
      // the next opportunity to refresh.
    }
  }

  // Derived role check. False when no user, no roles, or no admin
  // role in the array. Reactive — flips the moment fetchMe lands.
  const isAdmin = derived<boolean>(() => !!user()?.roles?.includes('admin'))

  // Auto-hydrate roles on first mount when a token is already in the
  // cookie (e.g. after a hard reload). Fires once per page load.
  if (typeof window !== 'undefined' && token()) {
    fetchMe().catch(() => {})
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

  /**
   * Upload a new profile photo. POSTs the file as multipart to
   * /api/me/avatar; on success mirrors the returned URL onto the cached
   * user (signal + cookie) so every avatar binding updates without a
   * refetch. Content-Type is left unset so the browser writes the
   * multipart boundary itself (authFetch only adds Authorization/Accept).
   */
  async function uploadAvatar(file: File): Promise<{ ok: boolean, avatar?: string, error?: string }> {
    try {
      const form = new FormData()
      form.append('avatar', file)
      const res = await _apiFetch('/api/me/avatar', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, avatar?: string, error?: string }
      if (!res.ok || !data.ok || !data.avatar)
        return { ok: false, error: data.error || 'Upload failed' }
      const merged = { ...(user() ?? {}), avatar: data.avatar } as UserProfile
      user.set(merged)
      setUserCookie(merged)
      return { ok: true, avatar: data.avatar }
    }
    catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
  }

  return {
    user,
    token,
    isAuthenticated,
    isAdmin,
    notifications,
    unreadCount,
    signIn,
    signUp,
    logout,
    getUser,
    setUser,
    uploadAvatar,
    fetchMe,
    authFetch,
    // Exposed for the admin store — admin login POSTs to its own
    // endpoint, then needs to persist the returned token + user via
    // the same cookie plumbing the public signIn uses. Without this
    // the admin store would have to duplicate `setAuthCookie` etc.
    persistAuth,
    setNotifications,
    markAllRead,
    dismissNotification,
  }
})
