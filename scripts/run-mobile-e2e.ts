import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

/**
 * End-to-end run of the iOS app against a simulator (bench-review#81).
 *
 * The web conformance gate validates the built `dist/`, which the app loads —
 * but nothing exercised the native shell: that it launches, that the WebView
 * reaches its content, that a deep link routes, or that the offline fallback
 * engages when the server is gone. The offline path is the one most worth
 * covering, because it only runs when something else has already broken and so
 * is never exercised by hand.
 *
 * iOS only, deliberately. `config/mobile.ts` declares `deviceFamilies:
 * ['iphone']` and there is no Android configuration in this project, so an
 * Android arm would be dead code pretending to be coverage.
 */

const projectRoot = resolve(import.meta.dir, '..')
const flowRoot = join(projectRoot, '.maestro/flows')
const resultsRoot = join(projectRoot, 'storage/framework/runtime/e2e/ios')
const offlineBundle = join(projectRoot, 'dist-offline')
const builtSite = join(projectRoot, 'dist')

/**
 * Pages the flows actually visit. A bundle that is merely PRESENT is not a
 * bundle that works — the first version of this checked only that the
 * directory existed, and the bundle it blessed was a week stale.
 */
const REQUIRED_PAGES = ['index.html', 'judges.html']

/**
 * Maestro is a JVM program, and Homebrew's openjdk is keg-only — it is not
 * symlinked into /Library/Java, so `/usr/libexec/java_home` does not find it
 * and Maestro exits with "Unable to locate a Java Runtime" before running a
 * single step. Pointing JAVA_HOME at an installed JDK is the whole fix.
 */
const JAVA_HOMES = [
  '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
  '/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home',
  '/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
  '/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home',
]

function maestroEnvironment(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    // A test run must not report device or test metadata to a third party.
    MAESTRO_CLI_NO_ANALYTICS: '1',
    MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
  }
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME))
    return env
  const found = JAVA_HOMES.find(home => existsSync(home))
  if (found)
    env.JAVA_HOME = found
  return env
}

/** Xcode target/product name, from the generated project.yml. */
const PRODUCT = 'BenchReview'

function run(command: string[], options: { env?: Record<string, string | undefined>, allowFailure?: boolean } = {}): string {
  const result = Bun.spawnSync(command, {
    cwd: projectRoot,
    env: { ...process.env, ...options.env } as Record<string, string>,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = result.stdout.toString()
  const stderr = result.stderr.toString()
  if (!result.success && !options.allowFailure)
    throw new Error(`${command.join(' ')} failed (${result.exitCode})\n${stdout}\n${stderr}`)
  return stdout + stderr
}

function requireCommand(name: string, hint: string): void {
  const found = Bun.spawnSync(['which', name], { stdout: 'pipe', stderr: 'pipe' })
  if (!found.success)
    throw new Error(`${name} is not installed. ${hint}`)
}

/**
 * Refuse to run against a bundle that is missing, empty, or older than the
 * site it is supposed to mirror.
 *
 * The staleness half is not theoretical. `bun run build` refreshes `dist/` and
 * does NOT refresh `dist-offline/` — only `build:ios` chains the two — so a
 * normal build leaves the app shipping whatever the bundle happened to contain.
 * Found exactly that while writing this: the bundle was a week old and
 * predated the judge directory's load-failure state, so the offline app
 * claimed "No judges yet" during an outage, which is the false claim that
 * state exists to prevent.
 */
export function assertUsableOfflineBundle(): void {
  if (!existsSync(offlineBundle))
    throw new Error(`dist-offline/ does not exist. Run \`bun run build:offline-bundle\` first.`)

  const entries = readdirSync(offlineBundle)
  if (entries.length === 0)
    throw new Error(`dist-offline/ is empty. Run \`bun run build:offline-bundle\` first.`)

  for (const page of REQUIRED_PAGES) {
    const path = join(offlineBundle, page)
    if (!existsSync(path))
      throw new Error(`dist-offline/${page} is missing — the flows navigate to it. Run \`bun run build:offline-bundle\`.`)
    if (statSync(path).size === 0)
      throw new Error(`dist-offline/${page} is empty.`)
  }

  if (!existsSync(builtSite))
    return

  // Compare against the site it mirrors. A bundle older than dist/ is a bundle
  // that will test last week's app.
  for (const page of REQUIRED_PAGES) {
    const fresh = join(builtSite, page)
    if (!existsSync(fresh))
      continue
    const bundledAt = statSync(join(offlineBundle, page)).mtimeMs
    const builtAt = statSync(fresh).mtimeMs
    if (bundledAt < builtAt - 1000) {
      throw new Error(
        `dist-offline/${page} is older than dist/${page} — the app would be tested against a stale bundle. `
        + `\`bun run build\` does not refresh dist-offline; run \`bun run build:offline-bundle\`.`,
      )
    }
  }
}

function bootedSimulator(preferred?: string): string {
  const listing = run(['xcrun', 'simctl', 'list', 'devices', 'available'])
  const booted = [...listing.matchAll(/^\s*(.+?) \(([0-9A-F-]{36})\) \(Booted\)/gim)]
  if (preferred) {
    const match = booted.find(m => m[1].includes(preferred) || m[2] === preferred)
    if (match)
      return match[2]
    throw new Error(`No booted simulator matching "${preferred}". Booted: ${booted.map(m => m[1]).join(', ') || 'none'}`)
  }
  if (booted.length)
    return booted[0][2]

  // Nothing booted — start the first available iPhone rather than failing.
  const iphone = listing.match(/^\s*(iPhone .+?) \(([0-9A-F-]{36})\) \(Shutdown\)/im)
  if (!iphone)
    throw new Error('No iPhone simulator is available. Install one via Xcode > Settings > Components.')
  run(['xcrun', 'simctl', 'boot', iphone[2]])
  return iphone[2]
}

/**
 * Generate the Xcode project, compile it for the simulator, and install it.
 *
 * `MOBILE_E2E=1` makes `config/mobile.ts` choose `webAssets: 'dist-offline'`
 * with no server at all, so every flow runs against the bundle and none of
 * them depend on the network. That is the point: a suite that needs a server
 * cannot test what happens without one.
 */
function buildAndInstall(deviceId: string): string {
  const generated = join(projectRoot, 'storage/framework/mobile/ios')
  const project = join(generated, 'BenchReview.xcodeproj')

  // Regenerate so the project matches config/mobile.ts and the current bundle.
  run(['./buddy', 'build:ios'], { env: { MOBILE_E2E: '1' } })
  if (!existsSync(project))
    throw new Error(`${project} was not generated.`)

  const derivedData = join(resultsRoot, 'derived-data')
  mkdirSync(derivedData, { recursive: true })
  run([
    'xcodebuild',
    '-project', project,
    '-scheme', 'BenchReview',
    '-destination', `platform=iOS Simulator,id=${deviceId}`,
    '-derivedDataPath', derivedData,
    '-configuration', 'Debug',
    // Signed locally rather than unsigned. An unsigned app carries no
    // entitlements, and without its application-identifier iOS refuses it the
    // Keychain — every stored session would be lost at the next launch. No
    // developer team is needed for this.
    'CODE_SIGN_IDENTITY=-',
    'CODE_SIGN_STYLE=Manual',
    'DEVELOPMENT_TEAM=',
    // Framework workaround. The generated project declares no PRODUCT_NAME, so
    // Xcode resolves the product to a bare `.app` and the build dies with
    // "Multiple commands produce .../.app" — the link step and the
    // create-directory step both claiming the same empty name. Nothing in this
    // repo can fix it at the source: project.yml and project.pbxproj are both
    // written by `./buddy build:ios` under storage/framework/, and regenerating
    // from that spec with XcodeGen reproduces it exactly. A sibling project on
    // a newer framework emits PRODUCT_NAME six times, so this is a generator
    // version gap, not configuration.
    //
    // Overriding it on the command line builds a correct BenchReview.app and
    // survives regeneration, which editing the generated spec would not.
    `PRODUCT_NAME=${PRODUCT}`,
    'build',
  ])

  const app = join(derivedData, `Build/Products/Debug-iphonesimulator/${PRODUCT}.app`)
  if (!existsSync(app))
    throw new Error(`Built app not found at ${app}`)

  run(['xcrun', 'simctl', 'install', deviceId, app])
  return app
}

function appId(): string {
  return process.env.IOS_BUNDLE_ID?.trim() || 'org.benchreview.app'
}

/** Parse Maestro's JUnit output. A run that executed nothing is a failure. */
export function junitSummary(xml: string): { tests: number, failures: number } {
  const tests = Number(xml.match(/tests="(\d+)"/)?.[1] ?? 0)
  const failures = Number(xml.match(/failures="(\d+)"/)?.[1] ?? 0)
    + Number(xml.match(/errors="(\d+)"/)?.[1] ?? 0)
  return { tests, failures }
}

function runFlow(deviceId: string, flow: string): void {
  const slug = flow.replace(/\.yaml$/, '')
  const report = join(resultsRoot, `${slug}.xml`)
  mkdirSync(resultsRoot, { recursive: true })

  run([
    'maestro',
    `--device=${deviceId}`,
    '--no-ansi',
    'test',
    '--env', `APP_ID=${appId()}`,
    '--format', 'junit',
    '--output', report,
    '--test-output-dir', join(resultsRoot, 'tests', slug),
    join(flowRoot, flow),
  ], { allowFailure: true, env: maestroEnvironment() })

  if (!existsSync(report))
    throw new Error(`Maestro wrote no report for ${flow} — it did not run.`)
  const summary = junitSummary(readFileSync(report, 'utf8'))
  if (summary.tests === 0)
    throw new Error(`Maestro ran no tests for ${flow}.`)
  if (summary.failures > 0)
    throw new Error(`${flow}: ${summary.failures} failure(s). See ${join(resultsRoot, 'tests', slug)}.`)
  console.log(`  ✓ ${flow}`)
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const only = args.find(a => a.startsWith('--flow='))?.slice('--flow='.length)
  const device = args.find(a => a.startsWith('--device='))?.slice('--device='.length)

  requireCommand('maestro', 'Install it with: curl -fsSL https://get.maestro.mobile.dev | bash')
  if (!maestroEnvironment().JAVA_HOME && !process.env.JAVA_HOME)
    throw new Error('Maestro needs a JDK and none was found. Install one (brew install openjdk@17) or set JAVA_HOME.')
  requireCommand('xcrun', 'Install Xcode and its command line tools.')

  assertUsableOfflineBundle()

  const deviceId = bootedSimulator(device)
  console.log(`\n  iOS e2e — simulator ${deviceId}, app ${appId()}\n`)

  if (!args.includes('--no-build')) {
    console.log('  building and installing…')
    buildAndInstall(deviceId)
  }

  // `pending-*` flows document a gap that is real and not yet fixed. They are
  // kept in the repo — deleting them loses the evidence — but skipped by
  // default so the suite stays green on what works, and a red suite always
  // means a regression rather than a known bug.
  const includePending = args.includes('--include-pending')
  const flows = readdirSync(flowRoot)
    .filter(f => f.endsWith('.yaml'))
    .filter(f => includePending || !f.startsWith('pending-'))
    .sort()
  const selected = only ? flows.filter(f => f.includes(only)) : flows
  if (!selected.length)
    throw new Error(`No flow matched "${only}". Available: ${flows.join(', ')}`)

  for (const flow of selected)
    runFlow(deviceId, flow)

  console.log(`\n  all ${selected.length} flow(s) passed — reports in ${resultsRoot}\n`)
}
