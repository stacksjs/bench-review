/**
 * Handing a pushed screen the row its opener already holds (bench-review#79).
 *
 * `navigation.open(path)` takes a path and nothing else — there is no props
 * argument (craft-native/craft#375) — so a detail screen normally re-fetches
 * what the list was already displaying. That costs a round trip for data that
 * was on screen a moment earlier, and it fails offline even though the data
 * was in memory.
 *
 * ## Why this rides the URL and not a store
 *
 * The obvious channel is `craft.snapshots`, which both screens can reach. It
 * does not work, and the way it fails is quiet:
 *
 *   - `snapshots.set` answers whether the value was "handed to the shell",
 *     which then persists it to a file. The push can beat that write, so the
 *     next screen's `get` reads the PREVIOUS value. Measured on a simulator:
 *     a judge opened from the feed painted the photo an earlier visit from
 *     the directory had stashed, not the one the feed had just written.
 *   - An in-memory map beside it does not help either. Native screens do not
 *     share a JS context — a map written on the feed screen reads back EMPTY
 *     on the judge screen in the same process (`size=0`).
 *
 * Query parameters have neither problem. They travel as part of the
 * navigation itself, so the value that arrives is always the one this tap
 * sent: it cannot be stale, cannot belong to another row, and needs no guard.
 *
 * The cost is a longer path and string-only values, which is fine for the
 * four short fields a header draws.
 *
 * ## The `h` prefix
 *
 * Path params and query params land in ONE flat `route.params` object, so a
 * handoff key named `id` would fight the `:id` in the route. Prefixing keeps
 * them in their own corner and says at a glance where a value came from.
 */

export interface JudgeHandoff {
  name?: string
  photo?: string
  /** Courthouse, or the feed's composed "court · city · state" line. */
  court?: string
  /** Jurisdiction and state, when the opener has them apart from the court. */
  where?: string
}

const KEYS: Array<[keyof JudgeHandoff, string]> = [
  ['name', 'hname'],
  ['photo', 'hphoto'],
  ['court', 'hcourt'],
  ['where', 'hwhere'],
]

/**
 * `?hname=…&hphoto=…` for the fields that have a value, or '' for none.
 *
 * Empty fields are left out rather than sent empty, so the path stays as
 * short as what is actually known.
 */
export function handoffQuery(handoff: JudgeHandoff): string {
  const parts: string[] = []
  for (const [field, key] of KEYS) {
    const value = String(handoff[field] ?? '').trim()
    if (value)
      parts.push(`${key}=${encodeURIComponent(value)}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

/**
 * The handoff carried by a route, or null when it carries none.
 *
 * Null rather than an empty object, so a screen can tell "nothing was handed
 * over, fetch it" from "a name was handed over and it is empty".
 */
export function handoffFromParams(params: Record<string, any> | null | undefined): JudgeHandoff | null {
  if (!params || typeof params !== 'object')
    return null
  const out: JudgeHandoff = {}
  let any = false
  for (const [field, key] of KEYS) {
    const raw = params[key]
    if (raw == null)
      continue
    const value = String(raw).trim()
    if (!value)
      continue
    out[field] = value
    any = true
  }
  return any ? out : null
}

/**
 * A handoff as the shape the judge endpoint returns, so the detail screen
 * reads one shape whether the header came from a tap or from the server.
 */
export function judgeFromHandoff(handoff: JudgeHandoff | null): Record<string, any> | null {
  if (!handoff)
    return null
  return {
    name: handoff.name ?? '',
    photo: handoff.photo ?? '',
    court: handoff.court ? { name: handoff.court } : null,
    location: handoff.where ?? '',
  }
}
