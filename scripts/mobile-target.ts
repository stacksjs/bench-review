/**
 * Which server a native build loads, and the rules that stop a build pointing
 * somewhere it cannot reach (bench-review#81).
 *
 * The server is fixed when the app is BUILT, not at runtime: `MOBILE_URL`
 * becomes `devServerURL` in the generated `craft.config.json`. So a build
 * pointed at the wrong place cannot be corrected on the device — it opens on a
 * dead server and silently drops to its bundled copy, where every API call
 * fails and the site looks empty rather than broken.
 *
 * Checked here rather than in `config/mobile.ts`, because the web server loads
 * that file too and a bad MOBILE_URL must not stop the site booting.
 */

export const PRODUCTION_URL = 'https://benchreview.org'

/** `./buddy dev` serves the site on 4000; the API is a separate process on 4008. */
export const LOCAL_URL = 'http://localhost:4000'

export type MobileTarget = 'simulator' | 'device'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function isLoopback(url: URL): boolean {
  return LOOPBACK_HOSTS.has(url.hostname)
}

/**
 * The origin a build for `target` should load, or an error saying why not.
 *
 * A simulator shares the Mac's network stack, so it CAN reach localhost. A
 * physical iPhone cannot, and that failure is near-invisible — the app just
 * shows bundled pages — so it is refused up front.
 */
export function resolveMobileServer(value: string | undefined, target: MobileTarget): string {
  const raw = value?.trim() || PRODUCTION_URL
  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    throw new Error(`The app's server must be an absolute http:// or https:// URL, not "${raw}".`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error(`The app's server must be an absolute http:// or https:// URL, not "${raw}".`)

  if (target === 'device' && isLoopback(url))
    throw new Error(`An iPhone cannot reach this Mac's ${url.host}. Build against ${PRODUCTION_URL}, or pass --server with an https tunnel URL.`)
  if (url.protocol === 'http:' && !isLoopback(url))
    throw new Error(`Only this Mac (localhost) may be served over plain http; use https for ${url.host}.`)

  return url.origin
}

/** Read `--server=<url>` or `--server <url>` from a script's arguments. */
export function serverArgument(args: string[]): string | undefined {
  const index = args.findIndex(arg => arg === '--server' || arg.startsWith('--server='))
  if (index === -1)
    return undefined
  const value = args[index] === '--server' ? args[index + 1] : args[index].slice('--server='.length)
  if (!value || value.startsWith('--'))
    throw new Error('--server needs a URL, for example --server=http://localhost:4000')
  return value
}
