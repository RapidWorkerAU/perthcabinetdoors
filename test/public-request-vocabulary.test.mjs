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
  builtInPlinthMm,
  ikeaRangeOf,
  kickboardAllowedFor,
  kickboardOnPatch,
  presetRef,
  resolveIkeaPreset,
} from "../lib/pcd-ikea-presets.js";
import { cabinetVerticalSpanMm, kickboardHeightMm } from "../lib/pcd-kickboard-utils.js";
import { computeDoorSizes, frontSpanMm } from "../lib/pcd-door-utils.js";
import { hasKickboard } from "../lib/pcd-kickboard-utils.js";
import { publicPartsFor } from "../lib/pcd-public-config.js";
import { computeCutList } from "../lib/pcd-cut-list.js";
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

// ── the plinth a Pax already has ────────────────────────────────────────────
//
// It is sold at its overall height, base included: 2010 and 2360 frames take
// 1950 and 2290 doors, and the difference is the recessed base it stands on.

const paxItem = (w, h, extra = {}) => ({
  id: "p", item_type: "tall_cabinet", preset_ref: presetRef("pax", "frame", w, h),
  width_mm: w, height_mm: h, depth_mm: 580, ...extra,
});

test("a Pax carries its own plinth inside the height it is sold at", () => {
  assert.equal(builtInPlinthMm(paxItem(500, 2010)), 60, "2010 frame less its 1950 door");
  assert.equal(builtInPlinthMm(paxItem(1000, 2360)), 70, "2360 frame less its 2290 door");
});

test("a frame that stands on legs has no built-in plinth", () => {
  assert.equal(builtInPlinthMm(metod), 0);
  assert.equal(builtInPlinthMm(besta), 0);
  assert.equal(builtInPlinthMm(CUSTOM_CABINET), 0, "cabinets we build have none either");
});

test("a Pax is never lifted by a kickboard, whatever the flag says", () => {
  // The cut list already refused to MAKE the board. The geometry did not, so an
  // item carrying the old flag was drawn standing a full 120mm plinth off the
  // floor: a 2010 wardrobe reaching 2130.
  const flagged = paxItem(500, 2010, { has_kickboard: true, kickboard_height_mm: 120 });
  assert.equal(kickboardHeightMm(flagged), 0);
  assert.deepEqual(cabinetVerticalSpanMm(flagged), [0, 2010]);
});

test("a cabinet we build is still lifted by its kickboard", () => {
  const ours = { id: "o", item_type: "base_cabinet", height_mm: 720, has_kickboard: true };
  assert.equal(kickboardHeightMm(ours), 120);
  assert.deepEqual(cabinetVerticalSpanMm(ours), [120, 840]);
});

test("both views start a Pax's fronts above its plinth", () => {
  // The elevation shortens the front area; 3D raises where the front cells
  // begin. Both read the same number off the preset rather than each carrying
  // their own idea of how far up a Pax door starts.
  const elevation = read("app/admin/design/_components/FrontElevationView.js");
  const has = (text, snippet, why) => assert.ok(text.includes(snippet), why || snippet);

  has(elevation, "builtInPlinthMm(item)", "the elevation reads the plinth");
  has(elevation, "const frontSvgH = Math.max(svgH - plinthMm * scale, 0)");
  has(elevation, "const dH   = frontSvgH / rows", "doors stop above it");
  has(elevation, "h={frontSvgH}", "so does a drawer bank");
  has(elevation, "const pxPerMm = frontSvgH / totalMm", "so do mixed sections");

  const threeD = read("app/admin/design/_components/Design3DView.js");
  has(threeD, "const bottomMm = carcassBottomMm + builtInPlinthMm(item)");
});

test("nothing offers a Pax a kickboard to colour, flag or no flag", () => {
  // has_kickboard on its own was the answer in eight places, and an item can
  // still carry it from an older design. Reading it raw is what put a Kickboard
  // swatch on a Pax, on a plinth that is part of the frame and already the
  // colour of the wardrobe.
  const flagged = { ...paxItem(500, 2010), has_kickboard: true, front_type: "doors", door_config: { columns: 1, rows: 1 }, qty: 1 };
  assert.equal(hasKickboard(flagged), false);
  assert.ok(!publicPartsFor(flagged).some((part) => part.key === "kickboard"), "no part to colour");
  const cut = computeCutList(flagged, [flagged], null) || [];
  assert.ok(!cut.some((row) => String(row.name || "").toLowerCase().includes("kick")), "no board cut either");
});

test("a Metod and a cabinet we build still get theirs", () => {
  const metodOn = {
    ...metod, has_kickboard: true, item_type: "tall_cabinet",
    width_mm: 600, height_mm: 2000, depth_mm: 600, qty: 1,
    front_type: "doors", door_config: { columns: 1, rows: 1 },
  };
  assert.equal(hasKickboard(metodOn), true);
  assert.ok(publicPartsFor(metodOn).some((part) => part.key === "kickboard"));

  const ours = {
    id: "o", item_type: "base_cabinet", width_mm: 600, height_mm: 720, depth_mm: 560, qty: 1,
    has_kickboard: true, front_type: "doors", door_config: { columns: 1, rows: 1 },
  };
  assert.equal(hasKickboard(ours), true);
  const cut = computeCutList(ours, [ours], null) || [];
  assert.ok(cut.some((row) => String(row.name || "").toLowerCase().includes("kick")), "still cut for a cabinet we build");
});

test("a wall cabinet never has one, wherever it is asked", () => {
  assert.equal(hasKickboard({ item_type: "wall_cabinet", has_kickboard: true }), false);
});

test("a Pax door is cut to the door, not to the whole frame", () => {
  // The size that reaches a quote. Sizing off the cabinet height alone made a
  // Pax door 60mm too long: it would have covered the plinth that is built into
  // the frame and shows in every photo of one.
  const doors = computeDoorSizes({
    ...paxItem(1000, 2010),
    front_type: "doors",
    door_config: { columns: 2, rows: 1 },
  });
  assert.equal(frontSpanMm(paxItem(1000, 2010)), 1950, "IKEA's own door height");
  assert.equal(doors.length, 1, "a pair of identical doors is one line of qty 2");
  assert.equal(doors[0].qty, 2);
  // 3mm off each way is what we cut a nominal IKEA front to.
  assert.equal(doors[0].height, 1947);
  assert.equal(doors[0].width, 497);
});

test("a cabinet we build sizes its doors off its whole height", () => {
  const ours = {
    id: "o", item_type: "tall_cabinet", width_mm: 600, height_mm: 2000, depth_mm: 600,
    front_type: "doors", door_config: { columns: 1, rows: 1 },
  };
  assert.equal(frontSpanMm(ours), 2000);
  assert.equal(computeDoorSizes(ours)[0].height, 1997);
});

test("a frame's own base is painted as part of the cabinet, not as a board of ours", () => {
  const elevation = read("app/admin/design/_components/FrontElevationView.js");
  const has = (snippet, why) => assert.ok(elevation.includes(snippet), why || snippet);

  // Two plinths sit inside the body and they are not the same thing. A
  // bookcase's rail is a board we cut, in the kickboard colour, marked in the
  // amber that means "this is on your cut list". A Pax base is part of the
  // frame: it takes the carcass tile, which for a prop IS the IKEA finish it
  // was given, and it is never amber.
  has("const insetPlinthMm = kickboardIsInset(item) ? kickboardHeightMm(item) : 0");
  has("const framePlinthMm = builtInPlinthMm(item)");
  has('tileFillFor(item, insetPlinthMm > 0 ? "kickboard" : "carcass")');
  has("{insetPlinthMm > 0 ? (", "only a board of ours gets the amber");
});

test("an open Pax closes its base off across the front", () => {
  // Sides to the floor and a bottom board raised onto the base is only half of
  // it. A Pax has a rail across the FRONT between the sides, floor to the
  // underside of that board. Without it the base read as two legs with a shelf
  // balanced across them.
  const threeD = read("app/admin/design/_components/Design3DView.js");
  const has = (snippet, why) => assert.ok(threeD.includes(snippet), why || snippet);
  has("const baseRail = (rail) => { if (rt > 0) panels.push({ rect: rail, b: bottomMm, t: floorMm }); };");
  has("builtInPlinthMm(item) > 0 ? carc : 0", "only a frame's own base draws it here");
  // A bookcase's plinth is a board of ours in its own colour, drawn by
  // KickboardMesh. Drawing it here as well would put two rails in one place.
  has("const rt = baseGapMm > 0 ? baseRailT : 0;");
});

test("an open Pax is built with its base, not sat flat on the floor", () => {
  // Sides to the floor, bottom board raised onto the base. openCarcassPanels
  // already builds exactly that for a bookcase; it just needed telling that a
  // Pax is the same construction.
  const threeD = read("app/admin/design/_components/Design3DView.js");
  assert.ok(
    threeD.includes("return kickboardIsInset(item) ? kickboardHeightMm(item) : builtInPlinthMm(item);"),
    "the open carcass lifts its bottom board onto a built-in base too"
  );
});

test("the admin panel does not offer a kickboard on a frame that has one", () => {
  const panel = read("app/admin/design/_components/DesignRightPanel.js");
  assert.ok(
    panel.includes('draft.item_type !== "wall_cabinet" && kickboardAllowedFor(draft)'),
    "the panel group asks the same rule the planner and the cut list ask"
  );
  assert.ok(panel.includes("has its own plinth built into its height"), "and says why it is not there");
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
