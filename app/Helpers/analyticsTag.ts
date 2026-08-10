/**
 * The ts-analytics `<script>` tag, owned locally.
 *
 * `build.ts` used to import this from `@stacksjs/ts-analytics/stx`. That import
 * cannot resolve, and never could: the package is not a dependency of this app
 * at all — it arrives transitively through `localtunnels`, and it arrives as
 * `github:stacksjs/ts-analytics#54013c6`. A git dependency installs the
 * repository, not a published artifact, so `node_modules/@stacksjs/ts-analytics`
 * has no `dist/` — while its `exports` map points `./stx` at
 * `./dist/integrations/stx.js`. The subpath resolves to nothing:
 *
 *   Cannot find module '@stacksjs/ts-analytics/stx' from 'build.ts'
 *
 * which took the whole build down at the first import, before a single page was
 * rendered. `dist/` had been stale since 20 July as a result.
 *
 * Reproducing four lines here is the proportionate fix. The alternative —
 * building a transitive git dependency in place — works until the next
 * `bun install` and leaves the build resting on a package that structurally
 * cannot ship the entry point it advertises.
 *
 * Faithful to `@stacksjs/ts-analytics` `src/integrations/stx.ts` at 54013c6:
 * same default endpoint, same `/script.js` path, same stealth suffix, same
 * "return empty rather than emit a half-configured tag" rule.
 */

/** Origin used when neither an explicit endpoint nor `TS_ANALYTICS_ENDPOINT` is set. */
export const DEFAULT_API_ENDPOINT = 'http://localhost:2027'

export interface TsAnalyticsOptions {
  /** Site identifier. Without it, no tag is emitted. */
  appId?: string
  /** API origin. Falls back to `TS_ANALYTICS_ENDPOINT`, then the default. */
  apiEndpoint?: string
  /** Path of the shared tracker script. Default `/script.js`. */
  scriptPath?: string
  /** Append `?stealth=true`. Default false. */
  stealth?: boolean
}

/** Resolve the API origin from an explicit override, env, then the default. */
export function resolveApiEndpoint(explicit?: string): string {
  const raw = (explicit ?? process.env.TS_ANALYTICS_ENDPOINT ?? DEFAULT_API_ENDPOINT).trim()
  return raw.replace(/\/+$/, '')
}

/**
 * The raw `<script>` tag to splice into a built page's `<head>`.
 *
 * Returns `''` when `appId` or the endpoint is missing, so a half-configured
 * environment injects nothing rather than a broken tag.
 */
export function tsAnalyticsTag(options: TsAnalyticsOptions): string {
  const appId = options?.appId?.trim()
  if (!appId)
    return ''

  const origin = resolveApiEndpoint(options?.apiEndpoint)
  if (!origin)
    return ''

  const rawPath = options.scriptPath ?? '/script.js'
  const scriptPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  const src = `${origin}${scriptPath}${options.stealth ? '?stealth=true' : ''}`

  return `<script defer data-site="${appId}" src="${src}"></script>`
}
