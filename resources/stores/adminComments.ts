import { defineStore, state, useStore } from '@stacksjs/stx'

export interface AdminCommentRow {
  id: number
  body: string
  status: 'published' | 'rejected'
  judge_review_id: number | null
  anonymized: number | boolean
  created_at: string | null
  author: { id: number | null, name: string | null } | null
  review: { id: number, title: string | null } | null
}

/**
 * Admin comment moderation (bench-review#51).
 *
 * Comments auto-publish, which is right for the conversation they exist
 * for, but it left no way to remove one abusive reply short of editing the
 * database. Takedown is soft — status flips to 'rejected', the row stays —
 * so a contested decision can still be looked at, and it is reversible.
 */
defineStore('adminComments', () => {
  const comments = state<AdminCommentRow[]>([])
  const loading = state<boolean>(false)
  const actionError = state<string>('')
  const statusFilter = state<string>('published')
  /** Comment id currently being acted on, so one row's buttons disable alone. */
  const acting = state<Record<number, boolean>>({})

  async function fetchComments(): Promise<void> {
    loading.set(true)
    try {
      const res = await useStore('auth').authFetch(`/api/admin/comments?status=${encodeURIComponent(statusFilter())}`)
      if (!res.ok) {
        actionError.set(`Could not load comments (${res.status})`)
        return
      }
      const data = await res.json().catch(() => ({})) as { comments?: AdminCommentRow[] }
      comments.set(Array.isArray(data.comments) ? data.comments : [])
      actionError.set('')
    }
    catch (err) {
      console.error('[adminComments] fetch failed:', err)
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
    return fetchComments()
  }

  async function setStatus(id: number, status: 'published' | 'rejected', note?: string): Promise<boolean> {
    if (acting()[id])
      return false
    acting.set({ ...acting(), [id]: true })
    try {
      const res = await useStore('auth').authFetch(`/api/admin/comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, error?: string }
      if (!res.ok || !data.ok) {
        actionError.set(data.error || 'That did not go through — try again.')
        return false
      }
      actionError.set('')
      await fetchComments()
      return true
    }
    catch (err) {
      console.error('[adminComments] setStatus failed:', err)
      actionError.set('Could not reach the server.')
      return false
    }
    finally {
      const next = { ...acting() }
      delete next[id]
      acting.set(next)
    }
  }

  return { comments, loading, actionError, statusFilter, acting, fetchComments, setStatusFilter, setStatus }
})
