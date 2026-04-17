import { defineStore, state, derived } from '@stacksjs/stx'

defineStore('auth', () => {
  const user = state(null)
  const isAuthenticated = derived(() => !!user())
  const notifications = state([])

  const unreadCount = derived(() => {
    return notifications().filter(n => n.unread).length
  })

  async function login(email, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) throw new Error('Login failed')
      const data = await res.json()
      user.set(data.user)
      return data
    } catch (error) {
      console.error('Login error:', error)
      throw error
    }
  }

  function logout() {
    user.set(null)
    notifications.set([])
    navigate('/login', true)
  }

  function setNotifications(notifs) {
    notifications.set(notifs)
  }

  function markAllRead() {
    notifications.set(notifications().map(n => ({ ...n, unread: false })))
  }

  function dismissNotification(id) {
    notifications.set(notifications().filter(n => n.id !== id))
  }

  return {
    user,
    isAuthenticated,
    notifications,
    unreadCount,
    login,
    logout,
    setNotifications,
    markAllRead,
    dismissNotification,
  }
})
