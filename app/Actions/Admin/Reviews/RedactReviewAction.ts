import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { logModeration } from '../../../Helpers/auditLog'
import { sanitizeReviewHtml } from '../../../Helpers/sanitizeReviewHtml'

/**
 * PATCH /api/admin/reviews/{id}/content — excise part of a review without
 * deleting it (bench-review#53).
 *
 * Moderation was whole-review only: flip the status, or take it down. That is
 * the wrong shape for the case this site will actually meet, which is a review
 * that is lawful and worth keeping except for one sentence — a judge's home
 * address, a phone number, a family member's name. Under the Daniel Anderl
 * Act and the state Daniel's Laws the obligation is to remove the covered
 * information, not the opinion around it, and deleting the whole review to
 * comply is both over-removal and a worse outcome for the author.
 *
 * The FAQ has promised "we will remove or edit it" since launch, and no admin
 * edit path existed.
 *
 * Body:
 *   - content : the redacted HTML (sanitized here, same as author edits)
 *   - title   : optional, when the title itself carries covered information
 *   - note    : required — WHY. This is the compliance record.
 *
 * Status is deliberately untouched. A redacted review stays published; that
 * is the entire point of having this as well as a takedown.
 */

const MAX_CONTENT = 10000

export default new Action({
  name: 'Admin Redact Review',
  description: 'Edit a review\'s content to remove covered information, preserving the original',
  method: 'PATCH',

  async handle() {
    const admin = await Auth.user().catch(() => null)
    const adminId = (admin as any)?.id
    if (!adminId)
      return response.json({ error: 'Not authenticated.' }, 401)

    const reviewId = Number(request.params?.id)
    if (!Number.isInteger(reviewId) || reviewId <= 0)
      return response.json({ error: 'Invalid review id.' }, 422)

    // The reason is required, and it is not paperwork. A redaction changes
    // what the site says a named person wrote; months later the only answer
    // to "why does this differ from what was published" is this note.
    const note = String(request.get?.('note') ?? '').trim().slice(0, 1000)
    if (note.length < 5)
      return response.json({ error: 'A reason for the redaction is required.' }, 422)

    const existing = await db.selectFrom('judge_reviews')
      .select(['id', 'title', 'content', 'status'])
      .where('id', '=', reviewId)
      .executeTakeFirst() as { id: number, title: string | null, content: string | null, status: string } | undefined
    if (!existing)
      return response.json({ error: 'Review not found.' }, 404)

    const titleInput = request.get?.('title')
    const contentInput = request.get?.('content')
    if (titleInput == null && contentInput == null)
      return response.json({ error: 'Nothing to change.' }, 422)

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (titleInput != null) {
      const title = String(titleInput).trim().slice(0, 200)
      if (title.length < 3)
        return response.json({ error: 'The title is too short.' }, 422)
      patch.title = title
    }

    if (contentInput != null) {
      // Same sanitizer the author path uses. An admin is trusted to decide
      // WHAT to remove, not to hand-write raw HTML into a public page — and
      // the sanitizer is what holds the raw-text-element XSS bypass closed.
      const sanitized = (await sanitizeReviewHtml(String(contentInput))).slice(0, MAX_CONTENT)
      if (sanitized.replace(/<[^>]*>/g, '').trim().length < 10)
        return response.json({ error: 'The redacted review would be empty — take it down instead.' }, 422)
      patch.content = sanitized
    }

    // Snapshot BEFORE the write. The redaction overwrites in place, so this
    // is the only remaining record of what was published.
    await logModeration({
      actorUserId: Number(adminId),
      action: 'review.redact',
      targetType: 'review',
      targetId: reviewId,
      note,
      metadata: { snapshot: { title: existing.title, content: existing.content }, status: existing.status },
    })

    await db.updateTable('judge_reviews')
      .set(patch as any)
      .where('id', '=', reviewId)
      .execute()

    return response.json({ ok: true, id: reviewId })
  },
})
