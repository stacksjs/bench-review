import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { response } from '@stacksjs/router'

/**
 * GET /api/home/highlights — aggregated activity slices for the home page.
 *
 * One round-trip returns three datasets the home page surfaces:
 *
 *   - `trending_judges`     — most-reviewed in the last 7 days (limit 6)
 *   - `top_rated_judges`    — highest avg rating, gated on min 2 reviews
 *                             so a single 5-star review doesn't crown a
 *                             judge (limit 6)
 *   - `active_reviewers`    — users with the most published reviews in
 *                             the last 30 days (limit 5). Email + ID
 *                             are stripped before serialization; only
 *                             a public-safe shape goes out.
 *
 * Filters all aggregates on `status = 'published'` so pending /
 * rejected content doesn't skew the public-facing tallies. Each row
 * is hydrated with the joined judge (name, image_url, court name) so
 * the home page can render cards without a second round-trip per row.
 *
 * Resolves bench-review#34.
 */
export default new Action({
  name: 'Home Highlights',
  description: 'Trending judges, top-rated judges, and active reviewers for the home page',
  method: 'GET',
  async handle() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Trending — judges by review count in the last 7 days. Join the
    // judge row so the home page card has name + image + court name
    // ready to render.
    const trendingRows = await (db.selectFrom('judge_reviews') as any)
      .innerJoin('judges' as any, 'judges.id', '=', 'judge_reviews.judge_id')
      .leftJoin('court_houses' as any, 'court_houses.id', '=', 'judges.court_house_id')
      .select([
        'judges.id as judge_id',
        'judges.name as judge_name',
        'judges.image_url as judge_image',
        'court_houses.name as court_name',
        'COUNT(judge_reviews.id) as review_count',
        'AVG(judge_reviews.rating) as avg_rating',
      ])
      .where('judge_reviews.status', '=', 'published')
      .where('judge_reviews.created_at', '>=', sevenDaysAgo)
      .groupBy('judges.id')
      .orderBy('review_count', 'desc')
      .limit(6)
      .execute() as Array<Record<string, any>>

    // Top-rated — judges by avg rating, gated on at least 2 published
    // reviews so a single perfect score doesn't dominate. ORDER BY
    // avg DESC, then review_count DESC as a tiebreaker (more reviewed
    // means more credible at the same average).
    const topRatedRows = await (db.selectFrom('judge_reviews') as any)
      .innerJoin('judges' as any, 'judges.id', '=', 'judge_reviews.judge_id')
      .leftJoin('court_houses' as any, 'court_houses.id', '=', 'judges.court_house_id')
      .select([
        'judges.id as judge_id',
        'judges.name as judge_name',
        'judges.image_url as judge_image',
        'court_houses.name as court_name',
        'COUNT(judge_reviews.id) as review_count',
        'AVG(judge_reviews.rating) as avg_rating',
      ])
      .where('judge_reviews.status', '=', 'published')
      .groupBy('judges.id')
      .having('COUNT(judge_reviews.id)' as any, '>=', 2)
      .orderBy('avg_rating', 'desc')
      .orderBy('review_count', 'desc')
      .limit(6)
      .execute() as Array<Record<string, any>>

    // Active reviewers — users who have the most published reviews in
    // the last 30 days. Public-safe payload only: id, name, count.
    //
    // anonymized=0 is a SECURITY filter, not a nicety: an anonymized
    // review still carries its user_id, so without this clause a user
    // who only ever posts anonymously would surface here BY NAME, and
    // the counts become a de-anonymization oracle (diff this count
    // against /users/{id}/reviews, which already excludes anonymized,
    // to learn how many anonymous reviews a named user wrote). Mirror
    // the same guard used in UserShowAction / UserReviewsAction.
    const reviewerRows = await (db.selectFrom('judge_reviews') as any)
      .innerJoin('users' as any, 'users.id', '=', 'judge_reviews.user_id')
      .select([
        'users.id as user_id',
        'users.name as user_name',
        'COUNT(judge_reviews.id) as review_count',
      ])
      .where('judge_reviews.status', '=', 'published')
      .where('judge_reviews.created_at', '>=', thirtyDaysAgo)
      .where('judge_reviews.user_id', 'is not', null)
      .where('judge_reviews.anonymized', '=', 0)
      .groupBy('users.id')
      .orderBy('review_count', 'desc')
      .limit(5)
      .execute() as Array<Record<string, any>>

    const shapeJudgeRow = (r: any) => ({
      id: Number(r.judge_id),
      name: String(r.judge_name ?? ''),
      image_url: r.judge_image ?? null,
      court_name: r.court_name ?? null,
      review_count: Number(r.review_count ?? 0),
      avg_rating: r.avg_rating == null ? null : Math.round(Number(r.avg_rating) * 10) / 10,
    })

    return response.json({
      trending_judges: trendingRows.map(shapeJudgeRow),
      top_rated_judges: topRatedRows.map(shapeJudgeRow),
      active_reviewers: reviewerRows.map(r => ({
        id: Number(r.user_id),
        name: String(r.user_name ?? ''),
        review_count: Number(r.review_count ?? 0),
      })),
    })
  },
})
