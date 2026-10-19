import { describe, expect, it } from 'bun:test'
import { sanitizeReviewHtml } from '../../app/Helpers/sanitizeReviewHtml'
import {
  CONTENT_MIN,
  plainTextFromHtml,
  reviewProblem,
  shortDate,
  starsFor,
  submitFailureMessage,
  toReviewHtml,
  visibleLength,
} from '../../resources/functions/native-review'

/**
 * The phone composes a review as plain text; the server stores HTML and
 * measures VISIBLE text. These tests pin the join between the two, because a
 * mismatch there is invisible until a published review reads wrong.
 */

const ok = { judgeId: 1, rating: 4, title: 'Fair and prepared', body: 'Ran the calendar on time and explained every ruling from the bench.' }

describe('toReviewHtml', () => {
  it('wraps each blank-line-separated block in its own paragraph', () => {
    expect(toReviewHtml('First point.\n\nSecond point.')).toBe('<p>First point.</p><p>Second point.</p>')
  })

  it('keeps a single newline inside a paragraph as a line break', () => {
    expect(toReviewHtml('Line one\nLine two')).toBe('<p>Line one<br>Line two</p>')
  })

  it('escapes markup instead of emitting it', () => {
    // A review that MENTIONS a tag must stay a review that mentions it.
    expect(toReviewHtml('He said <script>alert(1)</script> was fine'))
      .toBe('<p>He said &lt;script&gt;alert(1)&lt;/script&gt; was fine</p>')
  })

  it('escapes the ampersand before the escapes it introduces', () => {
    expect(toReviewHtml('Smith & Co <b>')).toBe('<p>Smith &amp; Co &lt;b&gt;</p>')
  })

  it('returns an empty string for empty input, not empty wrapper markup', () => {
    // `<p></p>` is what once sailed past a naive length check server-side.
    expect(toReviewHtml('   \n\n  ')).toBe('')
    expect(toReviewHtml('')).toBe('')
  })

  it('normalises CRLF, so a pasted body does not gain blank paragraphs', () => {
    expect(toReviewHtml('One\r\n\r\nTwo')).toBe('<p>One</p><p>Two</p>')
  })
})

describe('toReviewHtml survives the server sanitiser unchanged', () => {
  it('keeps paragraphs and the escaped text through sanitizeReviewHtml', async () => {
    const html = toReviewHtml('First point.\n\nSecond <b>point</b>.')
    const sanitised = (await sanitizeReviewHtml(html)).trim()
    // `<p>` is on the whitelist, so nothing the phone sends is dropped, and
    // the escaped `<b>` stays escaped rather than becoming real markup.
    expect(sanitised).toContain('<p>First point.</p>')
    expect(sanitised).toContain('&lt;b&gt;point&lt;/b&gt;')
    expect(sanitised).not.toContain('<b>')
  })
})

describe('visibleLength never over-estimates what the server will measure', () => {
  it('collapses whitespace the way the action does', () => {
    expect(visibleLength('  a   b \n c ')).toBe(5)
  })

  it('is never longer than the server-visible text of the HTML it produces', async () => {
    // Escaping only grows a string, so a body this says is long enough is one
    // the server also accepts. The reverse would let the phone promise a post
    // the server then rejects.
    for (const sample of ['plain words here', 'Smith & Co & Sons', 'a <b> & "quoted" \'thing\'']) {
      const serverVisible = (await sanitizeReviewHtml(toReviewHtml(sample)))
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      expect(visibleLength(sample)).toBeLessThanOrEqual(serverVisible.length)
    }
  })
})

describe('reviewProblem mirrors the server rules, in reading order', () => {
  it('accepts a complete review', () => {
    expect(reviewProblem(ok)).toBeNull()
  })

  it('asks for the judge first', () => {
    expect(reviewProblem({ ...ok, judgeId: 0, rating: 0, title: '' })).toBe('Choose the judge this review is about.')
  })

  it('asks for a rating before a title', () => {
    expect(reviewProblem({ ...ok, rating: 0, title: '' })).toBe('Give a rating from 1 to 5 stars.')
  })

  it('rejects a rating outside 1 to 5', () => {
    expect(reviewProblem({ ...ok, rating: 6 })).not.toBeNull()
  })

  it('rejects a title of whitespace, not just a short one', () => {
    expect(reviewProblem({ ...ok, title: '   ' })).toContain('title')
  })

  it('rejects a body under the server floor', () => {
    expect(reviewProblem({ ...ok, body: 'too short' })).toContain(String(CONTENT_MIN))
  })

  it('rejects a body over the server ceiling', () => {
    expect(reviewProblem({ ...ok, body: 'x'.repeat(10001) })).toContain('at most')
  })
})

describe('submitFailureMessage', () => {
  it('prefers the server wording when there is any', () => {
    expect(submitFailureMessage(409, { error: 'You have already reviewed this judge.' }))
      .toBe('You have already reviewed this judge.')
  })

  it('names the inbox for an unverified account', () => {
    expect(submitFailureMessage(403, {})).toContain('inbox')
  })

  it('says to edit the existing review on a duplicate', () => {
    expect(submitFailureMessage(409, {})).toContain('Edit your existing review')
  })

  it('says the session expired on a 401, since signing in again is the fix', () => {
    expect(submitFailureMessage(401, {})).toContain('Sign in again')
  })

  it('still says something actionable for an unexpected status', () => {
    expect(submitFailureMessage(500, {})).toBe('The review could not be posted. Please try again.')
  })
})

describe('plainTextFromHtml', () => {
  it('drops tags so a native label does not print them', () => {
    expect(plainTextFromHtml('<p>Ran a tight calendar.</p>')).toBe('Ran a tight calendar.')
  })

  it('keeps a word boundary where a block tag was', () => {
    // Without this, two paragraphs read as "bench.Clear".
    expect(plainTextFromHtml('<p>bench.</p><p>Clear with parties.</p>')).toBe('bench. Clear with parties.')
  })

  it('treats a line break as a space', () => {
    expect(plainTextFromHtml('<p>one<br>two</p>')).toBe('one two')
  })

  it('decodes the entities toReviewHtml produces, and no others', () => {
    expect(plainTextFromHtml(toReviewHtml('Smith & Co said <b> was "fine"')))
      .toBe('Smith & Co said <b> was "fine"')
  })

  it('round-trips a composed body back to what was typed', () => {
    const typed = 'First point.\n\nSecond point.'
    expect(plainTextFromHtml(toReviewHtml(typed))).toBe('First point. Second point.')
  })

  it('is empty for empty input rather than throwing', () => {
    expect(plainTextFromHtml('')).toBe('')
    expect(plainTextFromHtml(null as any)).toBe('')
  })

  it('decodes typographic entities, which opinion summaries are full of', () => {
    // `statute&rsquo;s` printed literally on the opinions screen until this.
    expect(plainTextFromHtml('<p>the statute&rsquo;s plain text</p>')).toBe('the statute\u2019s plain text')
    expect(plainTextFromHtml('a &mdash; b &hellip;')).toBe('a \u2014 b \u2026')
  })

  it('decodes numeric escapes, decimal and hex', () => {
    expect(plainTextFromHtml('don&#8217;t')).toBe('don\u2019t')
    expect(plainTextFromHtml('don&#x2019;t')).toBe('don\u2019t')
  })

  it('leaves an entity it does not know as written', () => {
    // Losing the word would be worse than showing its escape.
    expect(plainTextFromHtml('100 &notareal; done')).toBe('100 &notareal; done')
  })

  it('does not unwind a double escape into markup', () => {
    // `&amp;lt;` is the TEXT "&lt;", not a tag waiting to be rebuilt.
    expect(plainTextFromHtml('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;')
  })
})

describe('starsFor', () => {
  it('fills to the rating and leaves the rest hollow', () => {
    expect(starsFor(4)).toBe('★★★★☆')
    expect(starsFor(0)).toBe('☆☆☆☆☆')
    expect(starsFor(5)).toBe('★★★★★')
  })

  it('clamps rather than drawing a row of the wrong length', () => {
    expect(starsFor(9)).toHaveLength(5)
    expect(starsFor(-2)).toBe('☆☆☆☆☆')
    expect(starsFor(null)).toBe('☆☆☆☆☆')
  })
})

describe('shortDate', () => {
  it('formats an ISO timestamp', () => {
    expect(shortDate('2026-10-19T08:30:00.000Z')).toBe('19 Oct 2026')
  })

  it('says nothing when there is nothing to say', () => {
    // A row drops the line rather than printing "Invalid Date".
    expect(shortDate(null)).toBe('')
    expect(shortDate('')).toBe('')
    expect(shortDate('not a date')).toBe('')
  })
})
