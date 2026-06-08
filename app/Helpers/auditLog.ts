import { db } from '@stacksjs/database'

export interface ModerationEntry {
  /** The admin performing the action. */
  actorUserId: number
  /** Dotted verb, e.g. 'review.publish', 'user.delete', 'credential.approve'. */
  action: string
  targetType: 'review' | 'user' | 'credential'
  targetId?: number | null
  /** Optional context — rejection reason, deleted user's email, etc. */
  note?: string | null
}

/**
 * Append a moderation audit record (see app/Models/ModerationLog.ts).
 * Best-effort: an audit-write failure must never fail the moderation action
 * it's recording, so this swallows errors.
 */
export async function logModeration(entry: ModerationEntry): Promise<void> {
  try {
    if (!entry.actorUserId)
      return
    const now = new Date().toISOString()
    await db.insertInto('moderation_logs').values({
      actor_user_id: Number(entry.actorUserId),
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId != null ? Number(entry.targetId) : null,
      note: entry.note ? String(entry.note).slice(0, 2000) : null,
      uuid: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    } as any).execute()
  }
  catch {
    // best-effort — never break the moderation action over an audit write
  }
}
