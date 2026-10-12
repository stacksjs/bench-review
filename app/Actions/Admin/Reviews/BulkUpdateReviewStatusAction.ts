import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { request, response } from '@stacksjs/router'
import { applyReviewStatus } from '../../../Helpers/reviewModeration'

/**
 * POST /api/admin/reviews/bulk-status — approve or reject a batch.
 *
 * Body:
 *   - ids    : number[]  (review ids, 1..MAX_BULK)
 *   - status : 'published' | 'rejected'
 *
 * Reviews are pending by default, so with only a single-id endpoint the
 * moderator was the publication bottleneck: a page of 25 submissions meant
 * 25 round trips and 25 clicks (bench-review#51).
 *
 * Each row goes through the same `applyReviewStatus` the single-id endpoint
 * uses, so each gets its own audit row, author notification and email, flag
 * close-out and publish fan-out. Nothing about a batch is cheaper than
 * doing them one at a time — it is only fewer clicks. That is deliberate:
 * a "fast path" that skipped the author email would mean a moderator's
 * choice of button silently decided whether people were told.
 *
 * Rows are processed SERIALLY, and one row's failure does not abort the
 * batch — the response reports per-row outcomes. Serial because each row
 * can send up to two emails: a parallel batch would open 50 SMTP sends at
 * once against a provider that rate-limits.
 */

const ALLOWED_STATUSES = new Set(['published', 'rejected'])

/**
 * Cap on one batch. The queue pages at 25 and selection is per-page, so the
 * UI cannot exceed this; the cap is here for a scripted caller, bounding
 * both the serial mail work and the number of audit rows one request can
 * write.
 */
const MAX_BULK = 50

export default new Action({
  name: 'Admin Bulk Update Review Status',
  description: 'Approve or reject many reviews in one request, logging each',
  method: 'POST',

  async handle() {
    const body = request.all() as Record<string, unknown>
    const status = String(body.status ?? '').trim().toLowerCase()

    if (!ALLOWED_STATUSES.has(status))
      return response.json({ error: 'Status must be "published" or "rejected".' }, 422)

    if (!Array.isArray(body.ids))
      return response.json({ error: 'Send "ids" as an array of review ids.' }, 422)

    // Coerce, drop anything that is not a positive integer, and dedupe
    // while preserving the order the moderator selected in.
    const ids = [...new Set(
      body.ids
        .map(v => Number(v))
        .filter(n => Number.isInteger(n) && n > 0),
    )]

    if (ids.length === 0)
      return response.json({ error: 'No valid review ids were sent.' }, 422)

    if (ids.length > MAX_BULK)
      return response.json({ error: `Too many reviews in one request (max ${MAX_BULK}).` }, 422)

    // Resolve the moderator up front, as the single-id endpoint does: the
    // audit log is guaranteed an actor, so no status ever changes unlogged.
    const admin = await Auth.user().catch(() => null)
    const adminId = (admin as any)?.id
    if (!adminId)
      return response.json({ error: 'Not authenticated.' }, 401)

    const updated: number[] = []
    const unchanged: number[] = []
    const failed: Array<{ id: number, error: string }> = []

    for (const id of ids) {
      try {
        const outcome = await applyReviewStatus(id, status as 'published' | 'rejected', Number(adminId))
        if (!outcome.ok)
          failed.push({ id, error: outcome.error ?? 'Could not update this review.' })
        else if (outcome.changed)
          updated.push(id)
        else
          unchanged.push(id)
      }
      catch (err) {
        // A failure here is the db, not the input. Record it and carry on:
        // losing 49 successful moderation decisions to the 50th row's
        // problem is worse than a partial result the moderator can see.
        console.warn(`[admin-review-bulk] review ${id} → ${status} failed:`, err instanceof Error ? err.message : err)
        failed.push({ id, error: 'Could not update this review.' })
      }
    }

    return response.json({
      ok: true,
      status,
      updated,
      unchanged,
      failed,
    })
  },
})
