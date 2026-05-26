import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { sanitizeReviewHtml } from '../../Helpers/sanitizeReviewHtml'

interface SubmitPayload {
  judge_id?: number
  title?: string
  content?: string
  rating?: number
  type?: 'positive' | 'negative' | 'neutral'
}

const ALLOWED_TYPES = ['positive', 'negative', 'neutral'] as const

/**
 * POST /api/reviews — submit a new review.
 *
 * Auth-gated at the route layer (`auth` middleware from
 * `resources/middleware/auth.ts`). The framework runs the declarative
 * `validations` below before `handle()` and returns a 422 with a
 * uniform error shape if any field is invalid, so the handler only
 * deals with the cross-field / database checks (judge must exist).
 *
 * Status flows in as `pending` so moderation stays manual until an
 * automated review pipeline lands. The front-end shows "thanks, we'll
 * review it shortly" copy after submit; the row stays invisible to
 * other sessions until a moderator publishes it.
 */
export default new Action({
  name: 'Submit Review',
  description: 'Persist a user-submitted review (status=pending)',
  method: 'POST',
  validations: {
    judge_id: {
      rule: schema.number().positive(),
      message: 'Pick a judge before submitting.',
    },
    title: {
      rule: schema.string().min(3).max(255),
      message: 'Title must be between 3 and 255 characters.',
    },
    // Content is the medium-editor HTML body. Real reviews land in the
    // 800–1500 char range (see seeded fixtures); cap at 10000 so we
    // accept the long-form opinions the product is built for, while
    // keeping a sane upper bound against accidental megabyte posts.
    content: {
      rule: schema.string().min(10).max(10000),
      message: 'Review must be between 10 and 10000 characters.',
    },
    rating: {
      rule: schema.number().min(1).max(5),
      message: 'Pick a rating between 1 and 5 stars.',
    },
    type: {
      // `schema.string().in([...])` is what `LogAction.ts` in the
      // framework defaults uses, but `StringValidator` doesn't actually
      // expose `.in()` (only alpha/email/equals/length/matches/max/min/
      // numeric/url). The working enum pattern is `schema.enum([...])`,
      // per `Dashboard/Settings/UpdateAiConfig.ts`. The `LogAction`
      // default is stale and will throw at runtime as written.
      rule: schema.enum([...ALLOWED_TYPES]),
      message: 'Type must be one of positive, negative, or neutral.',
    },
  },
  async handle() {
    const body: SubmitPayload = typeof (request as any).all === 'function'
      ? (request as any).all()
      : {}

    const judgeId = Number(body.judge_id)
    const rating = Number(body.rating)
    const title = String(body.title ?? '').trim()
    // Strip inline styles, classes, and disallowed tags BEFORE
    // persistence. Pasted content from external CMSes routinely
    // arrives wrapped in `<div style="float:left;width:…">` which
    // collapses the article column for every reader, and a
    // `<script>` would otherwise execute via the article view's
    // `x-html` binding. See app/Helpers/sanitizeReviewHtml.ts for
    // the whitelist + rationale.
    const content = (await sanitizeReviewHtml(String(body.content ?? ''))).trim()
    // Re-validate length AFTER sanitisation. The declarative
    // `validations` check bounds the raw input (10–10000 chars),
    // but sanitisation only strips — never adds — so a 200-char
    // raw blob that's 100% inline-style wrappers could collapse to
    // an empty string. Without this guard the user would land a
    // visibly-empty review past the moderation queue.
    if (content.length < 10)
      return response.json({ error: 'Review must be at least 10 characters once formatting is cleaned up.' }, 422)
    const type = body.type ?? 'neutral'

    // Cross-field check that declarative validations can't express:
    // the judge id has to point at an existing row. Cheap PK lookup,
    // avoids writing a review against a stale/deleted judge.
    const judge = await Judge.find(judgeId)
    if (!judge)
      return response.json({ error: 'Judge not found' }, 404)

    // `auth` middleware sets the authenticated user on the global Auth
    // helper before the action runs (see middleware.ts:35). We pull the
    // id here so /api/me/reviews can filter by author later.
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id ?? null

    // Raw `db.insertInto` instead of `JudgeReview.create()`. The ORM's
    // `create()` path has a snake_case → camelCase mapping gap that
    // silently drops fields like `judge_id` and `user_id` — every
    // submission landed with NULL FK columns and the review showed
    // nowhere. The seeders dodge this the same way (see
    // database/seeders/ReviewSeeder.ts).
    const uuid = crypto.randomUUID()
    const now = new Date().toISOString()
    await db.insertInto('judge_reviews' as any).values({
      title,
      content,
      rating,
      type,
      status: 'pending',
      comments: 0,
      judge_id: judgeId,
      user_id: userId,
      uuid,
      created_at: now,
      updated_at: now,
    } as any).execute()

    const inserted = await db.selectFrom('judge_reviews' as any)
      .selectAll()
      .where('uuid' as any, '=', uuid)
      .executeTakeFirst()

    // Best-effort acknowledgement email. The submission has already
    // succeeded — the row is in the DB and the response will go out
    // either way — so any mail error is swallowed and logged. SMTP
    // catchers in dev sometimes aren't running; production with a
    // real driver will deliver normally. Same pattern as the password
    // reset action.
    const recipient = (authUser as any)?.email as string | undefined
    if (recipient && (inserted as any)?.id) {
      try {
        const { mail } = await import('@stacksjs/email')
        const judgeName = (judge as any)?.name ?? 'this judge'
        const reviewerName = (authUser as any)?.name || 'there'
        const articleUrl = `${process.env.APP_URL || 'http://localhost:4000'}/article/${(inserted as any).id}`
        await mail.send({
          to: recipient,
          subject: `Your review of ${judgeName} is pending moderation`,
          text: `Hi ${reviewerName},\n\nThanks for sharing your review of ${judgeName}. It's now in the moderation queue and a member of our team will take a look shortly — we typically publish within a day.\n\nYou can preview your review any time at:\n${articleUrl}\n\nYou'll get another email when a moderator approves or declines it.\n\n— Bench Review\n`,
          html: `<p>Hi ${reviewerName},</p><p>Thanks for sharing your review of <strong>${judgeName}</strong>. It's now in the moderation queue and a member of our team will take a look shortly — we typically publish within a day.</p><p>You can preview your review any time:</p><p><a href="${articleUrl}">${articleUrl}</a></p><p>You'll get another email when a moderator approves or declines it.</p><p>— Bench Review</p>`,
        })
      }
      catch (err) {
        console.warn('[submit-review] mail.send failed — review still saved.', err instanceof Error ? err.message : err)
      }
    }

    return response.json({ ok: true, review: inserted }, 201)
  },
})
