// STRUCTURED DATA, ON THE PAGE IT DESCRIBES.
//
// A block of JSON-LD saying in a machine readable form what the page already
// says in words. It is what lets a search engine lift an answer into a result
// directly, and what an assistant reads when it wants to be sure who and where
// a business is rather than inferring it from prose.
//
// ── IT MUST SAY WHAT THE PAGE SAYS ───────────────────────────────────────────
//
// The one rule with structured data: the markup and the visible page have to
// agree. Markup describing an FAQ that is not on the page, or a business that
// is not the one described above it, is the thing search engines penalise, and
// rightly. So every schema here is built FROM the same constants the page
// renders, never written out beside them. See lib/pcd-seo.js.
//
// ── WHY dangerouslySetInnerHTML ─────────────────────────────────────────────
//
// A script tag's contents are not React children, they are raw text, and this
// is the documented way to put JSON-LD on a page in React. The risk that name
// warns about is untrusted input, and there is none here: every value comes
// from a constant in our own source, JSON.stringify escapes it, and the one
// character that could close the tag early is replaced below.
export default function JsonLd({ schema }) {
  if (!schema) return null;

  const json = JSON.stringify(schema).replace(/</g, "\\u003c");

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
