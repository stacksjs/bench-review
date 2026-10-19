/**
 * Handing a pushed screen the row its opener already holds (bench-review#79).
 *
 * `navigation.open(path)` takes a path and nothing else — there is no props
 * argument (craft-native/craft#375) — so a detail screen normally re-fetches
 * what the list was already displaying. That costs a round trip for data that
 * was on screen a moment earlier, and it fails offline even though the data
 * was in memory.
 *
 * `craft.snapshots` is shared between screens, so it can carry the row across
 * the push. It is the offline-snapshot store doing a job it was not designed
 * for, and the danger is exactly that: a single shared key with no tie to the
 * navigation. Two opens in flight both write it, and the screen that lands
 * could read the other one's row and paint the WRONG judge's name.
 *
 * The id guard is what makes that safe. A handoff is only used when its id
 * matches the id the screen resolved from its own route, so a mismatched or
 * leftover handoff is ignored rather than trusted. One key per kind, not one
 * per row, so the store cannot grow without bound as people browse.
 *
 * No expiry, deliberately. A stale name for the moment before the refresh
 * lands is better than a blank header, and when the phone is offline a stale
 * handoff is the only thing the screen has.
 */

function store(): any {
  return (globalThis as any).craft?.snapshots
}

interface Envelope<T> {
  id: number
  value: T
}

/** Put `value` where the screen opened for `id` can find it. */
export function stashHandoff<T>(kind: string, id: number, value: T): void {
  if (!id || !value)
    return
  try {
    store()?.set?.(`handoff.${kind}`, { id: Number(id), value } satisfies Envelope<T>)
  }
  catch {
    // A handoff is an optimisation. Losing one costs a round trip, nothing more.
  }
}

/**
 * The handoff left for `id`, or null.
 *
 * Returns null on any mismatch — a different id, a malformed envelope, a store
 * that is not there — because every one of those means "paint from the server
 * instead", which is the behaviour this replaces and is always correct.
 */
export function takeHandoff<T>(kind: string, id: number): T | null {
  if (!id)
    return null
  try {
    const held = store()?.get?.(`handoff.${kind}`) as Envelope<T> | undefined
    if (!held || typeof held !== 'object')
      return null
    if (Number(held.id) !== Number(id))
      return null
    return (held.value ?? null) as T | null
  }
  catch {
    return null
  }
}
