// THE WEB SHOP: BUY A DECORATIVE BOARD FRONT, PAY FOR IT, AND IT IS AN ORDER.
//
// Decided 8 and 11 September 2026 (the "Two Paths, One Website" plan):
//
//   Polytec decorative board only: a flat door, a drawer front, a flat panel.
//   Priced EXACTLY as a quote is: board cost per square metre plus the markup,
//     banded edges at the ABS rate for the edges ticked, $5 a hole, hinges from
//     the catalogue at cost plus markup as their own line.
//   Quotes everywhere charge edging on the banded edges only.
//   A hidden quote sits behind every web order and goes through the deposit
//     gate's claim, paid in full. Unpaid checkouts are archived quietly.
//   Delivered only, flat Perth metro rate by postcode 6000 to 6199.
//   Sizes 100mm up to a 1200 x 2400 board less the edge trim.
//   Shop and Cart in the nav, two route cards on the home page.
//   One configurator: the shop asks through the quote builder's own pieces.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  SHOP_MARKUP_PERCENT,
  boringForHinge,
  checkoutDetailProblems,
  isMetroPostcode,
  newShopLine,
  shopLineItems,
  shopLineProblems,
  shopLineSpec,
  shopProduct,
  shopSizeLimit,
  shopSizeProblems,
} from "../lib/pcd-shop.js";
import { priceShopLine, publicShopCatalogue, webQuoteCosts } from "../lib/pcd-shop-pricing.js";
import { matchBoardCost } from "../lib/pcd-board-cost.js";
import { createHardwareResolver } from "../lib/pcd-hardware-line.js";
import { calculateQuoteLine, calculateQuoteTotals, edgingLinealMetres, normalizeBusinessDefaults } from "../lib/pcd-quote-utils.js";
import { businessDefaultsToDbRow } from "../lib/pcd-business-defaults.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ── A catalogue with the figures the live library held on 11 September ──────

const DEFAULTS = normalizeBusinessDefaults({
  markup_percent: 75,
  abs_edging_cost_per_lineal_metre_ex_gst: 2.5,
  hinge_drilling_unit_cost_ex_gst: 5,
  gst_rate: 0.1,
  board_edge_trim_mm: 10,
  web_delivery_metro_ex_gst: 45,
});

const LIBRARY = [
  {
    id: "matt-white-16",
    name: "Classic White",
    finish_type: "Matt",
    thickness: "16mm",
    material_type: "decorative board",
    supplier_name: "Polytec",
    cost_per_sqm_ex_gst: 60.74,
    order_types: ["supply board"],
  },
];
const HINGE_ROW = { id: "inserta", type: "hinge", brand: "Blum", name: "110 Deg Inserta", unit_cost_ex_gst: 7.22 };
const CUP_ROW = { id: "wide", type: "hinge", brand: "Blum", name: "155 Deg", unit_cost_ex_gst: 16.24 };

const CATALOGUE = {
  colours: [{ id: "matt-white-16", colour: "Classic White", finish: "Matt", thickness: "16mm", src: "", priced: true, cost: 60.74 }],
  hinges: [
    { id: "inserta", brand: "Blum", name: "110 Deg Inserta", description: "", imageUrl: "", priceExGst: 12.64 },
    { id: "wide", brand: "Blum", name: "155 Deg", description: "Used on corner doors", imageUrl: "", priceExGst: 28.42 },
  ],
  hardwareRows: [HINGE_ROW, CUP_ROW],
  defaults: DEFAULTS,
  limit: shopSizeLimit(DEFAULTS),
};
const RESOLVERS = {
  resolveBoard: (spec) => matchBoardCost(LIBRARY, spec),
  resolveHardware: createHardwareResolver([HINGE_ROW, CUP_ROW]),
};

function door(over = {}) {
  return {
    ...newShopLine(shopProduct("flat-door"), { id: "d1", hinge: CATALOGUE.hinges[0] }),
    colourLibraryId: "matt-white-16",
    thickness: "16mm",
    height: 720,
    width: 397,
    qty: 2,
    hingeQty: "2 hinges",
    hingeSide: "Left",
    ...over,
  };
}

// ── The price is the quote's price ──────────────────────────────────────────

test("a door is priced exactly as a quote prices it, worked through by hand", () => {
  const priced = priceShopLine(door(), CATALOGUE, RESOLVERS);
  assert.equal(priced.ok, true, JSON.stringify(priced.problems));
  // MARKED UP AT THE SHOP'S RATE, NOT THE BUSINESS DEFAULT. The fixture above
  // sets the business default to 75%, deliberately different, so that a line
  // falling back to it would show up here rather than pass unnoticed. See
  // SHOP_MARKUP_PERCENT.
  //
  // 0.720 x 0.397 = 0.28584 m2, x2 doors = 0.57168 m2 x $60.74 = $34.72 of
  // board, doubled at 100% is $69.45. Edged all round: 2 x (0.720 + 0.397) x 2
  // doors = 4.468m at $2.50 = $11.17, and edging is not marked up. So the doors
  // are $80.62.
  //
  // THE HINGES DO NOT DOUBLE. They are bought in and sold on, so they stay at
  // the business rate every other hinge in the business is sold at: 4 x $7.22 =
  // $28.88 of hardware, x1.75 = $50.54. The drilling is a rate a hole rather
  // than a cost with a margin on it, so 4 holes at $5 stays $20.
  assert.deepEqual(priced.parts, [
    ["Flat door, cut and edged", 80.62],
    ["Hinge holes, 4", 20],
    ["Hinges, 4", 50.54],
  ]);
  assert.equal(priced.totalExGst, 151.16);
  assert.equal(priced.unitExGst, 75.58);
});

// THE RATE IS THE BOARD'S, NOT THE ORDER'S. A hinge on the same line is bought
// in and sold on, so it must keep the rate the rest of the business sells
// hinges at. This is the assertion that fails if the shop rate is ever applied
// to the whole line rather than to the piece we make.
test("the shop rate lands on the board and leaves the hinges alone", () => {
  const priced = priceShopLine(door(), CATALOGUE, RESOLVERS);
  const markups = priced.quoteLines.map((line) => calculateQuoteLine(line, DEFAULTS));

  const board = markups.find((line) => line.product_type !== "Hardware");
  const hardware = markups.find((line) => line.product_type === "Hardware");

  assert.equal(board.markup_percent, SHOP_MARKUP_PERCENT, "the piece we make carries the shop rate");
  assert.equal(hardware.markup_percent, DEFAULTS.markup_percent, "the hinges keep the business rate");
  assert.notEqual(SHOP_MARKUP_PERCENT, DEFAULTS.markup_percent, "the fixture has to keep the two apart to prove anything");
});

test("only the banded edges are charged, and none is a real answer", () => {
  const drawer = {
    ...newShopLine(shopProduct("drawer-front"), { id: "f1" }),
    colourLibraryId: "matt-white-16",
    thickness: "16mm",
    height: 180,
    width: 597,
    qty: 3,
    bandedEdges: ["Top", "Bottom"],
  };
  const priced = priceShopLine(drawer, CATALOGUE, RESOLVERS);
  // 3 x 0.597 x 2 edges = 3.58m at $2.50 is $8.95, on $39.18 of board sold.
  assert.deepEqual(priced.parts, [["Drawer front, cut and edged", 48.13]]);

  const raw = priceShopLine({ ...drawer, bandedEdges: [] }, CATALOGUE, RESOLVERS);
  assert.deepEqual(raw.parts, [["Drawer front, cut and edged", 39.18]], "no edges, no edging");
});

test("the cart total is the quote's own total, delivery included", () => {
  const priced = priceShopLine(door(), CATALOGUE, RESOLVERS);
  const totals = calculateQuoteTotals(priced.quoteLines, 0.1, {
    ...webQuoteCosts(DEFAULTS, { deliveryExGst: 45 }),
    business_defaults: DEFAULTS,
  });
  assert.equal(totals.subtotal_ex_gst, 151.16 + 45);
  // $196.16 plus 10% GST.
  assert.equal(totals.total_inc_gst, 215.78);
});

test("the hinges we supply are their own Hardware line, one a hole", () => {
  const items = shopLineItems(door(), { hinge: CATALOGUE.hinges[0] });
  assert.equal(items.length, 2);
  assert.equal(items[1].type, "Hardware");
  assert.equal(items[1].hardwareId, "inserta");
  assert.equal(items[1].qty, 4, "two hinges on each of two doors");
  assert.deepEqual(items[0].bandedEdges, ["Top", "Bottom", "Left", "Right"], "all four is written out as the instruction it is");
  assert.equal(shopLineItems(door({ supplyHinges: false }), { hinge: CATALOGUE.hinges[0] }).length, 1);
  assert.equal(shopLineItems(door({ preDrill: false }), { hinge: CATALOGUE.hinges[0] }).length, 1, "no holes, no hinges");
});

// ── Quotes charge the edges that are banded ─────────────────────────────────

test("quote edging follows the banded edges, and nobody said means all four", () => {
  const line = { material: "Decorative Board", product_type: "Door", width_mm: 400, height_mm: 700, qty: 1 };
  assert.equal(edgingLinealMetres(line), 2.2, "all four until somebody says");
  assert.equal(edgingLinealMetres({ ...line, banded_edges: ["Left", "Right"] }), 1.4);
  assert.equal(edgingLinealMetres({ ...line, banded_edges: ["Top"] }), 0.4);
  assert.equal(edgingLinealMetres({ ...line, banded_edges: [] }), 0, "none of the four is none");
  assert.equal(edgingLinealMetres({ ...line, material: "Thermolaminate" }), 0);
});

// ── What stops a line being paid for ────────────────────────────────────────

test("a drilled door needs its side and its boring, never guessed", () => {
  const problems = shopLineProblems(door({ hingeSide: "" }), {
    limit: CATALOGUE.limit,
    colour: CATALOGUE.colours[0],
    hinge: CATALOGUE.hinges[0],
  });
  assert.ok(problems.includes("which side the hinges go"));
  assert.equal(newShopLine(shopProduct("flat-door")).hingeSide, "", "a new door is never given a side");
});

test("an Inserta hinge needs Inserta holes, and choosing a hinge sets them", () => {
  assert.equal(boringForHinge(CATALOGUE.hinges[0]), "Blum Inserta");
  assert.equal(boringForHinge(CATALOGUE.hinges[1]), "35mm cup only");
  const mismatched = shopLineProblems(door({ holeType: "35mm cup only" }), {
    limit: CATALOGUE.limit,
    colour: CATALOGUE.colours[0],
    hinge: CATALOGUE.hinges[0],
  });
  assert.ok(mismatched.some((problem) => /Inserta/.test(problem)), mismatched.join(" | "));
});

test("sizes run from 100mm to a whole board less the trim", () => {
  const limit = shopSizeLimit({ board_edge_trim_mm: 10 });
  assert.deepEqual(limit, { minHeightMm: 100, maxHeightMm: 2380, minWidthMm: 100, maxWidthMm: 1180 });
  assert.ok(shopSizeProblems({ height: 2381, width: 400 }, limit).height);
  assert.ok(shopSizeProblems({ height: 700, width: 99 }, limit).width);
  assert.deepEqual(shopSizeProblems({ height: 2380, width: 1180 }, limit), {});
  assert.equal(shopSizeLimit({ board_edge_trim_mm: 5 }).maxWidthMm, 1190, "the trim is a Business Default");
});

test("a colour with no live price cannot be bought, only moved to a quote list", () => {
  const unpriced = { ...CATALOGUE.colours[0], priced: false };
  const problems = shopLineProblems(door(), { limit: CATALOGUE.limit, colour: unpriced, hinge: CATALOGUE.hinges[0] });
  assert.ok(problems.includes("a colour we hold a price on"));
  const page = read("app/(site)/products/[slug]/ShopProductClient.js");
  assert.match(page, /function moveToQuoteList\(\)/);
  assert.match(page, /writeQuoteLines\(\[\.\.\.readQuoteDraft\(\)\.lines, moved\]\)/, "the whole line goes across, not retyped");
});

test("hinge positions read back the way they were asked", () => {
  const spec = shopLineSpec(door({ hingeFromBottomMm: "100", hingeFromTopMm: "100" }), { hinge: CATALOGUE.hinges[0] });
  const positions = spec.find(([label]) => label === "Positions")[1];
  assert.match(positions, /Bottom hinge 100mm from bottom/);
  assert.match(positions, /Top hinge 100mm from top/);
  assert.equal(shopLineSpec(door(), {}).find(([label]) => label === "Positions")[1], "Our standard positions");
});

// ── Delivery ────────────────────────────────────────────────────────────────

test("delivery is Perth metro by postcode, and an address is always asked", () => {
  assert.equal(isMetroPostcode("6000"), true);
  assert.equal(isMetroPostcode("6199"), true);
  assert.equal(isMetroPostcode("6200"), false);
  assert.equal(isMetroPostcode("6230"), false, "Bunbury is freight");
  assert.equal(isMetroPostcode("600"), false);

  const good = { name: "Sarah Jones", email: "sarah@example.com", phone: "0412 345 678", street: "14 Rokeby Road", suburb: "Subiaco", postcode: "6008" };
  assert.deepEqual(checkoutDetailProblems(good), {});
  assert.match(checkoutDetailProblems({ ...good, postcode: "6230" }).postcode, /email us for a freight price/);
  assert.ok(checkoutDetailProblems({ ...good, street: "" }).street);

  // Delivered, never collected: there is nothing to choose between, so no
  // choice is offered, and the street address is always one of the fields.
  const checkout = read("app/(site)/checkout/CheckoutClient.js");
  assert.ok(!checkout.includes('type="radio"'), "no delivery method to pick");
  assert.ok(!/Collect from|Pick up from/i.test(checkout), "no collection option anywhere");
  assert.match(checkout, /\{field\("street", true\)\}/);
});

test("the metro rate is a Business Default that saves", () => {
  assert.equal(DEFAULTS.web_delivery_metro_ex_gst, 45);
  assert.equal(normalizeBusinessDefaults({ web_delivery_metro_ex_gst: 0 }).web_delivery_metro_ex_gst, 0, "free delivery is a real answer");
  assert.equal(businessDefaultsToDbRow({ web_delivery_metro_ex_gst: 55 }).web_delivery_metro_ex_gst, 55);
  assert.match(read("app/admin/_components/AccountSettingsForm.tsx"), /key:\s+'web_delivery_metro_ex_gst'/);
});

// ── No rate leaves the server ───────────────────────────────────────────────

test("the browser never sees a cost", () => {
  const shown = publicShopCatalogue(CATALOGUE);
  assert.ok(shown.colours.every((colour) => !("cost" in colour)));
  assert.ok(!JSON.stringify(shown).includes("60.74"));
  const route = read("app/api/shop/price/route.js");
  assert.match(route, /publicCartPrice\(result\)/, "the price endpoint answers with the public shape only");
  const pricing = read("lib/pcd-shop-pricing.js");
  const publicShape = pricing.slice(pricing.indexOf("export function publicCartPrice"));
  assert.ok(!/cost|markup|quoteLines/.test(publicShape.replace(/No quote lines, no costs/, "")), "the public shape carries no cost");
});

// ── The order path ──────────────────────────────────────────────────────────

test("a web order goes through the deposit gate's claim and is paid in full", () => {
  const gate = read("lib/pcd-deposit-gate.js");
  assert.match(gate, /export const WEB_CHECKOUT = "web_checkout"/);
  assert.match(gate, /export const GATE_FLOWS = new Set\(\["quote_deposit_gate", WEB_ORDER_FLOW\]\)/);
  assert.match(gate, /payment_type: webOrder \? "final" : "deposit"/);
  assert.match(read("app/api/stripe/webhook/route.js"), /GATE_FLOWS\.has\(session\?\.metadata\?\.flow\)/);
});

test("an unpaid web checkout is archived quietly when its page runs out", () => {
  const gate = read("lib/pcd-deposit-gate.js");
  const expired = gate.slice(gate.indexOf("export async function markCheckoutExpired"));
  assert.match(expired, /await archiveWebCheckout\(supabase, quoteId\)/);
  const archive = gate.slice(gate.indexOf("export async function archiveWebCheckout"));
  assert.match(archive, /quoteArchivePatch\(\{ status: WEB_CHECKOUT \}, ARCHIVED_EXPIRED\)/);
  assert.match(archive, /\.eq\("status", WEB_CHECKOUT\)/, "never a quote that was paid in the same second");
  // No chase: the deposit reminders only ever read awaiting_deposit.
  assert.match(read("lib/pcd-deposit-sweep.js"), /\.eq\("status", AWAITING_DEPOSIT\)/);
});

test("checkout charges the saved quote's total, and only the figure on screen", () => {
  const checkout = read("lib/pcd-shop-checkout.js");
  assert.match(checkout, /status: WEB_CHECKOUT/);
  assert.match(checkout, /source: WEB_SHOP_SOURCE/);
  assert.match(checkout, /roundMoney\(expectedTotalIncGst\) !== price\.totals\.totalIncGst/, "a moved price is shown, not charged");
  assert.match(checkout, /const saved = await recalculateQuoteTotals\(supabase, quote\.id, defaults\)/);
  assert.match(checkout, /amount,\s*\n\s*currency: saved\.currency/, "Stripe takes the saved quote's total");
  assert.match(checkout, /flow: WEB_ORDER_FLOW/);
  assert.match(checkout, /if \(previousQuoteId\) await abandonWebCheckout\(supabase, previousQuoteId\)/, "never two live pages for one cart");
  assert.match(checkout, /project_name: projectName\(details\)/, "named customer and suburb, like every order");
});

test("the order carries where it came from", () => {
  assert.match(read("lib/pcd-order-from-quote.js"), /\.\.\.\(quote\.source \? \{ source: quote\.source \} : \{\}\)/);
  const migration = read("supabase/202609112000_pcd_web_shop.sql");
  for (const want of ["add column if not exists source text", "web_delivery_metro_ex_gst", "'web_checkout'"]) {
    assert.ok(migration.includes(want), want);
  }
  assert.ok(!/\bselect\b[^;]*;\s*$/i.test(migration.trim()), "the migration is one runnable block");
});

test("an unpaid cart stays off every admin list", () => {
  assert.match(read("app/api/admin/quotes/route.js"), /\.neq\("status", "web_checkout"\)/);
  assert.match(read("lib/pcd-desk-data.js"), /\.neq\("status", "web_checkout"\)/);
  assert.match(read("app/api/admin/calendar/jobs/route.js"), /"web_checkout"\)/);
});

// ── Two baskets, one configurator ───────────────────────────────────────────

// TWO STORES, ONE BASKET IN THE BAR.
//
// The header used to carry a My list button and a Cart button side by side. It
// now carries a single "Your items" basket, chosen deliberately, so the badge
// is one number: how many things you have with us. What must NOT merge is the
// two stores behind it. They keep their own key, their own tab, their own way
// out and their own money, because one is priced and the other is not, and a
// customer who mixes them up either sends a paid cart to be quoted or tries to
// pay for a quote list.
test("the cart and the quote list are two stores that never add together", () => {
  assert.match(read("lib/pcd-shop-cart.js"), /const STORAGE_KEY = "pcd\.shop-cart\.v1"/);
  assert.match(read("lib/pcd-quote-draft.js"), /const STORAGE_KEY = "pcd\.quote-draft\.v1"/);

  const panel = read("components/public/PublicItemsPanel.js");
  assert.match(panel, /const quoteCount = draftItemCount\(quoteLines\)/, "counted apart");
  assert.match(panel, /const cartCount = cartPieceCount\(cartLines\)/);
  assert.match(panel, /href="\/request-quote\/list"/, "and each keeps its own way out of the panel");
  assert.match(panel, /href="\/cart"/);

  assert.match(read("app/(site)/cart/CartClient.js"), /<CrossToList count=\{listCount\} \/>/, "the cart names the list");
  assert.match(read("app/(site)/request-quote/list/QuoteListClient.js"), /<CrossToCart \/>/, "and the list names the cart");
});

test("the shop asks through the quote builder's own pieces", () => {
  const shop = read("app/(site)/products/[slug]/ShopProductClient.js");
  const builder = read("app/(site)/request-quote/RequestQuoteFormClient.js");
  for (const piece of ["ColourTiles", "SizeFields", "BandedEdgesField", "HingeFields", "QtyStepper", "DoorDrawing"]) {
    assert.match(shop, new RegExp(`<${piece}\\b`), `the shop uses ${piece}`);
    assert.match(builder, new RegExp(`<${piece}\\b`), `the quote builder uses ${piece}`);
  }
  assert.ok(!builder.includes("colourComboButton"), "the colour search box is gone: finish then tiles, on both");
});

test("the shop is off on the live site until it is turned on", () => {
  assert.match(read("lib/pcd-site-flags.js"), /export const SHOP_ENABLED = process\.env\.NODE_ENV !== "production";/);
  for (const page of ["app/(site)/products/page.js", "app/(site)/products/[slug]/page.js", "app/(site)/cart/page.js", "app/(site)/checkout/page.js"]) {
    assert.match(read(page), /if \(!SHOP_ENABLED\) notFound\(\);/, page);
  }
  for (const route of ["app/api/shop/price/route.js", "app/api/shop/checkout/route.js"]) {
    assert.match(read(route), /if \(!SHOP_ENABLED\) return Response\.json/, route);
  }
  assert.match(read("app/(site)/page.js"), /\{SHOP_ENABLED \? \(/, "the home page offers it only when it is open");
});
