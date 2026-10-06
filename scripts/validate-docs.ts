import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const root = process.cwd()
const docsDir = resolve(root, 'docs')
const configPath = resolve(root, 'config/docs.ts')
const issues = new Set<string>()
const incomingRoutes = new Set<string>()
const appRoutePrefixes = ['/api', '/account', '/dashboard', '/login', '/pricing', '/register', '/reports', '/status']

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? markdownFiles(path) : path.endsWith('.md') ? [path] : []
  })
}

function proseOnly(text: string): string {
  let inFence = false
  return text.split('\n').filter((line) => {
    if (/^(?:```|~~~)/.test(line)) {
      inFence = !inFence
      return false
    }
    return !inFence
  }).join('\n')
}

function routeForFile(file: string): string {
  const path = relative(docsDir, file).replace(/\\/g, '/')
  if (path === 'index.md') return '/'
  return `/${path.replace(/(?:\/index)?\.md$/, '')}`
}

function resolveDocTarget(source: string, rawTarget: string): string | null {
  let target = rawTarget.replace(/^<|>$/g, '').split(/[?#]/, 1)[0]
  if (!target || /^(?:[a-z]+:|#|mailto:|tel:)/i.test(rawTarget)) return null

  if (target === '/docs') target = '/'
  else if (target.startsWith('/docs/')) target = target.slice('/docs'.length)

  const base = target.startsWith('/') ? resolve(docsDir, `.${target}`) : resolve(dirname(source), target)
  const candidates = [base, `${base}.md`, join(base, 'index.md')]
  const found = candidates.find(candidate => existsSync(candidate) && statSync(candidate).isFile())
  if (found) return found
  if (target.startsWith('/') && appRoutePrefixes.some(prefix => target === prefix || target.startsWith(`${prefix}/`))) return null
  return ''
}

function checkTarget(source: string, rawTarget: string): void {
  const target = resolveDocTarget(source, rawTarget)
  if (target === null) return
  if (target === '') {
    issues.add(`${relative(root, source)}: missing local target ${rawTarget}`)
    return
  }
  if (target.startsWith(docsDir)) incomingRoutes.add(routeForFile(target))
}

if (!existsSync(docsDir)) {
  console.error('Documentation directory does not exist: docs/')
  process.exit(1)
}

const files = markdownFiles(docsDir)
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const prose = proseOnly(text)
  const name = relative(root, file)
  const headings = prose.match(/^#\s+\S.*$/gm) ?? []
  const homeLayout = /^layout:\s*home\s*$/m.test(text)

  if (headings.length !== 1 && !(homeLayout && headings.length === 0)) {
    issues.add(`${name}: expected one H1, found ${headings.length}`)
  }

  const fences = text.match(/^(?:```|~~~)/gm) ?? []
  if (fences.length % 2 !== 0) issues.add(`${name}: unbalanced fenced code blocks`)
  if (/[—–]/.test(prose)) issues.add(`${name}: contains a prohibited long dash`)
  if (/\b(?:TODO|TBD|FIXME|XXX)\b/.test(prose)) issues.add(`${name}: contains an unfinished marker`)

  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) checkTarget(file, match[1])
  for (const match of prose.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) checkTarget(file, match[1])
}

if (existsSync(configPath)) {
  const config = readFileSync(configPath, 'utf8')
  for (const match of config.matchAll(/\blink:\s*['"]([^'"]+)['"]/g)) checkTarget(configPath, match[1])
}

for (const file of files) {
  const route = routeForFile(file)
  if (route !== '/' && !incomingRoutes.has(route)) {
    issues.add(`${relative(root, file)}: not linked from navigation or another documentation page`)
  }
}

console.log(`Validated ${files.length} documentation pages.`)
if (issues.size > 0) {
  for (const issue of [...issues].sort()) console.error(`- ${issue}`)
  process.exit(1)
}
