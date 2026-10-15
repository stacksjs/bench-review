/**
 * How a native screen reaches bench's API (bench-review#79).
 *
 * Deliberately small. HQ.training's equivalent is 244 lines because every one
 * of its screens is behind a sign-in, with a token in the Keychain and a
 * snapshot per screen. Bench's directory screens are PUBLIC — the same
 * endpoints the website calls without a session — so none of that applies
 * yet, and writing it before there is an authenticated native screen would be
 * inventing a shape the first real one has to live with.
 *
 * What is here is the part every screen does need: where the server is, a
 * JSON GET that fails in a way a screen can render, and a snapshot so the
 * first frame is last time's answer instead of a spinner.
 */

/** Craft's host object, present only inside the native runtime. */
function craftHost(): any {
  return (globalThis as any).craft
}

/**
 * The origin to call.
 *
 * `craft.app.url` is what the build was pointed at (`MOBILE_URL`, or
 * production). A bundled build with no server still has it, which is correct:
 * the screens then fail their fetch and show their offline state, rather than
 * calling a URL that was never configured.
 */
export function apiBase(): string {
  const url = craftHost()?.app?.url
  if (!url)
    return ''
  try {
    return new URL(String(url)).origin
  }
  catch {
    return ''
  }
}

export class ApiError extends Error {
  /** 0 when the request never reached a server — no signal, server down. */
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * GET a JSON endpoint.
 *
 * Distinguishes "could not reach the server" (status 0) from "the server
 * answered badly", because a screen says different things about them: one is
 * the phone's connection, the other is ours. Collapsing them is how an outage
 * gets reported to a user as an empty directory.
 */
export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const base = apiBase()
  if (!base)
    throw new ApiError('This build has no server configured.', 0)

  let response: Response
  try {
    response = await fetch(base + path, { headers: { Accept: 'application/json' }, signal })
  }
  catch (err) {
    if ((err as any)?.name === 'AbortError')
      throw err
    throw new ApiError('Could not reach Bench Review.', 0)
  }

  if (!response.ok)
    throw new ApiError(`The server answered ${response.status}.`, response.status)

  return await response.json() as T
}

/**
 * Last good answer for a screen, so a cold start paints content rather than a
 * spinner. `craft.snapshots` is the native key-value store and survives the
 * app being killed; it is absent outside the native runtime, where these
 * helpers simply no-op.
 */
export function readSnapshot<T>(name: string): T | undefined {
  try {
    const value = craftHost()?.snapshots?.get(name)
    return value == null ? undefined : value as T
  }
  catch {
    return undefined
  }
}

export function keepSnapshot(name: string, value: unknown): void {
  try {
    craftHost()?.snapshots?.set(name, value)
  }
  catch {
    // A snapshot is an optimisation. Losing one must never fail a screen.
  }
}
