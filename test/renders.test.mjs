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

// ── The design tool's cabinet panel ──────────────────────────────────────────
//
// The sidebar every cabinet is set up in. Rendered with a cabinet carrying the
// pieces that most often move between its sections: fronts, finished ends, a
// top panel, a kickboard set to run to the wall and a side filler, so a value
// read before it is declared anywhere in that form fails here, not in the tool.

test("the design tool's cabinet panel renders", async () => {
  const { default: DesignRightPanel } = await import("../app/admin/design/_components/DesignRightPanel.js");
  const room = { id: "r", name: "Kitchen", width_mm: 3000, depth_mm: 3000, height_mm: 2400 };
  const board = { material: "decorative board", finish: "Matt", colour: "Oak", thickness_mm: 18 };
  const item = {
    id: "a", room_id: "r", item_type: "base_cabinet", wall: "top", x_mm: 50, y_mm: 0,
    width_mm: 600, height_mm: 400, depth_mm: 560, qty: 1, label: "Bench",
    material: "decorative board", finish: "Matt", colour: "White",
    front_type: "drawers", drawer_config: { heights_mm: [400] }, drawer_style: board, door_style: board,
    has_kickboard: true, has_top_panel: true, end_panel_right: true, side_filler_left: true,
    panel_options: { kickboard: { extend_left: true }, top: { extend_left: true } },
  };
  const html = renderToString(createElement(DesignRightPanel, { item, allItems: [item], room, onItemChange: () => {} }));
  assert.ok(html.length > 0, "rendered nothing at all");
});

// ── The order issues report ──────────────────────────────────────────────────

test("the order issues report renders", async () => {
  const { default: IssuesClient } = await import("../app/admin/reporting/issues/IssuesClient.tsx");
  const issues = [
    { id: "a", order_id: "o1", kind: "wrong_size", detail: "Cut short", stage_at_report: null, owner: "us", blocks: "panel", extra_cost_ex_gst: 120, raised_by: null, raised_at: "2026-09-10T01:00:00Z", resolved_at: null, resolution: null, created_at: "2026-09-10T01:00:00Z", panel_label: "Door 1" },
    { id: "b", order_id: "o1", kind: "other", detail: "Scratched", stage_at_report: "Cut", owner: "supplier", blocks: "order", extra_cost_ex_gst: 0, raised_by: null, raised_at: "2026-08-01T01:00:00Z", resolved_at: "2026-08-05T01:00:00Z", resolution: "Replaced", created_at: "2026-08-01T01:00:00Z", panel_label: null },
  ];
  const html = renderToString(createElement(IssuesClient, {
    loadFailed: false, issues, today: "2026-09-27",
    orders: [{ id: "o1", order_number: "1042", name: "Smith Kitchen", customer_name: "J Smith", status: "active" }],
    agents: [], kinds: [],
  }));
  assert.ok(html.includes("Order issues"), "rendered without its title");
  assert.ok(html.includes("No cost recorded"), "the uncosted figure is missing");
});

// THE WEBSITE'S MESSAGES, rendered for real inside the settings they read.
// The banner scrolls two copies of the text; the notices show only their own
// place's message; nothing renders for an empty or out of date message.
test("the banner and the notices render from the settings", async () => {
  const { default: SiteSettingsProvider } = await import("../components/public/SiteSettingsProvider.js");
  const { SiteBanner, SiteNotice } = await import("../components/public/SiteMessages.js");
  const { normalizeSiteSettings } = await import("../lib/pcd-site-settings.js");
  const settings = normalizeSiteSettings({
    shop_open: true,
    messages: {
      banner: { text: "Spring sale: 10% off all doors <b>" },
      checkout: { text: "Orders are taking twelve working days this month." },
      quote: { text: "Old news", ends_on: "2020-01-01" },
    },
  });
  const html = renderToString(
    createElement(
      SiteSettingsProvider,
      { settings },
      createElement(SiteBanner),
      createElement(SiteNotice, { placement: "checkout" }),
      createElement(SiteNotice, { placement: "quote" }),
      createElement(SiteNotice, { placement: "shop" })
    )
  );
  assert.equal(html.split("Spring sale: 10% off all doors &lt;b&gt;").length - 1, 2, "two copies, and typed markup shows as words");
  assert.ok(html.includes("Orders are taking twelve working days this month."));
  assert.ok(!html.includes("Old news"), "an ended message is gone");
  assert.equal(html.split('role="note"').length - 1, 1, "only the checkout notice has anything to say");
  assert.ok(renderToString(createElement(SiteBanner)) === "", "no settings, no banner");
});
