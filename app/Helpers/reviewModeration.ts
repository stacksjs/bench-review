import { db } from '@stacksjs/database'
import { logModeration } from './auditLog'
import { wantsEmail } from './emailPreferences'
import { notify } from './notifications'
import { escapeHtml, renderReviewEmail } from './reviewEmailTemplate'

/**
 * One review status change, with every consequence attached.
 *
 * Lifted out of `UpdateReviewStatusAction` so the bulk endpoint can share
 * it rather than reimplement it (bench-review#51). The consequences are the
 * whole point: a publish fans out to the claimed judge and the judge's
 * followers, a reject closes the open flags that asked for it, and both
 * write an audit row and mail the author. A second copy of that would drift
 * — and the drift would be silent, because every side effect here is
 * deliberately best-effort.
 */

export type ReviewModerationStatus = 'published' | 'rejected'

export interface ReviewStatusOutcome {
  id: number
  ok: boolean
  /** The status the row carries now. Absent when the change did not happen. */
  status?: ReviewModerationStatus
  /** False when the row already carried the target status: no-op, not failure. */
  changed?: boolean
  /** Set when `ok` is false. Safe to show a moderator. */
  error?: string
  /** 404 when the row is gone. Absent for every other outcome. */
  code?: 404
}

/**
 * Apply `status` to one review as `adminId`.
 *
 * Resolves rather than throws for the ordinary failure (the row is gone),
 * so a bulk caller can report per-row outcomes instead of losing the whole
 * batch to one stale id. Genuine infrastructure failures still throw.
 */
export async function applyReviewStatus(
  reviewId: number,
  status: ReviewModerationStatus,
  adminId: number,
): Promise<ReviewStatusOutcome> {
  const existing = await db.selectFrom('judge_reviews')
    // title/content so the audit entry can snapshot what the review said at
    // the moment of the decision (bench-review#53). A status flip is the most
    // common moderation action and left no record of WHAT was decided about.
    .select(['id', 'user_id', 'status', 'title', 'content'])
    .where('id', '=', reviewId)
    .executeTakeFirst() as { id: number, user_id: number | null, status: string, title: string | null, content: string | null } | undefined
  if (!existing)
    return { id: reviewId, ok: false, error: 'Review not found.', code: 404 }

  const changed = existing.status !== status

  await db.updateTable('judge_reviews')
    .set({ status, updated_at: new Date().toISOString() } as any)
    .where('id', '=', reviewId)
    .execute()

  // Taking a review down closes the flags that asked for it.
  //
  // Not housekeeping — it re-arms the alert. Moderators are emailed only
  // on the FIRST open flag against a review (FlagReviewAction counts open
  // rows before inserting, so anonymous flagging cannot spam them). Flags
  // left open after the review was dealt with mean that count is never
  // zero again, so a review that is rejected, edited and re-published can
  // be flagged a hundred more times in silence.
  //
  // Resolved rather than dismissed: the flag was acted on. Deleting a
  // review already clears its flags (DeleteReviewAction); this is the same
  // idea for the outcome that keeps the row. Best-effort — the moderation
  // decision stands either way.
  if (status === 'rejected' && changed) {
    await db.updateTable('review_flags')
      .set({ status: 'resolved', updated_at: new Date().toISOString() } as any)
      .where('judge_review_id', '=', reviewId)
      .where('status', '=', 'open')
      .execute()
      .catch((err: unknown) => {
        console.warn(`[review-moderation] could not close open flags for review ${reviewId}:`, err instanceof Error ? err.message : err)
      })
  }

  // Audit trail — record who moderated, and to what. Logged on every
  // status change (independent of whether the author gets notified), which
  // is also what gives the bulk endpoint its per-row logging.
  if (changed) {
    await logModeration({
      actorUserId: Number(adminId),
      action: status === 'published' ? 'review.publish' : 'review.reject',
      targetType: 'review',
      targetId: reviewId,
      metadata: {
        from: existing.status,
        to: status,
        snapshot: { title: existing.title, content: existing.content },
      },
    })
  }

  // Notify the review's author IFF status actually changed AND the
  // review has a real author (seeded reviews have user_id=null).
  // Approve and reject each generate a fresh notification — no
  // dedup, since toggling status back and forth is a deliberate
  // moderation signal the user should see each time.
  if (existing.user_id != null && changed) {
    await notify({
      userId: Number(existing.user_id),
      actorUserId: adminId,
      type: status === 'published' ? 'approved' : 'rejected',
      reviewId,
    })

    // Email the author too, unless they have turned review mail off in
    // settings. Best-effort — a failed send doesn't roll back the
    // moderation decision; the in-app notification above still surfaces in
    // the bell dropdown, which is also where the outcome lands for anyone
    // who opted out. Looks up the author's email + the judge name from a
    // couple of cheap selects so the email body has real context.
    try {
      const author = await db.selectFrom('users')
        .select(['id', 'email', 'name'])
        .where('id', '=', Number(existing.user_id))
        .executeTakeFirst() as { id: number, email: string, name: string | null } | undefined

      if (author?.email && await wantsEmail(Number(existing.user_id), 'review_activity')) {
        const reviewRow = await db.selectFrom('judge_reviews')
          .select(['title', 'judge_id'])
          .where('id', '=', reviewId)
          .executeTakeFirst() as { title: string, judge_id: number } | undefined

        let judgeName = 'a judge'
        if (reviewRow?.judge_id) {
          const judgeRow = await db.selectFrom('judges')
            .select(['name'])
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
      console.warn(`[review-moderation] mail.send failed for review ${reviewId} → ${status}. The status change is persisted; the email could not be delivered.`, err instanceof Error ? err.message : err)
    }
  }

  // Publish fan-out (bench-review#57). Until now a publish notified only
  // the review's author, so two groups never heard about it:
  //
  //   - the judge being reviewed, if they have claimed and verified their
  //     profile. That is the part that is not an engagement feature: the
  //     subject of a published review had no way to learn it existed, which
  //     left the right-of-reply path with no trigger at all.
  //   - everyone following that judge, which is what made Follow a
  //     dead-end button.
  //
  // Only on a transition INTO published. Unpublishing is not an event for
  // these recipients, and notify() dedups both types on (recipient, review)
  // so a republish does not tell them twice.
  if (status === 'published' && changed) {
    try {
      const reviewRow = await db.selectFrom('judge_reviews')
        .select(['judge_id', 'title'])
        .where('id', '=', reviewId)
        .executeTakeFirst() as { judge_id: number | null, title: string | null } | undefined
      const judgeId = Number(reviewRow?.judge_id)

      if (Number.isFinite(judgeId) && judgeId > 0) {
        // The verified claimant. Filtered in JS rather than SQL because a
        // null-comparison on credential_verified_at hits the bqb
        // null-operator quirk the claim action documents.
        const claimants = await db.selectFrom('users')
          .select(['id', 'name', 'email', 'credential_verified_at'])
          .where('claimed_judge_id', '=', judgeId)
          .where('credential_type', '=', 'judge')
          .execute() as Array<{ id: number, name: string | null, email: string | null, credential_verified_at: string | null }>
        const judgeUser = claimants.find(u => u.credential_verified_at != null)

        const recipients = new Map<number, 'judge_review' | 'followed_review'>()
        if (judgeUser) recipients.set(Number(judgeUser.id), 'judge_review')

        const followers = await db.selectFrom('judge_follows')
          .select(['user_id'])
          .where('judge_id', '=', judgeId)
          .execute() as Array<{ user_id: number }>
        for (const f of followers) {
          const id = Number(f.user_id)
          // The claimant's own follow must not downgrade their
          // judge_review notification to a follower one.
          if (!recipients.has(id)) recipients.set(id, 'followed_review')
        }

        // Never tell someone about their own review: they already got the
        // 'approved' notification above.
        if (existing.user_id != null) recipients.delete(Number(existing.user_id))

        for (const [userId, type] of recipients)
          await notify({ userId, actorUserId: adminId, type, reviewId })

        // Email the claimed judge as well as notifying them in-app. The
        // in-app notification only lands if they happen to come back; this
        // is a review ABOUT them, published without their involvement, and
        // the whole point of the claim flow is that they get to answer it.
        // Followers deliberately get no email — they asked to follow a
        // judge, not to be mailed about them.
        //
        // Driven off the recipients map rather than `judgeUser` directly,
        // so the author-removal above governs both paths: a judge who
        // somehow wrote the review themselves is not mailed about it.
        const emailTarget = judgeUser && recipients.get(Number(judgeUser.id)) === 'judge_review'
          ? judgeUser
          : null

        if (emailTarget?.email && await wantsEmail(Number(emailTarget.id), 'reviews_about_me')) {
          const judgeRow = await db.selectFrom('judges')
            .select(['name'])
            .where('id', '=', judgeId)
            .executeTakeFirst() as { name: string | null } | undefined
          const judgeName = judgeRow?.name || 'your profile'
          const reviewTitle = reviewRow?.title || 'A new review'
          const base = process.env.APP_URL || 'http://localhost:4000'
          const articleUrl = `${base}/article/${reviewId}`

          // Dynamic import, matching the author-email block above: the
          // mail driver is pulled in only on the paths that actually send.
          const { mail } = await import('@stacksjs/email')
          await mail.send({
            to: String(emailTarget.email),
            subject: `A new review of ${judgeName} was published`,
            text: `A review of ${judgeName} has been published on Bench Review.\n\n"${reviewTitle}"\n\nYou can read it, and respond to it from your claimed profile, here:\n${articleUrl}\n\nResponses appear alongside the review.\n\n— Bench Review\n`,
            html: renderReviewEmail({
              preheader: `A review of ${judgeName} has been published.`,
              heading: 'A new review of you was published',
              greeting: `Hi ${emailTarget.name || 'there'},`,
              bodyHtml: `
                  <p style="margin:0 0 14px 0;">A review of <strong>${escapeHtml(judgeName)}</strong> has been published on Bench Review.</p>
                  <p style="margin:0 0 14px 0;">&ldquo;${escapeHtml(reviewTitle)}&rdquo;</p>
                  <p style="margin:0 0 14px 0;">You can respond to it from your claimed profile. Responses appear alongside the review.</p>
                `,
              ctaText: 'Read and respond',
              ctaUrl: articleUrl,
              accent: 'neutral',
              footerNote: 'You are getting this because you have a verified claim on this judge profile. You can turn these off in your settings.',
            }),
          })
        }
      }
    }
    catch (err) {
      // Best-effort, like the author email: a missed fan-out must not undo
      // a moderation decision that is already persisted.
      console.warn(`[review-moderation] publish fan-out failed for review ${reviewId}.`, err instanceof Error ? err.message : err)
    }
  }

  return { id: reviewId, ok: true, status, changed }
}
