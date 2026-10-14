import { deleteExpiredRefreshTokens, deleteExpiredTokens, deleteRevokedTokens } from '@stacksjs/auth'
import { log } from '@stacksjs/logging'
import { Job } from '@stacksjs/queue'
import { reportError } from '../Support/reportError'

/**
 * Clear out spent auth tokens (bench-review#55).
 *
 * Expired and revoked tokens are not a security hole on their own — the
 * framework rejects them at use time — but they accumulate forever, and the
 * rows carry the user_id ↔ session linkage for every sign-in the site has ever
 * had. On a site whose promise is reviewer anonymity, a table that remembers
 * every session indefinitely is a liability with no corresponding benefit.
 *
 * ── Why not `buddy auth:prune` ──────────────────────────────────────────────
 * The framework's CLI action issues `WHERE expires_at < NOW()` via
 * `sql.raw('NOW()')`. `NOW()` is MySQL/Postgres; SQLite has no such function,
 * so that command errors out against this app's database and has never been
 * runnable here.
 *
 * The library functions it is built on are dialect-aware — they go through
 * `sqlDateTimeLiteral()` rather than a hardcoded `NOW()` — so this calls those
 * directly and skips the broken wrapper.
 *
 * Each step is independent: a missing `oauth_*` table (an app that never
 * issued a refresh token) must not stop the others from running.
 */
export default new Job({
  name: 'PruneAuthTokens',
  description: 'Delete expired and long-revoked auth tokens',
  queue: 'default',
  tries: 1,

  handle: async () => {
    const counts = { expired: 0, revoked: 0, refresh: 0 }

    for (const [key, run] of [
      ['expired', deleteExpiredTokens],
      ['revoked', () => deleteRevokedTokens(7)],
      ['refresh', deleteExpiredRefreshTokens],
    ] as const) {
      try {
        counts[key as keyof typeof counts] = Number(await (run as () => Promise<number>)()) || 0
      }
      catch (err) {
        // A table that does not exist is not worth an alert; anything else is.
        const message = err instanceof Error ? err.message : String(err)
        if (/no such table|does not exist/i.test(message))
          log.info(`[prune-tokens] skipped ${key}: ${message}`)
        else
          reportError('prune-tokens', err, { step: key })
      }
    }

    const total = counts.expired + counts.revoked + counts.refresh
    log.info(`[prune-tokens] removed ${total} token(s) (expired ${counts.expired}, revoked ${counts.revoked}, refresh ${counts.refresh})`)
    return { ...counts, total }
  },
})
