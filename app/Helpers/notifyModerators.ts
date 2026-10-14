import { db } from '@stacksjs/database'
import { escapeHtml, renderReviewEmail } from './reviewEmailTemplate'
import { reportError } from '../Support/reportError'

/**
 * Moderator alerts.
 *
 * Both of these resolve admins straight off the RBAC tables
 * (roles → user_roles → users) rather than the RBAC store helpers, so they
 * work from public, anonymous endpoints without the store-boot dependency.
 * No joins (the bqb query builder doesn't surface `.leftJoin()` —
 * stacksjs/bun-query-builder#1023).
 *
 * Both are best-effort: callers `void` them and they never throw. A
 * moderator alert that fails must not fail the thing it is reporting on.
 */

/**
 * Everyone with the `admin` role, as addresses. Shared rather than copied
 * into each alert — there are two callers now and the resolution is three
 * queries deep.
 */
async function moderatorRecipients(): Promise<Array<{ email: string, name: string | null }>> {
  const adminRole = await db.selectFrom('roles')
    .select(['id'])
    .where('name', '=', 'admin')
    .executeTakeFirst() as { id: number } | undefined
  if (!adminRole)
    return []

  const roleRows = await db.selectFrom('user_roles')
    .select(['user_id'])
    .where('role_id', '=', adminRole.id)
    .execute() as Array<{ user_id: number }>
  const adminIds = Array.from(new Set(roleRows.map(r => Number(r.user_id)).filter(Boolean)))
  if (adminIds.length === 0)
    return []

  const admins = await db.selectFrom('users')
    .select(['email', 'name'])
    .where('id', 'in', adminIds as any)
    .execute() as Array<{ email: string, name: string | null }>
  return admins.filter(a => !!a.email)
}

/**
 * A review was flagged (bench-review#27) — surface possibly defamatory
 * content fast instead of letting it sit silently in the queue.
 */
export async function notifyModeratorsOfFlag(reviewId: number, reason: string): Promise<void> {
  try {
    const admins = await moderatorRecipients()
    if (admins.length === 0)
      return

    // Judge name AND the flagged text (bench-review#53). The email used to
    // carry only links, which meant a moderator could not triage without
    // opening the admin UI — and for the one category where minutes matter,
    // a threat, the whole decision is "what does it actually say".
    const review = await db.selectFrom('judge_reviews')
      .select(['judge_id', 'title', 'content'])
      .where('id', '=', reviewId)
      .executeTakeFirst() as { judge_id: number | null, title: string | null, content: string | null } | undefined
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

    // A threat is escalated, not just reported. It is the one flag reason
    // where the platform may have to act within hours and may have to talk to
    // law enforcement, and a subject line that looks like every other
    // moderation notice is how it waits in a queue overnight. See
    // docs/THREAT-RESPONSE.md.
    const isThreat = reason === 'threat'

    // The review's own text, plain and truncated. HTML is stripped rather
    // than rendered: this is an email to a moderator about content that is by
    // definition hostile, and the one thing it must not do is execute or
    // reformat it.
    const plainText = String(review?.content ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500)
    const safeExcerpt = escapeHtml(plainText)
    const safeTitle = escapeHtml(String(review?.title ?? '').slice(0, 300))

    const { mail } = await import('@stacksjs/email')

    for (const admin of admins) {
      if (!admin.email)
        continue
      await mail.send({
        to: admin.email,
        subject: isThreat
          ? `URGENT: threat reported on a review of ${judgeName}`
          : `A review of ${judgeName} was flagged (${reasonLabel})`,
        text: `${isThreat ? 'THREAT REPORTED — see docs/THREAT-RESPONSE.md. Preserve the content; do not hard-delete.\n\n' : ''}A review of ${judgeName} was flagged for "${reasonLabel}".\n\nTitle: ${review?.title ?? '(none)'}\n\n${plainText || '(no text)'}\n\nReview: ${articleUrl}\nModerate: ${adminUrl}\n\n— Bench Review`,
        html: renderReviewEmail({
          preheader: isThreat
            ? `A threat was reported on a review of ${judgeName}.`
            : `A review of ${judgeName} was flagged for ${reasonLabel}.`,
          heading: isThreat ? 'A threat was reported' : 'A review was flagged',
          greeting: 'Hi moderator,',
          bodyHtml: `
            ${isThreat ? '<p style="margin:0 0 14px 0;padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;"><strong>Reported as a threat.</strong> Follow the threat-response runbook. Preserve the content — take it down through the admin UI, which keeps it, rather than deleting the row.</p>' : ''}
            <p style="margin:0 0 14px 0;">A review of <strong>${safeJudge}</strong> was flagged for <strong>${safeReason}</strong>.</p>
            <p style="margin:0 0 6px 0;font-weight:600;">${safeTitle || '(no title)'}</p>
            <p style="margin:0 0 14px 0;padding:10px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;white-space:pre-line;">${safeExcerpt || '(no text)'}</p>
          `,
          ctaText: 'Review it',
          ctaUrl: articleUrl,
          accent: 'red',
          footerNote: 'You receive this because you moderate Bench Review.',
        }),
      }).catch((err: unknown) => reportError('mail.moderator-flag-alert', err, { reviewId }))
    }
  }
  catch (err) {
    // Best-effort — never let a moderator-alert failure break flagging. But a
    // flag nobody was told about is a report sitting unseen in the queue, so
    // it is reported rather than discarded silently.
    reportError('notify-moderators.flag', err, { reviewId })
  }
}

/**
 * Somebody suggested a judge for the directory (bench-review#48).
 *
 * The queue it lands in had no UI until now, and still has no polling —
 * nobody is sitting on /admin/judge-submissions waiting. Without this the
 * submission is invisible until an admin happens to look, which for a
 * directory whose whole supply problem is coverage is exactly backwards.
 */
export async function notifyModeratorsOfJudgeSubmission(submissionId: number, judgeName: string): Promise<void> {
  try {
    const admins = await moderatorRecipients()
    if (admins.length === 0)
      return

    const base = process.env.APP_URL || 'http://localhost:4000'
    const queueUrl = `${base}/admin/judge-submissions`
    const safeName = escapeHtml(judgeName)
    const { mail } = await import('@stacksjs/email')

    for (const admin of admins) {
      await mail.send({
        to: admin.email,
        subject: `New judge submission: ${judgeName}`,
        text: `Someone suggested "${judgeName}" for the directory (submission #${submissionId}).\n\nReview it: ${queueUrl}\n\n— Bench Review\n`,
        html: renderReviewEmail({
          preheader: `A new judge was suggested for the directory: ${judgeName}.`,
          heading: 'A judge was suggested',
          greeting: 'Hi moderator,',
          bodyHtml: `<p style="margin:0 0 14px 0;">Someone suggested <strong>${safeName}</strong> for the directory. Approving creates a bare entry from the name; the profile is enriched afterwards.</p>`,
          ctaText: 'Open the queue',
          ctaUrl: queueUrl,
          accent: 'neutral',
          footerNote: 'You receive this because you moderate Bench Review.',
        }),
      }).catch((err: unknown) => reportError('mail.moderator-submission-alert', err, { submissionId }))
    }
  }
  catch (err) {
    // Best-effort — never let a moderator-alert failure break a submission.
    reportError('notify-moderators.submission', err, { submissionId })
  }
}
