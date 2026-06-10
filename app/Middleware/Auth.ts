import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { HttpError } from '@stacksjs/error-handling'
import { log } from '@stacksjs/logging'
import { Middleware } from '@stacksjs/router'

/**
 * Reject the request if the authenticated user is suspended (banned_at
 * set). Resolved once after token/session validation so it covers every
 * auth-gated route.
 *
 * Fails OPEN on a lookup error (e.g. a prod DB that hasn't run the
 * banned_at migration yet): the token is already validated, so allowing
 * is no worse than the pre-suspension behavior, and we must never break
 * all authentication because of this secondary check. A real ban throws.
 */
async function assertNotBanned(): Promise<void> {
  let row: { banned_at: string | null } | undefined
  try {
    const user = await Auth.user()
    const userId = (user as any)?.id
    if (!userId)
      return
    row = await db.selectFrom('users')
      .select(['banned_at'])
      .where('id', '=', Number(userId))
      .executeTakeFirst() as { banned_at: string | null } | undefined
  }
  catch (err) {
    log.warn(`[middleware:auth] suspension check skipped: ${err instanceof Error ? err.message : String(err)}`)
    return
  }
  if (row?.banned_at)
    throw new HttpError(403, 'This account has been suspended. Contact support if you believe this is a mistake.')
}

export default new Middleware({
  name: 'Auth',
  priority: 1,
  async handle(request) {
    // Check bearer token first (API auth)
    const bearerToken = request.bearerToken()

    if (bearerToken) {
      log.debug(`[middleware:auth] Validating bearer token`)
      const isValid = await Auth.validateToken(bearerToken)
      if (!isValid)
        throw new HttpError(401, 'Unauthorized. Invalid token.')

      log.debug(`[middleware:auth] Bearer token valid`)
      await assertNotBanned()
      return
    }

    // Check session cookie (web auth)
    const sessionId = request.cookie('session_id')

    if (sessionId) {
      log.debug(`[middleware:auth] Validating session`)
      const { sessionCheck } = await import('@stacksjs/auth')
      const isValid = await sessionCheck(sessionId)
      if (!isValid)
        throw new HttpError(401, 'Unauthorized. Session expired.')

      log.debug(`[middleware:auth] Session valid`)
      await assertNotBanned()
      return
    }

    throw new HttpError(401, 'Unauthorized. No token or session provided.')
  },
})
