// The terms library, and the small subset of HTML terms are written in.
//
// Two things are being protected here.
//
// SAFETY. Terms are the only field in the app that is rendered as markup into a
// page a customer opens. The whitelist in lib/pcd-terms-html.js is what makes
// that safe, and it runs on the server as well as in the editor, so these check
// the whitelist itself rather than any screen's use of it.
//
// THE COPY RULE. Adding a term to a quote copies its wording. A quote is a
// document: editing the library afterwards must never rewrite a quote that has
// already gone to a customer, and deleting a term must not empty one.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  joinTermsHtml,
  looksLikeTermsHtml,
  plainTextToTermsHtml,
  sanitizeTermsHtml,
  termsHtmlToBlocks,
  termsHtmlToPlainText,
  toTermsHtml,
} from "../lib/pcd-terms-html.js";
import { defaultQuoteTerms, normalizeQuoteTerm, quoteTermToDbRow } from "../lib/pcd-quote-terms.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ── The whitelist ────────────────────────────────────────────────────────────

test("a script tag cannot survive", () => {
  const html = sanitizeTermsHtml('<p>Hi<script>alert(1)</script></p>');
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /^<p>/);
});

test("every attribute is dropped, including event handlers and styles", () => {
  const html = sanitizeTermsHtml('<p style="color:red" onclick="steal()"><strong class="x">Bold</strong></p>');
  assert.equal(html, "<p><strong>Bold</strong></p>");
});

test("an img or an anchor keeps its text and loses itself", () => {
  assert.equal(sanitizeTermsHtml('<p><a href="http://x">click</a></p>'), "<p>click</p>");
  assert.equal(sanitizeTermsHtml('<p>a<img src="x" onerror="steal()">b</p>'), "<p>ab</p>");
});

test("a bare angle bracket is escaped rather than left to open a tag", () => {
  assert.doesNotMatch(sanitizeTermsHtml("<p>5 < 6</p>"), /<(?!\/?p>)/);
});

test("b and i are folded into strong and em, so bold has one spelling", () => {
  assert.equal(sanitizeTermsHtml("<b>B</b><i>I</i><u>U</u>"), "<strong>B</strong><em>I</em><u>U</u>");
});

test("unclosed and mismatched tags are closed rather than left hanging", () => {
  assert.equal(sanitizeTermsHtml("<p><strong>open"), "<p><strong>open</strong></p>");
  assert.equal(sanitizeTermsHtml("</em><p>ok</p>"), "<p>ok</p>");
});

test("markup that says nothing comes back as nothing", () => {
  // A quote with no terms has to print no terms, not an empty box.
  assert.equal(sanitizeTermsHtml("<p></p><p><br></p>"), "");
  assert.equal(toTermsHtml("   "), "");
});

// ── Terms written before formatting existed ──────────────────────────────────

test("plain text keeps its paragraphs and line breaks", () => {
  assert.equal(plainTextToTermsHtml("One\nTwo\n\nThree"), "<p>One<br>Two</p><p>Three</p>");
});

test("an old plain-text quote still reads correctly", () => {
  // Every quote written before this feature holds plain text. Rendering it as
  // markup without this would run all its lines together.
  assert.equal(looksLikeTermsHtml("Prices are valid for 14 days."), false);
  assert.equal(toTermsHtml("Prices are valid for 14 days."), "<p>Prices are valid for 14 days.</p>");
});

test("text that looks like a tag is escaped, not treated as markup", () => {
  assert.equal(plainTextToTermsHtml("Use <brackets> carefully"), "<p>Use &lt;brackets&gt; carefully</p>");
});

// ── Joining ──────────────────────────────────────────────────────────────────

test("adding a term appends a document, and blanks are skipped", () => {
  assert.equal(joinTermsHtml(["<p>A</p>", "plain B", "", null, undefined]), "<p>A</p><p>plain B</p>");
});

test("plain text on the quote survives a term being added to it", () => {
  // Someone typing into an old quote and then pressing Add terms must not lose
  // what they typed.
  assert.equal(joinTermsHtml(["Typed by hand", "<p>Added term</p>"]), "<p>Typed by hand</p><p>Added term</p>");
});

// ── For the PDF ──────────────────────────────────────────────────────────────

test("blocks carry the styling of each run, so the PDF can draw it", () => {
  const blocks = termsHtmlToBlocks("<p>Payment <strong>terms</strong></p>");
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].runs.map((run) => [run.text, run.bold]), [["Payment ", false], ["terms", true]]);
});

test("a numbered list counts, and a bulleted list marks", () => {
  const blocks = termsHtmlToBlocks("<ol><li>First</li><li>Second</li></ol><ul><li>Point</li></ul>");
  assert.deepEqual(blocks.map((block) => block.marker), ["1.", "2.", "•"]);
});

test("each list restarts its own numbering", () => {
  const blocks = termsHtmlToBlocks("<ol><li>a</li></ol><ol><li>b</li><li>c</li></ol>");
  assert.deepEqual(blocks.map((block) => block.marker), ["1.", "1.", "2."]);
});

test("plain text reaches the PDF as blocks too", () => {
  const blocks = termsHtmlToBlocks("Line one\n\nLine two");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].runs[0].text, "Line one");
});

test("terms as plain text for anywhere that cannot show markup", () => {
  assert.equal(termsHtmlToPlainText("<p>A</p><ul><li>one</li><li>two</li></ul>"), "A\none\ntwo");
});

// ── The library ──────────────────────────────────────────────────────────────

test("a term is sanitised on the way to the database, not only in the browser", () => {
  const row = quoteTermToDbRow({ name: "  Install  ", body_html: '<p onclick="x">Wording</p>', always_include: "yes" });
  assert.equal(row.name, "Install");
  assert.equal(row.body_html, "<p>Wording</p>");
  assert.equal(row.always_include, true);
});

test("a new quote starts with the Always terms, in library order", () => {
  const library = [
    { id: "a", name: "Standard", body_html: "<p>Standard</p>", always_include: true, sort_order: 10 },
    { id: "b", name: "Install", body_html: "<p>Install</p>", always_include: false, sort_order: 20 },
    { id: "c", name: "Acceptance", body_html: "<p>Acceptance</p>", always_include: true, sort_order: 30 },
  ].map(normalizeQuoteTerm);

  const defaults = defaultQuoteTerms(library);
  assert.equal(defaults.terms, "<p>Standard</p><p>Acceptance</p>");
  assert.deepEqual(defaults.terms_term_ids, ["a", "c"]);
});

test("no Always terms means a quote carries none, rather than inventing some", () => {
  const defaults = defaultQuoteTerms([{ id: "b", body_html: "<p>Install</p>", always_include: false }].map(normalizeQuoteTerm));
  assert.equal(defaults.terms, "");
  assert.deepEqual(defaults.terms_term_ids, []);
});

// ── The rules the screens have to keep ───────────────────────────────────────

test("every path that makes a quote uses the library, not the old single box", () => {
  // A default that reached one creation path and not another is worse than
  // none: the same button would produce different documents.
  for (const path of [
    "app/api/admin/quotes/route.js",
    "app/api/admin/quote-requests/route.js",
    "app/api/admin/quotes/[id]/duplicate/route.js",
  ]) {
    const src = read(path);
    assert.match(src, /defaultQuoteTermsFor/, `${path} must read the terms library`);
    assert.doesNotMatch(src, /businessDefaults\.quote_terms/, `${path} must not read the retired single default`);
  }
});

test("terms are sanitised on the server when a quote is saved", () => {
  // The editor cleans as you type. This is the one the browser cannot skip.
  for (const path of ["app/api/admin/quotes/route.js", "app/api/admin/quotes/[id]/route.js"]) {
    assert.match(read(path), /sanitizeTermsHtml/, `${path} must sanitise terms before storing them`);
  }
});

test("both customer-facing pages render terms through the whitelist", () => {
  for (const path of ["app/(site)/quotes/QuoteApprovalClient.js", "app/(site)/quote/QuoteViewClient.tsx"]) {
    const src = read(path);
    assert.match(src, /dangerouslySetInnerHTML=\{\{ __html: toTermsHtml\(/, `${path} must pass terms through toTermsHtml`);
  }
});

test("the PDF measures and draws formatted terms with the same function", () => {
  // Sizing the box with one layout and filling it with another is how a notes
  // block clips or overflows.
  const src = read("lib/pcd-cabinet-pdf.js");
  assert.match(src, /function quoteNoteLines\(value, width, rich\)/);
  assert.match(src, /quoteNoteContainerHeight\(value, width, rich\)/);
  assert.match(src, /drawRichTextLines\(page, quoteNoteLines\(value, width, true\)/);
});
