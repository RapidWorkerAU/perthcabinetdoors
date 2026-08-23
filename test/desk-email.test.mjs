// THE EMAIL WE SEND MOST OFTEN LOOKED LEAST LIKE US.
//
// A reply from the customer desk had a frame of its own: its own palette, its
// own header, its own footer. So the wrapper a customer had already seen twice,
// on their enquiry confirmation and their quote request confirmation, was not
// the one our actual replies arrived in.
//
// Two frames also meant two things to keep working in Outlook, which renders
// with Word and throws away most of a stylesheet, and two things to keep
// readable on a phone. The shell used by the website emails is the one already
// proven against both.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deskReplyEmailHtml, deskReplyEmailText } from "../lib/pcd-desk-email.js";
import { customerEnquiryHtml, customerQuoteRequestHtml, emailShell } from "../lib/pcd-email-templates.js";

const REFERENCE = {
  kind: "Quote",
  reference: "PCD-Q-2026-4A7C21",
  dateLabel: "Sent",
  date: "18 February 2026",
  amount: "$4,182.00",
};

const desk = (extra = {}) =>
  deskReplyEmailHtml({
    subject: "Re: Your quote PCD-Q-2026-4A7C21",
    bodyHtml: "<p>Hi Sarah,</p><p>The quote still stands.</p>",
    signatureHtml: "<p>Ashleigh</p>",
    reference: REFERENCE,
    ...extra,
  });

// The structural pieces that make one email look like another: the ground, the
// header band, the card width and its border. If these match, they read as the
// same sender.
const FRAME = ["background:#f4efe7", "background:#0d3550", "max-width:640px", "border:1px solid #e2e8f0"];

test("a desk reply is built in the same frame as the website emails", () => {
  const reply = desk();
  const enquiry = customerEnquiryHtml({ customerName: "Sarah" });
  const request = customerQuoteRequestHtml({ customerName: "Sarah", lines: [] });
  FRAME.forEach((mark) => {
    assert.ok(reply.includes(mark), `the desk reply is missing ${mark}`);
    assert.ok(enquiry.includes(mark) && request.includes(mark), `${mark} is not actually part of the shared frame`);
  });
});

test("it is the shell itself, not a copy that happens to match", () => {
  const source = readFileSync(new URL("../lib/pcd-desk-email.js", import.meta.url), "utf8");
  assert.match(source, /import \{ emailShell \} from "\.\/pcd-email-templates"/);
  assert.match(source, /return emailShell\(\{/);
  // A copy would drift the first time either is touched.
  assert.doesNotMatch(source, /<!doctype html>/i, "the desk template must not build its own document");
});

// ── SAYING WHERE IT CAME FROM ──────────────────────────────────────────────
//
// It is sent by our system rather than typed in somebody's mail app, so it
// carries neither the personal look nor the threading a customer may expect.
// Saying so, and saying that a plain reply reaches us, stops it reading as a
// machine that cannot be answered.

test("it says where it came from and that a reply reaches us", () => {
  const reply = desk();
  assert.match(reply, /order system, which is why it does not look like our usual emails/);
  assert.match(reply, /reply to this message as normal and it comes straight back to our team/);
});

// Plenty of people read the plain-text copy, and it must not be the one version
// that fails to explain itself.
test("the plain-text copy says it too", () => {
  const text = deskReplyEmailText({ bodyText: "Hi Sarah,", signatureText: "Ashleigh" });
  assert.match(text, /order system, which is why it does not look like our usual emails/);
  assert.match(text, /comes straight back to our team/);
});

// Quiet, and after the message. It answers a question somebody might have; it is
// not something to read before what they were actually sent.
test("the note is below the message, not above it", () => {
  const reply = desk();
  assert.ok(reply.indexOf("The quote still stands") < reply.indexOf("order system, which is why"));
});

// ── WHAT THE HEADER SAYS ───────────────────────────────────────────────────

test("the header names the conversation rather than repeating the company name", () => {
  assert.match(desk(), /Re: Your quote PCD-Q-2026-4A7C21/);
});

test("a reply with no subject still has a heading", () => {
  assert.match(desk({ subject: "" }), /A message from Perth Cabinet Doors/);
});

// A reply typed by a person opens with what they wrote. An introduction above it
// would be us talking over them, which every other template needs and this one
// does not.
test("nothing is written above the message", () => {
  const reply = desk();
  assert.doesNotMatch(reply, /margin:0 0 18px;color:#334155/, "the shell's intro paragraph must not render");
  assert.ok(emailShell({ title: "x", children: "y" }).includes("y"), "and intro stays optional");
  assert.match(
    emailShell({ title: "x", intro: "an intro", children: "y" }),
    /an intro/,
    "while a template that wants one still gets one"
  );
});

// ── WHAT MUST SURVIVE THE MOVE ─────────────────────────────────────────────

test("the message, the signature and the reference all still come through", () => {
  const reply = desk();
  assert.match(reply, /The quote still stands/);
  assert.match(reply, /Ashleigh/);
  assert.match(reply, /This conversation relates to/);
  assert.match(reply, /PCD-Q-2026-4A7C21/);
  assert.match(reply, /\$4,182\.00/);
});

test("a reply with no signature or reference does not render empty boxes", () => {
  const bare = deskReplyEmailHtml({ subject: "Hello", bodyHtml: "<p>Just a note.</p>" });
  assert.doesNotMatch(bare, /This conversation relates to/);
  assert.match(bare, /Just a note\./);
});

// The body is already the sanitised subset the editor produces. Escaping it
// again would print its own tags at the customer.
test("the written message is not escaped twice", () => {
  assert.match(desk(), /Hi Sarah,<\/p>/);
});

// ── spaced the way it was typed ────────────────────────────────────────────
//
// A paragraph with no style on it is spaced by whatever is reading it: 8px in
// our editor, and "margin: 1em 0" in a mail client, which most of them do not
// collapse the way a browser does. So one blank line typed between two
// sentences arrived as a gap four times the size of the one on screen.
test("every paragraph carries its own spacing, because a style block would be stripped", () => {
  const reply = desk();
  assert.match(reply, /<p style="margin:0 0 10px;">Hi Sarah,<\/p>/);
  assert.doesNotMatch(reply, /<p>/, "not one paragraph left to the mail client's own margins");
});

// A reminder of which job this is, not a way back into it: an approved order
// with variations against it would send somebody to figures that have changed.
test("the reference is not a link", () => {
  const reply = desk();
  const panel = reply.slice(reply.indexOf("This conversation relates to"));
  assert.doesNotMatch(panel.slice(0, 700), /<a /, "the reference must not link to the quote or order");
});

// The preview on the settings screen and the real send build from one function,
// so what is approved on screen is what lands in an inbox.
test("the preview and the send are the same template", () => {
  const card = readFileSync(new URL("../app/admin/_components/EmailSignatureCard.js", import.meta.url), "utf8");
  assert.match(card, /deskReplyEmailHtml\(\{/);
  assert.match(card, /subject: "Re: Your quote/, "and the preview shows a subject, since the header uses one");

  const route = readFileSync(
    new URL("../app/api/admin/customer-desk/[customerId]/reply/route.js", import.meta.url),
    "utf8"
  );
  assert.match(route, /deskReplyEmailHtml\(\{ bodyHtml: written, signatureHtml, reference, subject \}\)/);
});
