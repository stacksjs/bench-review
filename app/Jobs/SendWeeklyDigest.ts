import { db } from '@stacksjs/database'
import { mail } from '@stacksjs/email'
import { log } from '@stacksjs/logging'
import { Job } from '@stacksjs/queue'
import { escapeHtml, renderReviewEmail } from '../Helpers/reviewEmailTemplate'

/**
 * Weekly digest of newly published reviews, to the newsletter list.
 *
 * This is the half of the re-engagement loop that never existed: bench could
 * collect an email address and then had no way to use it, so every signup was
 * a promise it did not keep (bench-review#57).
 *
 * Rules the implementation is built around:
 *
 *  - **Never send an empty digest.** A week with no new reviews produces no
 *    mail at all. "Here is nothing" is the fastest way to teach people to
 *    unsubscribe, and it costs sender reputation for no gain.
 *  - **One message per recipient.** Each carries that subscriber's own
 *    unsubscribe token, which rules out a single bulk send with everyone in
 *    bcc. At bench's list size that is the right trade.
 *  - **One bad address must not stop the run.** Sends are individually
 *    caught and counted; the run reports what got through.
 *  - **Run at most once a week.** The scheduler is not a guarantee — a
 *    restart can re-fire a task — so the job checks for a digest already
 *    sent inside the window before doing anything.
 *
 * The per-run record lives in `campaigns`, the framework table meant for
 * exactly this, rather than a new one. `campaign_sends` is deliberately not
 * written: it requires a non-null `email_list_id`, which would drag the
 * email-list model in for a per-recipient audit nothing currently reads.
 */
const DIGEST_WINDOW_DAYS = 7
/** Guard against a scheduler restart re-firing the task. Slightly under a week. */
const RERUN_GUARD_DAYS = 6
const MAX_REVIEWS = 6
/** Identifies this job's campaign rows; also the re-run guard's lookup key. */
const CAMPAIGN_TEMPLATE = 'weekly-digest'

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export default new Job({
  name: 'SendWeeklyDigest',
  description: 'Email newsletter subscribers the reviews published this week',
  queue: 'emails',
  tries: 1,
  timeout: 300,

  async handle() {
    const base = process.env.APP_URL || 'http://localhost:4000'

    // ── Re-run guard ────────────────────────────────────────────────
    const recent = await (db.selectFrom('campaigns') as any)
      .select(['id', 'sent_at'])
      .where('template', '=', CAMPAIGN_TEMPLATE)
      .where('sent_at', '>=', daysAgoIso(RERUN_GUARD_DAYS))
      .executeTakeFirst() as { id: number, sent_at: string } | undefined
    if (recent) {
      log.info(`[digest] already sent at ${recent.sent_at}; skipping this run`)
      return
    }

    // ── Content ─────────────────────────────────────────────────────
    const since = daysAgoIso(DIGEST_WINDOW_DAYS)
    const reviews = await (db.selectFrom('judge_reviews') as any)
      .select(['id', 'title', 'rating', 'judge_id', 'created_at'])
      .where('status', '=', 'published')
      .where('created_at', '>=', since)
      .orderBy('created_at', 'desc')
      .limit(MAX_REVIEWS)
      .execute() as Array<Record<string, any>>

    if (reviews.length === 0) {
      log.info('[digest] no reviews published this week; sending nothing')
      return
    }

    // Judge names in one query, not one per row.
    const judgeIds = Array.from(new Set(reviews.map(r => Number(r.judge_id)).filter(Boolean)))
    const nameById = new Map<number, string>()
    if (judgeIds.length > 0) {
      const judges = await (db.selectFrom('judges') as any)
        .select(['id', 'name'])
        .where('id', 'in', judgeIds as any)
        .execute() as Array<{ id: number, name: string | null }>
      for (const j of judges)
        nameById.set(Number(j.id), j.name || 'a judge')
    }

    // ── Recipients ──────────────────────────────────────────────────
    const subscribers = await (db.selectFrom('subscribers') as any)
      .select(['id', 'email', 'uuid'])
      .where('status', '=', 'subscribed')
      .execute() as Array<{ id: number, email: string | null, uuid: string | null }>

    const recipients = subscribers.filter(s => s.email && s.uuid)
    if (recipients.length === 0) {
      log.info('[digest] nobody subscribed; sending nothing')
      return
    }

    const items = reviews.map(r => ({
      title: String(r.title ?? 'Untitled review'),
      judge: nameById.get(Number(r.judge_id)) ?? 'a judge',
      url: `${base}/article/${Number(r.id)}`,
    }))

    const listHtml = items.map(it => `
      <tr>
        <td style="padding: 0 0 14px 0;">
          <a href="${escapeHtml(it.url)}" target="_blank" rel="noopener" style="color:#1d4ed8;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(it.title)}</a>
          <div style="color:#6b7280;font-size:13px;padding-top:2px;">on ${escapeHtml(it.judge)}</div>
        </td>
      </tr>`).join('')

    const listText = items.map(it => `- ${it.title} (on ${it.judge})\n  ${it.url}`).join('\n')
    const countLabel = items.length === 1 ? 'one new review' : `${items.length} new reviews`
    const subject = items.length === 1
      ? 'A new judge review this week'
      : `${items.length} new judge reviews this week`

    // ── Send ────────────────────────────────────────────────────────
    let sent = 0
    let failed = 0

    for (const sub of recipients) {
      // The page a human clicks. The List-Unsubscribe header below points at
      // the API instead, so a mail client's own one-click control posts
      // straight through (RFC 8058) without a round trip through the page.
      const unsubscribePage = `${base}/unsubscribe?token=${encodeURIComponent(String(sub.uuid))}`
      const unsubscribeApi = `${base}/api/email/unsubscribe?token=${encodeURIComponent(String(sub.uuid))}`

      try {
        await mail.send({
          to: String(sub.email),
          subject,
          // Marks this as bulk rather than transactional, which is what it is.
          tag: 'broadcast',
          headers: {
            // Required by the major mailbox providers for bulk senders, and
            // the reason the opt-out endpoint is POST-only: One-Click means
            // the provider POSTs this URL directly.
            'List-Unsubscribe': `<${unsubscribeApi}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
          text: `Here is what was published on Bench Review this week — ${countLabel}.\n\n${listText}\n\nRead everything: ${base}/reviews\n\nUnsubscribe: ${unsubscribePage}\n`,
          html: renderReviewEmail({
            preheader: `${countLabel} on Bench Review this week.`,
            heading: 'This week on Bench Review',
            greeting: 'Hi,',
            bodyHtml: `
              <p style="margin:0 0 18px 0;">Here is what was published this week — ${escapeHtml(countLabel)}.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${listHtml}</table>
            `,
            ctaText: 'Read the latest reviews',
            ctaUrl: `${base}/reviews`,
            accent: 'neutral',
            footerNote: 'You are getting this because you signed up for Bench Review updates.',
          }) + `<p style="margin:16px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#6b7280;text-align:center;"><a href="${escapeHtml(unsubscribePage)}" style="color:#6b7280;">Unsubscribe</a></p>`,
        })
        sent++
      }
      catch (err) {
        failed++
        log.warn(`[digest] send failed for subscriber ${sub.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // ── Record the run ──────────────────────────────────────────────
    const now = new Date().toISOString()
    try {
      await (db.insertInto('campaigns') as any)
        .values({
          name: `Weekly digest — ${now.slice(0, 10)}`,
          description: `${items.length} reviews published since ${since.slice(0, 10)}`,
          type: 'email',
          status: failed > 0 && sent === 0 ? 'failed' : 'sent',
          subject,
          template: CAMPAIGN_TEMPLATE,
          sent_at: now,
          audience_size: recipients.length,
          sent_count: sent,
          created_at: now,
          updated_at: now,
        })
        .execute()
    }
    catch (err) {
      // The mail has already gone out; losing the record must not look like
      // a failed run, but it does remove the re-run guard, so it is loud.
      log.error(`[digest] sent ${sent} message(s) but could NOT record the run: ${err instanceof Error ? err.message : String(err)}`)
    }

    log.info(`[digest] ${sent} sent, ${failed} failed, ${items.length} reviews, ${recipients.length} subscribers`)
  },
})
