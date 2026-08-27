// The Financials page's queries and the way it reports a failure.
//
// WHAT WENT WRONG, when these figures lived on the dashboard. Fetching each
// order's cost split with an embed, `pcd_orders.select('..., pcd_quotes(...)')`,
// looked right and returned nothing. pcd_orders.quote_id references pcd_quotes
// AND pcd_quotes.order_id references pcd_orders, so PostgREST cannot tell which
// relationship is meant and answers an ambiguous embed with an error and no
// rows at all. The code read `{ data }` and ignored `error`, so an entire
// failed query rendered as a confident $0 on the confirmed order total, a
// number that had been correct for as long as the dashboard had existed.
//
// Two rules come out of that and are locked here. Do not embed across a pair of
// tables that reference each other in both directions. And never let a failed
// query render as a total, because nobody doubts a total.
//
// The figures have since moved to /admin/financials. The rules moved with them,
// which is the whole reason this file follows rather than being deleted.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGE = readFileSync(new URL("../app/admin/financials/page.tsx", import.meta.url), "utf8");
const CLIENT = readFileSync(new URL("../app/admin/financials/FinancialsClient.tsx", import.meta.url), "utf8");
const DASH_PAGE = readFileSync(new URL("../app/admin/dashboard/page.tsx", import.meta.url), "utf8");
const DASH_CLIENT = readFileSync(new URL("../app/admin/dashboard/DashboardClient.tsx", import.meta.url), "utf8");

// ── the ambiguous embed ─────────────────────────────────────────────────────

// The pair that references each other in both directions.
test("nothing embeds pcd_quotes from pcd_orders, or the reverse", () => {
  const ordersQueries = PAGE.match(/from\('pcd_orders'\)\s*\.select\('[^']*'/g) || [];
  assert.ok(ordersQueries.length, "the page must still query orders");
  ordersQueries.forEach((query) => {
    assert.ok(!query.includes("pcd_quotes("), `ambiguous embed: ${query}`);
  });

  const quotesQueries = PAGE.match(/from\('pcd_quotes'\)\s*\.select\('[^']*'/g) || [];
  assert.ok(quotesQueries.length, "the page must still query quotes");
  quotesQueries.forEach((query) => {
    assert.ok(!query.includes("pcd_orders("), `ambiguous embed: ${query}`);
  });
});

// Payments reference orders one way only, so that embed is safe and is the one
// place the customer's name on a payment row comes from.
test("the payments query may embed its order, because that pair is one-way", () => {
  assert.match(PAGE, /from\('pcd_order_payments'\)\s*\.select\('[^']*pcd_orders\(/);
});

test("the cost split is fetched as its own query and joined by id", () => {
  assert.match(PAGE, /from\('pcd_quotes'\)\.select\('id, markup_amount_ex_gst, labour_cost_ex_gst'\)\.in\('id', orderQuoteIds\)/);
});

test("that query is skipped rather than run with an empty id list", () => {
  assert.match(PAGE, /orderQuoteIds\.length[\s\S]{0,200}: \{ data: \[\], error: null \}/);
});

// ── a failed query must never read as a total ───────────────────────────────

test("every query behind a figure has its error checked", () => {
  ["paymentsError", "ordersError", "quotesError", "orderQuotesError"].forEach((name) => {
    assert.ok(PAGE.includes(`error: ${name}`), `${name} is never destructured`);
  });
  assert.match(PAGE, /const loadFailed = Boolean\(paymentsError \|\| ordersError \|\| quotesError \|\| orderQuotesError\)/);
});

test("the failure reaches the page", () => {
  assert.match(PAGE, /loadFailed=\{loadFailed\}/);
  assert.match(CLIENT, /loadFailed: boolean/);
  assert.match(CLIENT, /\{loadFailed && \(/);
});

test("the message says unknown, not zero", () => {
  const banner = CLIENT.slice(CLIENT.indexOf("{loadFailed && ("), CLIENT.indexOf("{loadFailed && (") + 700);
  assert.match(banner, /not zero, they are unknown/i);
});

// ── the figures say what kind of money they are ─────────────────────────────

// Revenue is inc GST and profit is ex GST. An unlabelled pair of figures sitting
// next to each other invites them to be compared as though they were the same.
test("profit figures are labelled ex GST", () => {
  assert.match(CLIENT, /ex GST · markup plus labour/);
  assert.match(CLIENT, /profit ex GST/);
});

test("an order with no cost split behind it reads as unknown, not as zero", () => {
  assert.match(CLIENT, /italic text-\[#8b8a81\]">Unknown</);
  assert.match(CLIENT, /unknown rather than nothing/);
});

// Outstanding is a position, not a period. If the period filter appeared to
// apply to it, a quiet month would read as nothing being owed.
test("the outstanding total says the period does not apply to it", () => {
  assert.match(CLIENT, /as at today/);
  assert.match(CLIENT, /period above does not change this/);
});

// ── the dashboard no longer carries any of this ─────────────────────────────

// THE RULE IS ABOUT TOTALS, AND IT STANDS.
//
// This used to be enforced by banning the string total_inc_gst from the
// dashboard outright, which was the right blunt guard while the dashboard
// carried a financial summary panel. The action queue that replaced Needs
// attention does show a figure per row: what THAT quote is worth, what THAT
// payment is owed, printed beside the row it came from.
//
// That is not what went wrong. What went wrong was a failed query rendering as
// a confident $0 on an order TOTAL, and nobody doubting a total. So the ban has
// moved to the thing that actually caused it: nothing on the dashboard may add
// figures up, and no query may have its error dropped. A source that fails is a
// missing row and a yellow line saying the list is short, which is visible in a
// way a wrong total never is.
test("the dashboard totals no money", () => {
  assert.ok(!DASH_CLIENT.includes("FinancialSummaryPanel"), "the financial panel is still on the dashboard");
  assert.ok(!DASH_PAGE.includes("markup_amount_ex_gst"), "the dashboard still reads the cost split");

  // Nothing on either file sums a figure. Counting rows is fine; adding money
  // is what this forbids.
  assert.ok(!/\breduce\s*\(/.test(DASH_PAGE), "the dashboard page is adding figures up");
  assert.ok(!/\breduce\s*\(/.test(DASH_CLIENT), "the dashboard panel is adding figures up");

  // The queue counts rows, which is fine, and must never add their values.
  const QUEUE = readFileSync(new URL("../lib/pcd-action-queue.js", import.meta.url), "utf8");
  assert.ok(!/\+=\s*(toNumber|Number)\(/.test(QUEUE), "the queue is totalling values");
  assert.ok(!/\.value\s*\+|\+\s*\w+\.value\b/.test(QUEUE), "the queue is adding row values together");
});

// The other half of the same fault: { data } read, { error } dropped. Every
// query on this page has to be able to say it failed.
test("a dashboard query that fails says so instead of returning nothing", () => {
  assert.match(DASH_PAGE, /result\.error/, "the page is not checking query errors");
  assert.match(DASH_PAGE, /problems\.push/, "a failed query has to be recorded");
  assert.match(DASH_CLIENT, /queue\.problems\.length > 0/, "and shown, or the queue is quietly short");
});

// The pair that references each other in both directions, on this page too.
test("the dashboard does not embed quotes from orders, or the reverse", () => {
  const ordersQueries = DASH_PAGE.match(/from\('pcd_orders'\)\s*\n?\s*\.select\('[^']*'/g) || [];
  ordersQueries.forEach((query) => assert.ok(!query.includes("pcd_quotes("), `ambiguous embed: ${query}`));

  const quotesQueries = DASH_PAGE.match(/from\('pcd_quotes'\)\s*\n?\s*\.select\('[^']*'/g) || [];
  assert.ok(quotesQueries.length, "the dashboard must still query quotes");
  quotesQueries.forEach((query) => assert.ok(!query.includes("pcd_orders("), `ambiguous embed: ${query}`));
});

// The one payment query the dashboard keeps is for the count and the attention
// list, so it must stay filtered to unpaid rather than quietly becoming a total.
test("the dashboard's payment query is still only the unpaid count", () => {
  assert.match(DASH_PAGE, /from\('pcd_order_payments'\)[\s\S]{0,200}\.eq\('is_paid', false\)/);
});

test("Financials is reachable, as a report rather than a row of its own", () => {
  // It used to be its own row in the main rail, directly beside Reporting,
  // which was two rows for one idea: a financial summary IS a report. It now
  // sits in Reporting's second sidebar, and the rail's Reporting row stays lit
  // while you are on it because the two share no path prefix.
  const shell = readFileSync(new URL("../app/admin/_components/AdminShell.tsx", import.meta.url), "utf8");
  const reporting = readFileSync(new URL("../app/admin/reporting/ReportingShell.tsx", import.meta.url), "utf8");

  assert.match(reporting, /href: '\/admin\/financials', label: 'Financials'/);
  assert.match(shell, /covers: \['\/admin\/financials'\]/);
  assert.ok(!/label: 'Financials'/.test(shell), "and it is no longer a row of its own");
});

// ── the ledger ──────────────────────────────────────────────────────────────
//
// The page was five headline figures, an ageing strip and four tables of equal
// weight, which is why nothing on it said where to look. It is now a rail of
// figures beside ONE table, and that table shows either side of the same
// period. These lock the shape rather than the styling.

test("there is one table, and it switches between the two sides", () => {
  // Two toggle buttons, one table. Not two tables with one hidden.
  assert.match(CLIENT, /Confirmed orders · \{won\.length\}/);
  assert.match(CLIENT, /Unaccepted quotes · \{pipeline\.length\}/);
  const tables = CLIENT.match(/<table\b/g) || [];
  assert.equal(tables.length, 1, `expected one table, found ${tables.length}`);
});

test("both sides are governed by the same period", () => {
  // The whole point of the toggle: flip the table without losing where you are.
  assert.match(CLIENT, /confirmedOrders\(orders, range\)/);
  assert.match(CLIENT, /openPipeline\(quotes, linkedQuoteIds, range\)/);
});

test("switching sides does not reset the period or the search", () => {
  // setTab is the only thing the toggle does.
  const toggles = CLIENT.match(/onClick=\{\(\) => setTab\('(orders|quotes)'\)\}/g) || [];
  assert.ok(toggles.length >= 2, "both toggle buttons must set the tab");
  assert.ok(!CLIENT.includes("setPeriodId('this_fy')\n"), "the period must not be reset anywhere but by its own control");
});

// A seven column table of figures on a 390px screen is a horizontal scroll
// nobody wins. The same rows are rendered as cards instead.
test("the ledger has a phone layout, not just a scrollbar", () => {
  assert.match(CLIENT, /hidden md:block overflow-x-auto/, "the table must be desktop only");
  assert.match(CLIENT, /md:hidden flex flex-col/, "there must be a phone card list");
  // Both have to total, or the phone shows rows with no bottom line.
  const phone = CLIENT.slice(CLIENT.indexOf('md:hidden flex flex-col'));
  assert.match(phone, /money2\(shownTotal\)/, "the phone layout must show the total");
  assert.match(phone, /money2\(shownProfit\)/, "the phone layout must show the profit");
});

test("the rail stacks above the ledger on a phone", () => {
  assert.match(CLIENT, /grid-cols-1 lg:grid-cols-\[236px_1fr\]/);
});

// ── GST ─────────────────────────────────────────────────────────────────────

test("both GST figures are shown and each says which basis it is", () => {
  assert.match(CLIENT, /GST collected/);
  assert.match(CLIENT, /cash basis/);
  assert.match(CLIENT, /accrual basis/);
  assert.match(CLIENT, /gstOnReceived\(received, ordersById\)/);
});

test("GST is read from the rows, so the page must fetch it", () => {
  assert.match(PAGE, /from\('pcd_orders'\)\s*\.select\('[^']*gst_amount/);
  assert.match(PAGE, /from\('pcd_quotes'\)\s*\.select\('[^']*gst_amount/);
});

// ── what the page is for ────────────────────────────────────────────────────

test("profit is shown against both sides, and the potential one says so", () => {
  assert.match(CLIENT, /Profit on those/);
  assert.match(CLIENT, /Profit if all land/);
  assert.match(CLIENT, /none of it won yet/);
  assert.match(CLIENT, /Profit if won/);
});

// Owed is a position and belongs on the page, but it was taking 40% of it for
// two payments. One line, opening on demand.
test("owed is one line with a drawer, not a section", () => {
  assert.match(CLIENT, /Owed to us now/);
  assert.match(CLIENT, /setOwedOpen\(o => !o\)/);
  assert.match(CLIENT, /aria-expanded=\{owedOpen\}/);
  assert.ok(!CLIENT.includes("outstandingByBucket"), "the five cell ageing strip is gone");
});
