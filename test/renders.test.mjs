// DOES THE PAGE ACTUALLY RENDER.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
//
// On 21 September 2026 every quote in the admin was a dead page for a day. One
// block in QuoteEditor.js sat twenty-nine lines above the `totals` it named, so
// the component threw "Cannot access 'totals' before initialization" before it
// had drawn anything, and the customer-facing symptom was Next's
// "application error: a client-side exception has occurred".
//
// Everything was green. `next build` compiled it. ESLint reported no errors.
// All 3,265 tests passed, because not one of them had ever rendered a
// component: 113 of the 178 test files read source code as text and check it
// against a rule, which is the right tool for some questions and no help at all
// for this one.
//
// This file closes that gap. It builds each page the way React does and asserts
// that HTML comes out. It does not check what a page looks like, what it says,
// or what happens when you click anything. It answers the one question nothing
// else in the suite was asking: DOES IT RUN.
//
// ── WHAT A FAILURE HERE MEANS ────────────────────────────────────────────────
//
// The page is broken for everyone, right now. There is no "only on some data"
// reading of a failure in this file: these render with nothing loaded, which is
// the state every visitor is in for the first moment of every visit. Do not
// skip a case, and do not adjust one to pass. Fix the page.
//
// ── WHAT IS DELIBERATELY NOT PROVED ──────────────────────────────────────────
//
// `renderToString` never runs effects, and every page here loads its data in
// one. So this is the page BEFORE its data arrives, and a fault that only
// appears once a quote is on screen will not be caught here. Reaching that
// needs a real DOM; the note at the bottom of test/helpers/render-page.mjs says
// what that would take and what to weigh first.
//
// Rendering needs JSX, stylesheets, the "@/" alias and .tsx support, none of
// which Node has. See test/helpers/render-support.mjs. Pages additionally need
// Next's router contexts, which is test/helpers/render-page.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { renderPage } from "./helpers/render-page.mjs";

// The browser Supabase client reads these when a save or an upload asks for it.
// Nothing in a first render calls it, but a module that reads configuration as
// it loads must not be the reason a test here fails, and a fake value makes the
// reason for any failure unambiguous.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";

// ── The admin quote editor ───────────────────────────────────────────────────
//
// The worst case, which makes it the right guard: 5,888 lines, the largest
// component in the codebase, around fifty imports, the screen every job in the
// business passes through, and where the September bug landed.

const { default: QuoteEditor } = await import("../app/admin/quotes/[id]/QuoteEditor.js");

test("the quote editor renders before anything has loaded", () => {
  const html = renderToString(createElement(QuoteEditor, { quoteId: "test-quote-id" }));
  assert.equal(typeof html, "string");
  assert.ok(html.length > 0, "rendered nothing at all");
});

// A quote id is what the page is given by its route. Rendering without one
// should still produce a page rather than throw, because a broken link is a
// thing that happens and a blank screen is the worst possible answer to it.
test("the quote editor renders without a quote id", () => {
  const html = renderToString(createElement(QuoteEditor, {}));
  assert.ok(html.length > 0, "rendered nothing at all");
});

// ── The pages a customer opens ───────────────────────────────────────────────
//
// These are the ones where a crash is a reputation rather than an inconvenience,
// and they are the material for Pass 2 of docs/reliability-audit-plan.md.
//
// The customer's quote page is why render-page.mjs exists: it calls
// `useSearchParams()` to read its access code before it does anything else, and
// outside Next's router context that returns null and the page throws.

const PUBLIC_PAGES = [
  ["the customer's quote", "../app/(site)/quotes/QuoteApprovalClient.js", { search: { code: "ABC123" } }],
  ["the quote access code form", "../app/(site)/quotes/QuoteAccessForm.js", {}],
  ["the quote view", "../app/(site)/quote/QuoteViewClient.tsx", { search: { code: "ABC123" } }],
  ["the project view", "../app/(site)/project/ProjectViewClient.tsx", { search: { code: "ABC123" } }],
  ["the request list", "../app/(site)/request-quote/list/QuoteListClient.js", {}],
  ["the request send step", "../app/(site)/request-quote/send/QuoteSendClient.js", {}],
  ["the request sent page", "../app/(site)/request-quote/sent/QuoteSentClient.js", {}],
  ["the quote request form", "../app/(site)/request-quote/RequestQuoteFormClient.js", {}],
  ["the site measure booking form", "../app/(site)/book-a-site-measure/BookSiteMeasureClient.js", {}],
  ["the site measure booked page", "../app/(site)/book-a-site-measure/booked/BookedClient.js", {}],
  ["the finishes browser", "../app/(site)/finishes/FinishesBrowser.js", {}],
];

for (const [name, path, options] of PUBLIC_PAGES) {
  test(`${name} renders`, async () => {
    const { default: Component } = await import(path);
    assert.equal(typeof Component, "function", `${path} has no default component export`);
    const html = renderPage(Component, options);
    assert.ok(html.length > 0, "rendered nothing at all");
  });
}

// ── The shop product page, which needs what its route gives it ───────────────
//
// Unlike the pages above, this one is handed its product and catalogue by the
// server component that wraps it, so rendering it with nothing is not a fault,
// it is a test that forgot the props. The product comes from the real
// `shopProduct`, so the fixture cannot drift from what the shop actually sells.

test("the shop product page renders", async () => {
  const { default: ShopProductClient } = await import("../app/(site)/products/[slug]/ShopProductClient.js");
  const { SHOP_PRODUCTS, shopProduct } = await import("../lib/pcd-shop.js");

  const slug = SHOP_PRODUCTS[0]?.slug;
  assert.ok(slug, "the shop must list at least one product for this to prove anything");

  const html = renderPage(ShopProductClient, {
    props: {
      product: shopProduct(slug),
      // Empty lists on purpose: a catalogue that has not loaded is a real state
      // and the page must draw in it. `limit` is what the size guidance reads.
      catalogue: {
        hinges: [],
        colours: [],
        profiles: [],
        boards: [],
        limit: { minHeightMm: 35, maxHeightMm: 3050, minWidthMm: 35, maxWidthMm: 1200 },
      },
    },
    pathname: `/products/${slug}`,
  });

  assert.ok(html.length > 0, "rendered nothing at all");
});
