import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

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
    const content = String(body.content ?? '').trim()
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

    return response.json({ ok: true, review: inserted }, 201)
  },
})
