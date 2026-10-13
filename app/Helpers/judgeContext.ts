import { db } from '@stacksjs/database'

/**
 * The judge a review is about, with enough context to identify WHICH judge
 * (bench-review#50).
 *
 * A review that says only "Brian Curtis Wimes" does not identify anyone: the
 * directory holds 22 rows across 10 names, and that one is two profiles
 * separated by E.D. versus W.D. Missouri. Reviews are first-party records
 * about named, sitting people, so a reader attributing one to the wrong judge
 * of the same name is the failure this issue was filed about.
 *
 * Attached in one place so every surface that lists reviews shows the same
 * thing. The ORM's `belongsTo` relation already puts a `judge` on the row, but
 * its shape depends on which columns the model declares — and jurisdiction,
 * state and slug were added by migration rather than through the model. This
 * resolves them explicitly instead.
 */

export interface JudgeContext {
  id: number
  name: string
  slug: string | null
  court: string | null
  jurisdiction: string | null
  state: string | null
  image_url: string | null
  /**
   * Courthouse, jurisdiction and state as one line, ready to render.
   *
   * Composed here rather than in each component: four surfaces show this and
   * they would drift. Absent parts are dropped rather than rendered as "null"
   * or "Unknown" — a judge whose courthouse we do not know should say less,
   * not say something wrong.
   */
  context_line: string
}

function lineFor(court: string | null, jurisdiction: string | null, state: string | null): string {
  return [court, jurisdiction, state].filter(Boolean).join(' · ')
}

/**
 * Resolve judges (and their courthouses) for a set of review rows and attach
 * a `judge` object to each. Two queries regardless of row count.
 *
 * Rows whose `judge_id` resolves to nothing keep `judge: null` rather than a
 * placeholder, which is what the components already branch on.
 */
export async function attachJudgeContext<T extends Record<string, any>>(rows: T[]): Promise<T[]> {
  if (!rows.length)
    return rows

  const judgeIds = [...new Set(rows.map(r => Number(r.judge_id)).filter(id => Number.isFinite(id) && id > 0))]
  if (!judgeIds.length)
    return rows

  const judges = await db.selectFrom('judges')
    .select(['id', 'name', 'slug', 'jurisdiction', 'state', 'image_url', 'court_house_id'])
    .where('id', 'in', judgeIds as any)
    .execute() as Array<Record<string, any>>

  const courtIds = [...new Set(judges.map(j => Number(j.court_house_id)).filter(Boolean))]
  const courtById = new Map<number, string>()
  if (courtIds.length) {
    const courts = await db.selectFrom('court_houses')
      .select(['id', 'name'])
      .where('id', 'in', courtIds as any)
      .execute() as Array<{ id: number, name: string }>
    for (const c of courts) courtById.set(Number(c.id), c.name)
  }

  const byId = new Map<number, JudgeContext>()
  for (const j of judges) {
    const court = j.court_house_id ? courtById.get(Number(j.court_house_id)) ?? null : null
    byId.set(Number(j.id), {
      id: Number(j.id),
      name: String(j.name ?? ''),
      slug: j.slug ?? null,
      court,
      jurisdiction: j.jurisdiction ?? null,
      state: j.state ?? null,
      image_url: j.image_url ?? null,
      context_line: lineFor(court, j.jurisdiction ?? null, j.state ?? null),
    })
  }

  return rows.map(r => ({ ...r, judge: byId.get(Number(r.judge_id)) ?? null }))
}

/** Single-row convenience for the article page. */
export async function judgeContextFor(judgeId: number): Promise<JudgeContext | null> {
  const [row] = await attachJudgeContext([{ judge_id: judgeId }])
  return (row as any).judge ?? null
}
