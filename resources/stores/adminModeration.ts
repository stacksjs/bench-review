import { defineStore, state, useStore } from '@stacksjs/stx'

export interface ModerationEntry {
  id: number
  actor_user_id: number
  actor_name: string
  action: string
  target_type: string
  target_id: number | null
  note: string | null
  created_at: string | null
}

/**
 * Read-only moderation audit trail (GET /api/admin/moderation-log). Records
 * who performed each review/user/credential moderation action — defensibility
 * for "why was this removed / still up" disputes.
 */
defineStore('adminModeration', () => {
  const logs = state<ModerationEntry[]>([])
  const loading = state<boolean>(false)
  const error = state<string>('')

  async function fetchLogs(): Promise<void> {
    loading.set(true)
    try {
      const res = await useStore('auth').authFetch('/api/admin/moderation-log')
      const data = await res.json().catch(() => ({})) as { logs?: ModerationEntry[] }
      logs.set(Array.isArray(data.logs) ? data.logs : [])
      error.set('')
    }
    catch (err) {
      error.set(err instanceof Error ? err.message : 'Could not load the audit log')
    }
    finally {
      loading.set(false)
    }
  }

  return { logs, loading, error, fetchLogs }
})
