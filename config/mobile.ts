import type { MobileConfig } from '@stacksjs/types/mobile'

/**
 * Native app configuration.
 *
 * ## What the native app actually is
 *
 * Not a rewrite. Stacks' mobile build produces a native shell that loads this
 * same STX site, so there is one codebase and one set of views. `./buddy
 * build:ios` generates the Xcode project from the values below.
 *
 * Which server the app talks to is fixed AT BUILD TIME, not at runtime:
 *
 *   - normally: `url` (the live site), with `fallbackWebAssets: 'dist'` as an
 *     offline copy. If the server cannot be reached — a deploy, a dev-server
 *     restart, no signal — the app serves the bundled pages and returns to the
 *     server on its own once it answers.
 *   - under MOBILE_E2E: `webAssets: 'dist'` only, so the end-to-end run never
 *     depends on a network.
 *
 * The offline copy is `dist-offline/`, NOT `dist/`. `dist/` pre-renders a page
 * per entity and weighs 430 MB — unshippable, and `simctl install` times out
 * on it. `scripts/build-offline-bundle.ts` strips the per-entity page trees to
 * get 10.5 MB, which costs nothing offline: the API is unreachable then too, so
 * a bundled judge page shows the same empty state as the shared tab shell that
 * is kept. Run `bun run build:ios`, which chains build -> bundle -> generate.
 *
 * ## Capabilities
 *
 * Only what the app demonstrably uses is declared. Each capability adds
 * entitlements and permission prompts, and an entitlement with no
 * corresponding feature is a thing App Review asks about:
 *
 *   - camera + filePicker — `Bench/ReviewForm.stx` has
 *     `<input type="file" accept="image/jpeg,image/png,image/webp">` for
 *     review photos, which iOS answers with the camera/library picker.
 *   - share — `navigator.share` is called in `Bench/Blog/Blog.stx` and
 *     `Bench/Judge/ProfileHeader.stx`.
 *   - deepLinks — required for `associatedDomains` and `urlSchemes` below.
 *
 * NOT declared, deliberately: geolocation, biometric, pushNotifications,
 * healthKit, contacts, calendar. Nothing in the app calls them today. Add one
 * when a feature needs it, not in advance.
 */

const envVars = typeof Bun !== 'undefined' ? Bun.env : process.env

// A free (personal) Apple team cannot sign Associated Domains, so Xcode
// refuses the whole profile rather than dropping just that entitlement. A
// personal-team sideload therefore ships without universal links.
const personalTeam = envVars.IOS_PERSONAL_TEAM === '1'

// End-to-end runs load the bundled site so they never depend on the network;
// every other build prefers the live site and keeps `dist/` as the fallback.
const mobileContent = envVars.MOBILE_E2E === '1'
  ? { webAssets: 'dist-offline' }
  : {
      url: envVars.MOBILE_URL ?? 'https://benchreview.org',
      fallbackWebAssets: 'dist-offline',
    }

export default {
  ios: {
    appName: 'Bench Review',
    bundleId: envVars.IOS_BUNDLE_ID ?? 'org.benchreview.app',
    version: envVars.IOS_APP_VERSION ?? '1.0.0',
    buildNumber: envVars.IOS_BUILD_NUMBER ?? '1',
    deploymentTarget: '16.0',
    teamId: envVars.APPLE_TEAM_ID,
    ...mobileContent,

    trustedOrigins: ['https://benchreview.org'],
    associatedDomains: personalTeam ? [] : ['applinks:benchreview.org'],
    urlSchemes: ['benchreview'],

    appIcon: 'public/images/app/bench-review-app-icon.png',
    // The footer navy from the Gavel Blue design system
    // (`Bench/BenchFooter.stx` → `bg-[#0b1e3b]`), so the launch screen matches
    // the site's own chrome instead of flashing white.
    backgroundColor: '#0b1e3b',
    // The site renders light-only — the conformance gate's visual check runs
    // THEMES = ['light'] — so claiming dark support would hand iOS a dark
    // container around a light page.
    darkMode: false,

    orientations: ['portrait'],
    deviceFamilies: ['iphone'],

    capabilities: {
      camera: true,
      filePicker: true,
      share: true,
      deepLinks: true,
    },

    /**
     * App Store privacy manifest.
     *
     * ⚠️ VERIFY BEFORE SUBMISSION. App Review compares this manifest against
     * the privacy answers entered in App Store Connect, and a manifest that
     * declares less than the labels is a rejection. What is below is what the
     * app provably collects today; it is not a substitute for filling in the
     * App Store Connect questionnaire and checking the two agree.
     *
     * `accessedApiTypes` is intentionally absent rather than guessed. Apple
     * requires a declared reason code for certain APIs (UserDefaults, file
     * timestamps, disk space, …); which of those the generated Xcode project
     * actually touches needs reading, and inventing reason codes would be
     * worse than leaving the key out and filling it in deliberately.
     */
    privacy: {
      // bench has no analytics SDK and no ad network.
      tracking: false,
      collectedDataTypes: [
        {
          // Account sign-up and sign-in.
          type: 'NSPrivacyCollectedDataTypeEmailAddress',
          linked: true,
          tracking: false,
          purposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          // The reviews themselves, plus comments and judge responses.
          type: 'NSPrivacyCollectedDataTypeOtherUserContent',
          linked: true,
          tracking: false,
          purposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          // Review photos (`ReviewPhoto`), uploaded through the file input.
          type: 'NSPrivacyCollectedDataTypePhotosorVideos',
          linked: true,
          tracking: false,
          purposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
      ],
    },
  },
} satisfies MobileConfig
