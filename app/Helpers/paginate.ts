/**
 * Local pagination shim. Returns the canonical Laravel-style paginator
 * shape that the upstream `@stacksjs/orm` paginator (`#1910`) emits —
 * `{ data, current_page, per_page, total, last_page, from, to,
 * has_more_pages, prev_page_url, next_page_url, first_page_url,
 * last_page_url, path }`.
 *
 * Why this exists instead of just calling `Model.paginate(...)`:
 *
 * The upstream pagination umbrella shipped on `stacksjs/stacks` main
 * (commits `0a0534c0d`, `7fc0fa591`, `9e9d527b0`, `b7215361f`,
 * `0ae511f45` per the #1910 close), and we synced those files into
 * `storage/framework/core/orm/src/`. But the runtime wiring is only
 * partially functional in our vendored copy:
 *
 *   - `Model.paginate(perPage, page)` runs but returns bqb's OLD shape
 *     (`{ data, total, page, perPage, lastPage, hasMorePages, isEmpty,
 *     from, to }`) — the canonical adapter isn't intercepting the
 *     direct-on-Model path.
 *   - `Model.where(...).paginate(...)` AND `Model.query().paginate(...)`
 *     both throw `Cannot destructure property 'perPage' from null or
 *     undefined value` — the QB-proxy interception is broken in our
 *     copy, likely because the umbrella commits depend on earlier
 *     infra that we don't have.
 *
 * Drop this file when a fresh `@stacksjs/orm` release lands on npm
 * with the umbrella's wiring intact (or when we do a full framework
 * re-sync from main). Until then, `paginate({ table, where, orderBy })`
 * goes around the ORM entirely and talks to bqb's query builder
 * directly — that path is unbroken.
 */

import { db } from '@stacksjs/database'
import { request as currentRequest } from '@stacksjs/router'

export interface Paginator<T = any> {
  data: T[]
  current_page: number
  per_page: number
  total: number
  last_page: number
  from: number | null
  to: number | null
  has_more_pages: boolean
  prev_page_url: string | null
  next_page_url: string | null
  first_page_url: string
  last_page_url: string
  path: string
}

const DEFAULT_PER_PAGE = 25
const MAX_PER_PAGE = 100

export interface PaginateOptions {
  table: string
  /** Chainable filter, applied to BOTH the count query and the data query. */
  where?: (q: any) => any
  /** Optional ORDER BY clause for the data query (ignored on the count). */
  orderBy?: { column: string, direction?: 'asc' | 'desc' }
  /** Per-page size. If omitted, reads `?per_page=` from the request, clamped to [1, 100], default 25. */
  perPage?: number
  /** 1-indexed page number. If omitted, reads `?page=` from the request, default 1. */
  page?: number
  /** Override the URL path used to build prev/next/first/last URLs. Defaults to the current request path. */
  path?: string
}

interface ResolvedArgs {
  perPage: number
  page: number
  basePath: string
  carryQuery: Record<string, string>
}

function readNumericQuery(req: any, key: string): number | undefined {
  const raw = req?.query?.[key] ?? req?.get?.(key)
  if (raw == null || raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

function resolveArgs(opts: PaginateOptions): ResolvedArgs {
  const req = currentRequest as any

  const queryPerPage = readNumericQuery(req, 'per_page')
  const queryPage = readNumericQuery(req, 'page')

  const perPage = opts.perPage !== undefined
    ? Math.max(1, Math.min(MAX_PER_PAGE, Math.floor(opts.perPage)))
    : (queryPerPage !== undefined
        ? Math.max(1, Math.min(MAX_PER_PAGE, Math.floor(queryPerPage)))
        : DEFAULT_PER_PAGE)

  const page = Math.max(1, Math.floor(opts.page ?? queryPage ?? 1))

  let basePath = opts.path ?? ''
  if (!basePath) {
    try {
      const reqUrl: string = req?.url ?? ''
      if (reqUrl) {
        const u = new URL(reqUrl, 'http://localhost')
        basePath = u.pathname
      }
    }
    catch { /* keep empty */ }
  }
  if (!basePath) basePath = '/'

  // Preserve other query params (filters, search terms) when building
  // prev/next URLs so the user's filter context survives pagination.
  const carryQuery: Record<string, string> = {}
  try {
    const reqUrl: string = req?.url ?? ''
    if (reqUrl) {
      const u = new URL(reqUrl, 'http://localhost')
      for (const [k, v] of u.searchParams) {
        if (k === 'page' || k === 'per_page') continue
        carryQuery[k] = v
      }
    }
  }
  catch { /* no carry */ }

  return { perPage, page, basePath, carryQuery }
}

function buildPageUrl(basePath: string, page: number, perPage: number, carry: Record<string, string>): string {
  const params = new URLSearchParams(carry)
  params.set('page', String(page))
  params.set('per_page', String(perPage))
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

export interface ResolvedPaginatorArgs {
  perPage: number
  page: number
  offset: number
}

/**
 * Read pagination args from the request without running any queries.
 * Use this when an action needs to do custom hydration / joins / etc.
 * over the page slice (admin tables, judge-joined review lists),
 * then call {@link buildPaginatorMeta} on the resulting array.
 */
export function resolvePaginatorArgs(opts: { perPage?: number, page?: number } = {}): ResolvedPaginatorArgs {
  const req = currentRequest as any
  const queryPerPage = readNumericQuery(req, 'per_page')
  const queryPage = readNumericQuery(req, 'page')

  const perPage = opts.perPage !== undefined
    ? Math.max(1, Math.min(MAX_PER_PAGE, Math.floor(opts.perPage)))
    : (queryPerPage !== undefined
        ? Math.max(1, Math.min(MAX_PER_PAGE, Math.floor(queryPerPage)))
        : DEFAULT_PER_PAGE)

  const page = Math.max(1, Math.floor(opts.page ?? queryPage ?? 1))
  return { perPage, page, offset: (page - 1) * perPage }
}

/**
 * Wrap an already-fetched page slice + total in the canonical paginator
 * shape, building prev/next/first/last URLs from the active request.
 * Use this when {@link paginate} can't be applied directly (custom
 * joins, per-row hydration, multi-table queries).
 *
 * ```ts
 * const { perPage, page, offset } = resolvePaginatorArgs()
 * const total = await countReviewsForJudge(judgeId)
 * const rows = await fetchReviewsForJudge(judgeId, perPage, offset)
 * const hydrated = await hydrateLikes(rows)
 * return response.json(buildPaginatorMeta(hydrated, total, page, perPage))
 * ```
 */
export function buildPaginatorMeta<T>(
  data: T[],
  total: number,
  page: number,
  perPage: number,
  opts?: { path?: string },
): Paginator<T> {
  const req = currentRequest as any

  let basePath = opts?.path ?? ''
  if (!basePath) {
    try {
      const reqUrl: string = req?.url ?? ''
      if (reqUrl) basePath = new URL(reqUrl, 'http://localhost').pathname
    }
    catch { /* keep empty */ }
  }
  if (!basePath) basePath = '/'

  const carryQuery: Record<string, string> = {}
  try {
    const reqUrl: string = req?.url ?? ''
    if (reqUrl) {
      const u = new URL(reqUrl, 'http://localhost')
      for (const [k, v] of u.searchParams) {
        if (k === 'page' || k === 'per_page') continue
        carryQuery[k] = v
      }
    }
  }
  catch { /* no carry */ }

  const lastPage = Math.max(1, Math.ceil(Number(total ?? 0) / perPage))
  const currentPage = Math.min(Math.max(1, page), lastPage)
  const dataLen = Array.isArray(data) ? data.length : 0
  const from = dataLen > 0 ? (currentPage - 1) * perPage + 1 : null
  const to = dataLen > 0 ? from! + dataLen - 1 : null

  return {
    data: data ?? [],
    current_page: currentPage,
    per_page: perPage,
    total: Number(total ?? 0),
    last_page: lastPage,
    from,
    to,
    has_more_pages: currentPage < lastPage,
    prev_page_url: currentPage > 1
      ? buildPageUrl(basePath, currentPage - 1, perPage, carryQuery)
      : null,
    next_page_url: currentPage < lastPage
      ? buildPageUrl(basePath, currentPage + 1, perPage, carryQuery)
      : null,
    first_page_url: buildPageUrl(basePath, 1, perPage, carryQuery),
    last_page_url: buildPageUrl(basePath, lastPage, perPage, carryQuery),
    path: basePath,
  }
}

export async function paginate<T = any>(opts: PaginateOptions): Promise<Paginator<T>> {
  const { perPage, page, basePath, carryQuery } = resolveArgs(opts)

  // COUNT query. Run before LIMIT/OFFSET so it returns the unscoped
  // total. Using a literal `COUNT(*) as c` because bqb's selectFrom
  // is happy with the string-column form and we already use this
  // pattern elsewhere (see app/Helpers/reviewLikes.ts).
  let countQ: any = (db.selectFrom(opts.table as any) as any).select(['COUNT(*) as c'])
  if (opts.where) countQ = opts.where(countQ)
  const countRow = await countQ.executeTakeFirst() as { c: number | string } | undefined
  const total = Number(countRow?.c ?? 0)

  const lastPage = Math.max(1, Math.ceil(total / perPage))
  const currentPage = Math.min(Math.max(1, page), lastPage)

  // DATA query. Apply the same WHERE clause, then ORDER BY + LIMIT/OFFSET.
  let dataQ: any = (db.selectFrom(opts.table as any) as any).selectAll()
  if (opts.where) dataQ = opts.where(dataQ)
  if (opts.orderBy) dataQ = dataQ.orderBy(opts.orderBy.column as any, opts.orderBy.direction ?? 'asc')
  dataQ = dataQ.limit(perPage).offset((currentPage - 1) * perPage)
  const data: T[] = await dataQ.execute() as T[]

  const dataLen = Array.isArray(data) ? data.length : 0
  const from = dataLen > 0 ? (currentPage - 1) * perPage + 1 : null
  const to = dataLen > 0 ? from! + dataLen - 1 : null

  return {
    data: data ?? [],
    current_page: currentPage,
    per_page: perPage,
    total,
    last_page: lastPage,
    from,
    to,
    has_more_pages: currentPage < lastPage,
    prev_page_url: currentPage > 1
      ? buildPageUrl(basePath, currentPage - 1, perPage, carryQuery)
      : null,
    next_page_url: currentPage < lastPage
      ? buildPageUrl(basePath, currentPage + 1, perPage, carryQuery)
      : null,
    first_page_url: buildPageUrl(basePath, 1, perPage, carryQuery),
    last_page_url: buildPageUrl(basePath, lastPage, perPage, carryQuery),
    path: basePath,
  }
}
