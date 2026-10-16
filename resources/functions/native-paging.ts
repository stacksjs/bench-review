/**
 * Numbered pagination for the native screens (bench-review#79).
 *
 * Prev / 1 2 … N / Next, the same shape the web directory draws
 * (`Bench/Judge/JudgeDirectory.stx`) — not load-more and not infinite scroll.
 * A reader who wants the judge they saw yesterday can go back to page 4; an
 * infinite list makes them scroll for it and loses the position on every
 * return to the screen.
 *
 * The numbers are computed here rather than in each screen so the two
 * directories cannot drift into different pagers.
 */

export interface PageItem {
  /** Page number; 0 for the gap marker, which is not a destination. */
  n: number
  label: string
  gap: boolean
  active: boolean
}

/** Rows per page. Smaller than the web's 12 is pointless on a phone; larger scrolls forever. */
export const PAGE_SIZE = 25

export function lastPageOf(total: number, size: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}

/** The slice of `items` belonging to `page`, clamped so an out-of-range page is not blank. */
export function pageSlice<T>(items: T[], page: number, size: number = PAGE_SIZE): T[] {
  const last = lastPageOf(items.length, size)
  const current = Math.max(1, Math.min(page, last))
  const start = (current - 1) * size
  return items.slice(start, start + size)
}

/**
 * The pager's buttons: first page, a window around the current one, last page,
 * with `…` where numbers were skipped. Identical to the web's `buildPages` so
 * the two surfaces page the same way.
 *
 * Returns an empty list for a single page — a pager that cannot go anywhere is
 * noise.
 */
export function buildPages(current: number, last: number): PageItem[] {
  if (last <= 1)
    return []
  const cur = Math.max(1, Math.min(current, last))
  const out: PageItem[] = []
  const page = (n: number): void => void out.push({ n, label: String(n), gap: false, active: n === cur })
  const gap = (): void => void out.push({ n: 0, label: '…', gap: true, active: false })
  const lo = Math.max(2, cur - 1)
  const hi = Math.min(last - 1, cur + 1)

  page(1)
  if (lo > 2)
    gap()
  for (let n = lo; n <= hi; n++)
    page(n)
  if (hi < last - 1)
    gap()
  page(last)
  return out
}
