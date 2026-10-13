import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { logModeration } from '../../../Helpers/auditLog'

/**
 * POST /api/admin/judges/{id}/merge — fold one judge profile into another.
 *
 * `{id}` is the profile that SURVIVES; `sourceId` in the body is absorbed and
 * then deleted (bench-review#50).
 *
 * This is not hypothetical tidying. The CourtListener import keys judges on
 * (name, courthouse) and a judge can hold seats on two courts, so the live
 * data carries 22 rows across 10 names — including one judge sitting in both
 * E.D. and W.D. Missouri. Reviews of that person are split across two
 * profiles, and a reader sees half of them.
 *
 * ── Conflicts are refused, not resolved ────────────────────────────────
 * Two unique constraints can make a merge impossible:
 *
 *   judge_reviews (user_id, judge_id) WHERE status != 'rejected'
 *     — one person has a live review of BOTH profiles. Something has to give,
 *       and which review survives is an editorial decision about two pieces
 *       of writing about a real judge. This action will not make it silently.
 *
 *   users.claimed_judge_id WHERE verified
 *     — both profiles have a verified claimant. Merging would leave two
 *       people verified as the same judge, which is the exact failure the
 *       claim flow exists to prevent.
 *
 * Both answer 409 naming the conflicting rows. Follows are the one case
 * resolved automatically: a duplicate follow is not a judgement call, so the
 * source's row is dropped rather than moved.
 */

/** Every table that points at a judge, and the column that does it. */
const JUDGE_REFERENCES: Array<{ table: string, column: string }> = [
  { table: 'judge_reviews', column: 'judge_id' },
  { table: 'judge_opinions', column: 'judge_id' },
  { table: 'judge_responses', column: 'judge_id' },
  { table: 'review_drafts', column: 'judge_id' },
  { table: 'users', column: 'claimed_judge_id' },
]

export default new Action({
  name: 'Admin Merge Judges',
  description: 'Fold a duplicate judge profile into the one that survives',
  method: 'POST',

  async handle() {
    const admin = await Auth.user().catch(() => null)
    const adminId = (admin as any)?.id
    if (!adminId)
      return response.json({ error: 'Not authenticated.' }, 401)

    const targetId = Number(request.params?.id)
    const sourceId = Number(request.get?.('sourceId'))

    if (!Number.isInteger(targetId) || targetId <= 0 || !Number.isInteger(sourceId) || sourceId <= 0)
      return response.json({ error: 'Both judge ids are required.' }, 422)
    if (targetId === sourceId)
      return response.json({ error: 'A judge cannot be merged into itself.' }, 422)

    const judges = await db.selectFrom('judges')
      .select(['id', 'name', 'slug', 'status', 'court_house_id', 'external_id'])
      .where('id', 'in', [targetId, sourceId] as any)
      .execute() as Array<Record<string, any>>
    const target = judges.find(j => Number(j.id) === targetId)
    const source = judges.find(j => Number(j.id) === sourceId)
    if (!target || !source)
      return response.json({ error: 'Judge not found.' }, 404)

    // ── Conflict pre-flight, before anything is written ──────────────────
    const liveReviews = await db.selectFrom('judge_reviews')
      .select(['id', 'user_id', 'judge_id', 'status'])
      .where('judge_id', 'in', [targetId, sourceId] as any)
      .execute() as Array<{ id: number, user_id: number | null, judge_id: number, status: string }>

    const liveBy = (jid: number): Map<number, number> => new Map(
      liveReviews
        .filter(r => Number(r.judge_id) === jid && r.user_id != null && r.status !== 'rejected')
        .map(r => [Number(r.user_id), Number(r.id)]),
    )
    const targetReviewers = liveBy(targetId)
    const sourceReviewers = liveBy(sourceId)
    const reviewConflicts = [...sourceReviewers.entries()]
      .filter(([userId]) => targetReviewers.has(userId))
      .map(([userId, reviewId]) => ({ user_id: userId, source_review_id: reviewId, target_review_id: targetReviewers.get(userId)! }))

    if (reviewConflicts.length) {
      return response.json({
        error: 'Some reviewers have a live review of both profiles. Resolve those reviews first — rejecting or deleting one of each pair — then merge.',
        conflicts: reviewConflicts,
      }, 409)
    }

    const claimants = await db.selectFrom('users')
      .select(['id', 'email', 'claimed_judge_id', 'credential_verified_at', 'credential_type'])
      .where('claimed_judge_id', 'in', [targetId, sourceId] as any)
      .execute() as Array<Record<string, any>>
    const verified = claimants.filter(u => u.credential_verified_at != null && u.credential_type === 'judge')
    if (verified.length > 1) {
      return response.json({
        error: 'Both profiles have a verified claimant. Revoke one claim before merging — otherwise two people end up verified as the same judge.',
        conflicts: verified.map(u => ({ user_id: u.id, claimed_judge_id: u.claimed_judge_id })),
      }, 409)
    }

    // ── Move everything across ───────────────────────────────────────────
    // Follows first, and only after dropping the ones that would collide:
    // a user following both profiles has one follow of one judge afterwards,
    // which is not a judgement call.
    const follows = await db.selectFrom('judge_follows')
      .select(['id', 'user_id', 'judge_id'])
      .where('judge_id', 'in', [targetId, sourceId] as any)
      .execute() as Array<{ id: number, user_id: number, judge_id: number }>
    const targetFollowers = new Set(follows.filter(f => Number(f.judge_id) === targetId).map(f => Number(f.user_id)))
    const duplicateFollowIds = follows
      .filter(f => Number(f.judge_id) === sourceId && targetFollowers.has(Number(f.user_id)))
      .map(f => Number(f.id))
    if (duplicateFollowIds.length) {
      await db.deleteFrom('judge_follows')
        .where('id', 'in', duplicateFollowIds as any)
        .execute()
    }
    await db.updateTable('judge_follows')
      .set({ judge_id: targetId } as any)
      .where('judge_id', '=', sourceId)
      .execute()

    const moved: Record<string, number> = { judge_follows: follows.filter(f => Number(f.judge_id) === sourceId).length - duplicateFollowIds.length }
    for (const ref of JUDGE_REFERENCES) {
      const rows = await db.selectFrom(ref.table as any)
        .select(['id'])
        .where(ref.column as any, '=', sourceId)
        .execute() as Array<{ id: number }>
      if (rows.length) {
        await db.updateTable(ref.table as any)
          .set({ [ref.column]: targetId } as any)
          .where(ref.column as any, '=', sourceId)
          .execute()
      }
      moved[ref.table] = rows.length
    }

    await db.deleteFrom('judges').where('id', '=', sourceId).execute()

    // The source row is gone, so the audit entry is the only remaining record
    // of what it said — snapshot it rather than just naming an id nothing
    // resolves any more.
    await logModeration({
      actorUserId: Number(adminId),
      action: 'judge.merge',
      targetType: 'judge',
      targetId: targetId,
      note: `merged "${source.name}" (#${sourceId}) into "${target.name}" (#${targetId})`,
      metadata: { source, moved, dropped_duplicate_follows: duplicateFollowIds.length },
    })

    return response.json({ ok: true, target_id: targetId, source_id: sourceId, moved, dropped_duplicate_follows: duplicateFollowIds.length })
  },
})
