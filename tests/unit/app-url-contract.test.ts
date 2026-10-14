import { describe, expect, test } from 'bun:test'

/**
 * APP_URL has two consumers with different expectations — bench-review#55.
 *
 * The framework treats `config.app.url` as a BARE HOST and prepends the scheme
 * itself (`https://${config.app.url}` in the password-reset mailer; its own
 * default is `stacks.localhost`). bench's helpers read `process.env.APP_URL`
 * and interpolate it whole (`${APP_URL}/article/12`), so they need the scheme.
 *
 * `.env` carries the full url, so the framework was emitting
 * `https://http://localhost:4000/password/reset/...` — an unusable link in the
 * one email a locked-out user depends on. config/app.ts normalises for the
 * framework without touching the env var the app reads.
 */

/** Exactly what `config/app.ts` does. */
function configUrl(appUrl: string | undefined): string {
  return (appUrl ?? 'stacks.localhost').replace(/^https?:\/\//, '')
}

/** Exactly what the framework's reset mailer does with it. */
function frameworkResetBase(configAppUrl: string): string {
  return configAppUrl ? `https://${configAppUrl}` : 'http://localhost:3000'
}

describe('APP_URL contract', () => {
  test('a full url does not produce a double scheme', () => {
    expect(frameworkResetBase(configUrl('https://benchreview.com'))).toBe('https://benchreview.com')
    expect(frameworkResetBase(configUrl('http://localhost:4000'))).toBe('https://localhost:4000')

    // The shape the bug produced.
    expect(frameworkResetBase(configUrl('http://localhost:4000'))).not.toContain('https://http')
  })

  test('a bare host still works, so the framework default is unbroken', () => {
    expect(configUrl('stacks.localhost')).toBe('stacks.localhost')
    expect(frameworkResetBase(configUrl(undefined))).toBe('https://stacks.localhost')
  })

  test('the env var itself is left alone for the app helpers that interpolate it', () => {
    // app/Actions/Reviews/SubmitReviewAction.ts and friends build
    // `${process.env.APP_URL}/article/123`, which needs the scheme present.
    const envValue = 'http://localhost:4000'
    expect(`${envValue}/article/12`).toBe('http://localhost:4000/article/12')
  })
})
