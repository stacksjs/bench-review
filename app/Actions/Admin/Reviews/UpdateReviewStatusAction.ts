import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { notify } from '../../../Helpers/notifications'
import { escapeHtml, renderReviewEmail } from '../../../Helpers/reviewEmailTemplate'

/**
 * PATCH /api/admin/reviews/{id}/status — approve or reject a review.
 *
 * Body:
 *   - status : 'published' | 'rejected'
 *
 * The public feed (`LatestReviewsAction` / `ReviewsByJudgeAction`)
 * filters `status = 'published'`, so flipping a row to `rejected` is
 * a soft-take-down that leaves the row in the table — the admin can
 * un-reject later if needed. Hard delete is a separate action.
 */
const ALLOWED_STATUSES = new Set(['published', 'rejected'])

export default new Action({
  name: 'Admin Update Review Status',
  description: 'Approve or reject a pending or already-moderated review',
  method: 'PATCH',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid review id.',
    },
  },

  async handle() {
    const reviewId = Number((request as any).params?.id)
    const status = String((request as any).get?.('status') ?? '').trim().toLowerCase()

    if (!ALLOWED_STATUSES.has(status))
      return response.json({ error: 'Status must be "published" or "rejected".' }, 422)

    const existing = await db.selectFrom('judge_reviews')
      .select(['id', 'user_id', 'status'] as any)
      .where('id', '=', reviewId)
      .executeTakeFirst() as { id: number, user_id: number | null, status: string } | undefined
    if (!existing)
      return response.json({ error: 'Review not found.' }, 404)

    await db.updateTable('judge_reviews')
      .set({ status, updated_at: new Date().toISOString() } as any)
      .where('id', '=', reviewId)
      .execute()

    // Notify the review's author IFF status actually changed AND the
    // review has a real author (seeded reviews have user_id=null).
    // Approve and reject each generate a fresh notification — no
    // dedup, since toggling status back and forth is a deliberate
    // moderation signal the user should see each time.
    if (existing.user_id != null && existing.status !== status) {
      const me = await Auth.user().catch(() => null)
      const actorId = (me as any)?.id ?? null
      await notify({
        userId: Number(existing.user_id),
        actorUserId: actorId,
        type: status === 'published' ? 'approved' : 'rejected',
        reviewId,
      })

      // Email the author too. Best-effort — a failed send doesn't
      // roll back the moderation decision; the in-app notification
      // above still surfaces in the bell dropdown. Looks up the
      // author's email + the judge name from a couple of cheap
      // selects so the email body has real context.
      try {
        const author = await db.selectFrom('users')
          .select(['id', 'email', 'name'] as any)
          .where('id', '=', Number(existing.user_id))
          .executeTakeFirst() as { id: number, email: string, name: string | null } | undefined

        if (author?.email) {
          const reviewRow = await db.selectFrom('judge_reviews')
            .select(['title', 'judge_id'] as any)
            .where('id', '=', reviewId)
            .executeTakeFirst() as { title: string, judge_id: number } | undefined

          let judgeName = 'a judge'
          if (reviewRow?.judge_id) {
            const judgeRow = await db.selectFrom('judges')
              .select(['name'] as any)
              .where('id', '=', reviewRow.judge_id)
              .executeTakeFirst() as { name: string } | undefined
            if (judgeRow?.name) judgeName = judgeRow.name
          }

          const reviewerName = author.name || 'there'
          const articleUrl = `${process.env.APP_URL || 'http://localhost:4000'}/article/${reviewId}`
          const safeJudge = escapeHtml(judgeName)
          const { mail } = await import('@stacksjs/email')

          if (status === 'published') {
            await mail.send({
              to: author.email,
              subject: `Your review of ${judgeName} is now live`,
              text: `Hi ${reviewerName},\n\nGreat news — your review of ${judgeName} has been approved and is live on Bench Review.\n\nView it here:\n${articleUrl}\n\nThanks for contributing.\n\n— Bench Review\n`,
              html: renderReviewEmail({
                preheader: `Approved — your review of ${judgeName} is live and visible to readers.`,
                heading: `Your review is live.`,
                greeting: `Hi ${reviewerName},`,
                bodyHtml: `
                  <p style="margin:0 0 14px 0;">Great news — your review of <strong>${safeJudge}</strong> has been approved and is now live on Bench Review.</p>
                  <p style="margin:0 0 14px 0;">Anyone visiting the site can read it, find it helpful, and share it. Thanks for contributing — clerk and attorney reviews like yours are what make the directory useful.</p>
                `,
                ctaText: 'View your review',
                ctaUrl: articleUrl,
                accent: 'green',
                footerNote: `Status: published. Edits go back to a moderator for re-approval before they're visible publicly.`,
              }),
            })
          }
          else {
            await mail.send({
              to: author.email,
              subject: `Your review of ${judgeName} was declined`,
              text: `Hi ${reviewerName},\n\nA moderator declined your review of ${judgeName}. Only you can see it from your account — readers won't.\n\nYou can edit and resubmit it, or write a fresh one:\n${articleUrl}/edit\n\nIf you think this was a mistake, reply to this email and we'll take another look.\n\n— Bench Review\n`,
              html: renderReviewEmail({
                preheader: `Declined — your review of ${judgeName} isn't live. You can edit and resubmit it.`,
                heading: `Your review was declined.`,
                greeting: `Hi ${reviewerName},`,
                bodyHtml: `
                  <p style="margin:0 0 14px 0;">A moderator declined your review of <strong>${safeJudge}</strong>. Only you can see it from your account — readers won't.</p>
                  <p style="margin:0 0 14px 0;">You can edit and resubmit it, or write a fresh one. Edited reviews go back into the moderation queue and a moderator will take another look.</p>
                  <p style="margin:0 0 14px 0;">If you think the decline was a mistake, just reply to this email and we'll re-review.</p>
                `,
                ctaText: 'Edit and resubmit',
                ctaUrl: `${articleUrl}/edit`,
                accent: 'red',
                footerNote: `Status: declined. Editing puts the review back in the moderation queue.`,
              }),
            })
          }
        }
      }
      catch (err) {
        console.warn(`[admin-review-status] mail.send failed for review ${reviewId} → ${status}. The status change is persisted; the email could not be delivered.`, err instanceof Error ? err.message : err)
      }
    }

    return response.json({ ok: true, id: reviewId, status })
  },
})
