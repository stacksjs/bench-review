import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

interface AppContract {
  domain: string
  minPages: number
  routes: Record<string, string[]>
}

const CONTRACTS: Record<string, AppContract> = {
  // bench-review. Markers are chosen to survive the coming-soon -> launched
  // transition: `/` is served by the coming-soon gate today (title "Coming
  // Soon - Bench Review") and by home.stx once that gate lifts, so the brand
  // name is the only stable assertion for it. The other three assert their
  // <h1>, which is real page content rather than chrome.
  'bench-review': {
    domain: 'benchreview.org',
    minPages: 35,
    routes: {
      '/': ['Bench Review'],
      '/judges': ['Judicial Directory'],
      '/login': ['Welcome back'],
      '/register': ['Create your account'],
    },
  },
  analyticshq: {
    domain: 'analyticshq.org',
    minPages: 30,
    routes: {
      '/': ['analyticshq'],
      '/compare/matomo': ['analyticshq vs Matomo', 'Point for point.'],
      '/login': ['analyticshq'],
    },
  },
  bughq: {
    domain: 'bughq.org',
    minPages: 25,
    routes: {
      '/': ['Error tracking for people who ship.', 'From throw to triaged'],
      '/login': ['bughq'],
      '/dashboard': ['bughq'],
    },
  },
  commshq: {
    domain: 'commshq.org',
    minPages: 45,
    routes: {
      '/': ['Grow an audience worth knowing.', 'From first hello to favorite customer.'],
      '/login': ['CommsHQ'],
      '/dashboard/commshq': ['CommsHQ'],
    },
  },
  loghq: {
    domain: 'loghq.org',
    minPages: 30,
    routes: {
      '/': ['Your logs, finally worth reading.', 'From scattered log files to one live stream.'],
      '/login': ['loghq'],
      '/compare/sentry': ['loghq', 'Sentry'],
    },
  },
  reportshq: {
    domain: 'reportshq.org',
    minPages: 20,
    routes: {
      '/': ['Reports that build themselves', 'Three steps, and you write none of the reporting'],
      '/login': ['ReportsHQ'],
      '/pricing': ['ReportsHQ'],
    },
  },
  status: {
    domain: 'statushq.org',
    minPages: 35,
    routes: {
      '/': ['Know the moment', 'One dashboard for uptime, SSL, DNS, and status.'],
      '/login': ['Welcome back'],
      '/register': ['Create your account'],
    },
  },
}

const projectRoot = resolve(import.meta.dir, '..')
const distRoot = resolve(projectRoot, 'dist')
const ssrRoot = resolve(projectRoot, '.output')
const ssrPages = resolve(ssrRoot, 'server/pages')
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as { name?: string }
const packageName = String(packageJson.name || '')
const directoryName = projectRoot.split('/').pop() || ''
const appName = CONTRACTS[packageName] ? packageName : directoryName
const contract = CONTRACTS[appName]

if (!contract)
  throw new Error(`No release contract is configured for package ${appName || '(unnamed)'}.`)

const isSsr = existsSync(ssrPages)
if (!existsSync(distRoot) && !isSsr)
  throw new Error('No production artifact found. Run bun run build first.')

function walkFiles(directory: string): string[] {
  if (!existsSync(directory)) return []
  const files: string[] = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) files.push(...walkFiles(path))
    else files.push(path)
  }
  return files
}

function routeArtifact(route: string): { html: string, source: string } | undefined {
  if (!isSsr) {
    const direct = route === '/' ? join(distRoot, 'index.html') : join(distRoot, `${route.slice(1)}.html`)
    const nested = join(distRoot, route.slice(1), 'index.html')
    const source = existsSync(direct) ? direct : existsSync(nested) ? nested : undefined
    return source ? { html: readFileSync(source, 'utf8'), source } : undefined
  }

  const name = route === '/' ? 'index' : route.slice(1).replaceAll('/', '-')
  const source = join(ssrPages, `${name}.compiled.json`)
  if (!existsSync(source)) return undefined
  const compiled = JSON.parse(readFileSync(source, 'utf8')) as { html?: string }
  return { html: compiled.html || '', source }
}

const pageFiles = isSsr
  ? walkFiles(ssrPages).filter(path => path.endsWith('.compiled.json'))
  : walkFiles(distRoot).filter(path => path.endsWith('.html'))

const failures: string[] = []
if (pageFiles.length < contract.minPages)
  failures.push(`artifact contains ${pageFiles.length} pages; expected at least ${contract.minPages}`)

const publicRoot = isSsr ? join(ssrRoot, 'public') : distRoot
for (const [route, expectedText] of Object.entries(contract.routes)) {
  const artifact = routeArtifact(route)
  if (!artifact) {
    failures.push(`${route}: production artifact is missing`)
    continue
  }

  const withoutCode = artifact.html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
  const visibleText = withoutCode.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  for (const fragment of expectedText) {
    if (!visibleText.includes(fragment))
      failures.push(`${route}: expected text is missing: ${fragment}`)
  }
  if (/@(if|foreach|forelse)\b/.test(visibleText))
    failures.push(`${route}: unresolved template syntax is visible`)
  if (/<h[12]\b[^>]*>\s*<\/h[12]>/i.test(withoutCode))
    failures.push(`${route}: an empty primary heading was emitted`)
  if (/\b(?:AWS_SECRET_ACCESS_KEY|DB_PASSWORD|STRIPE_SECRET_KEY)\s*[:=]\s*["']?[^\s"'<]{4,}/i.test(artifact.html))
    failures.push(`${route}: a secret-shaped assignment was emitted`)

  const assetPattern = /(?:src|href)=["'](\/[^"'?#]+)["']/gi
  let match: RegExpExecArray | null
  while ((match = assetPattern.exec(artifact.html))) {
    const assetPath = match[1]
    const looksLikeAsset = extname(assetPath) !== '' || assetPath.startsWith('/_stx/') || assetPath.startsWith('/__stx/')
    if (!looksLikeAsset) continue
    const local = resolve(publicRoot, `.${assetPath}`)
    if (!local.startsWith(`${publicRoot}/`) || !existsSync(local))
      failures.push(`${route}: referenced asset is missing: ${assetPath}`)
  }
}

for (const metadataFile of ['sitemap.xml', 'robots.txt']) {
  const path = join(publicRoot, metadataFile)
  if (!existsSync(path)) {
    failures.push(`${metadataFile}: missing from production artifact`)
    continue
  }
  const contents = readFileSync(path, 'utf8')
  if (contents.includes('http://localhost')) failures.push(`${metadataFile}: contains a localhost production URL`)
  if (!contents.includes(contract.domain)) failures.push(`${metadataFile}: does not name ${contract.domain}`)
}

const migrationsDir = resolve(projectRoot, 'database/migrations')
if (existsSync(migrationsDir)) {
  for (const file of readdirSync(migrationsDir).sort()) {
    const path = join(migrationsDir, file)
    if (!statSync(path).isFile()) continue
    if (readFileSync(path, 'utf8').trim().length === 0) failures.push(`migration is empty: ${file}`)
    const sql = readFileSync(path, 'utf8')
    if (/^(<{7}|={7}|>{7})/m.test(sql)) failures.push(`migration contains a merge marker: ${file}`)
  }
}

if (isSsr && failures.length === 0) {
  const { startProductionServer } = await import('@stacksjs/stx')
  const port = 42_000 + Math.floor(Math.random() * 8_000)
  const server = await startProductionServer({ outputDir: ssrRoot, port })
  try {
    for (const route of Object.keys(contract.routes)) {
      const response = await fetch(`http://127.0.0.1:${server.port}${route}`)
      const body = await response.text()
      if (!response.ok) failures.push(`${route}: production server returned ${response.status}`)
      if (!body.toLowerCase().includes(appName.toLowerCase())) failures.push(`${route}: production server response is not the expected application`)
    }
  }
  finally {
    server.stop()
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Validated ${pageFiles.length} production pages, ${Object.keys(contract.routes).length} smoke routes, metadata, assets, migrations, and ${isSsr ? 'the SSR server' : 'the SSG artifact'}.`)
