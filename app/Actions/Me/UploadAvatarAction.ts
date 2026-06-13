import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { processAndPersistAvatar } from '../../Helpers/avatarPhoto'

/**
 * POST /api/me/avatar — set the authenticated user's profile photo.
 *
 * Multipart body with a single `avatar` file. The image runs through
 * processAndPersistAvatar (EXIF strip → square 256² WebP → local disk;
 * one-file S3 swap later), the resulting URL is stored on `users.avatar`,
 * and returned so the SPA can update the cached user without a refetch.
 *
 * Auth-gated; a user can only ever set their OWN avatar (the row is keyed
 * by the authenticated id, never a client-supplied one).
 */
export default new Action({
  name: 'Upload Avatar',
  description: 'Set the current user\'s profile photo',
  method: 'POST',

  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    // Multipart parse — same proxy helper the review-photo upload uses.
    const formData = await (request as any).formData?.().catch(() => null)
    if (!formData)
      return response.json({ error: 'Multipart body required.' }, 400)

    const file = formData.get('avatar') as File | null
    if (!file || typeof (file as any).arrayBuffer !== 'function')
      return response.json({ error: 'No image in the upload.' }, 422)

    let persisted
    try {
      persisted = await processAndPersistAvatar(Number(userId), file, file.type)
    }
    catch (err) {
      return response.json({ error: err instanceof Error ? err.message : 'Upload failed.' }, 422)
    }

    const now = new Date().toISOString()
    await db.updateTable('users')
      .set({ avatar: persisted.url, updated_at: now } as any)
      .where('id', '=', Number(userId))
      .execute()

    return response.json({ ok: true, avatar: persisted.url })
  },
})
