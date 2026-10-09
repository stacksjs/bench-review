import { getNotificationPreferences } from '@stacksjs/notifications'

/**
 * Per-category email opt-outs, stored in the framework's
 * `notification_preferences` table `(user_id, channel, category, enabled)`.
 *
 * Only categories listed here are addressable. Account and security mail —
 * the welcome message, email verification, password reset — is deliberately
 * NOT a category: those confirm something the user just did or protect the
 * account itself, and an opt-out would mean a password reset silently going
 * nowhere. The settings UI says so rather than leaving the omission to be
 * guessed at.
 *
 * Adding a category means adding it here AND calling `wantsEmail` at the send
 * site. A category with no send site is a switch wired to nothing, which is
 * worse than no switch at all.
 */
export type EmailCategory = 'review_activity'

export interface EmailCategoryDescriptor {
  id: EmailCategory
  label: string
  description: string
}

/**
 * Single source of truth for the categories: the API hands these to the
 * settings UI rather than the template hardcoding its own copy of the
 * labels, so a renamed category cannot drift between the two.
 */
export const EMAIL_CATEGORIES: readonly EmailCategoryDescriptor[] = [
  {
    id: 'review_activity',
    label: 'Updates about my reviews',
    description: 'When a review you wrote is received, published, or declined. Turning this off leaves the in-app notifications in place.',
  },
]

const KNOWN = new Set<string>(EMAIL_CATEGORIES.map(c => c.id))

export function isEmailCategory(value: unknown): value is EmailCategory {
  return typeof value === 'string' && KNOWN.has(value)
}

/**
 * Whether `userId` still wants email for `category`. Absent row means yes —
 * introducing the feature must not silently mute everyone who has never
 * opened the settings page.
 *
 * Always pass a category. `getNotificationPreferences(userId)` with none does
 * not restrict to the global row; it folds every category's rows into one map
 * keyed by channel, so a category-scoped opt-out would masquerade as a global
 * one.
 *
 * Fails OPEN. A transient read error sends the mail rather than swallowing
 * it: these carry the outcome of something the reader is waiting on — a
 * review being published or declined — and an extra message to someone who
 * opted out is the less damaging of the two failures. (Were a marketing
 * category ever added, it would need the opposite default and its own path.)
 */
export async function wantsEmail(userId: number, category: EmailCategory): Promise<boolean> {
  if (!Number.isFinite(userId) || userId <= 0)
    return false
  try {
    const prefs = await getNotificationPreferences(Number(userId), category)
    return prefs.get('email') !== false
  }
  catch (err) {
    console.warn(`[email-prefs] could not read preferences for user ${userId}/${category}; sending anyway.`, err instanceof Error ? err.message : err)
    return true
  }
}
