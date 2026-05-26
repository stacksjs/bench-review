/**
 * Transactional email layout for review-lifecycle messages
 * (submission acknowledgement, moderation approval, moderation
 * decline). Centralised so the three call sites stay visually in
 * sync without copy-pasting markup.
 *
 * Why table-layout + inline styles:
 *   - Outlook (desktop) still uses the Word rendering engine; it
 *     ignores flex / grid and strips a lot of `<head>` CSS. Tables
 *     are the lowest-common-denominator layout primitive that works
 *     everywhere from Apple Mail to Outlook 2016.
 *   - Gmail occasionally strips `<style>` blocks when it decides to
 *     run its "less secure" pipeline. Inline styles survive.
 *
 * Dark-mode safety:
 *   - Apple Mail / Gmail mobile aggressively invert "light" emails.
 *     `<meta name="color-scheme" content="light">` opts out of the
 *     auto-invert and lets our explicit colours win. Major clients
 *     (Apple Mail, Gmail Android, iOS Mail) all respect it.
 *
 * Width / sizing:
 *   - 600px is the safe upper bound for Outlook's preview pane plus
 *     mobile single-column. Anything wider gets horizontally
 *     scrolled on Outlook desktop.
 */

export interface ReviewEmailOptions {
  /** Short copy shown in inbox previews (Gmail / Apple Mail truncate to ~90 chars). */
  preheader?: string
  /** Big serif heading inside the card. */
  heading: string
  /** "Hi Alice," greeting line. */
  greeting: string
  /** One or more HTML paragraphs for the body. Use <p>…</p>. */
  bodyHtml: string
  /** CTA button. Pass both to render; omit to skip the button. */
  ctaText?: string
  ctaUrl?: string
  /** Visual accent — drives the header bar + CTA background. */
  accent?: 'green' | 'amber' | 'red' | 'neutral'
  /** Footer note above the company-info row. */
  footerNote?: string
}

interface AccentTokens {
  bar: string
  ctaBg: string
  ctaText: string
}

const ACCENTS: Record<NonNullable<ReviewEmailOptions['accent']>, AccentTokens> = {
  green: { bar: '#059669', ctaBg: '#111827', ctaText: '#ffffff' },
  amber: { bar: '#d97706', ctaBg: '#111827', ctaText: '#ffffff' },
  red: { bar: '#dc2626', ctaBg: '#111827', ctaText: '#ffffff' },
  neutral: { bar: '#111827', ctaBg: '#111827', ctaText: '#ffffff' },
}

/**
 * Escape user-controlled strings before they land in HTML. Reviewer
 * name and judge name come from DB rows that originated as user
 * input; even though the rest of the email body is composed of
 * static template copy, we treat substituted values as untrusted.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderReviewEmail(opts: ReviewEmailOptions): string {
  const accent = ACCENTS[opts.accent ?? 'neutral']
  const preheader = opts.preheader ? escapeHtml(opts.preheader) : ''
  const heading = escapeHtml(opts.heading)
  const greeting = escapeHtml(opts.greeting)
  // `bodyHtml` is composed by callers using known-safe template
  // literals + escaped substitutions — pass it through verbatim.
  const body = opts.bodyHtml
  const footerNote = opts.footerNote ? escapeHtml(opts.footerNote) : ''

  const cta = opts.ctaText && opts.ctaUrl
    ? `
            <tr>
              <td align="left" style="padding: 8px 0 24px 0;">
                <a href="${escapeHtml(opts.ctaUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;background-color:${accent.ctaBg};color:${accent.ctaText};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;line-height:1;">${escapeHtml(opts.ctaText)}</a>
              </td>
            </tr>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f7f9;color:#292929;-webkit-font-smoothing:antialiased;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;color:#f6f7f9;font-size:1px;line-height:1px;">${preheader}</div>` : ''}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f6f7f9;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background-color:${accent.bar};height:4px;line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#b45309;">Bench Review</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0 32px;font-family:'Charter','Iowan Old Style','Source Serif Pro',Georgia,Cambria,'Times New Roman',serif;">
              <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;color:#111827;letter-spacing:-0.01em;">${heading}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 8px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#292929;">
              <p style="margin:0 0 16px 0;">${greeting}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 8px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#292929;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">${cta}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #e5e7eb;">
                <tr>
                  <td style="padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;">
                    ${footerNote ? `<p style="margin:0 0 8px 0;">${footerNote}</p>` : ''}
                    <p style="margin:0;">Bench Review — like Glassdoor for the judiciary. Reviews from clerks, attorneys, and court staff bringing transparency to the bench.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;margin-top:16px;">
          <tr>
            <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#9ca3af;">
              You received this email because you submitted a review on Bench Review. We only contact you about your own reviews.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
