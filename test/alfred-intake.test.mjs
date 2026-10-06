// ALFRED, PHASE 3: QUOTE REQUESTS AND ENQUIRIES.
//
// ── WHAT THIS PROTECTS ───────────────────────────────────────────────────────
//
//   A DRAFT QUOTE IS MADE THE WAY A PERSON MAKES ONE. Alfred calls the same
//   convertQuoteRequest as the Convert to quote button, so the pricing, the
//   line gate and the completeness check cannot drift apart.
//
//   NO MODEL PRICES A QUOTE. The quote job never asks Claude anything.
//
//   NOTHING IS SENT. A draft quote cannot be "approved" from the Alfred page;
//   it is sent from the quote. Declining deletes it only while it is a draft.
//
//   AN ENQUIRY REPLY IS ITS OWN CONVERSATION, and sending it marks the enquiry
//   responded.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { enquirySourceKey, quoteSourceKey, requestsDue } from "../lib/pcd-alfred-intake.js";
import { normaliseAlfredSettings } from "../lib/pcd-alfred-settings.js";
import { alfredNoteFor } from "../components/admin/AlfredLineNote.tsx";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const intake = read("lib/pcd-alfred-intake.js");
const drafts = read("lib/pcd-alfred-drafts.js");

test("a request waits the set hours, and only unquoted requests count", () => {
  const now = new Date("2026-10-06T10:00:00Z");
  const rows = [
    { id: "a", status: "new", created_at: "2026-10-05T09:00:00Z" },
    { id: "b", status: "new", created_at: "2026-10-05T11:00:00Z" },
    { id: "c", status: "reviewing", created_at: "2026-10-04T09:00:00Z" },
    { id: "d", status: "new", converted_quote_id: "q1", created_at: "2026-10-01T09:00:00Z" },
    { id: "e", status: "closed", created_at: "2026-10-01T09:00:00Z" },
    { id: "f", status: "new", created_at: "2026-08-01T09:00:00Z" },
  ];
  assert.deepEqual(requestsDue(rows, 24, now).map((r) => r.id), ["c", "a"], "oldest first; under 24 hours, quoted, closed and over 30 days are left");
});

test("the wait and the two jobs are settings", () => {
  const s = normaliseAlfredSettings({});
  assert.equal(s.quote_wait_hours, 24);
  assert.equal(s.jobs.quotes, true);
  assert.equal(s.jobs.enquiries, true);
  assert.equal(normaliseAlfredSettings({ quote_wait_hours: 1 }).quote_wait_hours, 4);
  assert.equal(normaliseAlfredSettings({ jobs: { quotes: false } }).jobs.quotes, false);
});

test("each request and enquiry is drafted once", () => {
  assert.equal(quoteSourceKey("r1"), "quote:r1");
  assert.equal(enquirySourceKey("e1"), "enquiry:e1");
});

test("a draft quote is made by the same conversion as the button, and no model prices it", () => {
  assert.match(intake, /convertQuoteRequest\(supabase, request\.id, \{ actorType: "alfred" \}\)/);
  assert.match(read("app/api/admin/quote-requests/route.js"), /convertQuoteRequest\(context\.supabase, payload\.id, \{ actorType: "admin" \}\)/);
  const quoteJob = intake.slice(intake.indexOf("export async function runQuoteDrafts"), intake.indexOf("export function offeringFacts"));
  assert.doesNotMatch(quoteJob, /askForReply/);
});

test("a draft quote is sent from the quote, never from the Alfred page", () => {
  assert.match(drafts, /if \(draft\.kind === "quote"\) throw fail\("Open the draft quote/);
});

test("declining deletes the draft quote only while it is still a draft", () => {
  assert.match(intake, /if \(quote && quote\.status !== "draft"\)/);
  assert.match(drafts, /if \(draft\?\.kind === "quote" && draft\.status === "waiting"\) await discardDraftQuote/);
});

test("a draft quote settles when it is sent the normal way or deleted, not by age", () => {
  assert.match(intake, /if \(!quote\) return \{ status: "withdrawn"/);
  assert.match(intake, /if \(quote\.status !== "draft"\) return \{ status: "approved"/);
  assert.match(drafts, /decided_by: "Sent from the quote"/);
});

test("an enquiry reply starts its own conversation and marks the enquiry responded", () => {
  assert.match(drafts, /newTicket: draft\.kind === "update" \|\| draft\.kind === "enquiry"/);
  assert.match(drafts, /update\(\{ status: "responded"/);
});

test("only an email a person sent counts as already answering an enquiry", () => {
  assert.match(intake, /\.some\(countsAsUpdate\)/);
});

test("Alfred's line note finds its line by id, then by place", () => {
  const notes = [
    { lineId: "l1", index: 0, note: "Needs a price" },
    { lineId: null, index: 2, note: "Made to order" },
  ];
  assert.equal(alfredNoteFor(notes, { id: "l1" }, 5), "Needs a price");
  assert.equal(alfredNoteFor(notes, { id: "lx" }, 2), "Made to order");
  assert.equal(alfredNoteFor(notes, { id: "l9" }, 1), "");
  assert.equal(alfredNoteFor(null, { id: "l1" }, 0), "");
});

test("the quote, the lists and the hourly pass all know about it", () => {
  assert.match(read("app/admin/quotes/[id]/QuoteEditor.js"), /<AlfredLineNote index=\{index\}/);
  assert.match(read("app/admin/quotes/[id]/QuoteEditor.js"), /Drafted by Alfred from the quote request\./);
  assert.match(read("app/api/admin/quotes/[id]/route.js"), /alfred: alfred \|\| null/);
  for (const list of ["app/admin/quotes/QuotesTable.tsx", "app/admin/enquiries/EnquiriesManager.tsx", "app/admin/quote-requests/QuoteRequestsManager.tsx"]) {
    assert.match(read(list), /<AlfredDot/, list);
  }
  assert.match(read("app/api/cron/alfred/route.js"), /runIntakeDrafts\(supabase\)/);
  assert.match(read("app/api/admin/alfred/run/route.js"), /runIntakeDrafts\(context\.supabase\)/);
});
