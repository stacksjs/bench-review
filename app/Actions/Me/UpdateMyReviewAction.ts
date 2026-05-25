import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * PATCH /api/me/reviews/{id} — author edits their own review and
 * resubmits it for moderation.
 *
 * Visibility rules:
 *   - Only the row's author can call this. Non-owners get 404 (same
 *     response shape as a missing row — non-existence and access-
 *     denial indistinguishable from outside).
 *   - Published reviews are off-limits to edit. Once moderation has
 *     approved content, silent edits afterwards would let an author
 *     bait-and-switch — write something innocuous, get approved,
 *     swap it for something else. The author can delete-and-rewrite
 *     instead. Pending and rejected rows ARE editable, since neither
 *     has been seen by any reader yet.
 *
 * Side effect: every successful edit resets `status = 'pending'`. A
 * rejected review re-enters the moderation queue; a pending review
 * stays pending but with refreshed content. The moderator gets to
 * see whatever the author wrote MOST RECENTLY — never a stale draft.
 */
const ALLOWED_TYPES = new Set(['positive', 'negative', 'neutral'])

export default new Action({
  name: 'Update My Review',
  description: 'Edit a pending/rejected review you authored; resets status to pending',
  method: 'PATCH',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid review id.',
    },
  },

  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const reviewId = Number((request as any).params?.id)

    const existing = await db.selectFrom('judge_reviews' as any)
      .select(['id', 'user_id', 'status'] as any)
      .where('id' as any, '=', reviewId)
      .executeTakeFirst() as { id: number, user_id: number | null, status: string } | undefined

    if (!existing || existing.user_id == null || Number(existing.user_id) !== Number(userId))
      return response.json({ error: 'Review not found' }, 404)

    if (existing.status === 'published')
      return response.json({ error: 'Published reviews can\'t be edited. Delete and rewrite if you need to change them.' }, 422)

    // Body fields. All optional individually — we accept partial
    // patches so the client can send only what changed. Validations
    // are inline rather than declarative-on-Action because the
    // declarative `validations:` block only covers path params here.
    const titleInput = (request as any).get?.('title')
    const contentInput = (request as any).get?.('content')
    const ratingInput = (request as any).get?.('rating')
    const typeInput = (request as any).get?.('type')

    const patch: Record<string, unknown> = {}

    if (typeof titleInput === 'string') {
      const t = titleInput.trim()
      if (t.length < 3 || t.length > 255)
        return response.json({ error: 'Title must be between 3 and 255 characters.' }, 422)
      patch.title = t
    }

    if (typeof contentInput === 'string') {
      const c = contentInput.trim()
      if (c.length < 10 || c.length > 10000)
        return response.json({ error: 'Content must be between 10 and 10000 characters.' }, 422)
      patch.content = c
    }

    if (ratingInput !== undefined && ratingInput !== null) {
      const r = Number(ratingInput)
      if (!Number.isFinite(r) || r < 1 || r > 5)
        return response.json({ error: 'Rating must be between 1 and 5.' }, 422)
      patch.rating = Math.floor(r)
    }

    if (typeof typeInput === 'string') {
      const t = typeInput.trim().toLowerCase()
      if (!ALLOWED_TYPES.has(t))
        return response.json({ error: 'Type must be positive, negative, or neutral.' }, 422)
      patch.type = t
    }

    if (Object.keys(patch).length === 0)
      return response.json({ error: 'No editable fields supplied.' }, 422)

    // Resubmit semantics: every successful edit bumps status back to
    // pending. The moderator queue gets the fresh content.
    patch.status = 'pending'
    patch.updated_at = new Date().toISOString()

    await db.updateTable('judge_reviews' as any)
      .set(patch as any)
      .where('id' as any, '=', reviewId)
      .execute()

    const fresh = await db.selectFrom('judge_reviews' as any)
      .selectAll()
      .where('id' as any, '=', reviewId)
      .executeTakeFirst()

    return response.json({ ok: true, review: fresh })
  },
})
