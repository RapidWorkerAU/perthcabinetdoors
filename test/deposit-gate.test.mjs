// THE DEPOSIT GATE.
//
// ── WHY IT EXISTS ────────────────────────────────────────────────────────────
//
// Approving a quote that needed a deposit used to create the order there and
// then, five seconds before the customer even reached the payment page. One
// customer clicked Approve, closed the tab, and left behind an order for $2,922
// of work nobody had paid for. Worse, their own quote link then told them the
// quote was approved and an order existed, with no button and no way to pay:
// they could not finish without ringing us, and nothing told them anything was
// wrong.
//
// ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
//
//   APPROVAL AND DEPOSIT ARE ONE TRANSACTION. Clicking Approve on a deposit
//   quote records no approval and creates no order. Only money arriving does.
//
//   A HELD QUOTE IS NEVER LOCKED. It is the one state where the customer has
//   answered and still has something to do. Locking it is the dead end.
//
//   THE LINK WE EMAIL IS THE QUOTE, NEVER STRIPE. A Stripe page dies after 24
//   hours, so a reminder carrying one would arrive already broken.
//
//   FINALISING IS REACHABLE THREE WAYS AND RUNS ONCE. Paying first moves the
//   danger to "they paid and we missed it", which is worse than what we had.
//
//   NOTHING PAYABLE SURVIVES A QUOTE BEING WITHDRAWN. Our access code means
//   nothing to Stripe, so rejecting or overriding has to expire the session.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { QUOTE_STATUSES } from "../lib/pcd-quote-utils.js";
import { editability } from "../lib/pcd-document-lock.js";
import { AWAITING_DEPOSIT, CUSTOMER_ACTIONABLE } from "../lib/pcd-deposit-gate.js";
import { FIRST_REMINDER_AFTER_MS, FINAL_REMINDER_AFTER_MS } from "../lib/pcd-deposit-sweep.js";
import { customerDepositReminderHtml, customerDepositFinalHtml } from "../lib/pcd-email-templates.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const ACTION = read("app/api/quote-workflow/action/route.js");
const GATE = read("lib/pcd-deposit-gate.js");
const WEBHOOK = read("app/api/stripe/webhook/route.js");
const CLIENT = read("app/(site)/quotes/QuoteApprovalClient.js");
const OVERRIDE = read("app/api/admin/quotes/[id]/override/route.js");
const SWEEP = read("lib/pcd-deposit-sweep.js");
const SUCCESS = read("app/(site)/payments/success/page.js");
const EMAILS = read("lib/pcd-deposit-emails.js");
const FROM_QUOTE = read("lib/pcd-order-from-quote.js");

// ─── the state itself ────────────────────────────────────────────────────────

test("awaiting_deposit sits between viewed and approved", () => {
  assert.ok(QUOTE_STATUSES.includes(AWAITING_DEPOSIT));
  assert.ok(
    QUOTE_STATUSES.indexOf(AWAITING_DEPOSIT) > QUOTE_STATUSES.indexOf("viewed"),
    "after viewed"
  );
  assert.ok(
    QUOTE_STATUSES.indexOf(AWAITING_DEPOSIT) < QUOTE_STATUSES.indexOf("approved"),
    "and before approved, because it is not an approval"
  );
});

test("every quote status the code can write is allowed by the database", () => {
  // pcd_quotes.status has a check constraint. Adding a value to QUOTE_STATUSES
  // without a migration means the code writes a status the database refuses,
  // and NOTHING catches it until a customer hits it in production: the build
  // passes, the tests pass, and the constraint only fires on a row it actually
  // touches.
  //
  // That is exactly how awaiting_deposit shipped broken. The check that said
  // there was no constraint was an update against an id that does not exist, so
  // it matched no rows and proved nothing.
  const migration = read("supabase/202608261405_pcd_quote_status_awaiting_deposit.sql");
  const allowed = migration.match(/check \(\s*status in \(([^)]+)\)/);
  assert.ok(allowed, "the constraint migration must declare the allowed list");

  const values = new Set(allowed[1].match(/'([a-z_]+)'/g).map((v) => v.replace(/'/g, "")));
  QUOTE_STATUSES.forEach((status) => {
    assert.ok(values.has(status), `the database refuses "${status}", which the code can write`);
  });
  assert.ok(values.has("archived"), "archiving writes this status too");
});

test("a held quote is sealed, so the existing override can pull it back", () => {
  // Not "permanent": that would make it uneditable forever, with no order to
  // raise a variation against. Not "open": a customer is holding the price.
  assert.equal(editability("quote", AWAITING_DEPOSIT), "sealed");
});

// ─── approving creates nothing ───────────────────────────────────────────────

test("the public approve route creates no order for a deposit quote", () => {
  const branch = ACTION.slice(
    ACTION.indexOf("A DEPOSIT QUOTE STOPS HERE"),
    ACTION.indexOf("CLAIM THE QUOTE BEFORE MAKING ANYTHING FROM IT")
  );
  assert.ok(branch.length > 0, "the deposit branch must exist");
  assert.ok(!branch.includes("createOrderFromQuote"), "no order is created on approval");
  assert.ok(branch.includes("startDepositCheckout"), "it opens a payment page instead");
  assert.match(branch, /orderId: null/, "and it must not claim an order exists");
});

test("the deposit branch runs before the approval is claimed", () => {
  assert.ok(
    ACTION.indexOf("A DEPOSIT QUOTE STOPS HERE") < ACTION.indexOf('status: "approved", approved_at: now'),
    "a deposit quote must never reach the approve claim"
  );
});

test("a held quote is not treated as already responded to", () => {
  // The condition itself, not the block around it: the comment above it names
  // awaiting_deposit precisely to explain why it is absent from the check.
  const guard = ACTION.match(/if \(quote\.status === "approved"[^)]*\) \{/);
  assert.ok(guard, "the already-responded guard must exist");
  assert.ok(
    !guard[0].includes(AWAITING_DEPOSIT),
    "they must be able to come back and finish"
  );
  assert.ok(CUSTOMER_ACTIONABLE.has(AWAITING_DEPOSIT));
});

test("the public page does not lock a held quote", () => {
  const locked = CLIENT.match(/const isLocked = [^;]+;/);
  assert.ok(locked, "isLocked must exist");
  assert.ok(
    !locked[0].includes("awaiting_deposit"),
    "locking a held quote is the dead end this replaced"
  );
  assert.match(CLIENT, /const awaitingDeposit = quote\?\.status === "awaiting_deposit"/);
  // And it says where they stand rather than leaving them to guess.
  assert.match(CLIENT, /no order has been created/);
});

// ─── one finaliser, reachable three ways ─────────────────────────────────────

test("finalising claims the quote conditionally, so only one caller wins", () => {
  // Searched forward from the marker: startDepositCheckout has its own claim
  // and its own `if (!claimed)` higher up the file.
  const from = GATE.indexOf("THE CLAIM.");
  assert.ok(from > 0, "the claim must be marked");
  const claim = GATE.slice(from, GATE.indexOf("if (!claimed)", from));
  assert.match(claim, /\.eq\("status", AWAITING_DEPOSIT\)/, "conditional on the held state");
  assert.match(claim, /\.update\(\{ status: "approved"/);
});

test("all three callers go through the one finaliser", () => {
  assert.match(WEBHOOK, /finaliseDepositAcceptance/, "the webhook");
  assert.match(SUCCESS, /finaliseDepositAcceptance/, "the thank you page");
  assert.match(SWEEP, /finaliseDepositAcceptance/, "and the sweep");
});

test("an order is only ever created from inside the gate", () => {
  // If anything else learns to create an order from a paid deposit, the claim
  // stops being the single point that decides, and two can race.
  assert.ok(!WEBHOOK.includes("createOrderFromQuote"), "not the webhook");
  assert.ok(!SWEEP.includes("createOrderFromQuote"), "not the sweep");
  assert.ok(!SUCCESS.includes("createOrderFromQuote"), "not the thank you page");
  assert.match(GATE, /createOrderFromQuote\(supabase, quote/);
});

test("an unpaid session is never finalised", () => {
  const guard = GATE.slice(GATE.indexOf("if (session.payment_status !== \"paid\")"));
  assert.ok(guard.startsWith('if (session.payment_status !== "paid")'));
  assert.match(GATE, /markAcceptedAt: true/, "a paid deposit is confirmed work from the start");
});

test("money against a quote that is no longer held stops for a human", () => {
  assert.match(GATE, /needsAttention: true/);
  assert.match(GATE, /status: "needs_attention"/);
  assert.ok(
    !GATE.includes("createRefund"),
    "it must not decide to refund on its own; both ways of being wrong cost real money"
  );
});

test("a cancelled order does not block its quote forever", () => {
  // Clearing an abandoned deposit means cancelling the order it left behind,
  // and the whole point is that the customer can then come back and pay. While
  // this matched any order at all, paying handed them back the cancelled shell:
  // nothing promotes a cancelled order, so they would have paid for a job that
  // read as cancelled.
  const from = FROM_QUOTE.slice(FROM_QUOTE.indexOf("export async function createOrderFromQuote"));
  const guard = from.slice(0, from.indexOf("const now ="));
  assert.match(guard, /status !== "cancelled"/, "a cancelled order is not a live one");
  assert.ok(!guard.includes(".maybeSingle()"), "and there may legitimately be more than one row now");
});

// ─── nothing payable survives a withdrawal ───────────────────────────────────

test("rejecting cancels the payment page", () => {
  // The logging branch near the end, not the note-required check at the top.
  const rejection = ACTION.slice(ACTION.lastIndexOf('if (action === "rejected") {'));
  assert.match(rejection, /cancelOpenCheckouts/, "our status means nothing to Stripe");
  assert.match(rejection, /status: "cancelled"/);
});

test("the override cancels the payment page before pulling the quote back", () => {
  // Measured inside the handler. Both names also appear in the import block at
  // the top of the file, in the other order, which says nothing about run order.
  const body = OVERRIDE.slice(OVERRIDE.indexOf("export async function POST"));
  const cancelAt = body.indexOf("cancelOpenCheckouts");
  const pullAt = body.indexOf("pullBackToDraftPatch");
  assert.ok(cancelAt > 0, "the override must close the payment page");
  assert.ok(pullAt > 0, "and still pull the quote back");
  assert.ok(
    cancelAt < pullAt,
    "before the pull back, so there is no window where the quote is editable and the old price is payable"
  );
});

test("cancelling a payment page expires it at Stripe, not just in our table", () => {
  const fn = GATE.slice(GATE.indexOf("export async function cancelOpenCheckouts"));
  assert.match(fn, /expireCheckoutSession/, "a row saying closed is not a closed page");
});

// ─── the chase ───────────────────────────────────────────────────────────────

test("reminders are one hour and twenty four hours", () => {
  assert.equal(FIRST_REMINDER_AFTER_MS, 60 * 60 * 1000);
  assert.equal(FINAL_REMINDER_AFTER_MS, 24 * 60 * 60 * 1000);
});

test("every reminder is stamped the moment it is sent", () => {
  // Stamping at the end of the pass would send the same email again next time
  // if the pass died halfway.
  ["deposit_reminded_at", "deposit_final_reminded_at", "deposit_staff_notified_at"].forEach((column) => {
    const guard = new RegExp(`!quote\\.${column}`);
    assert.match(SWEEP, guard, `${column} gates its own send`);
    assert.match(SWEEP, new RegExp(`${column}: now\\.toISOString\\(\\)`), `${column} is written back`);
  });
});

test("a quote past both thresholds gets one email, not two", () => {
  // Both reminders come due at once whenever a quote reaches its first sweep
  // already more than a day old: the sweep was down, it is the backlog after a
  // deploy, or the GitHub schedule lapsed and only the daily Vercel pass is
  // left. Sending both would put "one step left" and "final reminder" in
  // somebody's inbox seconds apart.
  assert.match(SWEEP, /const finalIsDue =/, "the two must be decided together");
  // The condition line itself. Searching forward matters: sendDepositReminder
  // is also an import at the top of the file, which says nothing about order.
  const from = SWEEP.indexOf("if (!quote.deposit_reminded_at");
  assert.ok(from > 0, "the first reminder must be guarded");
  const firstSend = SWEEP.slice(from, SWEEP.indexOf("sendDepositReminder(quote", from));
  assert.match(firstSend, /!finalIsDue/, "the first is suppressed when the final is due");
  // And it is stamped anyway, or it stays pending forever and the branch is hit
  // again on every pass.
  assert.match(SWEEP, /summary\.skippedFirst \+= 1/);
});

test("the sweep settles money before it chases anyone for it", () => {
  const run = SWEEP.slice(SWEEP.indexOf("export async function runDepositSweep"));
  assert.ok(
    run.indexOf("reconcileOpenCheckouts") < run.indexOf("sendDepositChases"),
    "chasing first would demand a deposit somebody paid twenty minutes ago"
  );
});

test("the emailed link is the quote page and never a Stripe url", () => {
  assert.match(EMAILS, /\/quotes\/view\?code=/);
  assert.ok(!EMAILS.includes("checkout_url"), "a Stripe page dies after 24 hours");
  assert.ok(!EMAILS.includes("stripe.com"));
});

// ─── what the customer actually reads ────────────────────────────────────────

const figures = {
  customerName: "Glen & Dana Taylor",
  quoteNumber: "PCD-Q-2026-FD6DFB",
  totalIncGst: "$2,922.70",
  depositAmount: "$1,461.35",
  depositPercent: "50%",
  viewUrl: "https://www.perthcabinetdoors.com.au/quotes/view?code=8F2F203E",
};

test("both reminders say the quote is not approved and no order exists", () => {
  [customerDepositReminderHtml(figures), customerDepositFinalHtml(figures)].forEach((html) => {
    assert.match(html, /no order/i, "the consequence is stated");
    assert.match(html, /<b>/, "and it is the emphasised sentence, not buried");
    assert.match(html, /\$1,461\.35/, "with the amount owing");
    assert.match(html, /quotes\/view\?code=/, "and a link that cannot expire");
  });
});

test("the reminders use the quote template the customer already knows", () => {
  const html = customerDepositReminderHtml(figures);
  // The cream and green identity of "Your quote is ready". A chase email in the
  // navy staff shell reads as a different company asking for money.
  assert.match(html, /#f4f0e8/, "the cream page");
  assert.match(html, /#eef7ed/, "the green header");
  assert.match(html, /#17321f/, "and the dark green button");
});

test("the final reminder says it is the last one", () => {
  assert.match(customerDepositFinalHtml(figures), /last reminder/i);
});
