import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

/**
 * Write the Apple App Site Association file (bench-review#80).
 *
 * `config/mobile.ts` declares `associatedDomains: ['applinks:benchreview.org']`,
 * which is only half of a universal link. The other half lives on the WEB side:
 * iOS fetches `https://benchreview.org/.well-known/apple-app-site-association`
 * and will only open links in the app if that file names this exact
 * team+bundle and claims the path.
 *
 * The failure mode when it is missing is the reason this is generated rather
 * than hand-maintained: iOS declines silently and falls back to Safari. The
 * entitlement is present, the association is absent, and nothing anywhere
 * reports a problem — the app just never opens a link and it looks like a
 * product decision.
 *
 * Generated into `public/`, which the build copies into `dist/`, so the file
 * ships with the static artifact and cannot drift from the app's identity.
 *
 * ── Which paths the app claims ──────────────────────────────────────────────
 * Content, and nothing else.
 *
 * `components` is evaluated IN ORDER and the first match wins, so every
 * exclusion has to come before the includes it is carving out of. Getting that
 * backwards is the classic AASA bug: the excludes are written, they are simply
 * never reached.
 *
 * Excluded deliberately:
 *   - `/admin/*` — the moderation surface. It is where an anonymized reviewer
 *     can be unmasked, and it should be reached from a browser the person
 *     chose, not from whatever app happened to intercept a tap.
 *   - the auth paths — a password reset or an email verification that opens in
 *     an app shell instead of the browser that requested it is a worse flow and
 *     a confusing one. The link in that email is a one-time credential; it
 *     belongs in the browser that asked for it.
 *
 * Everything claimed is public, shareable content: the feed, judge profiles
 * (which is where `navigator.share` is actually called), courthouses, and
 * published review articles.
 *
 * `/reviews` is claimed as an exact path as well as a prefix, which the two
 * directories are not. It is where the app STARTS — `config/mobile.ts` points
 * `url` at it and it leads the tab bar — so a link to it is a link to the
 * screen the app opens on. `/judges` and `/court-houses` are index pages
 * nobody shares; their detail pages are the share targets, and those are
 * covered by the prefix.
 */

export interface MobileAssociationEnvironment {
  APPLE_TEAM_ID?: string
  IOS_BUNDLE_ID?: string
  // Index signature so `process.env` is assignable: an interface of only
  // optional properties trips TypeScript's weak-type check against ProcessEnv.
  [key: string]: string | undefined
}

/** Default matches `config/mobile.ts`'s own fallback — keep the two in step. */
const DEFAULT_BUNDLE_ID = 'org.benchreview.app'

/**
 * Path rules, in evaluation order. Exclusions first — see above.
 */
export function applinkComponents(): Array<Record<string, unknown>> {
  return [
    // -- excluded, and these MUST stay above the includes --
    { '/': '/admin/*', 'exclude': true, 'comment': 'moderation surface; open in the browser' },
    { '/': '/login', 'exclude': true, 'comment': 'auth stays in the browser' },
    { '/': '/register', 'exclude': true, 'comment': 'auth stays in the browser' },
    { '/': '/forgot-password', 'exclude': true, 'comment': 'auth stays in the browser' },
    { '/': '/reset-password*', 'exclude': true, 'comment': 'one-time credential in an email' },
    { '/': '/verify-email/*', 'exclude': true, 'comment': 'one-time credential in an email' },

    // -- claimed --
    // The feed, claimed EXACTLY as well as by prefix — unlike the two
    // directories, whose index pages are not claimed. It is the app's start
    // path and the first tab (config/mobile.ts), so a link to it is a link to
    // where the app opens; an index nobody shares is a different case.
    { '/': '/reviews', 'comment': 'the feed — the app opens here' },
    { '/': '/reviews/*', 'comment': 'comment threads under a review' },
    { '/': '/judges/*', 'comment': 'judge profiles and their tabs — the main share target' },
    { '/': '/court-houses/*', 'comment': 'courthouse profiles' },
    { '/': '/article/*', 'comment': 'published reviews' },
  ]
}

export async function generateMobileAssociations(
  environment: MobileAssociationEnvironment = process.env,
  publicDirectory = join(process.cwd(), 'public'),
): Promise<string[]> {
  const teamId = environment.APPLE_TEAM_ID?.trim()
  const bundleId = environment.IOS_BUNDLE_ID?.trim() || DEFAULT_BUNDLE_ID
  if (!teamId)
    return []

  const output = join(publicDirectory, '.well-known')
  await mkdir(output, { recursive: true })

  const path = join(output, 'apple-app-site-association')
  // No file extension, deliberately — Apple fetches this exact name. It still
  // has to be served as application/json; a host that guesses by extension
  // will get that wrong, which is why the deploy docs call it out.
  await writeFile(path, `${JSON.stringify({
    applinks: {
      details: [{
        appIDs: [`${teamId}.${bundleId}`],
        components: applinkComponents(),
      }],
    },
    // `webcredentials` is deliberately absent. It associates the domain for
    // Password AutoFill, and `config/mobile.ts` entitles `applinks:` only — so
    // claiming it here would assert a capability the signed app does not have.
    // Add both together or neither.
  }, null, 2)}\n`)

  return [path]
}

if (import.meta.main) {
  const written = await generateMobileAssociations()
  if (!written.length) {
    // Loud, because the whole point of this file is that its absence is
    // otherwise undetectable until someone taps a link on a real device.
    console.warn('[mobile-associations] APPLE_TEAM_ID is unset — no apple-app-site-association written.')
    console.warn('[mobile-associations] Universal links will silently fall back to Safari on every tap.')
  }
  else {
    console.log(`[mobile-associations] wrote ${written[0]}`)
  }
}
