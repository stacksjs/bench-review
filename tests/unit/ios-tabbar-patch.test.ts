import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { CORNER_RADIUS, patchTabBarHighlight } from '../../scripts/patch-ios-tabbar'

/**
 * Squaring the tab bar's selection highlight (craft-native/craft#386).
 *
 * The patch runs against GENERATED Swift that `./buddy build:ios` rewrites in
 * full, so the thing worth testing is that it changes the highlight and
 * NOTHING else — and that it fails loudly rather than quietly doing nothing
 * when upstream moves the code.
 */

// The shape of the generated file, trimmed to the parts that matter.
const GENERATED = `
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.35), lineWidth: 0.5))
        }
        ForEach(tabs) { tab in
            Button {
                select(tab)
            } label: {
                VStack {
                    Text(tab.title)
                        .minimumScaleFactor(0.8)
                }
                .foregroundStyle(isSelected ? selectedColor : Color.primary)
                .frame(maxWidth: .infinity, minHeight: 54)
                .background {
                    if isSelected {
                        Capsule()
                            .fill(Color.primary.opacity(0.09))
                            .matchedGeometryEffect(id: "selection", in: selection)
                    }
                }
                .contentShape(Capsule())
            }
            .badge {
                Text("3").background(Capsule().fill(Color.red))
            }
        }
`

describe('squaring the selection highlight', () => {
  test('the highlight becomes a rounded rectangle at the asked-for radius', () => {
    // 6pt is crosswind's rounded-md (0.375rem), which is what was asked for.
    expect(CORNER_RADIUS).toBe(6)
    const { source, changed } = patchTabBarHighlight(GENERATED)
    expect(changed).toBe(true)
    expect(source).toContain('RoundedRectangle(cornerRadius: 6, style: .continuous)\n                            .fill(Color.primary.opacity(0.09))')
  })

  test('the ANIMATION survives, which is what makes this cheap', () => {
    // matchedGeometryEffect is what slides the highlight between tabs. If the
    // swap dropped it the highlight would jump, and squaring the corners
    // would stop being a one-line change.
    const { source } = patchTabBarHighlight(GENERATED)
    expect(source).toContain('.matchedGeometryEffect(id: "selection", in: selection)')
  })

  test('the TAPPABLE region follows the drawn shape', () => {
    // Otherwise the corners keep accepting taps the highlight no longer
    // covers — a half-change that is invisible until someone taps a corner.
    const { source } = patchTabBarHighlight(GENERATED)
    expect(source).toContain('.contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))')
    expect(source).not.toContain('.contentShape(Capsule())')
  })

  test("the BAR's own capsule is left alone", () => {
    // The bar is a pill because that is the iOS 26 Liquid Glass tab bar, and
    // it is correct. Replacing every Capsule() in the file would square off
    // the whole bar — which is the obvious wrong way to write this patch.
    const { source } = patchTabBarHighlight(GENERATED)
    expect(source).toContain('.background(.ultraThinMaterial, in: Capsule())')
    expect(source).toContain('.overlay(Capsule().strokeBorder(Color.white.opacity(0.35), lineWidth: 0.5))')
  })

  test('the badge is left alone too', () => {
    const { source } = patchTabBarHighlight(GENERATED)
    expect(source).toContain('Capsule().fill(Color.red)')
  })

  test('running it twice is not an error and changes nothing the second time', () => {
    // `build:ios` regenerates and re-patches; a second run over an already
    // patched file must be a no-op rather than a throw.
    const once = patchTabBarHighlight(GENERATED)
    const twice = patchTabBarHighlight(once.source)
    expect(twice.changed).toBe(false)
    expect(twice.source).toBe(once.source)
  })

  test('it FAILS when upstream changes the highlight, rather than doing nothing', () => {
    // The whole reason this is a script and not a hand-patch is that a silent
    // revert is the worst outcome. If craft#386 lands, or the code is
    // refactored, the build should say so.
    const moved = GENERATED.replace('.fill(Color.primary.opacity(0.09))', '.fill(Color.accentColor.opacity(0.12))')
    expect(() => patchTabBarHighlight(moved)).toThrow(/craft#386|expected shape/i)
  })
})

describe('the build the suite installs', () => {
  const runner = readFileSync(join(import.meta.dir, '../../scripts/run-mobile-e2e.ts'), 'utf8')

  // ⚠️ THE DEFECT THIS EXISTS FOR. The tab bar patch rewrites generated Swift,
  // and the runner spawns `./buddy build:ios` directly rather than going
  // through the `build:ios` npm script that chains the patch on. So the patch
  // ran on nobody's machine for the path that actually installs the app: the
  // squared highlight was committed and unit-tested, and the simulator kept
  // showing craft's capsule through three rounds of reporting it.
  //
  // Testing the transform is not testing the delivery. This tests delivery.
  // ⚠️ MATCH RUNNING CODE, NOT TEXT. The first version of this searched the
  // whole file for the call and passed against a COMMENTED-OUT one — exactly
  // the vacuous-assertion trap the flow linter exists for, reproduced here
  // while falsifying it. Comment lines are dropped before anything is matched.
  const live = runner.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
  const lineOf = (needle: string): number => live.findIndex(l => l.includes(needle))

  test('patches the generated swift before compiling it', () => {
    const generate = lineOf('\'build:ios\'')
    const patch = lineOf('patchTabBar(projectRoot)')
    const compile = lineOf('\'xcodebuild\'')

    expect(generate).toBeGreaterThan(-1)
    expect(patch).toBeGreaterThan(-1)
    expect(compile).toBeGreaterThan(-1)
    // Generation writes the file, the patch rewrites it, xcodebuild reads it.
    // Any other order compiles the stock shape.
    expect(patch).toBeGreaterThan(generate)
    expect(compile).toBeGreaterThan(patch)
  })
})
