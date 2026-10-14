import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { recordJudgeSearch } from '../../Helpers/searchDemand'

/**
 * GET /api/judges/search?q=… — server-side typeahead.
 *
 * Powers the review form's judge picker (and any future autocomplete).
 * Shape matches `JudgeIndexAction` so the SPA can drop the result
 * straight into the same `Judge` type without re-mapping.
 *
 * Search behaviour:
 *  - `q` < 1 char  → returns `[]` (avoids dumping the table on stray
 *                    keystrokes / blur-then-refocus events)
 *  - case-insensitive substring match against name, court name,
 *    city, and state
 *  - capped at 20 rows — typeaheads with longer lists are useless
 *
 * ── Bounded in SQL (bench-review#56) ────────────────────────────────────────
 * This used to run `Judge.all()` + `CourtHouse.all()` and filter the result in
 * memory: 2,740 judges and 202 courthouses hydrated into ORM model instances,
 * per request, to return at most 20 rows — on an unauthenticated endpoint that
 * fires on every debounced keystroke. That is a DoS amplifier reachable by
 * anyone with curl, and the per-request cost grew with the import.
 *
 * It is now one `LEFT JOIN` with a `LIKE` and a `LIMIT`, so the database
 * returns the 20 rows and nothing else is materialised. The old comment here
 * said the ORM does not surface `.leftJoin()`; it does, and
 * `HomeHighlightsAction` was already using it.
 *
 * `whereAny` emits a parenthesised `(a LIKE ? OR b LIKE ? …)` with real
 * placeholders — not string concatenation — so the needle cannot break out of
 * the predicate.
 *
 * Every search is counted (see `app/Helpers/searchDemand.ts`). A query that
 * returns nothing is the clearest available signal about which judge to
 * import next, and until now it was discarded the moment the response went
 * out. Nothing about the searcher is recorded, only the query and how many
 * judges it found.
 */
const MIN_LEN = 1
const LIMIT = 20

/**
 * Longest needle we will run. A LIKE pattern is scanned against every row, so
 * an unbounded one is free CPU for whoever sends it.
 */
const MAX_QUERY_LEN = 100

interface SearchRow {
  id: number
  uuid: string | null
  name: string | null
  image_url: string | null
  court_id: number | null
  court_name: string | null
  court_city: string | null
  court_state: string | null
  court_image: string | null
}

export default new Action({
  name: 'Judge Search',
  description: 'Server-side judge typeahead',
  method: 'GET',
  async handle() {
    const raw = String((request.query?.q ?? request.get?.('q') ?? '')).trim().slice(0, MAX_QUERY_LEN)
    if (raw.length < MIN_LEN)
      return response.json([])

    // `%` and `_` are LIKE wildcards. They are not an injection risk — the
    // value is still a bound parameter — but a needle of `%` matches every row,
    // which turns a capped typeahead into a full-table scan on demand. Proper
    // escaping needs a trailing `ESCAPE '\\'` clause the builder does not
    // expose, so they are stripped instead: nobody searches a judge by name
    // for a percent sign.
    const stripped = raw.replace(/[%_\\]/g, '')
    if (stripped.length < MIN_LEN)
      return response.json([])
    const needle = `%${stripped}%`

    const rows = await (db.selectFrom('judges') as any)
      .leftJoin('court_houses' as any, 'court_houses.id', '=', 'judges.court_house_id')
      .select([
        'judges.id as id',
        'judges.uuid as uuid',
        'judges.name as name',
        'judges.image_url as image_url',
        'court_houses.id as court_id',
        'court_houses.name as court_name',
        'court_houses.city as court_city',
        'court_houses.state as court_state',
        'court_houses.image as court_image',
      ])
      .whereAny(['judges.name', 'court_houses.name', 'court_houses.city', 'court_houses.state'], 'like', needle)
      .limit(LIMIT)
      .execute() as SearchRow[]

    const matches = rows.map(r => ({
      id: r.id,
      uuid: r.uuid,
      name: r.name,
      photo: r.image_url,
      location: r.court_city && r.court_state ? `${r.court_city}, ${r.court_state}` : '',
      court: r.court_id != null
        ? { id: r.court_id, name: r.court_name, image: r.court_image }
        : { id: null, name: 'Unknown court', image: null },
    }))

    // Deliberately NOT awaited. This is a typeahead that fires per debounced
    // keystroke, so two extra round-trips on the response path would be paid
    // on every one of them; a demand statistic is not worth making the search
    // feel slower. The helper swallows its own errors.
    void recordJudgeSearch(raw, matches.length)

    return response.json(matches)
  },
})
