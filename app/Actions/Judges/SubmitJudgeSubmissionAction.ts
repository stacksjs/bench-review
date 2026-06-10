import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'

/**
 * POST /api/judges/submit — public "suggest a judge for the directory"
 * intake. Backs resources/views/judges/submit.stx, which previously
 * POSTed here with no handler at all (every submission 404'd and the
 * lead was silently discarded — bench-review#48).
 *
 * Lands as status='pending'; an admin reviews it in the submissions
 * queue and either creates the judge or rejects it. Public + throttled
 * at the route layer (no auth — anyone can suggest a judge), so we
 * validate and length-cap everything here and store as plain text
 * (the admin queue renders it escaped).
 */

const trim = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default new Action({
  name: 'Submit Judge Submission',
  description: 'Accept a public judge directory suggestion (status=pending)',
  method: 'POST',

  async handle() {
    const body = request.all() as Record<string, unknown>

    const judgeName = trim(body.judgeName, 200)
    const court = trim(body.court, 200)
    const submitterEmail = trim(body.submitterEmail, 200).toLowerCase()

    if (judgeName.length < 2)
      return response.json({ error: 'Judge name is required.' }, 422)
    if (court.length < 2)
      return response.json({ error: 'Court is required.' }, 422)
    if (!EMAIL_RE.test(submitterEmail))
      return response.json({ error: 'A valid contact email is required.' }, 422)

    const now = new Date().toISOString()
    const uuid = crypto.randomUUID()

    await db.insertInto('judge_submissions').values({
      judge_name: judgeName,
      court,
      department: trim(body.department, 200) || null,
      city: trim(body.city, 120) || null,
      state: trim(body.state, 120) || null,
      appointed: trim(body.appointed, 12) || null,
      case_types: trim(body.caseTypes, 300) || null,
      bio: trim(body.bio, 4000) || null,
      source_url: trim(body.sourceUrl, 600) || null,
      submitter_role: trim(body.submitterRole, 60) || null,
      submitter_email: submitterEmail,
      status: 'pending',
      uuid,
      created_at: now,
      updated_at: now,
    } as any).execute()

    return response.json({ ok: true }, 201)
  },
})
