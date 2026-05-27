/**
 * Single source of truth for "what name does the public see for the
 * reviewer behind this review" (bench-review#36).
 *
 * Public surfaces — review feeds, article pages, courthouse stats —
 * MUST pass through this helper rather than reading `users.name`
 * directly. The author's true identity is only ever exposed when the
 * caller knows they're rendering for the author themselves (e.g.
 * `/my-reviews`, the author's own article edit) or an admin
 * moderating the review.
 *
 * The two inputs:
 *   - `review.anonymized` — author flagged this submission as
 *     anonymous at submit/edit time.
 *   - `user.role_label` — self-declared classification on the user
 *     row, used as a credibility qualifier. NULL means "no claim";
 *     anonymous reviewers without a role surface as plain
 *     "Anonymous reviewer".
 *
 * Returns:
 *   - id    — `null` when anonymized, the real user id otherwise
 *             (so anonymized reviewer cards CAN'T link back to
 *             `/user/{id}`, by construction)
 *   - name  — "Anonymous attorney" / "Anonymous reviewer" / the real
 *             user name
 *   - role_label — only set on non-anonymous reviews (it's already
 *             baked into `name` for anonymous ones)
 */

export interface PublicReviewer {
  id: number | null
  name: string
  role_label: string | null
}

const ROLE_DISPLAY: Record<string, string> = {
  attorney: 'attorney',
  clerk: 'clerk',
  court_staff: 'court staff member',
  litigant: 'litigant',
  observer: 'observer',
}

export function publicReviewerFor(
  review: { anonymized?: boolean | number | null, user_id?: number | null },
  user: { id?: number, name?: string | null, role_label?: string | null } | null,
): PublicReviewer {
  const isAnon = Boolean(review.anonymized && Number(review.anonymized) !== 0)

  if (isAnon) {
    const roleKey = (user?.role_label || '').toLowerCase()
    const roleDisplay = ROLE_DISPLAY[roleKey]
    return {
      id: null,
      name: roleDisplay ? `Anonymous ${roleDisplay}` : 'Anonymous reviewer',
      role_label: null,
    }
  }

  // Non-anonymous path. Missing user (seeded factory rows with
  // user_id=null, or a deleted user the FK didn't cascade) surfaces
  // as "Reviewer" rather than empty string.
  if (!user) {
    return { id: null, name: 'Reviewer', role_label: null }
  }

  return {
    id: user.id ?? null,
    name: user.name || 'Reviewer',
    role_label: user.role_label ?? null,
  }
}
