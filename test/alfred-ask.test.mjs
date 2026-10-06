// ALFRED, PHASE 4: ASK ALFRED, AND THE PRIVACY LINE.
//
// ── WHAT THIS PROTECTS ───────────────────────────────────────────────────────
//
//   THE CHAT CHANGES NOTHING. Every tool it has only reads. A tool that could
//   save, send or change something would be a decision made in code review,
//   not slipped in beside these.
//
//   EVERY REPLY IS ONE OF FIVE KINDS, and an answer or an email that leans on
//   a fact it never looked up is refused.
//
//   AN EMAIL GOES TO A CUSTOMER IT LOOKED UP, and is sent through approveDraft
//   like every other Alfred draft.
//
//   THE PRIVACY PAGE SAYS A PERSON APPROVES EVERY EMAIL.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOOLS, chatMessages, checkAsk } from "../lib/pcd-alfred-ask.js";
import { AI_DRAFTING_LINE, privacyPolicySections } from "../lib/pcd-privacy-policy.js";

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

test("an email goes only to a customer it looked up", () => {
  const raw = { kind: "plan", text: "I will email Sarah.", facts_used: ["F1"], email: { customer_id: "c1", subject: "Re: Your doors", body: "Hi Sarah — your order is active." } };
  assert.match(checkAsk(raw, { facts, seen: new Set() }).problem, /without looking the customer up/);
  const ok = checkAsk(raw, { facts, seen: new Set(["c1"]) });
  assert.equal(ok.ok, true);
  assert.equal(ok.result.email.subject, "Your doors");
  assert.equal(ok.result.email.body, "Hi Sarah, your order is active.", "no dashes, ever");
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
    { role: "alfred", text: "I will email her.", email: { subject: "Doors", body: "Hi" } },
  ]);
  assert.deepEqual(m.map((x) => x.role), ["user", "assistant"]);
  assert.match(m[0].content, /PCD-1042\?\n\nAnd the ETA\?/);
  assert.match(m[1].content, /Drafted email, subject "Doors"/);
});

test("a chat email is sent the same way as every other draft", () => {
  const ask = read("lib/pcd-alfred-ask.js");
  assert.match(ask, /kind: "chat"/);
  assert.match(ask, /return approveDraft\(supabase, saved\.id/);
  assert.match(read("lib/pcd-alfred-drafts.js"), /draft\.kind === "chat"/);
});

test("the privacy page says a person approves every email", () => {
  assert.match(AI_DRAFTING_LINE, /A person reads and approves every email before it is sent\./);
  const sections = privacyPolicySections({ salesEmail: "s@x", tradingName: "T", legalEntity: "L" });
  assert.ok(sections.some((s) => (s.paragraphs || []).includes(AI_DRAFTING_LINE)));
  assert.ok(sections.some((s) => (s.bullets || []).some((b) => /never reach us/.test(b))), "card details");
  for (const s of sections) for (const t of [...(s.paragraphs || []), ...(s.bullets || [])]) assert.doesNotMatch(t, /[–—]/);
  assert.match(read("components/public/PublicFooter.tsx"), /href="\/privacy"/);
  assert.match(read("lib/pcd-seo.js"), /path: "\/privacy"/);
});

test("a declined draft's reason teaches Alfred, except reasons that say nothing about the draft", async () => {
  const { DECLINE_REASONS, LESSON_REASONS } = await import("../lib/pcd-alfred-reasons.js");
  const { replyPrompt } = await import("../lib/pcd-alfred-model.js");
  assert.ok(LESSON_REASONS.every((r) => DECLINE_REASONS.includes(r)), "every lesson is a button");
  assert.ok(!LESSON_REASONS.includes("We already rang them"));
  const prompt = replyPrompt({ facts: [], thread: [], examples: [], lessons: [{ reason: "Tone is off", kind: "reply", text: "Hey mate!!" }] });
  assert.match(prompt, /<declined_drafts>\n<declined reason="Tone is off" kind="reply">\nHey mate!!\n<\/declined>/);
  assert.match(read("lib/pcd-alfred-context.js"), /\.in\("decline_reason", LESSON_REASONS\)/);
  assert.doesNotMatch(read("app/admin/alfred/AlfredClient.tsx"), /Alfred will remember/);
});

test("an edit made before sending teaches Alfred, and approving works before the SQL runs", async () => {
  const { replyPrompt } = await import("../lib/pcd-alfred-model.js");
  const prompt = replyPrompt({ facts: [], thread: [], examples: [], edits: [{ kind: "reply", before: "Hi Sarah!!", after: "Hi Sarah," }] });
  assert.match(prompt, /<edited_drafts>\n<edit kind="reply">\n<alfred_wrote>\nHi Sarah!!\n<\/alfred_wrote>\n<we_sent>\nHi Sarah,\n<\/we_sent>/);
  const drafts = read("lib/pcd-alfred-drafts.js");
  assert.match(drafts, /edited \? \{ \.\.\.claim, original_body: draft\.body_text \} : claim/);
  assert.match(drafts, /claimError\?\.code === "PGRST204"/);
  assert.match(read("lib/pcd-alfred-context.js"), /\.eq\("edited_before_send", true\)/);
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
