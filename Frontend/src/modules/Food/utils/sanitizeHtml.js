import DOMPurify from "dompurify"

/**
 * Cleans CMS HTML before it is handed to dangerouslySetInnerHTML.
 *
 * Every legal and support page on this platform renders admin-authored HTML. That HTML
 * reaches the browser unescaped by design — it is meant to carry headings, lists and
 * links — which means whatever is in it executes with the full authority of the page.
 * An access token lives in localStorage on the same origin, so a single script tag
 * saved into a policy page reads the session of every customer, seller and rider who
 * opens it.
 *
 * That is not a hypothetical about a hostile admin. A sub-admin account, a reused
 * password, or content pasted in from a document is enough, and none of it leaves a
 * trace a reader could notice.
 *
 * The allowlist below is what a policy page actually needs. Everything else is
 * dropped rather than escaped, so a page with something unexpected in it still renders
 * as a readable page instead of showing raw markup to a customer.
 */

/** Tags a legal, help or policy page legitimately uses. */
const ALLOWED_TAGS = [
    'p', 'br', 'hr', 'div', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
    'a', 'img',
]

/**
 * `style` is allowed but `on*` handlers are not; DOMPurify strips every event
 * attribute by default and this list never re-admits one.
 */
const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'colspan', 'rowspan', 'style', 'class']

let hooked = false

/**
 * Forces every link to open safely.
 *
 * `target="_blank"` without `rel="noopener"` hands the opened page a reference back
 * through window.opener, which is enough to navigate the original tab somewhere else —
 * a phishing step that needs no script at all. Applied as a hook so it covers links
 * DOMPurify keeps regardless of how the author wrote them.
 */
const installHook = () => {
    if (hooked || typeof window === 'undefined') return
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
            node.setAttribute('rel', 'noopener noreferrer')
        }
    })
    hooked = true
}

/**
 * @param {string} html Untrusted markup.
 * @returns {string} Markup safe to pass to dangerouslySetInnerHTML.
 */
export function sanitizeHtml(html) {
    const raw = typeof html === 'string' ? html : ''
    if (!raw) return ''

    // DOMPurify needs a DOM. There is no server rendering here, but returning the
    // input unchanged in a non-browser context would defeat the whole point, so it
    // returns nothing instead.
    if (typeof window === 'undefined' || !window.document) return ''

    installHook()
    return DOMPurify.sanitize(raw, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        // Blocks javascript:, vbscript: and data: URLs in href/src, which are the
        // ways a link executes code without ever being a script tag.
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    })
}

/** Ready to spread straight into a JSX element. */
export const safeHtml = (html) => ({ __html: sanitizeHtml(html) })
