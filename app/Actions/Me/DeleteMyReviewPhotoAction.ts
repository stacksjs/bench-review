import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { disk } from '../../Storage/disk'

/**
 * DELETE /api/me/photos/{id} — owner removes one of their own review
 * photos. Hard delete + removes the three stored variants THROUGH the
 * storage facade (best-effort; a missing object doesn't fail the row
 * delete since drift can happen during a partial-process failure).
 *
 * Deletion goes through disk().delete(key), NOT a hardcoded local fs
 * path: on the S3 disk the old fs-path reconstruction silently no-op'd
 * (join(cwd, 'https:/bucket…') never matched), so the row vanished but
 * the object stayed publicly fetchable forever — a right-to-removal
 * failure for legally-sensitive media. The key is recovered from the
 * stable `uploads/review-photos/...` segment of the stored URL
 * (unprefixed; the S3 driver re-applies any configured prefix).
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

    const photoId = Number(request.params?.id)

    const existing = await db.selectFrom('review_photos')
      .select(['id', 'user_id', 'thumb_url', 'card_url', 'full_url'])
      .where('id', '=', photoId)
      .executeTakeFirst() as { id: number, user_id: number, thumb_url: string, card_url: string, full_url: string } | undefined

    if (!existing || Number(existing.user_id) !== Number(userId))
      return response.json({ error: 'Photo not found' }, 404)

    // Remove the three stored variants through the storage facade so
    // this works on any disk. The row holds public URLs, so recover the
    // storage key from the stable `uploads/review-photos/...` segment
    // (unprefixed — the facade re-applies any S3 prefix). Best-effort:
    // a missing object doesn't fail the row delete.
    const store = disk()
    const keyOf = (url: string): string | null => {
      if (typeof url !== 'string')
        return null
      const i = url.indexOf('uploads/review-photos/')
      return i === -1 ? null : url.slice(i)
    }
    await Promise.all(
      [existing.thumb_url, existing.card_url, existing.full_url]
        .map(keyOf)
        .filter((k): k is string => k !== null)
        .map(k => store.delete(k).catch(() => { /* object gone; row delete still proceeds */ })),
    )

    await db.deleteFrom('review_photos')
      .where('id', '=', photoId)
      .execute()

    return response.json({ ok: true, deleted: photoId })
  },
})
