import { defineStore, derived, state, useStore } from '@stacksjs/stx'

export interface NotificationRow {
  id: number
  type: 'like' | 'approved' | 'rejected' | string
  created_at: string
  read_at: string | null
  unread: boolean
  actor: { id: number, name: string } | null
  review: { id: number, title: string } | null
}

defineStore('notifications', () => {
  const items = state<NotificationRow[]>([])
  const unreadCount = state<number>(0)
  const loading = state<boolean>(false)
  const filter = state<'all' | 'unread'>('all')

  // Derived for the header bell — true when there's at least one
  // unread item to surface. Drives whether the badge renders at all.
  const hasUnread = derived<boolean>(() => unreadCount() > 0)

  async function fetchNotifications(): Promise<void> {
    const authStore = useStore('auth')
    if (!authStore.token()) return
    loading.set(true)
    try {
      const res = await authStore.authFetch(`/api/me/notifications?filter=${filter()}&limit=30`)
      if (!res.ok) return
      const data = await res.json() as { items: NotificationRow[], unread_count: number }
      items.set(Array.isArray(data.items) ? data.items : [])
      unreadCount.set(Number(data.unread_count ?? 0))
    }
    catch (err) {
      console.error('[notifications] fetch failed:', err)
    }
    finally {
      loading.set(false)
    }
  }

  function setFilter(next: 'all' | 'unread'): void {
    filter.set(next)
    void fetchNotifications()
  }

  async function markRead(id: number): Promise<void> {
    const authStore = useStore('auth')
    try {
      const res = await authStore.authFetch(`/api/me/notifications/${id}/read`, { method: 'POST' })
      if (!res.ok) return
      // Optimistic local update so the dropdown reflects immediately.
      // Even if a parallel fetchNotifications overwrites this, the
      // server-side read_at is already persisted so the badge stays
      // accurate.
      items.set(items().map(n => n.id === id ? { ...n, read_at: new Date().toISOString(), unread: false } : n))
      unreadCount.set(Math.max(0, unreadCount() - 1))
    }
    catch (err) {
      console.error('[notifications] markRead failed:', err)
    }
  }

  async function markAllRead(): Promise<void> {
    const authStore = useStore('auth')
    try {
      const res = await authStore.authFetch('/api/me/notifications/read-all', { method: 'POST' })
      if (!res.ok) return
      const now = new Date().toISOString()
      items.set(items().map(n => n.unread ? { ...n, read_at: now, unread: false } : n))
      unreadCount.set(0)
    }
    catch (err) {
      console.error('[notifications] markAllRead failed:', err)
    }
  }

  // Polling. 30s interval is a balance between freshness and request
  // overhead — the user might keep a tab open all day; we don't want
  // a request every second. SPA-nav-triggered refresh covers the
  // immediate "I just liked something, show me the toast" case.
  let pollTimer: ReturnType<typeof setInterval> | null = null
  function startPolling(): void {
    if (pollTimer || typeof window === 'undefined') return
    void fetchNotifications()
    pollTimer = setInterval(() => { void fetchNotifications() }, 30000)
  }
  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  // Cross-store refresh trigger. Whenever the auth store fires the
  // expired event (logout, 401 bounce), drop the local state so a
  // re-login starts fresh. Also stop polling so we're not hammering
  // the server with 401s.
  if (typeof window !== 'undefined') {
    document.addEventListener('auth:expired', () => {
      items.set([])
      unreadCount.set(0)
      stopPolling()
    })
  }

  return {
    items,
    unreadCount,
    hasUnread,
    loading,
    filter,
    fetchNotifications,
    setFilter,
    markRead,
    markAllRead,
    startPolling,
    stopPolling,
  }
})
