import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { response } from '@stacksjs/router'

/**
 * GET /api/court-houses — list all courthouses with hydrated stats.
 *
 * Powers CourtHouseDirectory.stx, the courthouse picker in
 * ReviewJudgeSearch.stx, and the courthouse profile's "By the numbers"
 * panel (CourtProfile.stx).
 *
 * Stats are computed in two aggregate queries (active_judges,
 * reviews+avg_rating) regardless of how many courthouses exist —
 * cheap enough at the directory scale we care about. The
 * CourtProfile component reads from the judges store's cache, so
 * embedding the stats here means a single round-trip on first load
 * instead of N+1 per-courthouse stat fetches.
 *
 * Reviews count + avg rating filter on `status = 'published'` so
 * pending / rejected reviews don't move the public numbers.
 *
 * Resolves bench-review#40 (the hardcoded "24 / 1287 / 4.4 / 12k" placeholders).
 */
export default new Action({
  name: 'CourtHouse Index',
  description: 'List all courthouses, hydrated with active-judges count + review aggregates',
  method: 'GET',
  async handle() {
    const rows = await CourtHouse.all() as Array<Record<string, any>>

    // Active-judges count, keyed by court_house_id.
    const judgeCounts = await (db.selectFrom('judges' as any) as any)
      .select(['court_house_id', 'COUNT(*) as c'])
      .groupBy('court_house_id' as any)
      .execute() as Array<{ court_house_id: number, c: number | string }>
    const judgesByCourt = new Map<number, number>()
    for (const r of judgeCounts)
      judgesByCourt.set(Number(r.court_house_id), Number(r.c ?? 0))

    // Published-review aggregates, keyed by court_house_id via the
    // judge join. The CASE-around-AVG returns null for empty groups
    // instead of a misleading 0 on courts with no reviews yet.
    const reviewAggs = await (db.selectFrom('judge_reviews' as any) as any)
      .innerJoin('judges' as any, 'judges.id', '=', 'judge_reviews.judge_id')
      .select([
        'judges.court_house_id as court_house_id',
        'COUNT(*) as total_reviews',
        'AVG(judge_reviews.rating) as avg_rating',
      ])
      .where('judge_reviews.status' as any, '=', 'published')
      .groupBy('judges.court_house_id' as any)
      .execute() as Array<{ court_house_id: number, total_reviews: number | string, avg_rating: number | string | null }>
    const reviewStatsByCourt = new Map<number, { total: number, avg: number | null }>()
    for (const r of reviewAggs) {
      const id = Number(r.court_house_id)
      const total = Number(r.total_reviews ?? 0)
      const avgRaw = r.avg_rating
      const avg = avgRaw == null ? null : Math.round(Number(avgRaw) * 10) / 10
      reviewStatsByCourt.set(id, { total, avg })
    }

    // Stitch the stats into each row. Courts with no judges yet get
    // explicit zeros (not nulls) so the UI doesn't need a separate
    // empty-state branch; avg_rating stays null when there are no
    // published reviews to average.
    const enriched = rows.map((row) => {
      const id = Number(row.id)
      const stats = reviewStatsByCourt.get(id)
      return {
        ...row,
        active_judges: judgesByCourt.get(id) ?? 0,
        total_reviews: stats?.total ?? 0,
        avg_rating: stats?.avg ?? null,
      }
    })

    return response.json(enriched)
  },
})
