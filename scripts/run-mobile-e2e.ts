import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { DEFAULT_PORT } from './mobile-e2e-api'
import { resolveMobileServer, serverArgument } from './mobile-target'

/**
 * End-to-end run of the iOS app against a simulator (bench-review#81).
 *
 * The web conformance gate validates the built `dist/`, which the SITE serves.
 * Nothing exercises the app: that it launches, that its screens reach the API,
 * that a link routes to the right one, or that an outage is reported as an
 * outage rather than as an empty directory. The last is the one most worth
 * covering, because it only happens once something else has already broken.
 *
 * ## This suite tests a NATIVE app, and that changed what it needs
 *
 * It used to test a web view over a bundled copy of the site, so it needed no
 * server at all: `MOBILE_E2E=1` selected `dist-offline` and every flow ran
 * against the bundle. Under `renderer: 'native'` the framework refuses both
 * `webAssets` and `fallbackWebAssets` — there is no web view to show them in —
 * so the app's content comes over HTTP from whatever `MOBILE_URL` named at
 * BUILD time, and `MOBILE_E2E` no longer selects anything.
 *
 * So the run owns a server instead: `scripts/mobile-e2e-api.ts`, on its own
 * port, with fixed data. Flows tagged `offline` are run with it STOPPED, which
 * is what being offline means for an app whose every screen is a fetch.
 * `./buddy dev` is left alone — it belongs to whoever is running it, and a
 * suite that killed it would be taking their work away mid-run.
 *
 * iOS only, deliberately. `config/mobile.ts` declares `deviceFamilies:
 * ['iphone']` and there is no Android configuration in this project, so an
 * Android arm would be dead code pretending to be coverage.
 */

const projectRoot = resolve(import.meta.dir, '..')
const flowRoot = join(projectRoot, '.maestro/flows')
const resultsRoot = join(projectRoot, 'storage/framework/runtime/e2e/ios')
const nativeScreens = join(projectRoot, 'resources/native')
const nativeBundle = join(projectRoot, 'storage/framework/mobile/ios/native-screens.js')

/**
 * Where the app opens, which under `renderer: 'native'` must BE one of the
 * `nativeScreens` — the framework refuses the build otherwise. Kept in step
 * with `config/mobile.ts`, whose own default is the same path.
 */
const START_PATH = '/reviews'

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
 * Refuse to run against a native bundle that is missing, empty, or older than
 * the screens it was compiled from.
 *
 * This replaced a `dist-offline/` check that no longer means anything: the
 * native app ships no web pages. What it does ship is every screen in
 * `resources/native`, compiled — and that CAN go stale the same way, because
 * only `build:ios` recompiles them.
 *
 * Checked at `storage/framework/mobile/ios/native-screens.js`, which is what
 * `./buddy build:ios` writes and what gets copied into the app bundle as
 * `dist/native-screen.js`. NOT at `dist/native-screen.js` in the project: that
 * copy only appears when the full `bun run build:ios` has also built the site,
 * so a guard on it fails a perfectly good iOS-only build.
 *
 * It matters most under `--no-build`, which is the flag someone reaches for
 * while iterating on flows, and therefore exactly when they are most likely
 * to be testing yesterday's screens and reading the result as today's.
 */
export function assertUsableNativeBundle(): void {
  if (!existsSync(nativeBundle))
    throw new Error(`${nativeBundle} does not exist — the app has no screens to draw. Run \`./buddy build:ios\`.`)

  if (statSync(nativeBundle).size === 0)
    throw new Error(`${nativeBundle} is empty. Run \`./buddy build:ios\`.`)

  if (!existsSync(nativeScreens))
    return

  const builtAt = statSync(nativeBundle).mtimeMs
  const newest = readdirSync(nativeScreens)
    .filter(f => f.endsWith('.stx'))
    .map(f => ({ file: f, at: statSync(join(nativeScreens, f)).mtimeMs }))
    .sort((a, b) => b.at - a.at)[0]

  if (newest && newest.at > builtAt + 1000) {
    throw new Error(
      `resources/native/${newest.file} is newer than the compiled screens — the run would test the previous build of them. `
      + `\`bun run build\` does not recompile them; run \`./buddy build:ios\`.`,
    )
  }
}

/**
 * Whether a flow asks to be run with the server stopped.
 *
 * Read from the flow's own `tags:` rather than from a list of filenames here,
 * so a flow carries its own requirement and renaming one cannot quietly turn
 * the offline test into an online one that passes.
 */
export function wantsOfflineServer(flowSource: string): boolean {
  // Front matter only — everything before the `---` that opens the steps.
  const frontMatter = flowSource.split(/^---\s*$/m)[0] ?? ''
  const lines = frontMatter.split('\n')
  const start = lines.findIndex(line => /^tags:\s*$/.test(line))
  if (start === -1)
    return false
  for (const line of lines.slice(start + 1)) {
    // The list ends at the first line that is not one of its items.
    if (!/^\s+-\s*\S/.test(line))
      return false
    if (/^\s+-\s*offline\s*$/.test(line))
      return true
  }
  return false
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
 * `server` is baked in: `config/mobile.ts` reads `MOBILE_URL` and the
 * generated `craft.config.json` carries it as `devServerURL`, which is what
 * `apiBase()` calls at runtime. It cannot be changed afterwards, so a build
 * pointed at the wrong place has to be rebuilt — which is why
 * `resolveMobileServer` refuses the bad values up front rather than letting
 * the app open on a dead host and look merely empty.
 *
 * The path matters as well as the origin: under `renderer: 'native'` the start
 * path has to BE one of the `nativeScreens`, and the framework refuses the
 * build otherwise.
 */
function buildAndInstall(deviceId: string, server: string): string {
  const generated = join(projectRoot, 'storage/framework/mobile/ios')
  const project = join(generated, 'BenchReview.xcodeproj')

  // Regenerate so the project matches config/mobile.ts and the current bundle.
  run(['./buddy', 'build:ios'], { env: { MOBILE_URL: `${server}${START_PATH}` } })
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

  // `--server` points the build somewhere else — `./buddy dev`, or a deployed
  // host — which is useful for looking at the app by hand. The FLOWS assert
  // the fixture's own data, so they will fail against anything else, loudly
  // and on the first assertion rather than by passing against whoever happens
  // to sort first.
  const chosen = serverArgument(args) ?? process.env.MOBILE_URL
  const ownServer = !chosen
  const server = resolveMobileServer(chosen ?? `http://localhost:${DEFAULT_PORT}`, 'simulator')
  if (!ownServer)
    console.log(`\n  ⚠️  --server given: flows that assert fixture data will fail against ${server}`)

  const deviceId = bootedSimulator(device)
  console.log(`\n  iOS e2e — simulator ${deviceId}, app ${appId()}, server ${server}\n`)

  // A SEPARATE PROCESS, not `Bun.serve` in this one.
  //
  // Everything this script runs — xcodebuild, simctl, maestro — goes through
  // `Bun.spawnSync`, which blocks the event loop until the child exits. An
  // in-process server shares that loop, so it would accept nothing for the
  // whole of a maestro run: the app would find the port dead and every flow
  // would assert against an offline screen. Measured, not guessed — the first
  // version did exactly this and flow 01 waited out its 90 seconds.
  let fixture: ReturnType<typeof Bun.spawn> | undefined

  const reachable = (): boolean => Bun.spawnSync([
    'curl', '--silent', '--fail', '--max-time', '1', '--output', '/dev/null',
    `http://localhost:${DEFAULT_PORT}/api/judges`,
  ]).success

  const startFixture = (): void => {
    if (!ownServer || fixture)
      return
    // Somebody else is already on the port. Carrying on would be worse than
    // stopping: the readiness check below would pass against THEIR server,
    // the run would test data this suite does not control, and the offline
    // flow would stop a child that was never serving while the real one kept
    // answering — a green offline test asserting nothing. Hit exactly that.
    if (reachable())
      throw new Error(`Something is already serving port ${DEFAULT_PORT}. Stop it, or pass --server to use it deliberately.`)

    fixture = Bun.spawn(['bun', join(projectRoot, 'scripts/mobile-e2e-api.ts')], {
      cwd: projectRoot,
      env: { ...process.env, MOBILE_E2E_PORT: String(DEFAULT_PORT) } as Record<string, string>,
      stdout: 'ignore',
      stderr: 'inherit',
    })
    // Ready before anything depends on it. A flow starts within seconds of the
    // install and the app fetches on its first frame.
    for (let attempt = 0; attempt < 50; attempt++) {
      if (reachable())
        return
      if (fixture.exitCode !== null)
        throw new Error(`The fixture API exited immediately (code ${fixture.exitCode}). Its error is above.`)
      Bun.sleepSync(100)
    }
    throw new Error(`The fixture API did not come up on port ${DEFAULT_PORT}.`)
  }

  const stopFixture = (): void => {
    if (!fixture)
      return
    fixture.kill()
    fixture = undefined
    // Gone before the flow starts, or the first screen of an "offline" run
    // gets a real answer and the flow asserts the wrong state.
    for (let attempt = 0; attempt < 50 && reachable(); attempt++)
      Bun.sleepSync(100)
  }

  startFixture()

  try {
    if (!args.includes('--no-build')) {
      console.log('  building and installing…')
      buildAndInstall(deviceId, server)
    }

    assertUsableNativeBundle()

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

    for (const flow of selected) {
      const offline = wantsOfflineServer(readFileSync(join(flowRoot, flow), 'utf8'))
      if (offline && !ownServer) {
        // Someone else's server. Stopping it is not ours to do, and running
        // the flow with it up would assert an offline state that never comes.
        console.log(`  – ${flow} skipped: it needs the server stopped, and --server is not ours to stop`)
        continue
      }
      if (offline) {
        stopFixture()
      }
      else {
        // A FRESH fixture for every flow, not just the first.
        //
        // Its state is in memory and mutable — likes, follows, posted
        // comments, which judges have been reviewed — so without this the
        // flows are coupled through it and the suite's result depends on the
        // order it happens to run in. Measured: 08 posts a comment to review
        // 1000, and 10 then found three comments on a review the fixture
        // seeds with two. 10 was right and the isolation was missing.
        //
        // Cheap: a child process and a readiness poll, about a second each.
        // `stopFixture` already waits for the port to go quiet, so this
        // cannot race the new one onto a port the old one still holds.
        stopFixture()
        startFixture()
      }
      runFlow(deviceId, flow)
    }

    console.log(`\n  all ${selected.length} flow(s) passed — reports in ${resultsRoot}\n`)
  }
  finally {
    stopFixture()
  }
}
