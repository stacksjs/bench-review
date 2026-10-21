import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { auditAll, auditFlow, hasAnyAssertion, isDeliberateRegex, textSelectors, unescapedClassChars } from '../../scripts/lint-maestro-flows'

/**
 * The flow lint, checked against the two assertions that actually shipped
 * broken (bench-review#81).
 *
 * Both were invisible in a green run. That is the whole case for a lint: a
 * convention cannot catch a mistake whose symptom is a passing test.
 */

const FLOWS = join(import.meta.dir, '../../.maestro/flows')

describe('the specimens this exists for', () => {
  test('a character class that cannot match the string it spells', () => {
    // Verbatim from 08-post-comment, which passed in one run and failed in
    // the next with no code change in between.
    const flow = `appId: x\n---\n- assertNotVisible: "[object Object]"\n`
    const [problem] = auditFlow('08.yaml', flow)
    expect(problem?.message).toMatch(/character class/i)
    expect(problem?.line).toBe(3)
  })

  test('escaping it is accepted', () => {
    const flow = `appId: x\n---\n- assertNotVisible: '\\[object Object\\]'\n`
    expect(auditFlow('08.yaml', flow)).toEqual([])
  })

  test('a flow that asserts nothing is not a test', () => {
    const flow = `appId: x\n---\n- launchApp\n- tapOn:\n    id: "thing"\n`
    expect(auditFlow('x.yaml', flow)[0]?.message).toMatch(/asserts nothing/i)
  })
})

describe('what it must NOT flag', () => {
  test('the deliberate regex idioms this suite uses', () => {
    expect(isDeliberateRegex('(?i)25 judges')).toBe(true)
    expect(isDeliberateRegex('.*Alder & Co.*')).toBe(true)
    // Ordinary prose with a full stop: `.` matches the literal too, so the
    // regex meaning is harmless and flagging it would be noise.
    expect(unescapedClassChars('Sign in to join this conversation.')).toEqual([])
  })

  test('a bracket that is already escaped', () => {
    expect(unescapedClassChars('\\[object Object\\]')).toEqual([])
  })

  test('braces are caught too, since a quantifier silently changes meaning', () => {
    expect(unescapedClassChars('a{2}')).toEqual(['{', '}'])
  })
})

describe('reading a flow', () => {
  test('selectors are found in every spelling the flows use', () => {
    const flow = [
      'appId: x', '---',
      '- assertVisible: "one"',
      '- assertNotVisible: \'two\'',
      '- extendedWaitUntil:',
      '    visible: "three"',
      '    timeout: 1000',
      '- assertVisible:',
      '    text: "four"',
      '',
    ].join('\n')
    expect(textSelectors(flow).map(s => s.value)).toEqual(['one', 'two', 'three', 'four'])
  })

  test('a selector with a NOTE beside it is still checked', () => {
    // Requiring end-of-line after the value made the lint skip these
    // entirely — so a selector with a comment next to it was exempt from
    // every check here, silently. Found by trying to break the lint and
    // discovering the test for it could not fail.
    const flow = `appId: x\n---\n- assertNotVisible: "[nope]"  # with a note\n`
    expect(textSelectors(flow).map(s => s.value)).toEqual(['[nope]'])
    expect(auditFlow('x.yaml', flow)[0]?.message).toMatch(/character class/i)
  })

  test('a whole-line comment is not mistaken for a selector', () => {
    // The flows quote these exact strings while explaining them; 08 names
    // "[object Object]" four times in prose.
    const flow = `appId: x\n---\n# - assertVisible: "[nope]"\n- assertVisible: "fine"\n`
    expect(textSelectors(flow).map(s => s.value)).toEqual(['fine'])
  })

  test('an extendedWaitUntil counts as asserting something', () => {
    expect(hasAnyAssertion('- extendedWaitUntil:\n    visible: "x"\n')).toBe(true)
    expect(hasAnyAssertion('- tapOn:\n    id: "x"\n')).toBe(false)
  })
})

describe('the suite in this repo', () => {
  test('every flow passes the lint', () => {
    const problems = auditAll(FLOWS)
    expect(problems.map(p => `${p.flow}:${p.line} ${p.message}`)).toEqual([])
  })

  test('and the lint is actually looking at them', () => {
    // A guard that silently found no files would also report no problems.
    const flows = readFileSync(join(FLOWS, '08-post-comment.yaml'), 'utf8')
    expect(textSelectors(flows).length).toBeGreaterThan(5)
  })
})
