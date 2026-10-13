import { Auth } from '@stacksjs/auth'
import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import queueAction from '../../app/Actions/Admin/Credentials/CredentialQueueIndexAction'
import claimAction from '../../app/Actions/Me/ClaimJudgeProfileAction'
import credentialAction from '../../app/Actions/Me/UpdateCredentialClaimAction'
import { openTestDatabase } from '../helpers/database'

/**
 * Judge-claim evidence — bench-review#51.
 *
 * A verified judge claim is what unlocks posting an official response under a
 * named sitting judge's identity, rendered publicly beneath reviews of them.
 * The claim used to carry one input, `judgeId`, so the admin queue showed a
 * name, an email and a dropdown selection: approving meant approving on
 * nothing, and a mistaken approval is public impersonation of a judge.
 *
 * What these hold down is that a claim cannot reach the queue without
 * something to check it against, that what the admin sees is what the
 * claimant actually submitted, and that evidence cannot outlive the claim it
 * was given for.
 */

const CLAIMANT_ID = 8601
const JUDGE_ID = 8602

const GOOD_EVIDENCE = 'I am the sitting judge for this department; my chambers listing is on the court website.'
/** Claims now also require an explicit attestation (bench-review#54). */
const ATTESTED = { attestation: true }

function seed(): void {
  const raw = openTestDatabase()
  raw.run('DELETE FROM users WHERE id = ?', [CLAIMANT_ID])
  raw.run('DELETE FROM judges WHERE id = ?', [JUDGE_ID])
  // Emails namespaced per test FILE — users.email is globally unique and the
  // suite shares one database.
  raw.run(
    'INSERT INTO users (id, name, email, email_verified_at, created_at) VALUES (?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
    [CLAIMANT_ID, 'Pat Claimant', 'claim-evidence@example.test'],
  )
  raw.run(
    'INSERT INTO judges (id, name, created_at) VALUES (?, ?, datetime(\'now\'))',
    [JUDGE_ID, 'Judge Under Claim'],
  )
  raw.close()
}

function claimRow(): Record<string, any> {
  const raw = openTestDatabase()
  const row = raw.query('SELECT credential_type, credential_evidence, credential_evidence_url, credential_claimed_at FROM users WHERE id = ?').get(CLAIMANT_ID) as Record<string, any>
  raw.close()
  return row
}

async function invoke(action: any, fields: Record<string, unknown>, method = 'POST'): Promise<{ status: number, body: any }> {
  const req = {
    url: 'http://localhost:4008/api/me/judge-claim',
    method,
    params: {},
    query: fields,
    get: (k: string) => (fields as any)[k],
    all: () => fields,
  }
  const res: any = await runWithRequest(req as any, () => (action as any).handle())
  const status = typeof res?.status === 'number' ? res.status : 200
  let body: any = null
  try { body = typeof res?.json === 'function' ? await res.json() : res }
  catch { body = res }
  return { status, body }
}

describe('judge claim evidence', () => {
  beforeEach(() => {
    seed()
    ;(Auth as any).user = async () => ({ id: CLAIMANT_ID, email_verified_at: '2026-01-01T00:00:00.000Z' })
  })

  test('a claim with no evidence is refused', async () => {
    const res = await invoke(claimAction, { judgeId: JUDGE_ID })

    expect(res.status).toBe(422)
    // Nothing queued: an admin must never be shown a claim with nothing to
    // check it against.
    expect(claimRow().credential_claimed_at).toBeNull()
  })

  test('a token few characters is not evidence', async () => {
    const res = await invoke(claimAction, { judgeId: JUDGE_ID, evidence: 'me' })

    expect(res.status).toBe(422)
    expect(claimRow().credential_claimed_at).toBeNull()
  })

  test('a claim with evidence is stored and queued', async () => {
    const res = await invoke(claimAction, {
      ...ATTESTED,
      judgeId: JUDGE_ID,
      evidence: GOOD_EVIDENCE,
      evidenceUrl: 'https://courts.example.gov/judges/under-claim',
    })

    expect(res.status).toBe(200)
    const row = claimRow()
    expect(row.credential_type).toBe('judge')
    expect(row.credential_evidence).toBe(GOOD_EVIDENCE)
    expect(row.credential_evidence_url).toBe('https://courts.example.gov/judges/under-claim')
    expect(row.credential_claimed_at).not.toBeNull()
  })

  test('the admin queue shows what the claimant submitted', async () => {
    await invoke(claimAction, { ...ATTESTED, judgeId: JUDGE_ID, evidence: GOOD_EVIDENCE, evidenceUrl: 'https://courts.example.gov/j' })

    const res = await invoke(queueAction, {}, 'GET')
    const mine = (res.body?.claims ?? []).find((c: any) => Number(c.id) === CLAIMANT_ID)

    expect(mine).toBeTruthy()
    // The whole point of the change: this is the evidence surface the
    // approve/reject buttons sit next to.
    expect(mine.credential_evidence).toBe(GOOD_EVIDENCE)
    expect(mine.credential_evidence_url).toBe('https://courts.example.gov/j')
    expect(mine.claimed_judge?.name).toBe('Judge Under Claim')
  })

  test('a claim without the attestation is refused', async () => {
    const res = await invoke(claimAction, { judgeId: JUDGE_ID, evidence: GOOD_EVIDENCE })

    expect(res.status).toBe(422)
    // Impersonating a sitting judge is the sharpest abuse this site can
    // suffer, and a verified claim grants the power to post official
    // responses under that judge's name. The attestation is the sentence a
    // false claim has to go through deliberately.
    expect(claimRow().credential_claimed_at).toBeNull()
  })

  test('a non-http link is refused rather than quietly dropped', async () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'not a url']) {
      const res = await invoke(claimAction, { ...ATTESTED, judgeId: JUDGE_ID, evidence: GOOD_EVIDENCE, evidenceUrl: bad })
      // 422, not a silent drop: an admin seeing no link cannot tell whether
      // one was offered. And the queue renders this for the one session that
      // can approve the claim, so a javascript: URL there is the worst place
      // on the site to put one.
      expect(res.status).toBe(422)
      expect(claimRow().credential_claimed_at).toBeNull()
    }
  })

  test('evidence does not outlive the claim it was given for', async () => {
    await invoke(claimAction, { ...ATTESTED, judgeId: JUDGE_ID, evidence: GOOD_EVIDENCE, evidenceUrl: 'https://courts.example.gov/j' })
    expect(claimRow().credential_evidence).toBe(GOOD_EVIDENCE)

    // Switch to an ordinary reviewer-credential claim, supplying none.
    const res = await invoke(credentialAction, { credential_type: 'bar_admission', credential_state: 'CA' }, 'PATCH')
    expect(res.status).toBe(200)

    const row = claimRow()
    expect(row.credential_type).toBe('bar_admission')
    // Overwritten, not left behind — otherwise the admin reads evidence for a
    // judge claim this user is no longer making.
    expect(row.credential_evidence).toBeNull()
    expect(row.credential_evidence_url).toBeNull()
  })
})
