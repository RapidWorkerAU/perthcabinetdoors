// Quote terms are a SMALL subset of HTML, and this is the only place that
// decides what that subset is.
//
// The wording is written in the quote editor with a few formatting buttons,
// stored on the quote, shown on the page the customer opens, and drawn into the
// PDF. Three different renderers, so the shape has to be pinned down in one
// place or they drift apart.
//
// WHAT IS ALLOWED, and nothing else:
//
//   p br            paragraphs and line breaks
//   strong em u     bold, italic, underline
//   ul ol li        bulleted and numbered lists
//
// No attributes survive at all — not style, not class, not href. That is
// deliberate rather than lazy: this text is written into a public page with
// dangerouslySetInnerHTML, so the safe move is a whitelist that keeps the tag
// name and throws the rest away, instead of trying to decide which attributes
// are harmless.
//
// Everything here runs in the browser AND on the server, so it uses no DOM.

export const TERMS_ALLOWED_TAGS = ["p", "br", "strong", "em", "u", "ul", "ol", "li"];

// b/i are what a browser's own formatting commands produce. They mean the same
// thing as strong/em and are folded into them so a quote never stores two
// spellings of bold.
const TAG_ALIASES = { b: "strong", i: "em", strike: null, span: null, div: "p" };

const VOID_TAGS = new Set(["br"]);
const BLOCK_TAGS = new Set(["p", "ul", "ol", "li"]);

function canonicalTag(name) {
  const lower = String(name || "").toLowerCase();
  if (Object.prototype.hasOwnProperty.call(TAG_ALIASES, lower)) return TAG_ALIASES[lower];
  return TERMS_ALLOWED_TAGS.includes(lower) ? lower : null;
}

// A stray "<" that is not part of a tag has to become &lt; or it reopens the
// hole the whitelist exists to close.
function escapeStrayAngles(text) {
  return String(text ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Reduce any HTML to the allowed subset: allowed tags keep their name and lose
 * every attribute, disallowed tags are dropped while their text is kept, and
 * anything left open is closed.
 */
export function sanitizeTermsHtml(input) {
  const source = String(input ?? "");
  if (!source) return "";

  const out = [];
  const open = [];
  // Matches a tag, or a run of text up to the next "<".
  const token = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/g;

  let match;
  while ((match = token.exec(source)) !== null) {
    const raw = match[0];

    // Plain text between tags.
    if (raw[0] !== "<") {
      out.push(escapeStrayAngles(raw));
      continue;
    }

    // Comments, doctypes, CDATA and anything else that is not a plain tag.
    if (!match[1]) continue;

    const tag = canonicalTag(match[1]);
    if (!tag) continue;

    const closing = raw[1] === "/";

    if (VOID_TAGS.has(tag)) {
      if (!closing) out.push(`<${tag}>`);
      continue;
    }

    if (!closing) {
      // A list item only means anything inside a list. Outside one it is a
      // paragraph, which is what the reader would have seen anyway.
      if (tag === "li" && !open.includes("ul") && !open.includes("ol")) {
        open.push("p");
        out.push("<p>");
        continue;
      }
      open.push(tag);
      out.push(`<${tag}>`);
      continue;
    }

    // A closing tag with no matching opener is noise; drop it. Otherwise close
    // everything down to and including the opener, so the output nests.
    const at = open.lastIndexOf(tag);
    if (at === -1) continue;
    while (open.length > at) {
      out.push(`</${open.pop()}>`);
    }
  }

  while (open.length) out.push(`</${open.pop()}>`);

  const html = out.join("");
  // A document of nothing but empty tags reads as "no terms", and a quote with
  // no terms must print none rather than an empty box.
  return termsHtmlToPlainText(html).trim() ? html : "";
}

/**
 * Plain text into the same subset: a blank line starts a new paragraph, a
 * single newline is a line break.
 *
 * Every quote and every default written before terms could be formatted is
 * plain text, so this is what keeps that wording rendering correctly instead of
 * collapsing into one run-on paragraph.
 */
export function plainTextToTermsHtml(text) {
  const source = String(text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!source) return "";
  return source
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// Whether a stored value is already markup. Anything else is treated as the
// plain text it is, rather than being shown to a customer with its line breaks
// thrown away.
export function looksLikeTermsHtml(value) {
  return /<\/?(p|br|strong|em|u|ul|ol|li|b|i|div|span)\b[^>]*>/i.test(String(value ?? ""));
}

/** Any stored terms value — old plain text or new markup — as safe markup. */
export function toTermsHtml(value) {
  const source = String(value ?? "");
  if (!source.trim()) return "";
  return looksLikeTermsHtml(source) ? sanitizeTermsHtml(source) : plainTextToTermsHtml(source);
}

/** Joining two terms is joining two documents, not two strings. */
export function joinTermsHtml(parts = []) {
  return (Array.isArray(parts) ? parts : [])
    .map((part) => toTermsHtml(part))
    .filter((part) => part.trim())
    .join("");
}

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

function decodeEntities(text) {
  return String(text ?? "").replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity);
}

/**
 * The same wording as plain text, for anywhere that cannot show markup (a
 * plain-text email, a preview line, a length check).
 */
export function termsHtmlToPlainText(html) {
  return decodeEntities(
    String(html ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|ul|ol)>/gi, "\n")
      .replace(/<[^>]*>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The wording as blocks the PDF can draw: one block per paragraph or list item,
 * each carrying its runs of text with the styling that applies to them.
 *
 *   { marker: "", indent: 0, runs: [{ text, bold, italic, underline }] }
 *
 * The PDF has no HTML in it and lays out a line at a time, so it needs the text
 * already split into styled pieces with the bullet or the number resolved. A
 * paragraph with no runs is a blank line, which is how spacing between
 * paragraphs survives into print.
 */
export function termsHtmlToBlocks(value) {
  const html = toTermsHtml(value);
  if (!html) return [];

  const blocks = [];
  let runs = [];
  const style = { bold: 0, italic: 0, underline: 0 };
  // A stack rather than a flag: nested lists are legal markup and the marker
  // has to follow the innermost list, not the first one opened.
  const lists = [];
  let pendingMarker = "";
  let indent = 0;

  const flush = () => {
    const text = runs.map((run) => run.text).join("");
    if (text.trim() || pendingMarker) {
      blocks.push({ marker: pendingMarker, indent, runs: runs.filter((run) => run.text) });
    }
    runs = [];
    pendingMarker = "";
    indent = 0;
  };

  const token = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?\/?>|[^<]+/g;
  let match;
  while ((match = token.exec(html)) !== null) {
    const raw = match[0];

    if (raw[0] !== "<") {
      const text = decodeEntities(raw).replace(/\s+/g, " ");
      if (text) {
        runs.push({
          text,
          bold: style.bold > 0,
          italic: style.italic > 0,
          underline: style.underline > 0,
        });
      }
      continue;
    }

    const tag = String(match[1] || "").toLowerCase();
    const closing = raw[1] === "/";

    if (tag === "br") {
      flush();
      continue;
    }
    if (tag === "strong" || tag === "b") { style.bold += closing ? -1 : 1; continue; }
    if (tag === "em" || tag === "i") { style.italic += closing ? -1 : 1; continue; }
    if (tag === "u") { style.underline += closing ? -1 : 1; continue; }

    if (tag === "ul" || tag === "ol") {
      flush();
      if (closing) lists.pop();
      else lists.push({ ordered: tag === "ol", count: 0 });
      continue;
    }

    if (tag === "li") {
      flush();
      if (!closing) {
        const list = lists[lists.length - 1];
        if (list) {
          list.count += 1;
          pendingMarker = list.ordered ? `${list.count}.` : "•";
          indent = lists.length;
        }
      }
      continue;
    }

    if (BLOCK_TAGS.has(tag)) flush();
  }
  flush();

  for (const key of Object.keys(style)) style[key] = 0;
  return blocks;
}
