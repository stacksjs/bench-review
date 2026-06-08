import { defineStore, state, useStore } from '@stacksjs/stx'

export interface CredentialClaim {
  id: number
  name: string
  email: string
  credential_type: string | null
  credential_state: string | null
  credential_claimed_at: string | null
  credential_rejection_note: string | null
  claimed_judge_id: number | null
  claimed_judge: { id: number, name: string } | null
}

/**
 * Admin verification queue — reviewer credential claims (bench-review#37)
 * AND judge-profile claims (which ride the same `credential_type='judge'`
 * rails). Reads GET /api/admin/credentials, acts via POST .../{id}/verify.
 *
 * Approve removes the claim from the queue (it becomes verified); reject
 * leaves it in the queue with a rejection note (so the user can resubmit),
 * so both actions just refetch rather than mutating the list optimistically.
 */
defineStore('adminCredentials', () => {
  const claims = state<CredentialClaim[]>([])
  const loading = state<boolean>(false)
  const actionError = state<string>('')

  async function fetchClaims(): Promise<void> {
    loading.set(true)
    try {
      const res = await useStore('auth').authFetch('/api/admin/credentials')
      const data = await res.json().catch(() => ({})) as { claims?: CredentialClaim[] }
      claims.set(Array.isArray(data.claims) ? data.claims : [])
      actionError.set('')
    }
    catch (err) {
      actionError.set(err instanceof Error ? err.message : 'Could not load the queue')
    }
    finally {
      loading.set(false)
    }
  }

  async function verify(userId: number, action: 'approve' | 'reject', note?: string): Promise<boolean> {
    try {
      const res = await useStore('auth').authFetch(`/api/admin/credentials/${userId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, error?: string }
      if (!res.ok || !data.ok) {
        actionError.set(data.error || 'Verification failed')
        return false
      }
      await fetchClaims() // approve drops it; reject keeps it (with note)
      return true
    }
    catch (err) {
      actionError.set(err instanceof Error ? err.message : 'Network error')
      return false
    }
  }

  return { claims, loading, actionError, fetchClaims, verify }
})
