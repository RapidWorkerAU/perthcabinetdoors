// MONEY WE ARE HOLDING FOR A CUSTOMER.
//
// Two mistakes are possible here and both cost real money:
//
//   applying a credit in the wrong place hands back more than we were paid
//   applying one to two quotes hands it back twice
//
// Every test below is one of those two, or a way somebody's money could quietly
// disappear off their record.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyCredits,
  claimableCredits,
  creditLabel,
  creditSentence,
  creditsOnQuote,
  depositAfterCredit,
  quoteCreditView,
  quoteStillLive,
} from "../lib/pcd-customer-credits.js";
import { depositAmountForQuote, depositBeforeCreditForQuote } from "../lib/pcd-quote-acceptance.js";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const LIB = read("lib/pcd-customer-credits.js");
const MIGRATION = read("supabase/202609191500_pcd_customer_credits.sql");
const PUBLIC_GET = read("app/api/quote-workflow/get/route.js");
const PUBLIC_PAGE = read("app/(site)/quotes/QuoteApprovalClient.js");
const BUILDER = read("app/admin/quotes/[id]/QuoteEditor.js");
const ORDER_FROM_QUOTE = read("lib/pcd-order-from-quote.js");
const QUOTE_ROUTE = read("app/api/admin/quotes/[id]/route.js");
const PDF = read("lib/pcd-cabinet-pdf.js");
const CUSTOMER_API = read("app/api/admin/customers/[id]/credits/route.js");

const credit = (over = {}) => ({
  id: "c1", amount: 100, paid_on: "2026-09-24", reason: "site_measure",
  state: "held", held_quote_id: "q1", currency: "AUD", ...over,
});

// ── the arithmetic ──────────────────────────────────────────────────────────

test("a credit is applied under the total, never as a cost line", () => {
  // THE MISTAKE THIS PINS. Cost rows are ex GST. Taking $100 off there removes
  // $100 before GST is added, so the customer keeps $110 against a $100
  // payment. Ten dollars gone on every quote, and the two ways agree exactly
  // when the credit is zero, which is why it would ship unnoticed.
  const view = quoteCreditView({ id: "q1", total_inc_gst: 1364 }, [credit()]);
  assert.equal(view.total, 1364, "the quote total does not move");
  assert.equal(view.applied, 100, "exactly what they paid");
  assert.equal(view.payable, 1264);

  // The wrong way, for the record: 1240 - 100 = 1140, plus GST = 1254, which
  // hands back 110 for a 100 payment.
  assert.notEqual(view.payable, 1254);
});

test("it never applies more than the total, because that is a refund nobody authorised", () => {
  const result = applyCredits([credit(), credit({ id: "c2", amount: 100 })], 150);
  assert.equal(result.applied, 150);
  assert.equal(result.payable, 0);
  assert.equal(result.lines[1].full, false, "and it says the second one was only part used");
});

test("two credits both apply, oldest first", () => {
  const result = applyCredits(
    [credit({ id: "c2", paid_on: "2026-10-02" }), credit({ id: "c1", paid_on: "2026-09-24" })],
    1364
  );
  assert.equal(result.applied, 200);
  assert.equal(result.payable, 1164);
  assert.equal(result.lines.length, 2);
});

test("a quote holding nothing says nothing", () => {
  assert.equal(quoteCreditView({ id: "q2", total_inc_gst: 1364 }, [credit()]), null);
  assert.equal(quoteCreditView({ id: "q1", total_inc_gst: 1364 }, []), null);
});

// ── the words ───────────────────────────────────────────────────────────────

test("the line names what they paid for and when", () => {
  // Somebody checking a quote against a bank statement has to find the line,
  // and two credits on one quote have to be tellable apart.
  assert.match(creditLabel(credit()), /^Site measure fee paid 24 Sep/);
  assert.match(creditLabel(credit({ paid_on: null })), /already paid/);
});

test("a date reads the same wherever the reader is", () => {
  // Formatted in UTC off the parts. A credit paid on the 24th must not read as
  // the 23rd for anybody west of Greenwich.
  assert.match(creditLabel(credit({ paid_on: "2026-01-01" })), /1 Jan 2026/);
});

test("the sentence states the numbers and thanks nobody", () => {
  const view = quoteCreditView({ id: "q1", total_inc_gst: 1364 }, [credit()]);
  const sentence = creditSentence(view, { depositBefore: 682, depositAfter: 582 });
  assert.match(sentence, /\$100\.00/);
  assert.match(sentence, /\$582\.00 rather than \$682\.00/);
  assert.ok(!/thank|great|happy|pleased/i.test(sentence));
});

// ── the deposit ─────────────────────────────────────────────────────────────

test("the credit comes off the deposit, not the final balance", () => {
  const quote = { deposit_required: true, deposit_percent: 50, total_inc_gst: 1364, credit_applied_inc_gst: 100 };
  assert.equal(depositBeforeCreditForQuote(quote), 682, "the share of the job does not change");
  assert.equal(depositAmountForQuote(quote), 582, "but there is less to pay to start");
});

test("a credit bigger than the deposit clears it rather than going negative", () => {
  const quote = { deposit_required: true, deposit_percent: 10, total_inc_gst: 1000, credit_applied_inc_gst: 500 };
  assert.equal(depositAmountForQuote(quote), 0);
  assert.equal(depositAfterCredit(100, 500), 0);
});

test("a quote with no credit is priced exactly as it always was", () => {
  const quote = { deposit_required: true, deposit_percent: 50, total_inc_gst: 1364 };
  assert.equal(depositAmountForQuote(quote), 682);
});

// ── the claim ───────────────────────────────────────────────────────────────

test("one quote holds a credit, and the column is what makes that true", () => {
  // held_quote_id being a single column is what stops two quotes claiming one
  // credit. Not a check in the code that somebody can forget.
  assert.match(MIGRATION, /held_quote_id uuid references public\.pcd_quotes\(id\)/);
  assert.match(MIGRATION, /pcd_customer_credits_state_shape/);
});

test("every state change is conditional on the state that was read", () => {
  // Two requests racing cannot both win. The database decides, not the timing.
  assert.match(LIB, /\.eq\("id", credit\.id\)\s*\n\s*\.eq\("state", "available"\)/);
  assert.match(LIB, /\.eq\("state", "held"\)\s*\n\s*\.eq\("held_quote_id", quoteId\)/);
});

test("credits attach on the save, not on a prompt at send", () => {
  // A question you can dismiss is a credit that gets lost, and the customer who
  // paid it never gets it back with nothing anywhere saying so.
  assert.equal((QUOTE_ROUTE.match(/await refreshQuoteCredits\(/g) || []).length, 2, "both save routes");
  assert.ok(!/confirm\(.*credit/i.test(BUILDER), "and nothing asks");
});

test("a save that cannot claim still saves the quote", () => {
  assert.match(LIB, /Never throws\. A quote save must not fail because a credit could not be/);
});

test("a dead quote lets go of what it was holding", () => {
  const REJECT = read("app/api/quote-workflow/action/route.js");
  const ARCHIVE = read("app/api/admin/quotes/[id]/archive/route.js");
  const EXPIRY = read("lib/pcd-quote-expiry.js");
  assert.match(REJECT, /releaseCreditsForQuote\(supabase, quote\.id\)/, "rejected");
  assert.match(ARCHIVE, /releaseCreditsForQuote\(context\.supabase, id\)/, "archived");
  assert.match(EXPIRY, /releaseCreditsForQuote\(supabase, quote\.id\)/, "expired");
});

test("the expiry release only happens after the quote was actually claimed", () => {
  const EXPIRY = read("lib/pcd-quote-expiry.js");
  const claimAt = EXPIRY.indexOf("if (!archived?.length) continue;");
  const releaseAt = EXPIRY.indexOf("releaseCreditsForQuote(supabase, quote.id)");
  assert.ok(claimAt > 0 && claimAt < releaseAt, "a quote approved seconds ago keeps its credit");
});

test("restoring an archived quote claims its credit back", () => {
  const ARCHIVE = read("app/api/admin/quotes/[id]/archive/route.js");
  assert.match(ARCHIVE, /else await refreshQuoteCredits\(context\.supabase, id, quote\.customer_id\)/);
});

test("only the live statuses count as holding", () => {
  assert.equal(quoteStillLive("draft"), true);
  assert.equal(quoteStillLive("sent"), true);
  assert.equal(quoteStillLive("approved"), false);
  assert.equal(quoteStillLive("archived"), false);
});

// ── becoming a payment ──────────────────────────────────────────────────────

test("accepting turns the credit into a paid payment on the order", () => {
  // Which is what makes the balance right everywhere with no new arithmetic:
  // outstandingOnOrder has always been the total less what came in.
  assert.match(ORDER_FROM_QUOTE, /spendCreditsOnOrder\(supabase, \{ quoteId: quote\.id, orderId: order\.id \}\)/);
  assert.match(LIB, /payment_type: "deposit"/);
  assert.match(LIB, /is_paid: true/);
});

test("the payment is dated when the customer actually paid, not today", () => {
  assert.match(LIB, /paid_at: String\(credit\.paid_on \|\| now\)\.slice\(0, 10\)/);
});

test("one payment row per credit, so the order can be traced", () => {
  assert.match(LIB, /for \(const credit of held\) \{/);
  assert.match(LIB, /notes: line\.label/);
});

test("a retried acceptance cannot pay the customer twice", () => {
  assert.match(LIB, /if \(!claimed\) continue;/);
});

test("a credit that will not spend does not stop the order being raised", () => {
  assert.match(ORDER_FROM_QUOTE, /the customer's credit did not reach the order/);
});

// ── what the customer sees ──────────────────────────────────────────────────

test("the public quote is handed the figure, not asked to work it out", () => {
  assert.match(PUBLIC_GET, /quoteCreditView\(quote, heldCredits\)/);
  assert.match(PUBLIC_GET, /depositAfterCredit\(depositFull, creditView\.applied\)/);
});

test("the public quote shows it under the total and never in the breakdown", () => {
  const block = PUBLIC_PAGE.slice(PUBLIC_PAGE.indexOf("publicCreditBlock"));
  assert.match(PUBLIC_PAGE, /publicCreditPayable/);
  assert.match(block, /Amount payable/);

  // The cost rows are the array literal itself, read precisely rather than by
  // searching the whole file for the word: the page holds a variable called
  // credit, and a loose match on it passes and fails for the wrong reasons.
  const rowsStart = PUBLIC_PAGE.indexOf("const costSummaryRows = [");
  const costRows = PUBLIC_PAGE.slice(rowsStart, PUBLIC_PAGE.indexOf("].filter(", rowsStart));
  assert.ok(!/credit/i.test(costRows), "a credit is never one of the cost rows");
});

test("the sticky bar shows what they pay, not what the job costs", () => {
  assert.match(PUBLIC_PAGE, /credit \? "Amount payable" : "Total inc GST"/);
});

test("the PDF says the same thing as the screen", () => {
  assert.match(PDF, /const credit = toNumber\(quote\.credit_applied_inc_gst\)/);
  assert.match(PDF, /label: "Amount payable", value: payable, grand: true/);
  const ATTACH = read("lib/pcd-quote-pdf-attachment.js");
  assert.match(ATTACH, /credit_label: creditLabelForPdf/);
});

// ── the builder ─────────────────────────────────────────────────────────────

test("the builder works it out with the same functions the customer's page does", () => {
  assert.match(BUILDER, /applyCredits\(heldCredits, totals\.total_inc_gst\)/);
  assert.match(BUILDER, /creditsOnQuote\(credits, quoteId\)/);
});

test("a credit sitting unapplied is said out loud rather than left to be found", () => {
  assert.match(BUILDER, /credit available, not applied/);
});

// ── taking money off somebody ───────────────────────────────────────────────

test("releasing needs no reason, because the money stays theirs", () => {
  assert.match(CUSTOMER_API, /if \(action === "release"\)/);
  const releaseBlock = CUSTOMER_API.slice(
    CUSTOMER_API.indexOf('if (action === "release")'),
    CUSTOMER_API.indexOf('if (action === "write_off"')
  );
  assert.ok(!/reason/.test(releaseBlock), "no justification box on a release");
});

test("writing one off refuses without a reason, in the library and not just the screen", () => {
  assert.match(LIB, /Say why\. Taking a credit off a customer is recorded\./);
  assert.match(LIB, /closed_by: actor \|\| null/);
});

test("a credit already spent cannot be written off after the fact", () => {
  assert.match(LIB, /\.in\("state", \["available", "held"\]\)/);
  assert.match(LIB, /already been spent or closed/);
});

test("a credit id from another customer cannot be closed through their record", () => {
  assert.match(CUSTOMER_API, /\.eq\("customer_id", customerId\)/);
});

// ── the shape of the thing ──────────────────────────────────────────────────

test("it is not an accounts system, and says so", () => {
  // The scope note lives on the migration, which is the right place for it:
  // the table is what would have to grow if any of this were ever wanted.
  assert.match(MIGRATION, /Not an accounts system/);
  // Read as COLUMNS, not as words. The migration's own comments say the credit
  // is not transferable, which is the opposite of a transfer feature, and a
  // loose word search called that a failure.
  const columns = MIGRATION.split(/\r?\n/)
    .filter((line) => /^ {2}\w+ /.test(line))
    .map((line) => line.trim().split(/\s+/)[0]);
  assert.ok(!columns.some((name) => /expire|expiry/i.test(name)), "no expiry column");
  assert.ok(!columns.some((name) => /transfer/i.test(name)), "no transfer column");
  assert.ok(!columns.some((name) => /statement|interest/i.test(name)), "no statements, no interest");
});

test("a credit is inc GST, and the column says why", () => {
  assert.match(MIGRATION, /Inc GST\. Applied under the quote total as money already received/);
});

test("claimable and held are different questions", () => {
  const rows = [credit(), credit({ id: "c2", state: "available", held_quote_id: null })];
  assert.equal(creditsOnQuote(rows, "q1").length, 1);
  assert.equal(claimableCredits(rows).length, 1);
});
