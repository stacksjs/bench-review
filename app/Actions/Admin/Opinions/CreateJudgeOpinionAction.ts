import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * POST /api/admin/judges/{id}/opinions — admin manually adds a
 * judge opinion (bench-review#39).
 *
 * Auth + admin middleware on the route. Until an automated pipeline
 * lands (CourtListener / PACER / state docket fetch — all parked
 * for legal review), this is the only path that populates the
 * `judge_opinions` cache. Curated by moderators who copy in real
 * opinion data with source URL + summary.
 *
 * Validations are loose because real opinion data is messy: case
 * names can be very long, citations vary by jurisdiction, dates
 * can be partial. We bound max lengths to keep payloads sane but
 * don't enforce a citation format.
 */
const ALLOWED_OUTCOMES = new Set([
  'affirmed', 'reversed', 'remanded', 'dismissed', 'granted',
  'denied', 'vacated', 'settled', 'other',
])

export default new Action({
  name: 'Admin Create Judge Opinion',
  description: 'Manually add a judge opinion to the local cache',
  method: 'POST',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid judge id.',
    },
  },

  async handle() {
    const judgeId = Number((request as any).params?.id)

    // Confirm the judge exists before inserting. An opinion against
    // a missing judge is noise.
    const judge = await db.selectFrom('judges' as any)
      .select(['id'] as any)
      .where('id' as any, '=', judgeId)
      .executeTakeFirst() as { id: number } | undefined
    if (!judge)
      return response.json({ error: 'Judge not found.' }, 404)

    const caseName = String((request as any).get?.('case_name') ?? '').trim()
    if (caseName.length < 3 || caseName.length > 500)
      return response.json({ error: 'Case name must be between 3 and 500 characters.' }, 422)

    const citation = String((request as any).get?.('citation') ?? '').trim().slice(0, 200) || null
    const decisionDate = String((request as any).get?.('decision_date') ?? '').trim() || null
    const summary = String((request as any).get?.('summary') ?? '').trim().slice(0, 5000) || null
    const sourceUrl = String((request as any).get?.('source_url') ?? '').trim().slice(0, 500) || null

    const outcomeRaw = String((request as any).get?.('outcome_label') ?? '').trim().toLowerCase()
    const outcomeLabel = ALLOWED_OUTCOMES.has(outcomeRaw) ? outcomeRaw : null

    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl))
      return response.json({ error: 'Source URL must be http(s)://...' }, 422)

    const now = new Date().toISOString()
    await db.insertInto('judge_opinions' as any).values({
      judge_id: judgeId,
      case_name: caseName,
      citation,
      decision_date: decisionDate,
      summary,
      outcome_label: outcomeLabel,
      source_url: sourceUrl,
      source_provider: 'manual',
      external_id: null,
      created_at: now,
      updated_at: now,
    } as any).execute()

    return response.json({ ok: true }, 201)
  },
})
