import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { notifyModeratorsOfJudgeSubmission } from '../../Helpers/notifyModerators'

/**
 * POST /api/judges/{id}/correction — "Report incorrect information" on a
 * judge profile (bench-review#50).
 *
 * The FAQ has promised a "Suggest an edit" link on every judge profile since
 * launch and that link existed on no component; the contact form's "Judge data
 * correction" option posts to /api/contact, which has no route. So the one
 * correction channel the site advertises has always gone nowhere — on
 * first-party records about named, sitting judges, where being wrong is the
 * legal exposure.
 *
 * Lands in `judge_submissions` with `kind = 'correction'` and the judge_id
 * attached, so it shares the queue, the reviewer action and the moderator
 * notification that already exist. Public and throttled at the route layer,
 * same posture as the "suggest a judge" intake: anyone may report an error
 * about a public official, and nothing is published from it.
 */

const trim = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_DETAILS = 15

export default new Action({
  name: 'Submit Judge Correction',
  description: 'Report incorrect information on a judge profile',
  method: 'POST',

  async handle() {
    const judgeId = Number(request.params?.id)
    if (!Number.isInteger(judgeId) || judgeId <= 0)
      return response.json({ error: 'Invalid judge.' }, 422)

    const judge = await db.selectFrom('judges')
      .select(['id', 'name'])
      .where('id', '=', judgeId)
      .executeTakeFirst() as { id: number, name: string } | undefined
    if (!judge)
      return response.json({ error: 'Judge not found.' }, 404)

    const details = trim(request.get?.('details'), 4000)
    if (details.length < MIN_DETAILS)
      return response.json({ error: 'Please describe what is incorrect.' }, 422)

    const sourceUrl = trim(request.get?.('sourceUrl'), 600)
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl))
      return response.json({ error: 'The source link must be a full http:// or https:// URL.' }, 422)

    // Optional: a report is useful without a way to reply, and demanding an
    // address from someone correcting a public record discourages the reports
    // most worth having. Validated when given so the reply-to is not junk.
    const submitterEmail = trim(request.get?.('submitterEmail'), 200).toLowerCase()
    if (submitterEmail && !EMAIL_RE.test(submitterEmail))
      return response.json({ error: 'That email address does not look valid.' }, 422)

    const now = new Date().toISOString()
    const uuid = crypto.randomUUID()

    await db.insertInto('judge_submissions').values({
      kind: 'correction',
      judge_id: judgeId,
      // Denormalized so the queue still reads correctly if the profile is
      // later renamed or merged away.
      judge_name: judge.name,
      court: '',
      details,
      source_url: sourceUrl || null,
      submitter_email: submitterEmail || null,
      status: 'pending',
      uuid,
      created_at: now,
      updated_at: now,
    } as any).execute()

    // Same fire-and-forget posture as the suggestion intake: the report is
    // saved and the person is owed their 201 whether or not SMTP answers.
    const inserted = await db.selectFrom('judge_submissions')
      .select(['id'])
      .where('uuid', '=', uuid)
      .executeTakeFirst() as { id: number } | undefined
    if (inserted?.id)
      void notifyModeratorsOfJudgeSubmission(Number(inserted.id), `correction: ${judge.name}`)

    return response.json({ ok: true }, 201)
  },
})
