import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * DELETE /api/me/photos/{id} — owner removes one of their own review
 * photos. Hard delete + unlinks the three on-disk variants (best-
 * effort; missing files don't fail the row delete since drift can
 * happen during a partial-process failure).
 *
 * Non-owners get 404. The user_id check is the security boundary;
 * the review's status doesn't gate the delete (an owner can clean
 * up photos at any lifecycle stage).
 */
export default new Action({
  name: 'Delete My Review Photo',
  description: 'Remove a single review photo + its three on-disk variants',
  method: 'DELETE',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid photo id.',
    },
  },

  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const photoId = Number((request as any).params?.id)

    const existing = await db.selectFrom('review_photos' as any)
      .select(['id', 'user_id', 'thumb_url', 'card_url', 'full_url'] as any)
      .where('id' as any, '=', photoId)
      .executeTakeFirst() as { id: number, user_id: number, thumb_url: string, card_url: string, full_url: string } | undefined

    if (!existing || Number(existing.user_id) !== Number(userId))
      return response.json({ error: 'Photo not found' }, 404)

    // Unlink the three on-disk variants. Map the public URL back to
    // the filesystem path. Best-effort — a missing file logs but
    // doesn't fail the row delete.
    const root = process.cwd()
    for (const url of [existing.thumb_url, existing.card_url, existing.full_url]) {
      try {
        if (typeof url !== 'string') continue
        const rel = url.replace(/^\/+/, '')
        unlinkSync(join(root, rel))
      }
      catch { /* file missing or unreachable; row delete still proceeds */ }
    }

    await db.deleteFrom('review_photos' as any)
      .where('id' as any, '=', photoId)
      .execute()

    return response.json({ ok: true, deleted: photoId })
  },
})
