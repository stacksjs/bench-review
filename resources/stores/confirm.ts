import { defineStore, state } from '@stacksjs/stx'

export interface ConfirmOptions {
  /** Heading. Defaults to "Are you sure?". */
  title?: string
  /** Body text. Required. */
  message: string
  /** Confirm-button label. Defaults to "Confirm". */
  confirmLabel?: string
  /** Cancel-button label. Defaults to "Cancel". */
  cancelLabel?: string
  /** Red confirm button for destructive actions (delete, etc.). */
  danger?: boolean
}

/**
 * Promise-based confirmation dialog — the styled replacement for the
 * browser's native `window.confirm()`.
 *
 * Call sites: `if (!(await confirmStore.ask({ message: '…', danger: true }))) return`.
 * The store holds the open/labels/danger state; <ConfirmHost> (mounted once
 * per layout) renders the modal and calls accept()/dismiss() on the buttons,
 * which settle the promise returned by ask(). Same signal-array + host model
 * as the toast store — an imperative ref API isn't possible in stx.
 */
defineStore('confirm', () => {
  const open = state<boolean>(false)
  const title = state<string>('Are you sure?')
  const message = state<string>('')
  const confirmLabel = state<string>('Confirm')
  const cancelLabel = state<string>('Cancel')
  const danger = state<boolean>(false)

  let resolver: ((ok: boolean) => void) | null = null

  function settle(ok: boolean): void {
    open.set(false)
    const r = resolver
    resolver = null
    if (r)
      r(ok)
  }

  function ask(opts: ConfirmOptions): Promise<boolean> {
    // Settle any still-open dialog as cancelled before opening a new one
    // so its awaiter doesn't dangle forever.
    if (resolver)
      settle(false)
    title.set(opts.title ?? 'Are you sure?')
    message.set(opts.message)
    confirmLabel.set(opts.confirmLabel ?? 'Confirm')
    cancelLabel.set(opts.cancelLabel ?? 'Cancel')
    danger.set(opts.danger ?? false)
    open.set(true)
    return new Promise<boolean>((resolve) => {
      resolver = resolve
    })
  }

  const accept = (): void => settle(true)
  const dismiss = (): void => settle(false)

  return { open, title, message, confirmLabel, cancelLabel, danger, ask, accept, dismiss }
})
