/**
 * Server-side review-HTML sanitiser.
 *
 * The article view renders `content` via `x-html` (i.e. raw innerHTML),
 * which means any HTML the author submits hits every reader's browser
 * verbatim. We treat this as a strict trust boundary:
 *
 *   - Pasted HTML from external sites (Lipsum, Word, Confluence,
 *     Medium itself) carries `float: left; width: 436px` style blocks
 *     and `<div>` wrappers that override our article typography and
 *     collapse the layout column — that's the cosmetic motivation.
 *   - Pasted `<script>`, `<iframe>`, or `<a href="javascript:…">`
 *     would execute on the reader's session — that's the security
 *     motivation, and the reason this is server-side rather than
 *     editor-side. The editor (MediumEditor's `cleanPastedHTML`)
 *     does a partial job; we can't rely on it.
 *
 * Implementation: Bun's `HTMLRewriter` (lol-html under the hood)
 * walks the tree, removes attributes that aren't on a tight per-tag
 * whitelist, and either keeps, unwraps, or drops the element based on
 * the tag bucket below. The output is a clean subset suitable for
 * `x-html` rendering with our article-body CSS.
 *
 * Whitelist rationale:
 *   - Block + inline text tags that map to the existing typography
 *     in `Bench/ArticleView.stx` styles block.
 *   - `<a>` is the only tag allowed to keep attributes (`href`,
 *     `target`), and `href` is restricted to `http(s):` and `mailto:`
 *     schemes so `javascript:` / `data:` URIs can't sneak through.
 *   - Structural wrappers (div, span, font, table) are unwrapped:
 *     their content survives, the wrapper (and its inline styles)
 *     does not. Tables degrade to flat text — there's no
 *     table-rendering CSS in the article view yet, and a malformed
 *     table from a paste would break the column either way.
 *   - Anything not classified is unwrapped (content survives, tag
 *     dropped). This is the safe default for unknown tags.
 */

const ALLOWED_TAGS = new Set([
  'p', 'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre',
  'ul', 'ol', 'li',
  'blockquote',
  'a',
  'br', 'hr',
])

// Wrapper tags whose CONTENT we keep but whose TAG (and any inline
// styles / classes on it) we drop. Includes the usual layout tags
// pasted from CMS exports plus tables (no table rendering CSS yet).
const UNWRAP_TAGS = new Set([
  'div', 'span', 'font', 'center',
  'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
])

// Tags whose entire subtree is removed. Script + style are obvious;
// the rest are either active-content vectors (iframe, embed, object,
// form controls) or out-of-band metadata that has no business in a
// review body (link, meta, noscript).
const DROP_TAGS = new Set([
  'script', 'style', 'iframe', 'embed', 'object', 'link', 'meta', 'noscript',
  'form', 'input', 'button', 'select', 'textarea', 'fieldset', 'label',
  'svg', 'math', 'video', 'audio', 'source', 'track', 'canvas',
])

const SAFE_HREF = /^(https?:|mailto:)/i

export async function sanitizeReviewHtml(html: string): Promise<string> {
  if (!html) return ''

  const rewriter = new HTMLRewriter().on('*', {
    element(el: any) {
      const tag = String(el.tagName || '').toLowerCase()

      if (DROP_TAGS.has(tag)) {
        el.remove()
        return
      }

      if (UNWRAP_TAGS.has(tag)) {
        el.removeAndKeepContent()
        return
      }

      if (!ALLOWED_TAGS.has(tag)) {
        // Unknown tag — preserve content, drop the wrapper.
        el.removeAndKeepContent()
        return
      }

      // Allowed tag. Strip every attribute except the per-tag
      // whitelist. Iterate over a snapshot of attributes since
      // removeAttribute mutates the underlying collection.
      const keepAttrs = tag === 'a' ? new Set(['href', 'target']) : null
      const attrs = [...(el.attributes as Iterable<[string, string]>)]
      for (const [name] of attrs) {
        if (!keepAttrs || !keepAttrs.has(name))
          el.removeAttribute(name)
      }

      // <a>-specific tightening: href scheme validation and a
      // forced rel="noopener noreferrer nofollow" on _blank links.
      if (tag === 'a') {
        const href = el.getAttribute('href') ?? ''
        if (href && !SAFE_HREF.test(href))
          el.removeAttribute('href')
        const target = el.getAttribute('target')
        if (target && target !== '_blank')
          el.removeAttribute('target')
        if (el.getAttribute('target') === '_blank')
          el.setAttribute('rel', 'noopener noreferrer nofollow')
      }
    },
  })

  // HTMLRewriter operates on Response bodies. Wrapping the input
  // string in a Response and reading the transformed body back out
  // is the documented pattern; the overhead is negligible against
  // the network round-trip the caller is already doing.
  return await rewriter.transform(new Response(html)).text()
}
