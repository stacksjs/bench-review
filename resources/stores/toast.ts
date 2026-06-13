import type { ToastType } from '~/resources/types'
import { defineStore, state } from '@stacksjs/stx'

export interface ToastItem {
  id: number
  type: ToastType
  title?: string
  message: string
}

/**
 * Transient toast notifications — the in-your-face counterpart to the
 * persistent bell-dropdown notifications in the auth store.
 *
 * A signal-array + `<ToastHost>`-rendered model is the ONLY workable shape in
 * stx: an imperative `ref.show()` API is impossible because stx's ref store
 * holds DOM elements, not a component's exposed methods (see the comment that
 * used to live in BenchComingSoon). Call sites push via `toast.error(...)` /
 * `toast.success(...)`; the host renders `toast.items()` and each auto-dismisses
 * after 5s (or on click).
 */
defineStore('toast', () => {
  const items = state<ToastItem[]>([])
  let seq = 0

  function dismiss(id: number): void {
    items.set(items().filter(t => t.id !== id))
  }

  function show(message: string, type: ToastType = 'info', title?: string): number {
    const id = ++seq
    items.set([...items(), { id, type, title, message }])
    // Auto-dismiss. show() only ever runs client-side (from event handlers),
    // so setTimeout is safe; dismiss() is idempotent if the user clicked first.
    if (typeof window !== 'undefined')
      window.setTimeout(() => dismiss(id), 5000)
    return id
  }

  // Convenience helpers so call sites read naturally:
  //   toast.error('Cannot submit review', 'Add a review title.')
  const error = (title: string, message: string): number => show(message, 'error', title)
  const success = (title: string, message: string): number => show(message, 'success', title)
  const info = (title: string, message: string): number => show(message, 'info', title)
  const warning = (title: string, message: string): number => show(message, 'warning', title)

  return { items, show, dismiss, error, success, info, warning }
})
