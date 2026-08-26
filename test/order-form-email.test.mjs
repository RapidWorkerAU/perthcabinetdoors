// EMAILING SOMEBODY THE ORDER FORM.
//
// The words are the feature. This email goes to the customers who were not
// going to fill anything in, so "here is a spreadsheet" gets ignored and saying
// what it is FOR is what gets it back.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ORDER_FORM_SUBJECT,
  defaultOrderFormMessage,
  orderFormEmailHtml,
  orderFormEmailText,
} from "../lib/pcd-order-form-email.js";

const ROUTE = readFileSync(new URL("../app/api/admin/order-form/email/route.js", import.meta.url), "utf8");

// ── The default words ───────────────────────────────────────────────────────

test("the message says why the form exists, not just that it is attached", () => {
  const message = defaultOrderFormMessage({ name: "Jason Brown" });
  // The three things the customer needs to be told, in the customer's terms.
  assert.match(message, /same questions as our online order form/i, "it is not extra work");
  assert.match(message, /only offer what we actually stock/i, "the dropdowns are the benefit");
  assert.match(message, /every field that applies/i, "and this is what we are asking of them");
});

test("the message covers the two things that cost us a remake", () => {
  const message = defaultOrderFormMessage({});
  assert.match(message, /height first, then width/i);
  assert.match(message, /which side they go/i);
});

test("it opens with their first name when we know it, and politely when we do not", () => {
  assert.match(defaultOrderFormMessage({ name: "Jason Brown" }), /^Hi Jason,/);
  assert.match(defaultOrderFormMessage({ name: "  Sarah  " }), /^Hi Sarah,/);
  assert.match(defaultOrderFormMessage({}), /^Hi,/);
  assert.match(defaultOrderFormMessage({ name: "   " }), /^Hi,/);
});

test("it signs off with whoever is sending it", () => {
  assert.match(defaultOrderFormMessage({ fromName: "Ashleigh" }), /Thanks,\nAshleigh$/);
  assert.match(defaultOrderFormMessage({}), /Thanks,$/);
});

test("it says a quote comes back before anything is made", () => {
  // A form that reads like an order rather than a request is how somebody ends
  // up believing they have committed to a price nobody has given them.
  const message = defaultOrderFormMessage({});
  assert.match(message, /written quote/i);
  assert.match(message, /Nothing gets made or ordered until you have approved/i);
});

// ── Turning it into a branded email ─────────────────────────────────────────

test("the email goes out in our usual styling", () => {
  const html = orderFormEmailHtml({ message: "Hello there.", fileName: "PCD-Order-Form.xlsx" });
  // emailShell's own markers, so this cannot quietly become a plain email.
  assert.match(html, /Perth Cabinet Doors/);
  assert.match(html, /sales@perthcabinetdoors\.com\.au/);
  assert.match(html, /^<!doctype html>/i);
});

test("a dash line becomes a real bullet and everything else becomes a paragraph", () => {
  // Whoever is sending this is writing an email, not authoring HTML. Anything
  // cleverer than paragraphs and bullets is a way for a stray character to
  // reach a customer as markup.
  const html = orderFormEmailHtml({
    message: "Some words.\n\n- first point\n- second point\n\nAnd a closing line.",
  });
  assert.equal((html.match(/<ul /g) || []).length, 1, "one list, not one per bullet");
  assert.equal((html.match(/<li /g) || []).length, 2);
  assert.match(html, />first point</);
  assert.match(html, /<p [^>]*>Some words\.<\/p>/);
  assert.match(html, /<p [^>]*>And a closing line\.<\/p>/);
});

test("two runs of bullets stay two lists rather than merging", () => {
  const html = orderFormEmailHtml({ message: "- a\n- b\n\nWords in between.\n\n- c" });
  assert.equal((html.match(/<ul /g) || []).length, 2);
  assert.match(html, /Words in between\./);
});

test("an asterisk bullet works too, because people type both", () => {
  const html = orderFormEmailHtml({ message: "* only point" });
  assert.match(html, /<li [^>]*>only point<\/li>/);
});

test("what somebody types cannot reach the customer as markup", () => {
  // The message is edited by hand before every send, so a stray angle bracket
  // is a normal thing to type, not an attack.
  const html = orderFormEmailHtml({ message: "Sizes are <600 wide & \"square\".\n- <b>bold</b>" });
  assert.ok(!html.includes("<b>bold</b>"), "markup got through");
  assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;/);
  assert.match(html, /&lt;600 wide &amp; &quot;square&quot;/);
});

test("the attachment is named, with the one thing that stops the dropdowns working", () => {
  // A file emailed to somebody opens read-only in Protected View, and in that
  // state the dropdowns do nothing at all. Left unsaid, that reads as a broken
  // spreadsheet rather than as a button they have not pressed.
  const html = orderFormEmailHtml({ message: "Hi.", fileName: "PCD-Order-Form-2026-08-25.xlsx" });
  assert.match(html, /PCD-Order-Form-2026-08-25\.xlsx/);
  assert.match(html, /Enable Editing/);

  const text = orderFormEmailText({ message: "Hi.", fileName: "PCD-Order-Form-2026-08-25.xlsx" });
  assert.match(text, /PCD-Order-Form-2026-08-25\.xlsx/);
  assert.match(text, /Enable Editing/);
});

test("a plain text copy goes with it", () => {
  // Some clients will not show HTML, and an empty email is worse than a plain
  // one.
  const text = orderFormEmailText({ message: defaultOrderFormMessage({ name: "Jason" }) });
  assert.match(text, /^Hi Jason,/);
  assert.match(text, /Perth Cabinet Doors/);
  assert.ok(!text.includes("<"), "the text copy has markup in it");
});

test("the subject says what it is for rather than what it is", () => {
  assert.match(ORDER_FORM_SUBJECT, /order form/i);
  assert.ok(ORDER_FORM_SUBJECT.length < 80, "a long subject gets cut off in the inbox");
});

// ── The route ───────────────────────────────────────────────────────────────

test("the form is built at send time, not taken from a file", () => {
  // A file made last month offers colours we may have stopped stocking. The
  // customer gets today's library or nothing.
  assert.match(ROUTE, /generateOrderForm\(context\.supabase\)/);
});

test("the send is checked, because Resend does not throw when it refuses", () => {
  // The whole reason lib/pcd-send-email.js exists: a refused message comes back
  // as { error }, and a route that ignores it tells somebody their email went.
  assert.match(ROUTE, /sendEmail\(resend, \{/);
  assert.match(ROUTE, /if \(!sent\.ok\)/);
});

test("filing it on the desk cannot make a sent email report as unsent", () => {
  // The customer has the form either way. Failing the request after the send
  // would have somebody send it a second time, which reads as a nag.
  const filing = ROUTE.slice(ROUTE.indexOf("recordOutboundEmail"));
  assert.match(ROUTE, /try \{\s*await recordOutboundEmail/);
  assert.match(filing, /catch \(deskError\)/);
  assert.ok(!/catch \(deskError\)[\s\S]{0,200}throw/.test(filing), "a desk failure is being rethrown");
});

test("a reply goes back to whoever sent it", () => {
  // Otherwise it lands in the general inbox for somebody to notice and pass on.
  assert.match(ROUTE, /replyTo: context\.user\?\.email/);
});

test("the address is checked before a workbook is built for it", () => {
  // Building the file takes a second and reads three tables. Doing that before
  // noticing the address is a typo is work nobody asked for.
  const validate = ROUTE.indexOf("EMAIL_SHAPE.test(to)");
  const build = ROUTE.indexOf("generateOrderForm(context.supabase)");
  assert.ok(validate > 0 && build > validate, "the address is checked after the build");
});

test("the route is admin only", () => {
  assert.match(ROUTE, /requireAdminApiContext\(\)/);
  assert.match(ROUTE, /if \(context\.error\) return context\.error/);
});
