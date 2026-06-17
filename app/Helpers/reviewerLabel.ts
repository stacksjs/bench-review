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

/**
 * Strip the raw `user_id` from a review row before it goes out on a
 * PUBLIC endpoint, replacing it with a server-computed `is_mine` boolean.
 *
 * Why: public review lists/detail mix anonymized + named reviews. Leaking
 * `user_id` lets an attacker de-anonymize — correlate a row's id against
 * `/api/users/{id}/reviews` (which only lists NON-anonymized reviews): a
 * user_id present in the public feed but absent from that user's public
 * list is one of their anonymous reviews. So `user_id` must never leave
 * the server on these surfaces. The frontend only needs to know "is this
 * my review" (to hide the helpful button on your own); `is_mine` carries
 * exactly that without exposing the id of anyone else.
 */
export function toPublicReviewRow<T extends { user_id?: number | null }>(
  row: T,
  viewerId: number | null,
): Omit<T, 'user_id'> & { is_mine: boolean } {
  const { user_id, ...rest } = row as any
  return {
    ...rest,
    is_mine: viewerId != null && user_id != null && Number(viewerId) === Number(user_id),
  }
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
