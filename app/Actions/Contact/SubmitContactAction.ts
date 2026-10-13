import process from 'node:process'
import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'

/**
 * POST /api/contact — the public contact form (bench-review#54).
 *
 * This route did not exist. `resources/stores/contact.ts` has always posted
 * here, and the framework's default only mounts when `feature('dashboard')`
 * is on, which config/features.ts does not enable — so every submission
 * failed silently from the sender's point of view.
 *
 * It is not an ordinary contact form. Two of its topics are the channels this
 * site designates for "Report a review" and "Legal request", so the people
 * most likely to need it are a judge's counsel sending a takedown demand and
 * a subject reporting something defamatory about them. They got a failure.
 *
 * The row is written FIRST and the email is best-effort afterwards. A legal
 * demand that exists only as an email nobody received is the same as one
 * never sent; the row is the record that it arrived and when.
 */

const TOPICS = new Set(['general', 'report', 'data', 'press', 'partnership', 'legal'])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_MESSAGE = 10

const trim = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max)

/**
 * Where each topic is sent.
 *
 * `legal` and `report` route to the legal address rather than the general
 * inbox: a takedown demand sitting in a shared support queue is how a 48-hour
 * response window is missed. Overridable by env so a deployment can point
 * them at real monitored mailboxes; the defaults match the addresses
 * contact.stx already prints on the page.
 */
function recipientFor(topic: string): string {
  const legal = (process.env.LEGAL_CONTACT_EMAIL ?? '').trim()
  const press = (process.env.PRESS_CONTACT_EMAIL ?? '').trim()
  const general = (process.env.CONTACT_EMAIL ?? '').trim() || 'hello@bench.review'
  if (topic === 'legal' || topic === 'report')
    return legal || general
  if (topic === 'press')
    return press || general
  return general
}

export default new Action({
  name: 'Submit Contact Message',
  description: 'Accept a message from the public contact form',
  method: 'POST',

  async handle() {
    const name = trim(request.get?.('name'), 200)
    const email = trim(request.get?.('email'), 200).toLowerCase()
    const topicRaw = trim(request.get?.('topic'), 40).toLowerCase()
    const message = trim(request.get?.('message'), 8000)

    if (name.length < 2)
      return response.json({ error: 'Please tell us your name.' }, 422)
    if (!EMAIL_RE.test(email))
      return response.json({ error: 'A valid email address is required so we can reply.' }, 422)
    if (message.length < MIN_MESSAGE)
      return response.json({ error: 'Please include a message.' }, 422)

    // An unknown topic is stored as 'general' rather than refused: the sender
    // did not choose it out of a list we control, and losing a legal request
    // over a select-option mismatch would be the exact failure this fixes.
    const topic = TOPICS.has(topicRaw) ? topicRaw : 'general'

    const now = new Date().toISOString()
    const uuid = crypto.randomUUID()

    await db.insertInto('contact_messages').values({
      name,
      email,
      topic,
      message,
      status: 'open',
      uuid,
      created_at: now,
      updated_at: now,
    } as any).execute()

    // Best-effort from here. The message is saved; the sender is owed their
    // confirmation whether or not SMTP answers.
    try {
      const to = recipientFor(topic)
      const { mail } = await import('@stacksjs/email')
      await mail.send({
        to,
        subject: `[bench:${topic}] ${name}`,
        text: `Topic: ${topic}\nFrom: ${name} <${email}>\n\n${message}\n`,
      })
    }
    catch (err) {
      console.warn(`[contact] could not deliver a '${topic}' message from ${email}. It is stored as contact_messages.${uuid}.`, err instanceof Error ? err.message : err)
    }

    return response.json({ ok: true }, 201)
  },
})
