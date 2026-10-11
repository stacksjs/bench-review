import { defineStore, state, useStore } from '@stacksjs/stx'

export interface JudgeSubmission {
  id: number
  judge_name: string
  court: string | null
  department: string | null
  city: string | null
  state: string | null
  appointed: string | null
  case_types: string | null
  bio: string | null
  source_url: string | null
  submitter_role: string | null
  submitter_email: string | null
  status: 'pending' | 'approved' | 'rejected'
  review_note: string | null
  created_at: string | null
}

export type SubmissionStatusFilter = 'pending' | 'approved' | 'rejected' | 'all'

/**
 * Admin queue for public judge suggestions (bench-review#48).
 *
 * The endpoints have existed since the submit form was wired; nothing ever
 * read them, so a submission persisted a row and then sat there — the worst
 * shape for a contribution form, because the person who filled it in has no
 * way to tell it went nowhere. Mirrors the adminCredentials store.
 *
 * Approve creates a bare judges row and stamps the submission reviewed;
 * reject records a note. Either way the row leaves the pending filter, so
 * both actions refetch rather than mutating the list in place.
 */
defineStore('adminJudgeSubmissions', () => {
  const submissions = state<JudgeSubmission[]>([])
  const loading = state<boolean>(false)
  const actionError = state<string>('')
  const statusFilter = state<string>('pending')
  /** Submission id currently being approved or rejected, so one row's buttons disable alone. */
  const acting = state<Record<number, boolean>>({})

  async function fetchSubmissions(): Promise<void> {
    loading.set(true)
    try {
      const res = await useStore('auth').authFetch(`/api/admin/judge-submissions?status=${encodeURIComponent(statusFilter())}`)
      if (!res.ok) {
        actionError.set(`Could not load the queue (${res.status})`)
        return
      }
      const data = await res.json().catch(() => ({})) as { submissions?: JudgeSubmission[] }
      submissions.set(Array.isArray(data.submissions) ? data.submissions : [])
      actionError.set('')
    }
    catch (err) {
      console.error('[adminJudgeSubmissions] fetch failed:', err)
      actionError.set('Could not reach the server.')
    }
    finally {
      loading.set(false)
    }
  }

  function setStatusFilter(next: string): Promise<void> {
    if (statusFilter() === next)
      return Promise.resolve()
    statusFilter.set(next)
    return fetchSubmissions()
  }

  async function review(id: number, action: 'approve' | 'reject', note?: string): Promise<boolean> {
    if (acting()[id])
      return false
    acting.set({ ...acting(), [id]: true })
    try {
      const res = await useStore('auth').authFetch(`/api/admin/judge-submissions/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, error?: string }
      if (!res.ok || !data.ok) {
        actionError.set(data.error || 'That did not go through — try again.')
        return false
      }
      actionError.set('')
      await fetchSubmissions()
      return true
    }
    catch (err) {
      console.error('[adminJudgeSubmissions] review failed:', err)
      actionError.set('Could not reach the server.')
      return false
    }
    finally {
      const next = { ...acting() }
      delete next[id]
      acting.set(next)
    }
  }

  return { submissions, loading, actionError, statusFilter, acting, fetchSubmissions, setStatusFilter, review }
})
