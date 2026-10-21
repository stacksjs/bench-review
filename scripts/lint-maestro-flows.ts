import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Static checks on the maestro flows (bench-review#81).
 *
 * Every assertion in the iOS suite is a REGEX matched against an element's
 * whole string, and both halves of that sentence have produced assertions
 * that tested nothing:
 *
 *   - `assertNotVisible: "[object Object]"` is a character CLASS matching one
 *     character out of "objectO ". It passed in one run and failed in the
 *     next without the app changing, which is a dead assertion announcing
 *     itself by luck.
 *   - `visible: "Tap to stop following"` is a FRAGMENT of
 *     "Following X. Tap to stop following.". Anchored, it matches nothing —
 *     so the negatives passed vacuously and the positives burned their
 *     timeout before failing.
 *
 * Both are invisible in a green run, which is what makes them worth a lint
 * rather than a convention. This is cheap and runs with the unit tests; it
 * cannot prove an assertion is MEANINGFUL, only that it is not one of the
 * two shapes that cannot work.
 */

export interface Selector {
  line: number
  value: string
}

export interface Problem {
  flow: string
  line: number
  value: string
  message: string
}

/**
 * Every text selector in a flow, with its line.
 *
 * A TRAILING comment is allowed after the value, and the match ends at the
 * closing quote rather than at the end of the line. Requiring end-of-line
 * made the lint skip `- assertVisible: "x"  # why` entirely — silently, so a
 * selector with a note beside it would have been exempt from every check
 * here. That is the same shape of hole as the assertions this exists to
 * find.
 *
 * The `#` has to be found OUTSIDE the quotes, which is why the quoted value
 * is matched explicitly rather than the line being split on `#` first: a
 * selector may legitimately contain one.
 *
 * Whole-line comments are skipped as well. They are already excluded by the
 * pattern — a leading `#` cannot match it — so this is belt and braces, and
 * the flows do quote these exact strings at length while explaining them.
 */
export function textSelectors(source: string): Selector[] {
  const found: Selector[] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*#/.test(line))
      continue
    const match = line.match(/^\s*-?\s*(?:assertVisible|assertNotVisible|visible|notVisible|text):\s*(?:"([^"]*)"|'([^']*)')\s*(?:#.*)?$/)
    if (match)
      found.push({ line: i + 1, value: match[1] ?? match[2] ?? '' })
  }
  return found
}

/**
 * Whether a selector is MEANT as a regex.
 *
 * `.*` wrappers and a leading `(?i)` are the two deliberate idioms in this
 * suite. Anything else carrying regex punctuation is far likelier to be
 * someone writing a literal and not realising.
 */
export function isDeliberateRegex(value: string): boolean {
  return value.includes('.*') || value.startsWith('(?i)')
}

/**
 * Regex punctuation that silently changes what a selector means.
 *
 * Brackets and braces only: parentheses carry the `(?i)` idiom, and `.` `?`
 * `+` appear in ordinary prose ("Sign in to join this conversation.") where
 * their regex meaning is harmless — `.` matches the literal full stop too.
 * A character class does not have that property: `[object Object]` cannot
 * match the string it spells.
 */
export function unescapedClassChars(value: string): string[] {
  const hits: string[] = []
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (c === '\\') {
      i++
      continue
    }
    if (c === '[' || c === ']' || c === '{' || c === '}')
      hits.push(c)
  }
  return hits
}

/** Does this flow assert anything at all? */
export function hasAnyAssertion(source: string): boolean {
  return /^\s*-?\s*(?:assertVisible|assertNotVisible|assertTrue)\b/m.test(source)
    || /^\s*-\s*extendedWaitUntil:/m.test(source)
}

export function auditFlow(name: string, source: string): Problem[] {
  const problems: Problem[] = []

  if (!hasAnyAssertion(source)) {
    problems.push({
      flow: name,
      line: 1,
      value: '',
      message: 'this flow asserts nothing — it can only fail if a tap errors, which is not a test',
    })
  }

  for (const sel of textSelectors(source)) {
    if (isDeliberateRegex(sel.value))
      continue
    const bad = unescapedClassChars(sel.value)
    if (bad.length) {
      problems.push({
        flow: name,
        line: sel.line,
        value: sel.value,
        message: `unescaped ${bad.join('')} — a text selector is a REGEX, so this is a character class and cannot match the string it spells. Escape it (\\[ \\]) or make the regex intent explicit with .*`,
      })
    }
  }

  return problems
}

export function auditAll(flowRoot: string): Problem[] {
  const problems: Problem[] = []
  for (const file of readdirSync(flowRoot).filter(f => f.endsWith('.yaml')).sort())
    problems.push(...auditFlow(file, readFileSync(join(flowRoot, file), 'utf8')))
  return problems
}

if (import.meta.main) {
  const problems = auditAll(join(process.cwd(), '.maestro/flows'))
  for (const p of problems)
    console.error(`  ${p.flow}:${p.line}  ${p.message}${p.value ? `\n      selector: ${p.value}` : ''}`)
  console.log(problems.length ? `\n  ${problems.length} problem(s)` : '  flows look sound')
  process.exit(problems.length ? 1 : 0)
}
