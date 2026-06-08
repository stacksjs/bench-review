import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { response } from '@stacksjs/router'

/**
 * GET /api/admin/moderation-log — the moderation audit trail (most recent
 * first). Each row is attributed to the acting admin; actor names are
 * resolved in a second query (no join — bqb #1023).
 */
export default new Action({
  name: 'Admin Moderation Log',
  description: 'List recent moderation actions (audit trail)',
  method: 'GET',
  async handle() {
    const rows = await db.selectFrom('moderation_logs')
      .select(['id', 'actor_user_id', 'action', 'target_type', 'target_id', 'note', 'created_at'])
      .orderBy('created_at', 'desc')
      .limit(200)
      .execute() as Array<Record<string, any>>

    const actorIds = Array.from(new Set(rows.map(r => Number(r.actor_user_id)).filter(Boolean)))
    const nameById = new Map<number, string>()
    if (actorIds.length > 0) {
      const actors = await db.selectFrom('users')
        .select(['id', 'name', 'email'])
        .where('id', 'in', actorIds as any)
        .execute() as Array<{ id: number, name: string | null, email: string | null }>
      for (const a of actors)
        nameById.set(Number(a.id), a.name || a.email || `User #${a.id}`)
    }

    const logs = rows.map(r => ({
      ...r,
      actor_name: nameById.get(Number(r.actor_user_id)) || `User #${r.actor_user_id}`,
    }))

    return response.json({ logs })
  },
})
