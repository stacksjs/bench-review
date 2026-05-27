import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { buildPaginatorMeta, resolvePaginatorArgs } from '../../Helpers/paginate'
import { hydrateLikeData } from '../../Helpers/reviewLikes'

/**
 * GET /api/users/{id}/reviews — paginated list of a user's PUBLISHED
 * reviews, hydrated with judge name + court for card rendering.
 *
 * Status filter is hardcoded to `published` — pending/rejected stay
 * invisible to the public (the author sees those on their own
 * `/my-reviews` page, but not on their PUBLIC profile).
 *
 * Returns the canonical paginator shape (see `app/Helpers/paginate.ts`).
 * Reads `?page=` / `?per_page=` from the request.
 *
 * Resolves bench-review#29 (the reviews-list half of the profile).
 */
export default new Action({
  name: 'User Reviews',
  description: 'Paginated list of a user\'s published reviews, hydrated with judge context',
  method: 'GET',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid user id.',
    },
  },

  async handle() {
    const userId = Number((request as any).params?.id)
    const { perPage, page, offset } = resolvePaginatorArgs()

    // Confirm the user exists before paginating reviews. Saves a
    // wasted COUNT + SELECT on bogus ids and lets us 404 cleanly.
    const exists = await db.selectFrom('users' as any)
      .select(['id'] as any)
      .where('id' as any, '=', userId)
      .executeTakeFirst() as { id: number } | undefined
    if (!exists)
      return response.json({ error: 'User not found' }, 404)

    // Anonymized reviews don't appear on the author's PUBLIC profile
    // (bench-review#36). The author's `/my-reviews` page still shows
    // them — that's the author's private dashboard, not the public
    // identity surface — but a third party visiting `/user/:id`
    // shouldn't be able to enumerate the author's anonymous reviews
    // by side-channel correlation.
    const countRow = await (db.selectFrom('judge_reviews' as any) as any)
      .select(['COUNT(*) as c'])
      .where('user_id' as any, '=', userId)
      .where('status' as any, '=', 'published')
      .where('anonymized' as any, '=', 0)
      .executeTakeFirst() as { c: number | string } | undefined
    const total = Number(countRow?.c ?? 0)

    // SELECT with the judge join so the card has name + image + court
    // without N+1 follow-up queries.
    const rows = await (db.selectFrom('judge_reviews' as any) as any)
      .leftJoin('judges' as any, 'judges.id', '=', 'judge_reviews.judge_id')
      .select([
        'judge_reviews.id as id',
        'judge_reviews.title as title',
        'judge_reviews.content as content',
        'judge_reviews.rating as rating',
        'judge_reviews.type as type',
        'judge_reviews.likes as likes',
        'judge_reviews.created_at as created_at',
        'judge_reviews.judge_id as judge_id',
        'judges.name as judge_name',
        'judges.image_url as judge_image',
      ])
      .where('judge_reviews.user_id' as any, '=', userId)
      .where('judge_reviews.status' as any, '=', 'published')
      .where('judge_reviews.anonymized' as any, '=', 0)
      .orderBy('judge_reviews.created_at' as any, 'desc')
      .limit(perPage)
      .offset(offset)
      .execute() as Array<Record<string, any>>

    // Hydrate `liked_by_me` so a logged-in viewer sees their own
    // reactions reflected. Hydrator works against raw rows; the join
    // columns survive because the helper merges instead of replacing.
    const hydrated = await hydrateLikeData(rows ?? [])

    // Reshape into a nested judge object for the frontend card
    // consumer. Keeps the API ergonomics aligned with what /my-reviews
    // and /article/:id already use.
    const shaped = hydrated.map((r: any) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      rating: r.rating,
      type: r.type,
      likes: r.likes,
      liked_by_me: r.liked_by_me ?? false,
      created_at: r.created_at,
      judge_id: r.judge_id,
      judge: r.judge_id != null
        ? { id: r.judge_id, name: r.judge_name, image_url: r.judge_image }
        : null,
    }))

    return response.json(buildPaginatorMeta(shaped, total, page, perPage))
  },
})
