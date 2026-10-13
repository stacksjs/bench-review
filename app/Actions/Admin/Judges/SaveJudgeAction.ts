import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { logModeration } from '../../../Helpers/auditLog'
import { isJudgeStatus, JUDGE_STATUSES, uniqueJudgeSlug } from '../../../Helpers/judgeSlug'

/**
 * POST /api/admin/judges        — create a judge profile
 * PATCH /api/admin/judges/{id}  — edit one
 *
 * One action for both, because the field handling is identical and the only
 * difference is whether there is a row to start from (bench-review#50).
 *
 * This is the auth-gated replacement for the auto-CRUD `POST /api/judges` the
 * ORM used to generate: that route had NO authentication, and it was broken
 * anyway — its fillable keys were camelCase with no snake_case mapping and
 * `court_house_id` was not fillable at all. `app/Models/Judge.ts` is now
 * `routes: ['index', 'show']`.
 *
 * Every write is audited. A judge profile is first-party data about a named,
 * sitting person, so "who changed this and when" is not optional.
 */

const trim = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max)

export default new Action({
  name: 'Admin Save Judge',
  description: 'Create or update a judge profile',
  method: 'POST',

  async handle() {
    const admin = await Auth.user().catch(() => null)
    const adminId = (admin as any)?.id
    if (!adminId)
      return response.json({ error: 'Not authenticated.' }, 401)

    const rawId = request.params?.id
    const judgeId = rawId == null ? 0 : Number(rawId)
    const isEdit = Number.isFinite(judgeId) && judgeId > 0

    let existing: Record<string, any> | undefined
    if (isEdit) {
      existing = await db.selectFrom('judges')
        .select(['id', 'name', 'slug', 'status', 'court_house_id'])
        .where('id', '=', judgeId)
        .executeTakeFirst() as Record<string, any> | undefined
      if (!existing)
        return response.json({ error: 'Judge not found.' }, 404)
    }

    const name = trim(request.get?.('name'), 200)
    if (name.length < 2)
      return response.json({ error: 'A judge name is required.' }, 422)

    const status = trim(request.get?.('status'), 20).toLowerCase() || 'active'
    if (!isJudgeStatus(status))
      return response.json({ error: `Status must be one of: ${JUDGE_STATUSES.join(', ')}.` }, 422)

    const courtHouseIdRaw = request.get?.('court_house_id')
    const courtHouseId = courtHouseIdRaw == null || courtHouseIdRaw === '' ? null : Number(courtHouseIdRaw)
    if (courtHouseId != null && (!Number.isInteger(courtHouseId) || courtHouseId <= 0))
      return response.json({ error: 'Courthouse is invalid.' }, 422)
    if (courtHouseId != null) {
      const court = await db.selectFrom('court_houses')
        .select(['id'])
        .where('id', '=', courtHouseId)
        .executeTakeFirst()
      // Checked rather than left to the FK: foreign keys are enforced at
      // runtime here, so without this the admin gets a constraint 500 instead
      // of a sentence naming the field.
      if (!court)
        return response.json({ error: 'That courthouse does not exist.' }, 422)
    }

    const appointedRaw = request.get?.('appointed_year')
    const appointedYear = appointedRaw == null || appointedRaw === '' ? null : Number(appointedRaw)
    if (appointedYear != null && (!Number.isInteger(appointedYear) || appointedYear < 1700 || appointedYear > 2200))
      return response.json({ error: 'Appointed year looks wrong.' }, 422)

    // Renaming re-slugs; an unchanged name keeps the slug it already has, so
    // an edit to the bio does not quietly move the judge's URL.
    const nameChanged = !isEdit || String(existing?.name ?? '') !== name
    const slug = nameChanged ? await uniqueJudgeSlug(name, isEdit ? judgeId : undefined) : existing?.slug ?? null

    const fields: Record<string, any> = {
      name,
      status,
      slug,
      court_house_id: courtHouseId,
      jurisdiction: trim(request.get?.('jurisdiction'), 60) || null,
      state: trim(request.get?.('state'), 60) || null,
      practice_area: trim(request.get?.('practice_area'), 60) || null,
      bio: trim(request.get?.('bio'), 4000) || null,
      appointed_year: appointedYear,
      image_url: trim(request.get?.('image_url'), 600) || null,
      updated_at: new Date().toISOString(),
    }

    if (isEdit) {
      await db.updateTable('judges').set(fields as any).where('id', '=', judgeId).execute()
      await logModeration({
        actorUserId: Number(adminId),
        action: 'judge.update',
        targetType: 'judge',
        targetId: judgeId,
        note: name,
      })
      return response.json({ ok: true, id: judgeId, slug })
    }

    const uuid = crypto.randomUUID()
    await db.insertInto('judges').values({
      ...fields,
      uuid,
      created_at: new Date().toISOString(),
    } as any).execute()

    const created = await db.selectFrom('judges')
      .select(['id'])
      .where('uuid', '=', uuid)
      .executeTakeFirst() as { id: number } | undefined

    await logModeration({
      actorUserId: Number(adminId),
      action: 'judge.create',
      targetType: 'judge',
      targetId: created?.id ?? null,
      note: name,
    })

    return response.json({ ok: true, id: created?.id ?? null, slug }, 201)
  },
})
