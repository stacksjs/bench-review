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

export interface CourtHandoff {
  name?: string
  /** "City, State", already joined by the opener. */
  where?: string
  /** Counts travel as strings, like every other query value. */
  judges?: string
  reviews?: string
  rating?: string
}

/**
 * `?hname=…&hphoto=…` for the fields that have a value, or '' for none.
 *
 * Empty fields are left out rather than sent empty, so the path stays as
 * short as what is actually known. Every key is prefixed, which is what keeps
 * a handoff out of the route's own namespace.
 */
export function handoffQuery(handoff: Record<string, string | number | null | undefined>): string {
  const parts: string[] = []
  for (const [field, raw] of Object.entries(handoff)) {
    const value = String(raw ?? '').trim()
    if (value)
      parts.push(`h${field}=${encodeURIComponent(value)}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

/**
 * The handoff carried by a route, or null when it carries none.
 *
 * `fields` names what to look for, so a screen reads only its own keys and an
 * unrelated query parameter cannot become part of a handoff.
 *
 * Null rather than an empty object, so a screen can tell "nothing was handed
 * over, fetch it" from "a name was handed over and it is empty".
 */
export function handoffFromParams<T extends Record<string, string>>(
  params: Record<string, any> | null | undefined,
  fields: readonly string[],
): T | null {
  if (!params || typeof params !== 'object')
    return null
  const out: Record<string, string> = {}
  let any = false
  for (const field of fields) {
    const raw = params[`h${field}`]
    if (raw == null)
      continue
    const value = String(raw).trim()
    if (!value)
      continue
    out[field] = value
    any = true
  }
  return any ? (out as T) : null
}

export const JUDGE_FIELDS = ['name', 'photo', 'court', 'where'] as const
export const COURT_FIELDS = ['name', 'where', 'judges', 'reviews', 'rating'] as const

/**
 * A judge handoff as the shape the judge endpoint returns, so the detail
 * screen reads one shape whether the header came from a tap or the server.
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

/**
 * The same for a courthouse, against `CourtHouseIndexAction`'s row.
 *
 * The counts come back as strings and are parsed here rather than at the
 * binding, so the screen never has to care which half of the paint it is
 * looking at. A rating that was never sent stays null — "no published reviews
 * yet" is a real state the screen shows differently from zero.
 */
export function courtFromHandoff(handoff: CourtHandoff | null): Record<string, any> | null {
  if (!handoff)
    return null
  const city = String(handoff.where ?? '')
  const rating = handoff.rating == null ? null : Number(handoff.rating)
  return {
    name: handoff.name ?? '',
    city,
    state: '',
    active_judges: handoff.judges == null ? null : Number(handoff.judges),
    total_reviews: handoff.reviews == null ? null : Number(handoff.reviews),
    avg_rating: rating != null && Number.isFinite(rating) ? rating : null,
  }
}
