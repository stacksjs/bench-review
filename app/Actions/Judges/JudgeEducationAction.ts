import type { RequestInstance } from '@stacksjs/types'
import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { response } from '@stacksjs/router'

interface EducationEntry {
  degree: string
  school: string
  year: string
}

/**
 * A judge's education, as ingested from CourtListener.
 *
 * ## Why this is its own endpoint
 *
 * `JudgeIndexAction` returns every judge in one response and components find
 * theirs by id — so anything added to that payload is downloaded on every page
 * that touches the directory, 2,740 rows at a time. That action's own comments
 * already draw this line for review aggregates ("Returning these fields here
 * would re-introduce the N+1 problem the lazy design exists to avoid"), and
 * education belongs on the same side of it: it is needed by exactly one tab of
 * one page.
 *
 * ## Why it replaced hardcoded markup
 *
 * `Bench/Judge/Profile.stx` used to render, as static markup with no binding,
 * "J.D., Stanford Law School" and "Bar Admission: California, 2005" on the
 * profile tab of all 2,740 real named federal judges. This endpoint serves the
 * real thing for the ~1,324 judges CourtListener has records for; the rest get
 * the component's empty state rather than an invented degree.
 *
 * Public and unauthenticated, like the other judge read endpoints — this is
 * public-record biographical data about public officials.
 */
export default new Action({
  name: 'JudgeEducation',
  description: 'Education history for one judge',
  method: 'GET',

  async handle(request: RequestInstance) {
    const id = Number(request.getParam('id'))
    if (!Number.isFinite(id) || id <= 0)
      return response.json({ education: [] })

    const row = await db.selectFrom('judges' as any)
      .select(['education'] as any)
      .where('id' as any, '=', id)
      .executeTakeFirst() as { education: string | null } | undefined

    if (!row?.education)
      return response.json({ education: [] })

    // The column holds JSON written by scripts/ingest-courtlistener.ts. A
    // malformed value is a bug in that script, not something a visitor should
    // see as a 500 — an empty list degrades to the component's empty state.
    let education: EducationEntry[] = []
    try {
      const parsed = JSON.parse(row.education)
      if (Array.isArray(parsed))
        education = parsed as EducationEntry[]
    }
    catch {
      education = []
    }

    return response.json({ education })
  },
})
