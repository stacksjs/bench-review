import { defineStore, derived, state } from '@stacksjs/stx'

/**
 * Follows store — tracks which judges the current user follows.
 *
 * `followedIds` is the source of truth for "am I following judge X"
 * checks across the app. The store fetches once on first read and
 * mutates locally on follow/unfollow so the UI reflects the new state
 * before the server roundtrip resolves.
 */
defineStore('follows', () => {
  const followedIds = state<number[]>([])
  const loading = state<boolean>(false)
  const loaded = state<boolean>(false)
  // Per-judge "in flight" set so consumer UI can disable the button
  // and avoid double-fire while a request is pending.
  const pending = state<Record<number, boolean>>({})

  function authHeaders(): Record<string, string> {
    const cookieMatch = typeof document !== 'undefined'
      ? document.cookie.match(/(?:^|; )auth-token=([^;]*)/)
      : null
    const token = cookieMatch ? decodeURIComponent(cookieMatch[1]) : ''
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
    if (token)
      headers.Authorization = `Bearer ${token}`
    return headers
  }

  async function fetchFollows(): Promise<void> {
    loading.set(true)
    try {
      const res = await fetch('/api/me/follows', { headers: authHeaders() })
      if (!res.ok) {
        followedIds.set([])
        return
      }
      const data = await res.json() as number[]
      followedIds.set(Array.isArray(data) ? data.map(Number).filter(Number.isFinite) : [])
    }
    catch (err) {
      console.error('[follows] fetchFollows failed:', err)
      followedIds.set([])
    }
    finally {
      loading.set(false)
      loaded.set(true)
    }
  }

  function isFollowing(judgeId: number): boolean {
    return followedIds().includes(Number(judgeId))
  }

  function isPending(judgeId: number): boolean {
    return !!pending()[Number(judgeId)]
  }

  function setPending(judgeId: number, on: boolean): void {
    const next = { ...pending() }
    if (on) next[judgeId] = true
    else delete next[judgeId]
    pending.set(next)
  }

  async function follow(judgeId: number): Promise<{ ok: boolean, error?: string }> {
    const id = Number(judgeId)
    if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Invalid judge id' }
    if (isFollowing(id) || isPending(id)) return { ok: true }

    setPending(id, true)
    // Optimistic — flip the UI immediately, roll back on failure.
    followedIds.set([...followedIds(), id])
    try {
      const res = await fetch(`/api/judges/${id}/follow`, {
        method: 'POST',
        headers: authHeaders(),
      })
      if (!res.ok) {
        followedIds.set(followedIds().filter(x => x !== id))
        return { ok: false, error: `HTTP ${res.status}` }
      }
      return { ok: true }
    }
    catch (err) {
      followedIds.set(followedIds().filter(x => x !== id))
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
    finally {
      setPending(id, false)
    }
  }

  async function unfollow(judgeId: number): Promise<{ ok: boolean, error?: string }> {
    const id = Number(judgeId)
    if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Invalid judge id' }
    if (!isFollowing(id) || isPending(id)) return { ok: true }

    setPending(id, true)
    const before = followedIds()
    followedIds.set(before.filter(x => x !== id))
    try {
      const res = await fetch(`/api/judges/${id}/follow`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) {
        followedIds.set(before)
        return { ok: false, error: `HTTP ${res.status}` }
      }
      return { ok: true }
    }
    catch (err) {
      followedIds.set(before)
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
    finally {
      setPending(id, false)
    }
  }

  async function toggle(judgeId: number): Promise<{ ok: boolean, error?: string }> {
    return isFollowing(judgeId) ? unfollow(judgeId) : follow(judgeId)
  }

  const totalFollowing = derived<number>(() => followedIds().length)

  return {
    followedIds,
    loading,
    loaded,
    pending,
    totalFollowing,
    fetchFollows,
    isFollowing,
    isPending,
    follow,
    unfollow,
    toggle,
  }
})
