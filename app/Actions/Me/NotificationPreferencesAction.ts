import type { EmailCategory } from '../../Helpers/emailPreferences'
import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { setNotificationPreference } from '@stacksjs/notifications'
import { request, response } from '@stacksjs/router'
import { EMAIL_CATEGORIES, isEmailCategory, wantsEmail } from '../../Helpers/emailPreferences'

/**
 * GET   /api/me/notification-preferences — the user's email opt-ins.
 * PATCH /api/me/notification-preferences — flip one category.
 *
 * The GET response carries the category labels as well as the flags, so the
 * settings UI renders whatever the server knows about instead of keeping its
 * own copy of the list. Add a category in app/Helpers/emailPreferences.ts and
 * it appears in settings with no template change.
 *
 * PATCH takes one `{ category, email }` pair rather than the whole matrix:
 * the UI saves on toggle, so a partial write is exactly what it has, and an
 * all-or-nothing payload would let a stale tab overwrite a change made in
 * another one.
 *
 * Only `email` is addressable. In-app notifications stay on — they cost the
 * reader nothing and they are where the moderation outcome still lands when
 * the email is switched off.
 *
 * bench-review#57.
 */
export default new Action({
  name: 'Notification Preferences',
  description: 'Read and update the current user\'s email notification opt-ins',
  // Multi-method: routes/api.ts binds GET and PATCH to this same action and
  // handle() dispatches on the verb (see Actions/Me/DraftAction).
  method: 'GET',

  async handle() {
    const authUser = await Auth.user()
    const userId = Number((authUser as any)?.id ?? 0)
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const method = String(request.method ?? 'GET').toUpperCase()

    if (method === 'PATCH' || method === 'PUT' || method === 'POST') {
      const rawCategory = request.query?.category ?? request.get?.('category')
      if (!isEmailCategory(rawCategory))
        return response.json({ error: 'Unknown notification category.' }, 422)

      // Accept the JSON boolean and the string forms a form post would send.
      const rawEnabled = request.query?.email ?? request.get?.('email')
      if (rawEnabled === undefined || rawEnabled === null || rawEnabled === '')
        return response.json({ error: 'A value for `email` is required.' }, 422)
      const enabled = rawEnabled === true || rawEnabled === 'true' || rawEnabled === 1 || rawEnabled === '1'

      await setNotificationPreference(userId, 'email', enabled, rawCategory)
      return response.json({ ok: true, category: rawCategory, email: enabled })
    }

    const categories = await Promise.all(EMAIL_CATEGORIES.map(async c => ({
      id: c.id,
      label: c.label,
      description: c.description,
      email: await wantsEmail(userId, c.id as EmailCategory),
    })))

    return response.json({ ok: true, categories })
  },
})
