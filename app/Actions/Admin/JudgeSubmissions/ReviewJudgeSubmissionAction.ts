import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { logModeration } from '../../../Helpers/auditLog'

/**
 * POST /api/admin/judge-submissions/{id}/review — approve or reject a
 * public judge suggestion.
 *
 * Approve creates a bare judges row from the submission (name only;
 * practice_area/court_house_id are left null because the submission's
 * free-text court/case-types don't map to the judges enum + courthouse
 * FK — an admin enriches the profile afterwards, see #50). Reject just
 * records a note. Either way the submission is stamped reviewed and the
 * action is written to the moderation log.
 */
export default new Action({
  name: 'Admin Review Judge Submission',
  description: 'Approve (create judge) or reject a judge-directory submission',
  method: 'POST',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid submission id.',
    },
  },

  async handle() {
    const me = await Auth.user()
    const adminId = (me as any)?.id
    if (!adminId)
      return response.json({ error: 'Not authenticated' }, 401)

    const submissionId = Number(request.params?.id)
    const action = String(request.get?.('action') ?? '').trim().toLowerCase()
    if (action !== 'approve' && action !== 'reject')
      return response.json({ error: 'action must be "approve" or "reject".' }, 422)

    const submission = await db.selectFrom('judge_submissions')
      .select(['id', 'judge_name', 'status'])
      .where('id', '=', submissionId)
      .executeTakeFirst() as { id: number, judge_name: string, status: string } | undefined
    if (!submission)
      return response.json({ error: 'Submission not found.' }, 404)
    if (submission.status !== 'pending')
      return response.json({ error: `Submission already ${submission.status}.` }, 422)

    const now = new Date().toISOString()

    if (action === 'approve') {
      const judgeUuid = crypto.randomUUID()
      await db.insertInto('judges').values({
        name: submission.judge_name,
        image_url: null,
        practice_area: null,
        court_house_id: null,
        uuid: judgeUuid,
        created_at: now,
        updated_at: now,
      } as any).execute()

      const created = await db.selectFrom('judges')
        .select(['id'])
        .where('uuid', '=', judgeUuid)
        .executeTakeFirst() as { id: number } | undefined

      await db.updateTable('judge_submissions')
        .set({ status: 'approved', reviewed_by_user_id: Number(adminId), reviewed_at: now, updated_at: now } as any)
        .where('id', '=', submissionId)
        .execute()

      await logModeration({
        actorUserId: Number(adminId),
        action: 'judge_submission.approve',
        targetType: 'judge_submission',
        targetId: submissionId,
        note: created?.id ? `Created judge #${created.id}` : undefined,
      })
      return response.json({ ok: true, status: 'approved', judge_id: created?.id ?? null })
    }

    // reject
    const note = String(request.get?.('note') ?? '').trim().slice(0, 1000)
    if (!note)
      return response.json({ error: 'Rejection requires a `note` explaining why.' }, 422)

    await db.updateTable('judge_submissions')
      .set({ status: 'rejected', review_note: note, reviewed_by_user_id: Number(adminId), reviewed_at: now, updated_at: now } as any)
      .where('id', '=', submissionId)
      .execute()

    await logModeration({
      actorUserId: Number(adminId),
      action: 'judge_submission.reject',
      targetType: 'judge_submission',
      targetId: submissionId,
      note,
    })
    return response.json({ ok: true, status: 'rejected' })
  },
})
