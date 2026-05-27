import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'

/**
 * GET /api/me/draft — fetch the user's compose-draft.
 * PUT /api/me/draft — upsert the user's compose-draft.
 * DELETE /api/me/draft — clear the user's compose-draft (called by
 *                       the submit handler after a successful submit).
 *
 * One draft per user, enforced by the unique index on review_drafts.user_id.
 * Matches the localStorage compose-draft behaviour the editor uses
 * today — the server copy is the cross-device source of truth.
 *
 * Resolves bench-review#26 (the server-side autosave piece — the
 * inline editor + localStorage cache already works locally).
 */

const ALLOWED_TYPES = new Set(['positive', 'negative', 'neutral'])

export default new Action({
  name: 'My Draft',
  description: 'Fetch / upsert / clear the user\'s compose-draft (server-side autosave)',
  // Multi-method handler so a single action covers GET / PUT / DELETE.
  // Route declarations at routes/api.ts bind each verb to the same
  // class; the method check inside handle() dispatches.
  method: 'GET',

  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const method = String((request as any).method ?? 'GET').toUpperCase()

    if (method === 'GET') {
      const row = await db.selectFrom('review_drafts' as any)
        .selectAll()
        .where('user_id' as any, '=', Number(userId))
        .executeTakeFirst() as Record<string, any> | undefined

      // Empty-shape response when no draft exists — keeps the client
      // contract uniform whether or not there's a row.
      if (!row)
        return response.json({ ok: true, draft: null })
      return response.json({ ok: true, draft: row })
    }

    if (method === 'DELETE') {
      await db.deleteFrom('review_drafts' as any)
        .where('user_id' as any, '=', Number(userId))
        .execute()
      return response.json({ ok: true, cleared: true })
    }

    // PUT (upsert). Body fields are all optional — the draft accepts
    // partial state at any point during composition.
    if (method === 'PUT' || method === 'PATCH') {
      const judgeIdRaw = (request as any).get?.('judge_id')
      const ratingRaw = (request as any).get?.('rating')
      const judgeId = judgeIdRaw === null || judgeIdRaw === '' || judgeIdRaw === undefined
        ? null
        : Number(judgeIdRaw)
      const rating = ratingRaw === null || ratingRaw === '' || ratingRaw === undefined
        ? null
        : Math.max(1, Math.min(5, Math.floor(Number(ratingRaw))))

      const titleRaw = (request as any).get?.('title')
      const contentRaw = (request as any).get?.('content')
      const typeRaw = String((request as any).get?.('type') ?? '').trim().toLowerCase()
      const anonRaw = (request as any).get?.('anonymized')

      const title = typeof titleRaw === 'string' ? titleRaw.slice(0, 500) : null
      // Don't sanitise here — content is the user's in-progress
      // draft, not a publishable payload. Sanitisation runs at
      // submit time in SubmitReviewAction. Bound the length to keep
      // payloads sane (review content cap is 10k; double that for
      // drafts that may include unsanitised pasted markup).
      const content = typeof contentRaw === 'string' ? contentRaw.slice(0, 20000) : null
      const type = ALLOWED_TYPES.has(typeRaw) ? typeRaw : null
      const anonymized = anonRaw === true || anonRaw === 'true' || anonRaw === 1 || anonRaw === '1' ? 1 : 0

      const existing = await db.selectFrom('review_drafts' as any)
        .select(['id'] as any)
        .where('user_id' as any, '=', Number(userId))
        .executeTakeFirst() as { id: number } | undefined

      const now = new Date().toISOString()
      const values: Record<string, unknown> = {
        user_id: Number(userId),
        judge_id: Number.isFinite(judgeId as number) ? judgeId : null,
        title,
        content,
        rating,
        type,
        anonymized,
        updated_at: now,
      }

      if (existing) {
        await db.updateTable('review_drafts' as any)
          .set(values as any)
          .where('id' as any, '=', existing.id)
          .execute()
      }
      else {
        values.created_at = now
        await db.insertInto('review_drafts' as any).values(values as any).execute()
      }
      return response.json({ ok: true })
    }

    return response.json({ error: `Method ${method} not supported on this endpoint.` }, 405)
  },
})
