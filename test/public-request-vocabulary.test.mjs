// What the public planner sends to a quote, and what it calls it.
//
// A customer added an IKEA Pax and got a quote request containing a line headed
// "Kickboard" with no colour on it. Three separate faults:
//
//   1. The review table showed our description of the piece as if it were the
//      product. We quote four things: Door, Drawer front, Panel and a cabinet.
//      "Kickboard" is not one of them; a kickboard is a Panel, which is how it
//      is cut and priced. The DATA was already right, the label was not.
//   2. A piece with no colour on it could be sent. It reaches us as "not chosen
//      yet" and cannot be priced without emailing the customer back.
//   3. IKEA cabinets come with their own plinth, and props were inheriting a
//      kickboard from the ordinary cabinet defaults, so a wardrobe arrived with
//      a kickboard nobody asked for and nothing to make it out of.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRODUCT_TYPES } from "../lib/pcd-materials.js";
import {
  METOD_KICKBOARD_STYLE,
  ikeaRangeOf,
  kickboardAllowedFor,
  kickboardOnPatch,
  resolveIkeaPreset,
} from "../lib/pcd-ikea-presets.js";
import { partsForItem } from "../lib/pcd-design-parts.js";
import { requestLinesForItem } from "../lib/pcd-design-request-lines.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// A base cabinet we build, with a kickboard on it.
const CUSTOM_CABINET = {
  id: "c1",
  item_type: "base_cabinet",
  label: "Base cabinet",
  width_mm: 600, height_mm: 720, depth_mm: 560,
  qty: 1,
  has_kickboard: true,
  kickboard_height_mm: 120,
  material: "decorative board",
  finish: "Matt",
  colour: "Carcass",
  door_style: { material: "decorative board", thickness_mm: 18, finish: "Matt", colour: "Classic White" },
};

// ── everything reaching a quote uses the quote's vocabulary ─────────────────

const ACCEPTED = [...PRODUCT_TYPES, "base_cabinet"];

test("a kickboard is quoted as a Panel, not as a product called Kickboard", () => {
  const [line] = requestLinesForItem(CUSTOM_CABINET, ["kickboard"], {});
  assert.equal(line.productType, "Panel", "the type the quote editor accepts");
  assert.equal(line.productName, "Kickboard", "what it actually is, for a human to read");
});

test("every line type a request can produce is one the quote editor accepts", () => {
  // product_type passes straight through when a request is converted, so an
  // unrecognised one lands as a blank Type on the quote.
  const parts = partsForItem(CUSTOM_CABINET).map((part) => part.key);
  assert.ok(parts.length, "the cabinet has parts");
  parts.forEach((key) => {
    requestLinesForItem(CUSTOM_CABINET, [key], {}).forEach((line) => {
      assert.ok(ACCEPTED.includes(line.productType), `${key} produced "${line.productType}"`);
    });
  });
});

test("the review table shows the product type, not our name for the piece", () => {
  const src = read("app/(site)/design/PublicDesignClient.js");
  const row = src.slice(src.indexOf("function ReviewRow"), src.indexOf("function ReviewRow") + 2000);
  assert.match(row, /<strong>\{line\.productType === "base_cabinet" \? "Cabinet" : line\.productType\}<\/strong>/);
  assert.ok(!/<strong>\{line\.productName\}<\/strong>/.test(row), "the description must not be the headline");
});

test("the panel wording is explained once, quietly", () => {
  const src = read("app/(site)/design/PublicDesignClient.js");
  assert.match(src, /quoted as <strong>Panels<\/strong>/);
});

// ── a colour is required before sending ─────────────────────────────────────

const NO_COLOUR = {
  ...CUSTOM_CABINET,
  door_style: { material: "decorative board", thickness_mm: 18, finish: "", colour: "" },
  material: "", finish: "", colour: "",
};

test("a piece with no colour is detectable from the line alone", () => {
  const [line] = requestLinesForItem(NO_COLOUR, ["kickboard"], {});
  assert.equal(line.colour, "", "this is the line the gate has to catch");
  assert.match(line.notes, /No colour chosen yet/);
});

test("the browser blocks the send and names the cabinets that need one", () => {
  const src = read("app/(site)/design/PublicDesignClient.js");
  assert.match(src, /function lineNeedsColour\(line\)/);
  assert.match(src, /const canSend = reviewLines\.length > 0 && missingColour\.length === 0/);
  // Both Send buttons, not just the one at the bottom.
  const guarded = (src.match(/disabled=\{busy \|\| !canSend\}/g) || []).length;
  assert.equal(guarded, 2, "every send button is gated");
  assert.match(src, /pcdRqBlocked/, "and it says which cabinets");
});

test("the server refuses it too, because a browser check is a suggestion", () => {
  const src = read("app/api/public/design/[code]/submit/route.js");
  assert.match(src, /line\.productType !== "base_cabinet" && \(!line\.material \|\| !line\.colour\)/);
  assert.match(src, /status: 422/);
});

test("a cabinet line is exempt, since its board rides on the pieces", () => {
  // A cabinet carries no material or colour of its own and is priced from its
  // cut list. Gating on it would block every request containing one.
  const src = read("app/api/public/design/[code]/submit/route.js");
  assert.match(src, /base_cabinet/);
  const client = read("app/(site)/design/PublicDesignClient.js");
  const fn = client.slice(client.indexOf("function lineNeedsColour"), client.indexOf("function lineNeedsColour") + 300);
  assert.match(fn, /if \(line\.productType === "base_cabinet"\) return false/);
});

// ── IKEA cabinets and kickboards ────────────────────────────────────────────

const metod = { id: "m1", item_type: "base_cabinet", preset_ref: "ikea:metod:base:600x800" };
const pax = { id: "p1", item_type: "tall_cabinet", preset_ref: "ikea:pax:frame:500x2010" };
const besta = { id: "b1", item_type: "wall_cabinet", preset_ref: "ikea:besta:frame:600x640" };

test("the refs used here are real presets", () => {
  // Otherwise the tests below pass against typos rather than against the rule.
  assert.ok(resolveIkeaPreset(metod.preset_ref), "metod ref");
  assert.ok(resolveIkeaPreset(pax.preset_ref), "pax ref");
  assert.equal(ikeaRangeOf(metod), "metod");
  assert.equal(ikeaRangeOf(pax), "pax");
});

test("only Metod can be fronted with a kickboard of ours", () => {
  assert.equal(kickboardAllowedFor(metod), true);
  assert.equal(kickboardAllowedFor(pax), false);
  assert.equal(kickboardAllowedFor(besta), false);
  assert.equal(kickboardAllowedFor(CUSTOM_CABINET), true, "cabinets we build are unaffected");
});

test("a Pax or Besta never offers a kickboard part, even carrying the old flag", () => {
  // Items saved before this rule still have has_kickboard set.
  [pax, besta].forEach((prop) => {
    const parts = partsForItem({ ...prop, has_kickboard: true, width_mm: 500, height_mm: 2010, depth_mm: 580, qty: 1 });
    assert.ok(!parts.some((part) => part.key === "kickboard"), `${ikeaRangeOf(prop)} must not offer one`);
  });
});

test("a Metod still offers one when it is switched on", () => {
  const parts = partsForItem({ ...metod, has_kickboard: true, width_mm: 600, height_mm: 800, depth_mm: 560, qty: 1 });
  assert.ok(parts.some((part) => part.key === "kickboard"));
});

test("an IKEA prop is added with no kickboard on it", () => {
  const src = read("app/(site)/design/PublicDesignClient.js");
  const add = src.slice(src.indexOf("async function addCabinet"), src.indexOf("async function addCabinet") + 1400);
  assert.match(add, /has_kickboard: false/, "the preset branch must clear the cabinet default");
});

test("switching a Metod kickboard on brings a board with it", () => {
  // A prop has no board spec of its own, so without this the kickboard reaches
  // the quote with no colour and nothing on the page to fix it with.
  const patch = kickboardOnPatch(metod);
  assert.equal(patch.has_kickboard, true);
  assert.equal(patch.kickboard_thickness_mm, 16);
  assert.deepEqual(patch.kickboard_style, METOD_KICKBOARD_STYLE);
  assert.equal(METOD_KICKBOARD_STYLE.colour, "Carcass");
  assert.equal(METOD_KICKBOARD_STYLE.thickness_mm, 16);
});

test("a cabinet we build keeps its own board, unchanged", () => {
  // The default is for props, which have nothing. Overriding a real cabinet's
  // kickboard with carcass white would be a regression.
  const patch = kickboardOnPatch(CUSTOM_CABINET);
  assert.deepEqual(patch, { has_kickboard: true });
});

test("the toggle is hidden where a kickboard is not allowed", () => {
  const src = read("app/(site)/design/PublicDesignClient.js");
  const toggle = src.slice(src.indexOf("function KickboardToggle"), src.indexOf("function KickboardToggle") + 1200);
  assert.match(toggle, /if \(!kickboardAllowedFor\(item\)\) return null/, "hidden, not disabled");
  assert.match(toggle, /kickboardOnPatch\(item\)/);
});
