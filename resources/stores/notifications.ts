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

  // Polling. 30s is a balance between freshness and request overhead — the
  // user might keep a tab open all day; we don't want a request every second.
  // SPA-nav-triggered refresh covers the immediate "I just liked something,
  // show me the toast" case.
  //
  // A self-rescheduling setTimeout rather than setInterval, for two reasons:
  //
  //  1. setInterval fires on a fixed wall-clock cadence regardless of whether
  //     the previous fetch finished. On a slow connection that stacks requests
  //     and they can land out of order, so a stale response overwrites a fresh
  //     one. Rescheduling only after the fetch settles makes 30s the gap
  //     BETWEEN requests, and guarantees at most one in flight.
  //  2. bench's client-script guard (config/ui.ts) allowlists setTimeout and
  //     deliberately does not allowlist setInterval, precisely so poll loops
  //     have to be looked at.
  //
  // Backgrounded tabs don't poll at all: browsers already throttle timers
  // there, but the throttled request is still pointless — nobody is looking at
  // the bell. Skip the fetch while hidden and catch up on the way back.
  const POLL_MS = 30000
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let polling = false

  function scheduleNextPoll(): void {
    if (!polling) return
    pollTimer = setTimeout(() => { void pollTick() }, POLL_MS)
  }

  async function pollTick(): Promise<void> {
    if (!polling) return
    // try/finally so the loop cannot die: fetchNotifications swallows its own
    // errors today, but if that ever changes, an escaping rejection here would
    // silently stop polling for the rest of the session.
    try {
      if (typeof document === 'undefined' || !document.hidden)
        await fetchNotifications()
    }
    finally {
      scheduleNextPoll()
    }
  }

  function startPolling(): void {
    if (polling || typeof window === 'undefined') return
    polling = true
    void pollTick()
  }

  function stopPolling(): void {
    polling = false
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  // Coming back to a tab that sat hidden should show current state, not
  // whatever was true when it was backgrounded. Refresh immediately and
  // restart the clock so the next poll is a full interval away.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!polling || document.hidden) return
      if (pollTimer) clearTimeout(pollTimer)
      void pollTick()
    })
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
