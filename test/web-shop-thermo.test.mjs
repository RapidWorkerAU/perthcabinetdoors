// THERMOLAMINATE IN THE WEB SHOP: PRICED WHERE THE RATE CARD CAN, QUOTED WHERE IT CANNOT.
//
// Decided 27 and 28 September 2026:
//
//   The shop sells Polytec thermolaminate as well as decorative board, on the
//     same three product pages, with Material as the first question.
//   A thermolaminate front is priced from the rate card in Settings, marked up
//     at the card's own margin, exactly as a converted quote request is.
//   Anything the card will not price goes to the quote list with the reason in
//     the customer's words, never into the cart.
//   The server decides cart or quote list. The browser is only told.
//
// And the five safeguards agreed before it was built:
//
//   1. Polytec's minimum size for each profile is checked, because the card
//      would price a door nobody can press.
//   2. A rate card that cannot be read prices nothing online, never the
//      built-in rates.
//   3. The colour has to be a thermolaminate row of the library.
//   4. Nothing is sold at $0.
//   5. Every refusal is tested here.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  SHOP_MARKUP_PERCENT,
  SHOP_THERMO_MATERIAL,
  newShopLine,
  shopLineItems,
  shopLineProblems,
  shopLineSpec,
  shopLineTitle,
  shopLineToQuoteLine,
  shopProduct,
  shopSizeLimit,
} from "../lib/pcd-shop.js";
import { priceShopLine, publicCartPrice, publicShopCatalogue, thermoPricedRange } from "../lib/pcd-shop-pricing.js";
import { matchBoardCost } from "../lib/pcd-board-cost.js";
import { createHardwareResolver } from "../lib/pcd-hardware-line.js";
import { calculateQuoteLine, normalizeBusinessDefaults } from "../lib/pcd-quote-utils.js";
import { normalizeThermoRateCard, priceThermoLine, thermoNotMadeByFinish } from "../lib/pcd-thermo-pricing.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ── The fixture ─────────────────────────────────────────────────────────────

const DEFAULTS = normalizeBusinessDefaults({
  markup_percent: 75,
  abs_edging_cost_per_lineal_metre_ex_gst: 2.5,
  hinge_drilling_unit_cost_ex_gst: 5,
  gst_rate: 0.1,
  board_edge_trim_mm: 10,
  web_delivery_metro_ex_gst: 45,
});

// THE CARD'S MARGIN IS SET APART FROM EVERY OTHER RATE IN THE FIXTURE (the
// business markup is 75, the shop's decorative rate is 100), so a front that
// took the wrong one shows up here rather than passing unnoticed.
const CARD = normalizeThermoRateCard({ margin_percent: 60 });

// Thermolaminate rows are made to order, so the library has no rate for them.
const THERMO_ROW = {
  id: "thermo-matt-white",
  name: "Classic White",
  finish_type: "Matt",
  thickness: "18mm",
  material_type: "thermolaminate",
  supplier_name: "Polytec",
  cost_per_sqm_ex_gst: 0,
  order_types: ["made to order MTO"],
};
const GLOSS_ROW = { ...THERMO_ROW, id: "thermo-gloss-white", name: "Ultra White", finish_type: "Gloss" };
const ODD_ROW = { ...THERMO_ROW, id: "thermo-odd", name: "Copper", finish_type: "Metallic" };
const DECOR_ROW = {
  id: "matt-white-16",
  name: "Classic White",
  finish_type: "Matt",
  thickness: "16mm",
  material_type: "decorative board",
  supplier_name: "Polytec",
  cost_per_sqm_ex_gst: 60.74,
  order_types: ["supply board"],
};
const HINGE_ROW = { id: "inserta", type: "hinge", brand: "Blum", name: "110 Deg Inserta", unit_cost_ex_gst: 7.22 };

const colourOf = (row, material, priced = true) => ({
  id: row.id,
  material,
  colour: row.name,
  finish: row.finish_type,
  thickness: row.thickness,
  src: "",
  priced,
  cost: Number(row.cost_per_sqm_ex_gst) || 0,
});

function catalogue(over = {}) {
  return {
    colours: [
      colourOf(THERMO_ROW, SHOP_THERMO_MATERIAL),
      colourOf(GLOSS_ROW, SHOP_THERMO_MATERIAL),
      colourOf(ODD_ROW, SHOP_THERMO_MATERIAL, false),
      colourOf(DECOR_ROW, "Decorative Board"),
    ],
    hinges: [{ id: "inserta", brand: "Blum", name: "110 Deg Inserta", description: "", imageUrl: "", priceExGst: 12.64 }],
    hardwareRows: [HINGE_ROW],
    defaults: DEFAULTS,
    limit: shopSizeLimit(DEFAULTS),
    profiles: [
      { name: "Vienna", category: "Minimal", image: "", available18mm: true, available21mm: true },
      { name: "Bathurst", category: "Soft", image: "", available18mm: true, available21mm: true },
      { name: "Cambridge", category: "Sharp", image: "", available18mm: true, available21mm: true },
      { name: "Hampton", category: "Detailed", image: "", available18mm: true, available21mm: true },
      { name: "Hampshire", category: "Detailed", image: "", available18mm: false, available21mm: true },
      { name: "Cove 25", category: "Fluted", image: "", available18mm: false, available21mm: true },
    ],
    edges: [{ name: "EM2 Thumb Mould", image: "" }, { name: "EM0 Square", image: "" }],
    thermoCard: CARD,
    thermoLimit: thermoPricedRange(CARD),
    thermoNotMade: thermoNotMadeByFinish(CARD),
    ...over,
  };
}

const RESOLVERS = {
  resolveBoard: (spec) => matchBoardCost([THERMO_ROW, GLOSS_ROW, ODD_ROW, DECOR_ROW], spec),
  resolveHardware: createHardwareResolver([HINGE_ROW]),
};

function front(over = {}) {
  return {
    ...newShopLine(shopProduct("flat-door"), { id: "t1" }),
    material: SHOP_THERMO_MATERIAL,
    colourLibraryId: "thermo-matt-white",
    thickness: "18mm",
    profileType: "Soft",
    profile: "Bathurst",
    edgeMould: "EM2 Thumb Mould",
    height: 720,
    width: 450,
    qty: 2,
    preDrill: false,
    supplyHinges: false,
    hingeHardwareId: "",
    ...over,
  };
}

const price = (line, cat = catalogue()) => priceShopLine(line, cat, RESOLVERS);

// ── Priced from the card ────────────────────────────────────────────────────

test("a thermolaminate door is priced from the rate card, worked through by hand", () => {
  const priced = price(front());
  assert.equal(priced.ok, true, JSON.stringify(priced));
  // The card, not the colour library: Soft, Smooth and Matt, 720 x 450 charged
  // as 750 x 450. $21.72 a piece + (5.077 x 1.2m + 110.16 x 0.3375m2) = $64.99.
  const card = priceThermoLine(
    { material: "Thermolaminate", product_type: "Door", supplier_name: "Polytec", thickness: "18mm", profile_type: "Soft", finish: "Matt", height_mm: 720, width_mm: 450 },
    CARD
  );
  assert.equal(card.unitCost, 64.99);
  // At the card's 60%: $103.98 a door, two doors $207.97. No edging (a wrapped
  // front is not taped) and no processing time.
  assert.deepEqual(priced.parts, [["Door, pressed and wrapped", 207.97]]);
  assert.equal(priced.totalExGst, 207.97);
});

test("a thermolaminate front takes the card's margin, not the shop's or the business's", () => {
  const priced = price(front());
  const piece = calculateQuoteLine(priced.quoteLines[0], DEFAULTS);
  assert.equal(piece.markup_percent, CARD.margin_percent);
  assert.notEqual(CARD.margin_percent, SHOP_MARKUP_PERCENT, "the fixture keeps the shop rate apart");
  assert.notEqual(CARD.margin_percent, DEFAULTS.markup_percent, "and the business rate");
  assert.equal(piece.edging_lineal_metres, 0, "a wrapped front has no edge to tape");
});

test("the quote behind the order carries the profile and the edge, and no banding", () => {
  const priced = price(front());
  const piece = priced.quoteLines[0];
  assert.equal(piece.material, "Thermolaminate");
  assert.equal(piece.profile_type, "Soft");
  assert.equal(piece.profile, "Bathurst");
  assert.equal(piece.edge_mould, "EM2 Thumb Mould");
  const [item] = shopLineItems(front());
  assert.equal(item.bandedEdges, null);
});

test("a drilled thermolaminate door keeps its holes and hinges as their own lines", () => {
  const priced = price(front({ preDrill: true, holeType: "Blum Inserta", hingeQty: "2 hinges", hingeSide: "Left", supplyHinges: true, hingeHardwareId: "inserta" }));
  assert.equal(priced.ok, true, JSON.stringify(priced));
  assert.deepEqual(priced.parts.map(([label]) => label), ["Door, pressed and wrapped", "Hinge holes, 4", "Hinges, 4"]);
});

// ── Priced by hand, with the reason ─────────────────────────────────────────

function handPriced(line, cat, code) {
  const priced = price(line, cat);
  assert.equal(priced.ok, false, `${code}: should not be priced online`);
  assert.equal(priced.handPriced, true, `${code}: should be priced by hand, not refused: ${JSON.stringify(priced)}`);
  assert.equal(priced.code, code);
  assert.ok(priced.reason && !/rate card|Settings/i.test(priced.reason), `${code}: the customer's words, not the staff sentence`);
  assert.equal(priced.quoteLines, undefined, `${code}: nothing to put in a cart`);
  return priced;
}

test("21mm is priced by hand, and a 21mm-only profile says so", () => {
  const plain = handPriced(front({ thickness: "21mm" }), catalogue(), "thickness");
  assert.match(plain.reason, /^21mm fronts are priced by hand/);
  const only21 = handPriced(front({ thickness: "21mm", profileType: "Detailed", profile: "Hampshire" }), catalogue(), "thickness");
  assert.match(only21.reason, /Hampshire is only made 21mm thick/);
});

test("fluted is priced by hand", () => {
  // Every fluted profile is 21mm only, so it is the thickness that stops it first.
  const priced = handPriced(front({ thickness: "21mm", profileType: "Fluted", profile: "Cove 25", height: 720, width: 600 }), catalogue(), "thickness");
  assert.match(priced.reason, /Cove 25/);
});

test("a facia strip is priced by hand", () => {
  handPriced(front({ profileType: "Minimal", profile: "Vienna", height: 120, width: 600 }), catalogue(), "facia");
});

test("anything over 2400 x 1200 is priced by hand", () => {
  handPriced(front({ profileType: "Minimal", profile: "Vienna", height: 2450, width: 500 }), catalogue(), "oversize");
  handPriced(front({ profileType: "Minimal", profile: "Vienna", height: 900, width: 1250 }), catalogue(), "oversize");
});

// NOT MADE IS NOT THE SAME AS NOT PRICED. Detailed in Gloss does not exist, so
// it is never offered and never quoted: it is an answer to change. A front that
// is made but the card will not price is the one that goes to the quote list.
test("a profile Polytec does not make in that finish is never offered, and never quoted", () => {
  assert.deepEqual(thermoNotMadeByFinish(CARD), { gloss: ["Detailed"] }, "the card's own gaps, finish by finish");

  const priced = price(front({ colourLibraryId: "thermo-gloss-white", profileType: "Detailed", profile: "Hampton" }));
  assert.equal(priced.ok, false);
  assert.notEqual(priced.handPriced, true, "not a quote list item");
  assert.ok(priced.problems.includes("a profile family made in Gloss"), JSON.stringify(priced));

  // Even a card that forgot to say so up front is caught when it prices.
  const blind = price(front({ colourLibraryId: "thermo-gloss-white", profileType: "Detailed", profile: "Hampton" }), catalogue({ thermoNotMade: {} }));
  assert.notEqual(blind.handPriced, true);
  assert.ok(blind.problems.includes("a profile family made in Gloss"));

  assert.equal(price(front({ colourLibraryId: "thermo-gloss-white" })).ok, true, "Soft in Gloss is made and priced");
  assert.deepEqual(publicShopCatalogue(catalogue()).thermoNotMade, { gloss: ["Detailed"] }, "the page is told what to hide");

  const shop = read("app/(site)/products/[slug]/ShopProductClient.js");
  assert.match(shop, /allFamilies\.filter\(\(family\) => !line\.finish \|\| isThermoMade\(notMade, line\.finish, family\)\)/, "the page hides it");
  assert.ok(!read("lib/pcd-shop.js").includes('case "not_made"'), "there is no customer wording for quoting it");
});

test("a finish that is not on the card is priced by hand", () => {
  handPriced(front({ colourLibraryId: "thermo-odd" }), catalogue(), "finish_tier");
});

// SAFEGUARD 1. The card would put a price on it; Polytec will not press it.
test("a piece smaller than Polytec will press that profile is priced by hand", () => {
  // Bathurst is pressed from 220 x 230 at the smallest.
  const priced = handPriced(front({ height: 200, width: 500 }), catalogue(), "below_minimum");
  assert.match(priced.reason, /Bathurst can only be pressed from 220 \(H\) x 230 \(W\) mm/);
  assert.equal(price(front({ height: 220, width: 230 })).ok, true, "and the minimum itself is fine");
});

// SAFEGUARD 2. Never the built-in rates.
test("a rate card that cannot be read prices nothing online", () => {
  handPriced(front(), catalogue({ thermoCard: null, thermoLimit: null }), "unavailable");
});

// SAFEGUARD 4. A door handed over free is the worst way to find a lost price.
test("a thermolaminate front that comes out at nothing is priced by hand", () => {
  const zero = normalizeThermoRateCard({
    categories: { Soft: { edge_per_m: 0, area_per_sqm: 0, tall_step: 0 } },
    tier_rates: { standard: { Soft: { per_piece: 0, rate_factor: 1 } } },
  });
  handPriced(front(), catalogue({ thermoCard: zero }), "zero");
});

// ── Not answered yet ────────────────────────────────────────────────────────

test("a thermolaminate front needs a profile and an edge the library makes", () => {
  const cat = catalogue();
  const ask = (line) => price(line, cat).problems || [];
  assert.ok(ask(front({ profileType: "", profile: "" })).includes("a front profile"));
  assert.ok(ask(front({ profile: "Made Up" })).includes("a front profile we make"));
  assert.ok(ask(front({ profileType: "Detailed", profile: "Hampshire" })).includes("a front profile made 18mm thick"));
  assert.ok(ask(front({ edgeMould: "" })).includes("an edge profile"));
  assert.ok(ask(front({ edgeMould: "EM99 Imaginary" })).includes("an edge profile we make"));
  assert.ok(ask(front({ thickness: "16mm" })).includes("a thickness"));
});

// SAFEGUARD 3.
test("a thermolaminate front needs a thermolaminate colour, and the other way round", () => {
  const cat = catalogue();
  assert.ok(price(front({ colourLibraryId: "matt-white-16" }), cat).problems.includes("a colour"));
  const flat = {
    ...newShopLine(shopProduct("flat-door"), { id: "d1" }),
    colourLibraryId: "thermo-matt-white",
    thickness: "18mm",
    height: 720,
    width: 397,
    preDrill: false,
  };
  assert.ok(price(flat, cat).problems.includes("a colour"));
});

test("a thermolaminate size is never refused for its range, only priced by hand", () => {
  const problems = shopLineProblems(front({ height: 2600, width: 90 }), { limit: shopSizeLimit(DEFAULTS), colour: catalogue().colours[0] });
  assert.ok(!problems.some((problem) => /height between|width between/.test(problem)));
});

test("a cart saved before thermolaminate, with no material, still prices as decorative board", () => {
  const old = { ...newShopLine(shopProduct("flat-door"), { id: "d1" }), colourLibraryId: "matt-white-16", thickness: "16mm", height: 720, width: 397, preDrill: false };
  delete old.material;
  assert.equal(price(old).ok, true);
});

// ── What the browser is told ────────────────────────────────────────────────

test("a hand priced line tells the browser why, and nothing else", () => {
  const cat = catalogue();
  const result = { catalogue: cat, lines: [price(front({ thickness: "21mm" }), cat)], ready: false, delivery: {}, totals: {} };
  const [shown] = publicCartPrice(result).lines;
  assert.equal(shown.ok, false);
  assert.equal(shown.handPriced, true);
  assert.match(shown.reason, /priced by hand/);
  assert.ok(!("staffReason" in shown) && !("code" in shown), "the staff sentence stays on the server");
});

test("the browser never sees the rate card", () => {
  const shown = publicShopCatalogue(catalogue());
  assert.ok(!("thermoCard" in shown));
  assert.ok(!JSON.stringify(shown).includes("110.16"), "no rate from the card");
  assert.deepEqual(shown.thermoLimit, { minMm: 150, maxHeightMm: 2400, maxWidthMm: 1200 });
});

// ── How a thermolaminate line reads ─────────────────────────────────────────

test("a thermolaminate line names its profile and edge, and has no edging row", () => {
  const line = { ...front(), colour: "Classic White", finish: "Matt" };
  assert.equal(shopLineTitle(line), "Classic White Bathurst door");
  const spec = Object.fromEntries(shopLineSpec(line));
  assert.equal(spec.Board, "Polytec thermolaminate 18mm");
  assert.equal(spec["Front profile"], "Soft, Bathurst");
  assert.equal(spec["Edge profile"], "EM2 Thumb Mould");
  assert.equal(spec.Edging, undefined);
});

test("moving a thermolaminate line to the quote list keeps everything they set up", () => {
  const moved = shopLineToQuoteLine({ ...front({ thickness: "21mm" }), colour: "Classic White", finish: "Matt" });
  assert.equal(moved.material, "Thermolaminate");
  assert.equal(moved.profileType, "Soft");
  assert.equal(moved.profile, "Bathurst");
  assert.equal(moved.edgeMould, "EM2 Thumb Mould");
  assert.equal(moved.thickness, "21mm");
  assert.equal(moved.bandedEdges, null);
  assert.equal(moved.height, 720);
});

// ── One way of doing it ─────────────────────────────────────────────────────

test("a quote request and the shop price thermolaminate through one helper", () => {
  assert.match(read("lib/pcd-quote-request-conversion.js"), /withThermoRateCard\(entry, thermoCard\)/);
  assert.match(read("lib/pcd-shop-pricing.js"), /withThermoRateCard\(converted, catalogue\.thermoCard\)/);
});

test("the shop and the quote builder ask for a profile with the same pieces", () => {
  const shop = read("app/(site)/products/[slug]/ShopProductClient.js");
  const builder = read("app/(site)/request-quote/RequestQuoteFormClient.js");
  for (const piece of ["FrontProfileFields", "ImageSelect"]) {
    assert.match(shop, new RegExp(`<${piece}\\b`), `the shop uses ${piece}`);
    assert.match(builder, new RegExp(`<${piece}\\b`), `the quote builder uses ${piece}`);
  }
  assert.ok(!/function ImageSelect\(/.test(builder), "one ImageSelect, in the builder folder");
});

test("the cart sends the material, which decides the board and the price", () => {
  const cart = read("app/(site)/cart/CartClient.js");
  const strip = cart.slice(cart.indexOf("export function linesForServer"), cart.indexOf("export function useCartPrice"));
  assert.ok(!/\bmaterial\b,/.test(strip.split("=>")[0]), "material is not stripped");
});

test("the page waits for the server to say cart or quote list", () => {
  const shop = read("app/(site)/products/[slug]/ShopProductClient.js");
  assert.match(shop, /entry\.handPriced/);
  assert.match(shop, /if \(problems\.length \|\| !price \|\| pricing \|\| handReason\) return;/, "a hand priced line never reaches the cart");
});
