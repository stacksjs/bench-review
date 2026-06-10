import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'

/**
 * GET /api/admin/judge-submissions — public judge suggestions for review.
 *
 * Query: `status` ('pending' | 'approved' | 'rejected' | 'all', default
 * 'pending'). Most recent first, capped at 200 — the queue is worked
 * down, not paginated deeply.
 */
const STATUSES = ['pending', 'approved', 'rejected'] as const

export default new Action({
  name: 'Admin Judge Submission Index',
  description: 'List public judge-directory submissions for moderation',
  method: 'GET',
  async handle() {
    const statusRaw = String(request.get?.('status') ?? 'pending').trim().toLowerCase()

    let query: any = db.selectFrom('judge_submissions')
      .select([
        'id',
        'judge_name',
        'court',
        'department',
        'city',
        'state',
        'appointed',
        'case_types',
        'bio',
        'source_url',
        'submitter_role',
        'submitter_email',
        'status',
        'review_note',
        'created_at',
      ])

    // Apply the status filter BEFORE orderBy — bqb emits clauses in
    // chain-call order, so WHERE must precede ORDER BY (see the same
    // caveat in UserIndexAction).
    if ((STATUSES as readonly string[]).includes(statusRaw))
      query = query.where('status', '=', statusRaw)

    const rows = await query
      .orderBy('created_at', 'desc')
      .limit(200)
      .execute() as Array<Record<string, unknown>>

    return response.json({ submissions: rows })
  },
})
