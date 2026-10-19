/**
 * How the phone's native screens look (bench-review#79).
 *
 * Apple's own grouped style, so the app feels like the apps around it rather
 * than like a web page in a frame. One vocabulary for every screen in
 * `resources/native`, bound with `:class="ui.group"` and the like, so the
 * screens cannot drift apart from each other.
 *
 * The accent is bench's blue (`project_bench_frontdoor_gavel_blue` — blue-600
 * on the web, #2563eb), not Apple's system blue, so the native app and the
 * site are recognisably the same product. Everything else is the system's:
 * the grouped background, white or #1c1c1e inset groups with 10pt corners,
 * 13pt uppercase section headers, rows at least 44pt tall, hairline
 * separators inset to where the text starts, and the system greys.
 *
 * Light and dark are each Apple's own, not a tint of the other. Note the web
 * site renders light-only (gate check 20 pins a `color-scheme: light` meta
 * precisely because it has no dark variants) — the native screens CAN follow
 * the system, because they are not that stylesheet.
 */
export const ui = {
  /** The whole screen: systemGroupedBackground. */
  screen: 'flex-1 bg-[#f2f2f7] dark:bg-black',
  /** A section's header, above a group. */
  header: 'mb-1.5 mt-7 mx-8 text-[13px] text-[#6e6e73] uppercase dark:text-[#98989d]',
  /** A note under a group. */
  footer: 'mt-1.5 mx-8 text-[13px] text-[#6e6e73] dark:text-[#98989d]',
  /** An inset grouped section. */
  group: 'overflow-hidden mx-4 bg-white dark:bg-[#1c1c1e] rounded-[10px]',
  /** A group holding a block of content rather than rows. */
  card: 'mx-4 p-4 bg-white dark:bg-[#1c1c1e] rounded-[10px]',
  /** A row in a group. */
  row: 'flex-row gap-3 items-center px-4 py-2.5 min-h-[44px]',
  /** The hairline between rows, inset to where their text starts. */
  separator: 'ml-4 h-[0.5px] bg-[#c6c6c8] dark:bg-[#38383a]',
  /** The same, past a 44pt avatar. */
  separatorAvatar: 'ml-[68px] h-[0.5px] bg-[#c6c6c8] dark:bg-[#38383a]',
  /** A row's main words. */
  title: 'text-[17px] text-black dark:text-white',
  /** A row's main words, emphasised. */
  titleStrong: 'font-semibold text-[17px] text-black dark:text-white',
  /** A line under the title. */
  subtitle: 'text-[15px] text-[#6e6e73] dark:text-[#98989d]',
  /** Small print: a caption, a count, a jurisdiction. */
  caption: 'text-[13px] text-[#6e6e73] dark:text-[#98989d]',
  /**
   * Something went wrong. systemRed, in the shade Apple uses for text rather
   * than for a tap target, so it clears contrast on white. Colour alone never
   * carries the meaning — every use sits in an `accessibilityRole="alert"`
   * and says in words what failed.
   */
  danger: 'text-[15px] text-[#d70015] dark:text-[#ff453a]',
  /** A value at a row's end. */
  value: 'text-[17px] text-[#6e6e73] dark:text-[#98989d]',
  /** A big number in a stat. */
  figure: 'font-semibold text-[22px] text-black dark:text-white',
  /** The disclosure chevron. */
  chevron: 'h-3.5 w-3.5 text-[#c4c4c7] dark:text-[#5b5b5f]',
  /** Something to tap: bench's blue. */
  tint: 'text-[#2563eb] dark:text-[#60a5fa]',
  /** The search field at the top of a list. */
  search: 'flex-row gap-2 items-center mx-4 px-2.5 h-9 bg-[#767680]/12 dark:bg-[#767680]/24 rounded-[10px]',
  /** A judge's initials disc, when there is no photo. */
  avatar: 'items-center justify-center h-11 w-11 bg-[#2563eb] dark:bg-[#1d4ed8] rounded-full',
  avatarText: 'font-semibold text-[15px] text-white',
  /** A placeholder block while the real rows load. */
  skeleton: 'bg-[#e5e5ea] dark:bg-[#2c2c2e] rounded-full',
} as const

/** `Loren A. Smith` -> `LS`. Two letters at most, so the disc never overflows. */
export function initials(name: string | null | undefined): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length)
    return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}
