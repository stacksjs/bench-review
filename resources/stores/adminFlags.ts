import { defineStore, derived, state, useStore } from '@stacksjs/stx'

export type FlagStatusFilter = 'open' | 'resolved' | 'dismissed' | 'all'

export interface AdminFlagRow {
  id: number
  reason: string
  details: string | null
  status: 'open' | 'resolved' | 'dismissed'
  moderator_id: number | null
  moderator_note: string | null
  judge_review_id: number | null
  // Flagger id is admin-only context (abuse-pattern spotting) — fine to
  // expose to a moderator; this never reaches a public surface.
  user_id: number | null
  created_at: string | null
  review: { id: number, title: string | null, status: string | null, judge_id: number | null } | null
}

/**
 * Admin flag-queue store. Backs resources/views/admin/flags.stx via the
 * FlagsTable component. The API (GET /api/admin/flags, POST
 * /api/admin/flags/{id}/resolve) already existed; this is the missing
 * moderation surface for it. Mirrors the adminReviews store shape.
 */
defineStore('adminFlags', () => {
  const flags = state<AdminFlagRow[]>([])
  const loading = state<boolean>(false)
  const statusFilter = state<FlagStatusFilter>('open')
  const actionError = state<string>('')
  const openCount = derived<number>(() => flags().filter(f => f.status === 'open').length)

  async function fetchFlags(): Promise<void> {
    loading.set(true)
    try {
      const res = await useStore('auth').authFetch(`/api/admin/flags?status=${statusFilter()}`)
      if (!res.ok) {
        actionError.set(`Failed to load flags (${res.status})`)
        return
      }
      const data = await res.json() as { flags: AdminFlagRow[] }
      flags.set(Array.isArray(data.flags) ? data.flags : [])
      actionError.set('')
    }
    catch (err) {
      actionError.set(err instanceof Error ? err.message : 'Network error')
    }
    finally {
      loading.set(false)
    }
  }

  function setStatusFilter(next: FlagStatusFilter): void {
    statusFilter.set(next)
    fetchFlags()
  }

  // Dismiss (not actionable) or resolve (acted on). Optional moderator
  // note. Updates the row in place, or drops it from the list when it
  // falls outside the active filter (resolving while viewing 'open').
  async function resolveFlag(id: number, action: 'dismiss' | 'resolve', note?: string): Promise<boolean> {
    try {
      const res = await useStore('auth').authFetch(`/api/admin/flags/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: note?.trim() || null }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, error?: string, status?: string }
      if (!res.ok || !data.ok) {
        actionError.set(data.error || 'Could not update the flag')
        return false
      }
      const filter = statusFilter()
      const newStatus = (data.status as AdminFlagRow['status']) ?? (action === 'resolve' ? 'resolved' : 'dismissed')
      if (filter !== 'all' && filter !== newStatus)
        flags.set(flags().filter(f => f.id !== id))
      else
        flags.set(flags().map(f => f.id === id ? { ...f, status: newStatus } : f))
      actionError.set('')
      return true
    }
    catch (err) {
      actionError.set(err instanceof Error ? err.message : 'Network error')
      return false
    }
  }

  return { flags, loading, statusFilter, actionError, openCount, fetchFlags, setStatusFilter, resolveFlag }
})
