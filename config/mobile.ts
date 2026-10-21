import type { MobileConfig } from '@stacksjs/types/mobile'

/**
 * Native app configuration.
 *
 * ## What the native app actually is
 *
 * Not a rewrite. Stacks' mobile build produces a native shell around this same
 * STX site, so there is one codebase. `./buddy build:ios` generates the Xcode
 * project from the values below.
 *
 * Since bench-review#79 that shell is no longer only a web view: the paths in
 * `nativeScreens` are drawn as real UIKit screens from `resources/native`,
 * with the system's own tab bar and push navigation, while every other path
 * still loads the site. The two halves share the API and nothing else, which
 * is why a native screen reads `resources/functions/native-api.ts` rather than
 * a web store.
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

// Always `url` plus a bundled fallback, including under MOBILE_E2E.
//
// This used to swap to `webAssets: 'dist-offline'` with no `url` for e2e runs,
// so they never touched the network. A native renderer has no web view for
// `webAssets` to be shown in, and the framework now says so outright:
//
//   ios.renderer 'native' has no web view to show ios.webAssets in:
//   set ios.url to the app's site instead
//
// `fallbackWebAssets` is gone for the same reason — it is the web view's
// offline page, and there is no web view. The framework refuses both.
//
// ⚠️ This CHANGES the offline story, and not entirely for the better yet. The
// native screens are compiled into the app, so they cold-start with no network
// and show their own offline state. But every path still served by the web —
// everything outside `nativeScreens` — now needs the server, where it used to
// fall back to `dist-offline`. That gap closes as more screens become native;
// until then the bundled fallback only returns if the renderer goes back to
// 'web'. The e2e suite's offline flow is written against the old behaviour and
// is updated with this.
// The path in `url` is where the app STARTS, and under a native renderer it
// has to be one of the `nativeScreens` — the framework refuses otherwise:
//
//   The start path "/" is not a nativeScreens path; with renderer: "native"
//   the app must start on a native screen.
//
// `/reviews` rather than `/`: `/` still serves the marketing coming-soon page
// (bench-review#62), so the web build opens the app on a "Coming soon"
// banner. The native app opens on the FEED, which is both the first tab and
// the only screen with something new on it between visits. It was `/judges`
// while the directory led the bar; the two have to agree, or the app opens on
// a tab that is not the one selected.
const mobileContent = {
  url: envVars.MOBILE_URL ?? 'https://benchreview.org/reviews',
}

/**
 * The screens Craft draws NATIVELY, by path (bench-review#79).
 *
 * A path listed here is a real UIKit screen from `resources/native`, not the
 * site in a web view: a cold start is native views, taps between them push
 * native screens, and the bar below is the system's own tab bar. Any path NOT
 * listed still opens the web site, so this converts the app screen by screen
 * rather than in one jump.
 *
 * Craft matches fixed segments before a parameter, so `/judges` is never
 * taken for a judge's id.
 *
 * Native so far: the two directories and the detail screen each pushes to,
 * the account screens, writing a review and the review feed. The rest — an
 * article, following a judge, editing a review already posted — is still the
 * web view, and the e2e suite (bench-review#81) covers both halves.
 */
const nativeScreens: Record<string, string> = {
  '/judges': 'Judges',
  '/judges/:id': 'Judge',
  // More fixed segments win over fewer, so these are never taken for
  // `/judges/:id` however they are ordered here.
  '/judges/:id/opinions': 'JudgeOpinions',
  '/judges/:id/education': 'JudgeEducation',
  '/court-houses': 'CourtHouses',
  '/court-houses/:id': 'CourtHouse',
  // Both reach the same screen. `/review` starts by asking which judge;
  // `/review/:id` arrives already knowing, which is how a judge's own screen
  // sends someone here without the picker.
  '/review': 'Review',
  '/review/:id': 'Review',
  '/reviews': 'Reviews',
  // One review in full. More fixed segments than `/reviews` and fewer than
  // `/reviews/:id/comments`, so the matcher reaches each of the three
  // whatever the order here — it sorts more-fixed-segments first.
  '/reviews/:id': 'ReviewDetail',
  // The thread under one review. More fixed segments than `/reviews`, so the
  // matcher reaches it first whatever the order here.
  '/reviews/:id/comments': 'ReviewComments',
  '/profile': 'Profile',
  // Not a tab: reached from whatever needed a session. The app does not open
  // on a sign-in wall — the directory and the published reviews are public on
  // the web and are public here, and App Review guideline 5.1.1(v) says an app
  // without significant account-based features must let people in without a
  // login.
  '/login': 'Login',
}

/**
 * The tab bar, an SF Symbol each.
 *
 * THE FEED LEADS. It is the only tab that has something new on it between one
 * visit and the next, which makes it the one worth opening the app onto — the
 * directories are a reference you go to when you already have a name in mind.
 * It is `/reviews` under a different word: the PATH stays as it is, because
 * the website serves `/reviews` and a universal link has to mean the same
 * thing on both. Only the label changed.
 *
 * Writing a review is the one thing the app asks of someone rather than
 * offers them, and it used to sit in the middle for that reason. The feed
 * taking first place pushes it off centre; left as it is rather than
 * reshuffled around it, because separating the two directories to keep Write
 * centred would be a stranger bar than an off-centre compose button.
 *
 * Five is also the ceiling: iOS collapses anything past the fifth into a
 * "More" list, so a sixth tab would hide two of these behind a menu.
 */
const tabs = [
  { id: '/reviews', title: 'Feed', symbol: 'text.bubble' },
  { id: '/judges', title: 'Judges', symbol: 'person.text.rectangle' },
  { id: '/court-houses', title: 'Courthouses', symbol: 'building.columns' },
  { id: '/review', title: 'Write', symbol: 'square.and.pencil' },
  { id: '/profile', title: 'Profile', symbol: 'person.crop.circle' },
]

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
    // White, because that is what the site actually renders as: `<body>` carries
    // no background class on any page, so every browser paints it white and the
    // content is styled for it (the root page's h1 is `text-gray-900`, the pill
    // `text-gray-600`).
    //
    // This was the footer navy (#0b1e3b) first, on the reasoning that it would
    // match the site's chrome. It does not — the footer is the only navy
    // surface. Because no page paints its own background, the WebView's colour
    // IS the page background, so navy put dark-grey text on a dark-navy field
    // and the first screen was close to unreadable. Verified on an iPhone 17
    // Pro simulator in light appearance, so it was not a dark-mode fault.
    //
    // Change this only together with a page that actually sets its own
    // background.
    backgroundColor: '#ffffff',
    // The site renders light-only — the conformance gate's visual check runs
    // THEMES = ['light'] — so claiming dark support would hand iOS a dark
    // container around a light page.
    darkMode: false,

    orientations: ['portrait'],
    deviceFamilies: ['iphone'],

    // What makes Craft draw `nativeScreens` as real UIKit screens instead of
    // loading the site in a web view (bench-review#79).
    //
    // This block carried an "INERT ON THIS FRAMEWORK VERSION" warning for a
    // while, and it was right at the time: `./buddy build:ios` went through
    // @stacksjs/build 0.70.380, which contains zero occurrences of
    // `nativeScreens` and never forwarded `renderer`, so the generated
    // craft.config.json still said `"renderer": "web"`.
    //
    // That is fixed. Native screen support lives in @stacksjs/actions, not
    // @stacksjs/build — checking the wrong package is what made the gap look
    // like a missing feature — and bench is on the stacks 0.75 line now. The
    // generated craft.config.json says `"renderer": "native"`, and the screens
    // have been exercised on a simulator.
    renderer: 'native',
    nativeScreens,
    tabs,

    capabilities: {
      camera: true,
      filePicker: true,
      share: true,
      deepLinks: true,
      // The session token, in the Keychain rather than anywhere this app can
      // read casually (resources/functions/native-session.ts). Without this
      // the capability gate refuses `craft.secureStorage` and the native sign
      // -in has nowhere to put what it earns. On a site built around reviewer
      // anonymity, the credential that links a person to an anonymous review
      // is exactly the thing that belongs behind the device's own lock.
      secureStorage: true,
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
