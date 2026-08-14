// The dashboard financial queries.
//
// WHAT WENT WRONG. Fetching each order's cost split with an embed,
// `pcd_orders.select('..., pcd_quotes(...)')`, looked right and returned
// nothing. pcd_orders.quote_id references pcd_quotes AND pcd_quotes.order_id
// references pcd_orders, so PostgREST cannot tell which relationship is meant
// and answers an ambiguous embed with an error and no rows at all. The code
// read `{ data }` and ignored `error`, so an entire failed query rendered as a
// confident $0 on the confirmed order total, a number that had been correct for
// as long as the dashboard had existed.
//
// Two rules come out of that and are locked here. Do not embed across a pair of
// tables that reference each other in both directions. And never let a failed
// query render as a total, because nobody doubts a total.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGE = readFileSync(new URL("../app/admin/dashboard/page.tsx", import.meta.url), "utf8");
const CLIENT = readFileSync(new URL("../app/admin/dashboard/DashboardClient.tsx", import.meta.url), "utf8");

// The pair that references each other in both directions.
test("nothing embeds pcd_quotes from pcd_orders, or the reverse", () => {
  const ordersQueries = PAGE.match(/from\('pcd_orders'\)\.select\('[^']*'/g) || [];
  assert.ok(ordersQueries.length, "the dashboard must still query orders");
  ordersQueries.forEach((query) => {
    assert.ok(!query.includes("pcd_quotes("), `ambiguous embed: ${query}`);
  });

  const quotesQueries = PAGE.match(/from\('pcd_quotes'\)\.select\('[^']*'/g) || [];
  quotesQueries.forEach((query) => {
    assert.ok(!query.includes("pcd_orders("), `ambiguous embed: ${query}`);
  });
});

test("the cost split is fetched as its own query and joined by id", () => {
  assert.match(PAGE, /from\('pcd_quotes'\)\.select\('id, markup_amount_ex_gst, labour_cost_ex_gst'\)\.in\('id', orderQuoteIds\)/);
  assert.match(PAGE, /new Map\(\(orderQuotesData \|\| \[\]\)\.map/);
});

test("that query is skipped rather than run with an empty id list", () => {
  assert.match(PAGE, /orderQuoteIds\.length[\s\S]{0,200}: \{ data: \[\], error: null \}/);
});

// ── a failed query must never read as a total ───────────────────────────────

test("the queries behind the financial figures check their errors", () => {
  assert.match(PAGE, /\{ data: financialOrdersData, error: financialOrdersError \}/);
  assert.match(PAGE, /error: orderQuotesError/);
  assert.match(PAGE, /const financialError = Boolean\(financialOrdersError \|\| orderQuotesError\)/);
});

test("the failure reaches the panel", () => {
  assert.match(PAGE, /loadFailed: financialError/);
  assert.match(CLIENT, /loadFailed\?:\s+boolean/);
  assert.match(CLIENT, /financial\.loadFailed && \(/);
});

test("the message says unknown, not zero", () => {
  const banner = CLIENT.slice(CLIENT.indexOf("financial.loadFailed && ("), CLIENT.indexOf("financial.loadFailed && (") + 600);
  assert.match(banner, /not zero, they are unknown/i);
});

test("the two notes cannot both show at once", () => {
  // The no-quote note explains a figure that is merely incomplete. It must not
  // appear alongside the one saying nothing loaded at all.
  assert.match(CLIENT, /!financial\.loadFailed && ordersWithoutSplit > 0/);
});

// ── the panel itself ────────────────────────────────────────────────────────

test("six cells, revenue then profit in each row", () => {
  const cells = CLIENT.match(/\{ label: '[^']+', value: [^,]+, profit: (true|false) \}/g) || [];
  assert.equal(cells.length, 6);
  assert.equal(cells.filter((cell) => cell.endsWith("profit: true }")).length, 2, "one profit cell per row");
});

test("the profit cells are labelled ex GST, because the revenue cells are not", () => {
  assert.match(CLIENT, /item\.profit && <span[^>]*>ex GST<\/span>/);
});
