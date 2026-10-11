/**
 * Does this error mean "a unique index rejected the row"?
 *
 * Both of bench's check-then-insert paths — the compose-draft autosave and
 * the review flag — now sit behind a real unique index, so the window
 * between their lookup and their insert can lose a race rather than quietly
 * writing a duplicate. That is the point of the index; it also means the
 * loser of the race surfaces as an exception that the caller has to read
 * rather than let escape as a 500.
 *
 * Driver-agnostic on purpose. SQLite says "UNIQUE constraint failed:
 * table.column", Postgres says "duplicate key value violates unique
 * constraint", MySQL says "Duplicate entry ... for key". Matching on the
 * message is unlovely, but neither bun-query-builder nor the drivers behind
 * it surface a stable error code here, and guessing one would be worse.
 */
export function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '')
  if (!message) return false
  return /unique constraint failed/i.test(message)
    || /duplicate key value violates unique constraint/i.test(message)
    || /duplicate entry .* for key/i.test(message)
    // bun:sqlite surfaces the constraint class on the error object; check it
    // too so a future message rewording does not silently break this.
    || (typeof (err as any)?.code === 'string' && /SQLITE_CONSTRAINT/i.test((err as any).code))
}
