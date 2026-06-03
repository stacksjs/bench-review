import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { buildPaginatorMeta, resolvePaginatorArgs } from '../../Helpers/paginate'
import { publicReviewerFor } from '../../Helpers/reviewerLabel'

/**
 * GET /api/reviews/{id}/comments — paginated published comments.
 *
 * Returns the canonical paginator shape (see app/Helpers/paginate.ts).
 * Reads `?page=` / `?per_page=` from the request, default 20 per page.
 *
 * Each comment row hydrated with the author payload from
 * `publicReviewerFor` — anonymized comments surface as "Anonymous
 * <role>" with `author.id = null` so the avatar can't link back to
 * `/user/{id}`. Mirrors the same gate ShowReviewAction uses for
 * review authors (bench-review#36).
 *
 * Only `status = 'published'` comments come through. Rejected
 * (admin-moderated) comments stay invisible to the public.
 *
 * Resolves bench-review#44 (read half).
 */
export default new Action({
  name: 'Comments For Review',
  description: 'Paginated published comments under a review with public-safe author hydration',
  method: 'GET',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid review id.',
    },
  },

  async handle() {
    const reviewId = Number(request.params?.id)
    const { perPage, page, offset } = resolvePaginatorArgs({ perPage: 20 })

    const countRow = await (db.selectFrom('review_comments') as any)
      .select(['COUNT(*) as c'])
      .where('judge_review_id', '=', reviewId)
      .where('status', '=', 'published')
      .executeTakeFirst() as { c: number | string } | undefined
    const total = Number(countRow?.c ?? 0)

    // Pull the comment slice + author rows in two queries. JOIN to
    // users for name + role_label so the public-author hydration runs
    // without N+1.
    const rows = await (db.selectFrom('review_comments') as any)
      .leftJoin('users' as any, 'users.id', '=', 'review_comments.user_id')
      .select([
        'review_comments.id as id',
        'review_comments.judge_review_id as judge_review_id',
        'review_comments.user_id as user_id',
        'review_comments.body as body',
        'review_comments.anonymized as anonymized',
        'review_comments.status as status',
        'review_comments.created_at as created_at',
        'users.name as user_name',
        'users.role_label as user_role_label',
      ])
      .where('review_comments.judge_review_id', '=', reviewId)
      .where('review_comments.status', '=', 'published')
      .orderBy('review_comments.created_at', 'asc')
      .limit(perPage)
      .offset(offset)
      .execute() as Array<Record<string, any>>

    const shaped = rows.map((r) => {
      const author = publicReviewerFor(
        { anonymized: r.anonymized, user_id: r.user_id },
        { id: r.user_id, name: r.user_name, role_label: r.user_role_label },
      )
      return {
        id: r.id,
        body: r.body,
        created_at: r.created_at,
        // Public-safe author — id may be null when anonymous so the
        // client can't link back to /user/:id by construction.
        author,
      }
    })

    return response.json(buildPaginatorMeta(shaped, total, page, perPage))
  },
})
