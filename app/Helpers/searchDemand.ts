import { db } from '@stacksjs/database'

/**
 * What people searched the judge directory for, and how many judges came
 * back. A search that returns nothing is the clearest signal there is about
 * which judge to import next: somebody went looking for them by name.
 * Until now every query was thrown away the moment the response was sent
 * (bench-review#57).
 *
 * Rows are AGGREGATE, not a log: one row per distinct normalised query, with
 * a running count. That keeps the table proportional to the vocabulary people
 * search for rather than to traffic, and it is what makes the backlog
 * useful -- "nine people looked for this one" ranks above "one person did".
 *
 * Deliberately NOT recorded: who searched, their IP, their session, or the
 * time of any individual search. A judge-name search can reveal that someone
 * has a case in front of that judge, so the row is kept unattributable by
 * construction -- there is no column to join against a user even if a later
 * change wanted one. `created_at` and `updated_at` describe the query, not
 * a person: first and most recent time ANYONE searched it.
 */

/**
 * Shortest query worth recording. The directory search is a typeahead that
 * fires per debounced keystroke, so every real search arrives behind a
 * trail of its own prefixes; below three characters those are nearly all
 * noise ("a", "sm") that would bury the names worth acting on.
 */
const MIN_LOG_LENGTH = 3

/** Hard cap so a pathological query can't write an unbounded row. */
const MAX_LOG_LENGTH = 120

/**
 * Fold the query to its recordable form: case and spacing are not meaningful
 * differences between two people looking for the same judge, and leaving them
 * distinct would split one backlog entry across several rows.
 */
export function normalizeSearchQuery(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LOG_LENGTH)
}

/**
 * Record one search. Fire-and-forget by contract: the caller must not await
 * this on the response path, and every failure is swallowed. A dropped
 * statistic is not worth degrading a search for.
 *
 * Read-then-write rather than an upsert, because this query path has no
 * parameterised raw-SQL escape hatch (`db.run` does not exist here, and
 * `db.unsafe` would mean interpolating a user-supplied string into SQL).
 * Two concurrent identical searches can therefore race: one increment is
 * lost, or one INSERT loses to the UNIQUE index and is swallowed. For a
 * demand counter that is the right trade -- the ranking it feeds does not
 * change because a count reads 8 instead of 9.
 */
export async function recordJudgeSearch(rawQuery: string, resultCount: number): Promise<void> {
  const query = normalizeSearchQuery(rawQuery)
  if (query.length < MIN_LOG_LENGTH)
    return

  const count = Number.isFinite(resultCount) && resultCount > 0 ? Math.floor(resultCount) : 0
  const now = new Date().toISOString()

  try {
    const existing = await (db.selectFrom('judge_search_queries') as any)
      .select(['id', 'searches'])
      .where('query', '=', query)
      .executeTakeFirst() as { id: number, searches: number | string } | undefined

    if (existing) {
      await (db.updateTable('judge_search_queries') as any)
        .set({
          searches: Number(existing.searches ?? 0) + 1,
          last_result_count: count,
          updated_at: now,
        })
        .where('id', '=', Number(existing.id))
        .execute()
      return
    }

    await (db.insertInto('judge_search_queries') as any)
      .values({
        query,
        searches: 1,
        last_result_count: count,
        created_at: now,
        updated_at: now,
      })
      .execute()
  }
  catch (err) {
    console.warn('[search-demand] could not record a search; the search itself was unaffected.', err instanceof Error ? err.message : err)
  }
}
