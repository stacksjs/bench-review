import { apiBase, ApiError } from './native-api'

/**
 * The signed-in session on the phone (bench-review#79).
 *
 * The token lives in the **Keychain**, not in a snapshot and not in memory:
 * `craft.secureStorage` is backed by `kSecClassGenericPassword` with
 * `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, so it survives a relaunch,
 * never leaves the device, and is unreadable while the phone is locked. On a
 * site whose promise is reviewer anonymity, a credential that identifies the
 * person behind an anonymous review belongs there and nowhere else.
 *
 * No cookie. The web login installs an HttpOnly session cookie
 * (`app/Support/sessionCookie.ts`) which is the right answer in a browser and
 * useless here — the native screens are not a web view and have no cookie jar.
 * They send the bearer token the same endpoint already returns.
 */

const TOKEN_KEY = 'auth.token'
const USER_KEY = 'auth.user'

export interface SessionUser {
  id?: number
  name?: string | null
  email?: string | null
}

function store(): any {
  return (globalThis as any).craft?.secureStorage
}

/**
 * Read synchronously so a screen can render its signed-in state in the FIRST
 * frame. An async read means every screen flashes its signed-out state first,
 * which looks like being logged out.
 */
export function authToken(): string {
  try {
    return String(store()?.getSync?.(TOKEN_KEY) ?? '')
  }
  catch {
    return ''
  }
}

export function signedIn(): boolean {
  return authToken().length > 0
}

export function currentUser(): SessionUser | null {
  try {
    const raw = store()?.getSync?.(USER_KEY)
    return raw ? JSON.parse(String(raw)) as SessionUser : null
  }
  catch {
    return null
  }
}

async function remember(token: string, user: SessionUser | null): Promise<void> {
  await store()?.set?.(TOKEN_KEY, token)
  if (user)
    await store()?.set?.(USER_KEY, JSON.stringify(user))
}

async function forget(): Promise<void> {
  try {
    await store()?.remove?.(TOKEN_KEY)
    await store()?.remove?.(USER_KEY)
  }
  catch {
    // Nothing useful to do: the caller is signing out either way.
  }
}

/**
 * The session as request headers, for a PUBLIC endpoint whose answer depends
 * on who is asking.
 *
 * `/api/reviews`, a judge's reviews and a comment thread are all readable
 * without a session, and all carry fields computed FROM one: `is_mine` says
 * whether the reader wrote the row, `liked_by_me` whether they already marked
 * it helpful. Fetched anonymously they are permanently false, which is not a
 * stale value — it is a wrong one that never corrects:
 *
 *   - your own review keeps offering a Helpful chip, and the server answers
 *     422 to every tap;
 *   - a review you already marked reads as unmarked, so the next tap takes
 *     the mark OFF.
 *
 * Deliberately NOT `authFetch`. That treats a 401 as a spent token and clears
 * the Keychain, which is right for an endpoint that REQUIRES a session and
 * wrong for one that does not: a public list answering 401 must not sign
 * anybody out. Here the token is an optional hint — present, the server
 * answers as the viewer; absent or stale, it answers as a guest, which is
 * exactly what a public endpoint should do.
 */
export function viewerHeaders(): Record<string, string> {
  const token = authToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * A request carrying the session, when there is one.
 *
 * A 401 means the token is spent — revoked by a password change, a "sign out
 * everywhere", or expiry — so it is cleared here rather than left to fail
 * every later call. Anything else is the caller's to interpret.
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = apiBase()
  if (!base)
    throw new ApiError('This build has no server configured.', 0)

  const token = authToken()
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(init.headers as Record<string, string> | undefined ?? {}),
  }
  if (token)
    headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(base + path, { ...init, headers })
  }
  catch {
    throw new ApiError('Could not reach Bench Review.', 0)
  }

  if (response.status === 401 && token)
    await forget()

  return response
}

export interface SignInResult {
  ok: boolean
  /** Shown to the person; already worded for them. */
  error?: string
  user?: SessionUser
}

/**
 * Exchange an email and password for a session.
 *
 * The wording of a failure is deliberately the SERVER's: `/api/auth/login`
 * answers "Incorrect email or password" for both an unknown address and a
 * wrong password, and inventing a friendlier split here would reintroduce the
 * account-enumeration oracle the web login is careful not to have.
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const base = apiBase()
  if (!base)
    return { ok: false, error: 'This build has no server configured.' }

  let response: Response
  try {
    response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  }
  catch {
    return { ok: false, error: 'Could not reach Bench Review. Check your connection.' }
  }

  const body = await response.json().catch(() => ({})) as Record<string, any>
  if (!response.ok) {
    return {
      ok: false,
      error: body?.errors?.[0]?.message
        || body?.message
        || body?.error
        || (response.status === 401 ? 'Incorrect email or password.' : 'Could not sign you in.'),
    }
  }

  const token = String(body.access_token || body.token || '')
  if (!token)
    return { ok: false, error: 'The server did not return a session.' }

  const user: SessionUser = body.user ?? {}
  await remember(token, user)
  return { ok: true, user }
}

/**
 * End the session.
 *
 * The server call is best-effort and the local keys are cleared regardless: a
 * sign-out that fails because the network is down must still sign the person
 * out of THIS phone, which is the thing they actually asked for.
 */
export async function signOut(): Promise<void> {
  const token = authToken()
  if (token) {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' })
    }
    catch {
      // Best effort; the local keys go either way.
    }
  }
  await forget()
}
