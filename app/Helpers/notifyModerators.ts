import { db } from '@stacksjs/database'
import { escapeHtml, renderReviewEmail } from './reviewEmailTemplate'

/**
 * Email admins when a review is flagged (bench-review#27) so flagged —
 * possibly defamatory — content surfaces fast instead of sitting silently
 * in the queue. Best-effort: callers `void` this and it never throws.
 *
 * Resolves admins straight off the RBAC tables (roles → user_roles → users)
 * rather than the RBAC store helpers, so it works from the public, anonymous
 * flag endpoint without the store-boot dependency. Two queries, no join
 * (the bqb query builder doesn't surface `.leftJoin()` — stacksjs/bun-query-builder#1023).
 */
export async function notifyModeratorsOfFlag(reviewId: number, reason: string): Promise<void> {
  try {
    const adminRole = await db.selectFrom('roles')
      .select(['id'])
      .where('name', '=', 'admin')
      .executeTakeFirst() as { id: number } | undefined
    if (!adminRole)
      return

    const roleRows = await db.selectFrom('user_roles')
      .select(['user_id'])
      .where('role_id', '=', adminRole.id)
      .execute() as Array<{ user_id: number }>
    const adminIds = Array.from(new Set(roleRows.map(r => Number(r.user_id)).filter(Boolean)))
    if (adminIds.length === 0)
      return

    const admins = await db.selectFrom('users')
      .select(['email', 'name'])
      .where('id', 'in', adminIds as any)
      .execute() as Array<{ email: string, name: string | null }>
    if (admins.length === 0)
      return

    // Judge name for context.
    const review = await db.selectFrom('judge_reviews')
      .select(['judge_id'])
      .where('id', '=', reviewId)
      .executeTakeFirst() as { judge_id: number | null } | undefined
    let judgeName = 'a judge'
    if (review?.judge_id) {
      const j = await db.selectFrom('judges')
        .select(['name'])
        .where('id', '=', review.judge_id)
        .executeTakeFirst() as { name: string } | undefined
      if (j?.name)
        judgeName = j.name
    }

    const reasonLabel = reason.replace(/_/g, ' ')
    const base = process.env.APP_URL || 'http://localhost:4000'
    const articleUrl = `${base}/article/${reviewId}`
    const adminUrl = `${base}/admin/reviews`
    const safeJudge = escapeHtml(judgeName)
    const safeReason = escapeHtml(reasonLabel)
    const { mail } = await import('@stacksjs/email')

    for (const admin of admins) {
      if (!admin.email)
        continue
      await mail.send({
        to: admin.email,
        subject: `A review of ${judgeName} was flagged (${reasonLabel})`,
        text: `A review of ${judgeName} was flagged for "${reasonLabel}".\n\nReview: ${articleUrl}\nModerate: ${adminUrl}\n\n— Bench Review`,
        html: renderReviewEmail({
          preheader: `A review of ${judgeName} was flagged for ${reasonLabel}.`,
          heading: 'A review was flagged',
          greeting: 'Hi moderator,',
          bodyHtml: `<p style="margin:0 0 14px 0;">A review of <strong>${safeJudge}</strong> was flagged for <strong>${safeReason}</strong>. Please take a look and decide whether to keep, edit, or take it down.</p>`,
          ctaText: 'Review it',
          ctaUrl: articleUrl,
          accent: 'red',
          footerNote: 'You receive this because you moderate Bench Review.',
        }),
      }).catch(() => {})
    }
  }
  catch {
    // Best-effort — never let a moderator-alert failure break flagging.
  }
}
