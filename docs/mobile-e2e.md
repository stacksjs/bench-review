# iOS end-to-end tests

```bash
bun run test:e2e:ios
```

Builds the app for a simulator, installs it, and drives it with [Maestro](https://maestro.mobile.dev).

## Prerequisites

| | |
|---|---|
| Xcode | with at least one iPhone simulator installed (Xcode → Settings → Components) |
| Maestro | `curl -fsSL https://get.maestro.mobile.dev \| bash` |
| `dist-offline/` | `bun run build:offline-bundle` |

The suite boots a simulator if none is running, and reuses a booted one otherwise.

## Why these four flows

The web conformance gate (`bun run gate`) validates the built `dist/` that the app loads. It cannot see the native shell — whether the app launches, whether the WebView reaches its content, whether a deep link routes, or whether the offline fallback engages.

| Flow | What breaks if it is missing |
|---|---|
| `01-cold-start` | a broken or stale offline bundle — the app opens on nothing |
| `02-navigation` | the hamburger is the only navigation an iPhone has (#90); if it stops working the app has none |
| `pending-03-deep-link` | **fails** — see below |
| `04-offline` | **the one worth having.** The offline path only runs when something has already broken, so nobody exercises it by hand |

`MOBILE_E2E=1` makes `config/mobile.ts` choose `webAssets: 'dist-offline'` with no server, so every flow runs against the bundle and none depend on the network. A suite that needs a server cannot test what happens without one.

## The deep-link flow is parked, deliberately

`config/mobile.ts` declares `urlSchemes: ['benchreview']`, so iOS registers the scheme and hands the URL to the app. The native shell then does nothing with it: `benchreview://judges` leaves the WebView on whatever page it was already showing. Verified on an iPhone 17 Pro simulator; the screenshot is in the run output.

The flow is kept as `pending-03-deep-link.yaml` rather than deleted, because it is the evidence. The runner skips `pending-*` by default so a red suite always means a regression rather than a known bug. Run it deliberately:

```bash
bun run test:e2e:ios -- --flow=deep-link --include-pending
```

`04-offline` originally used the same deep link to reach its second page, which made the offline test fail for a reason that had nothing to do with being offline. It navigates through the menu now.

## A framework workaround you will see in the build

The generated Xcode project declares no `PRODUCT_NAME`, so Xcode resolves the product to a bare `.app` and the build dies with *"Multiple commands produce …/.app"*. Nothing in this repo fixes it at the source — `project.yml` and `project.pbxproj` are both written by `./buddy build:ios`, and regenerating from that spec with XcodeGen reproduces it exactly. The runner passes `PRODUCT_NAME=BenchReview` on the `xcodebuild` command line, which survives regeneration where editing the generated spec would not.

## Maestro needs a JDK

Homebrew's openjdk is keg-only, so `/usr/libexec/java_home` does not find it and Maestro exits with *"Unable to locate a Java Runtime"* before running a step. The runner points `JAVA_HOME` at an installed JDK itself; `brew install openjdk@17` is enough.

## The staleness guard

`bun run build` refreshes `dist/` and **does not** refresh `dist-offline/` — only `build:ios` chains the two. So a normal build leaves the app shipping whatever the bundle last contained.

That is not hypothetical. When this suite was written the bundle was a week old and predated the judge directory's load-failure state, so the offline app claimed *"No judges yet"* during an outage — the exact false claim that state exists to prevent.

The runner therefore refuses to start when `dist-offline/` is missing, empty, missing a page the flows visit, or **older than `dist/`**. `04-offline` additionally asserts that "No judges yet" is *not* on screen, so the specific regression cannot come back silently.

## Previewing by hand

```bash
bun run preview:ios             # bundled, no server — what the e2e run uses
bun run preview:ios:local       # against ./buddy dev on this Mac
bun run preview:ios:production  # against benchreview.org
```

A simulator shares the Mac's network stack, so `localhost` works there. A physical iPhone cannot reach it, and `scripts/mobile-target.ts` refuses that combination up front — the failure is otherwise near-invisible, since the app silently falls back to its bundle and the site merely looks empty.

## Output

Reports and screenshots land in `storage/framework/runtime/e2e/ios/`:

- `<flow>.xml` — JUnit, for CI
- `tests/<flow>/` — screenshots and the command log

A run that executed **no** tests is treated as a failure. Maestro exits 0 when it matches no flows, and reading that as success is how a suite reports green while testing nothing.

## CI

Not wired yet — it needs a macOS runner with Xcode and a simulator, which is a different and much slower job than the current Linux CI. The suite is runnable locally today; see #81.
