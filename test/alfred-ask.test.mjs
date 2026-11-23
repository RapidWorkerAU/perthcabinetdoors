// ASK ALFRED: THE CHAT, WHICH IS ALL OF ALFRED NOW.
//
// ── WHAT THIS PROTECTS ───────────────────────────────────────────────────────
//
//   THE CHAT CHANGES NOTHING. Every tool it has only reads. A tool that could
//   save, send or change something would be a decision made in code review,
//   not slipped in beside these.
//
//   EVERY REPLY IS ONE OF A FIXED SET OF KINDS, and an answer that leans on a
//   fact it never looked up is refused.
//
//   IT NEVER DRAFTS OR SENDS AN EMAIL, AND NEVER SENDS A PAYMENT LINK.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOOLS, chatMessages, checkAsk } from "../lib/pcd-alfred-ask.js";
import { privacyPolicySections } from "../lib/pcd-privacy-policy.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const facts = [
  { key: "F1", text: "Order PCD-1042 for Sarah Nguyen: status active." },
  { key: "F2", text: "Our lead time is 15 working days." },
];

test("the chat's tools only look things up", () => {
  assert.deepEqual(TOOLS.map((t) => t.name).sort(), [
    "calendar",
    "customer_facts",
    "customer_jobs",
    "find_customers",
    "find_orders",
    "find_quotes",
    "money_owing",
    "month_figures",
    "open_orders",
    "order_items",
    "quote_lines",
    "requests_and_enquiries",
    "supplier_orders",
    "whats_waiting",
  ]);
  assert.doesNotMatch(read("lib/pcd-alfred-lookups.js"), /\.(insert|update|upsert|delete)\(/, "a lookup wrote to the database");
  const ask = read("lib/pcd-alfred-ask.js");
  const runTool = ask.slice(ask.indexOf("export async function runTool"), ask.indexOf("export function checkAsk"));
  assert.doesNotMatch(runTool, /\.(insert|update|upsert|delete)\(/, "a tool wrote to the database");
  assert.doesNotMatch(runTool, /sendDeskReply|approveDraft|resend/i);
});

test("an answer must rest on something looked up", () => {
  assert.equal(checkAsk({ kind: "answer", text: "It is active.", facts_used: ["F1"] }, { facts }).ok, true);
  assert.match(checkAsk({ kind: "answer", text: "It is active.", facts_used: [] }, { facts }).problem, /without looking anything up/);
  assert.match(checkAsk({ kind: "answer", text: "It ships Friday.", facts_used: ["F9"] }, { facts }).problem, /never looked up \(F9\)/);
  assert.equal(checkAsk({ kind: "answer", text: "Noted.", facts_used: ["team"] }, { facts }).ok, true, "what the person said counts");
});

test("the chat cannot draft an email or a batch of them, or send a payment link", () => {
  const seen = new Set(["c1"]);
  const plan = { kind: "plan", text: "I will email Sarah.", facts_used: ["F1"], email: { customer_id: "c1", subject: "Doors", body: "Hi Sarah" } };
  assert.equal(checkAsk(plan, { facts, seen }).ok, false);
  const batch = { kind: "batch", text: "I will email them.", facts_used: [], batch: { customer_ids: ["c1"], instruction: "Say hello." } };
  assert.equal(checkAsk(batch, { facts, seen }).ok, false);
  const ask = read("lib/pcd-alfred-ask.js");
  assert.doesNotMatch(ask, /approveDraft|sendDeskReply|sendChatEmail|draftBatch|pcd_alfred_drafts/);
  assert.match(ask, /What you cannot do: draft, write or send an email to anyone; send or create a payment link or a payment request;/);
  const route = read("app/api/admin/alfred/ask/route.js");
  assert.doesNotMatch(route, /action === "send"|action === "batch"/);
});

test("confirm keeps at most four options; cannot and unclear need no facts", () => {
  const c = checkAsk({ kind: "confirm", text: "Which Sarah?", options: ["A", "B", "C", "D", "E"], facts_used: [] }, { facts });
  assert.deepEqual(c.result.options, ["A", "B", "C", "D"]);
  assert.equal(checkAsk({ kind: "cannot", text: "I cannot change orders.", facts_used: [] }, { facts }).ok, true);
  assert.equal(checkAsk({ kind: "unclear", text: "Try: where is PCD-1042 up to?", facts_used: [] }, { facts }).ok, true);
  assert.equal(checkAsk({ kind: "change_order", text: "Done." }, { facts }).ok, false);
});

test("the chat history carries text only, alternating, starting with the person", () => {
  const m = chatMessages([
    { role: "alfred", text: "Hello" },
    { role: "you", text: "Where is PCD-1042?" },
    { role: "you", text: "And the ETA?" },
    { role: "alfred", text: "It is active." },
  ]);
  assert.deepEqual(m.map((x) => x.role), ["user", "assistant"]);
  assert.match(m[0].content, /PCD-1042\?\n\nAnd the ETA\?/);
  assert.equal(m[1].content, "It is active.");
});

test("the privacy page no longer talks about AI drafting, and still names the AI service", () => {
  const sections = privacyPolicySections({ salesEmail: "s@x", tradingName: "T", legalEntity: "L" });
  assert.ok(!sections.some((s) => s.key === "ai"), "no AI drafting section");
  for (const s of sections) for (const t of [...(s.paragraphs || []), ...(s.bullets || [])]) assert.doesNotMatch(t, /draft/i);
  assert.ok(sections.some((s) => (s.bullets || []).some((b) => /AI service/.test(b))), "the AI service is still listed as seeing records");
  assert.ok(sections.some((s) => (s.bullets || []).some((b) => /never reach us/.test(b))), "card details");
  for (const s of sections) for (const t of [...(s.paragraphs || []), ...(s.bullets || [])]) assert.doesNotMatch(t, /[–—]/);
  assert.match(read("components/public/PublicFooter.tsx"), /href="\/privacy"/);
  assert.match(read("lib/pcd-seo.js"), /path: "\/privacy"/);
});

test("a table comes back as a table, never as rows of | in the words", async () => {
  const { cleanTable, tableFromText } = await import("../lib/pcd-alfred-ask.js");
  const facts = [{ key: "F1", text: "x" }];
  const asked = checkAsk({ kind: "answer", text: "Three orders owe money.", facts_used: ["F1"], table: { columns: ["Order", "Owing"], rows: [["PCD-1", "$10.00"], ["PCD-2"], []] } }, { facts });
  assert.deepEqual(asked.result.table, { columns: ["Order", "Owing"], rows: [["PCD-1", "$10.00"], ["PCD-2", ""]] }, "rows made as wide as the headings, empty rows dropped");
  const written = checkAsk({ kind: "answer", text: "Here they are.\n\n| Order | Owing |\n|---|---|\n| PCD-1 | $10.00 |\n| PCD-2 | $5.00 |\n\nTotal $15.00.", facts_used: ["F1"], table: { columns: [], rows: [] } }, { facts });
  assert.deepEqual(written.result.table, { columns: ["Order", "Owing"], rows: [["PCD-1", "$10.00"], ["PCD-2", "$5.00"]] });
  assert.equal(written.result.text, "Here they are.\n\nTotal $15.00.");
  assert.equal(cleanTable({ columns: [], rows: [["a"]] }), null);
  assert.deepEqual(tableFromText("No table here."), { text: "No table here.", table: null });
  assert.match(read("app/admin/alfred/AskAlfred.tsx"), /<AnswerTable table=\{turn\.table\} \/>/);
});
