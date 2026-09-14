// WHAT IS FITTED INSIDE A CABINET: RAILS, BINS AND LIGHTS.
//
// Decided 13 September 2026. A wardrobe needs a hanging rail and a bin cabinet
// needs the bin, and neither is cut from board: they are bought from the
// hardware library, they sit at a height inside the cabinet, and each one
// belongs on the quote as its own line at its own price.
//
// Only the kinds that go in a cabinet ON THEIR OWN are offered. A handle, a
// hinge, a runner, a tray and a push to open all belong to a door or a drawer
// and are asked where that is asked, so nothing is ever asked, or charged,
// twice.
//
// The price is read from the library when the quote is staged, the same rule
// the boards follow, so a rail that went up last week is quoted at this week's
// price without anyone re-picking it.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  accessoryDefaultHeightMm,
  accessoryHeightMm,
  accessoryLabel,
  accessoryProblems,
  accessoryShowsInRoom,
  accessorySummary,
  insideWidthMm,
  sizeFromHardware,
  patchAccessory,
  readAccessories,
  refreshedAccessories,
  withAccessory,
  withoutAccessory,
} from "../lib/pcd-cabinet-accessories.js";
import { accessoryParts, hasAccessoryDrawing, insideDepthMm, partColour, partIsMetal } from "../lib/pcd-accessory-shapes.js";
import { ACCESSORY_TYPE_VALUES, HARDWARE_TYPES, isAccessoryType } from "../lib/pcd-hardware-types.js";
import { withLibraryHardwareRates } from "../lib/pcd-design-hardware-rates.js";
import { generateImportLines } from "../lib/pcd-design-to-lines.js";
import { buildItemPatch, buildItemRow } from "../lib/pcd-design-item-io.js";
import { stripForbiddenItemFields } from "../lib/pcd-public-design.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ROOM = { id: "room-1", name: "Bedroom", width_mm: 4000, depth_mm: 3000, height_mm: 2400 };
const RAIL = { id: "rail-1", hardware_id: "hw-rail", name: "Oval Hanging Rail", type: "wardrobe_hanging_rail", qty: 1, height_mm: null };
const BIN = { id: "bin-1", hardware_id: "hw-bin", name: "Hafele Concelo 60L", type: "slide_out_bin", qty: 1, height_mm: null };

function wardrobe(over = {}) {
  return {
    id: "c1", room_id: ROOM.id, item_type: "base_cabinet", label: "Wardrobe 900", wall: "top", x_mm: 0,
    width_mm: 900, height_mm: 2100, depth_mm: 600, qty: 2, carcass_thickness_mm: 16,
    material: "decorative board", finish: "Matt", colour: "Classic White",
    front_type: "none",
    accessories: [RAIL],
    ...over,
  };
}

function imported(item) {
  return generateImportLines({
    importableItems: [item],
    selections: {},
    selectedCabinetItems: [item],
    roomNameById: new Map([[ROOM.id, ROOM.name]]),
    roomById: new Map([[ROOM.id, ROOM]]),
    items: [item],
  });
}

// ── Which kinds are offered ─────────────────────────────────────────────────

test("only the kinds that go in a cabinet on their own are accessories", () => {
  assert.deepEqual(ACCESSORY_TYPE_VALUES, [
    "wardrobe_hanging_rail",
    "slide_out_bin",
    "cabinet_inserts",
    "pull_out_shoe_rail",
    "pull_out_trouser_rack",
  ]);
  for (const belongsToAFront of ["handle", "hinge", "drawer_runner", "push_to_open", "cutlery_tray", "bi_fold_door"]) {
    assert.equal(isAccessoryType(belongsToAFront), false, `${belongsToAFront} belongs to a door or a drawer`);
  }
  // Every kind says which it is, so a new one added to the library has to
  // answer the question rather than default into the picker.
  for (const type of HARDWARE_TYPES) assert.equal(typeof type.fitsInCabinet, "boolean", type.value);
});

// ── The list on a cabinet ───────────────────────────────────────────────────

test("the list keeps what it is given and refuses what it is not", () => {
  const item = wardrobe({
    accessories: [
      RAIL,
      { ...BIN, qty: "2" },
      { hardware_id: "hw-handle", name: "Bar pull", type: "handle" },
      { name: "No hardware row", type: "slide_out_bin" },
      "nonsense",
    ],
  });
  const list = readAccessories(item);
  assert.equal(list.length, 2, "the handle, the row with no hardware and the nonsense are all dropped");
  assert.equal(list[1].qty, 2, "a typed quantity is a number");
  assert.equal(list[0].height_mm, null, "nobody has said where the rail goes yet");
  assert.equal(accessoryLabel(list[0]), "Oval Hanging Rail");
  assert.equal(accessorySummary(item), "Oval Hanging Rail, 2 x Hafele Concelo 60L");
  assert.equal(accessorySummary(wardrobe({ accessories: [] })), "None");
});

test("adding, changing and removing one", () => {
  const empty = wardrobe({ accessories: [] });
  const added = withAccessory(empty, { hardware_id: "hw-rail", name: "Oval Hanging Rail", type: "wardrobe_hanging_rail" });
  assert.equal(added.length, 1);
  assert.equal(added[0].qty, 1, "one, until somebody says otherwise");
  assert.ok(added[0].id, "it gets an id of its own, so the same rail can be fitted twice");

  const two = withAccessory({ accessories: added }, { hardware_id: "hw-rail", name: "Oval Hanging Rail", type: "wardrobe_hanging_rail" });
  assert.equal(two.length, 2, "the same rail twice is two rails");

  const moved = patchAccessory({ accessories: added }, added[0].id, { height_mm: "1600", qty: "3" });
  assert.equal(moved[0].height_mm, 1600);
  assert.equal(moved[0].qty, 3);

  assert.deepEqual(withoutAccessory({ accessories: added }, added[0].id), []);
  assert.equal(withAccessory(empty, { hardware_id: "hw-handle", type: "handle" }).length, 0, "a handle cannot be smuggled in");
});

// ── Where it sits ───────────────────────────────────────────────────────────

test("each kind starts where that kind goes, measured like a shelf", () => {
  const item = wardrobe();
  // 2100 high, 16mm boards: the inside runs 16 to 2084.
  assert.equal(accessoryDefaultHeightMm("wardrobe_hanging_rail", item), 2024, "a rail hangs 60mm under the inside top");
  assert.equal(accessoryDefaultHeightMm("cabinet_inserts", item), 2084, "a light sits under the top");
  assert.equal(accessoryDefaultHeightMm("slide_out_bin", item), 16, "a bin stands on the floor of the cabinet");
  assert.equal(accessoryHeightMm({ type: "wardrobe_hanging_rail" }, item), 2024, "blank means where that kind goes");
  assert.equal(accessoryHeightMm({ type: "wardrobe_hanging_rail", height_mm: 1500 }, item), 1500, "a typed height wins");
  assert.equal(insideWidthMm(item), 868, "900 less a board either side");
});

test("an accessory outside its cabinet is called out before the quote is made", () => {
  assert.deepEqual(accessoryProblems(wardrobe()), []);
  const problems = accessoryProblems(wardrobe({ accessories: [{ ...RAIL, height_mm: 2600 }] }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Oval Hanging Rail sits at 2600mm, outside this cabinet/);
});

// ── Onto the quote ──────────────────────────────────────────────────────────

test("each accessory becomes its own hardware line, one per cabinet times how many", () => {
  const lines = imported(wardrobe({ accessories: [RAIL, { ...BIN, qty: 2 }] }));
  const accessories = lines.filter(({ line }) => line.product_type === "Hardware");
  assert.equal(accessories.length, 2);

  const [rail, bin] = accessories;
  assert.equal(rail.part, "accessories", "its own tick on the staging tree");
  assert.equal(rail.line.product_name, "Oval Hanging Rail");
  assert.equal(rail.line.hardware_type, "wardrobe_hanging_rail");
  assert.equal(rail.line.qty, 2, "one rail in each of two wardrobes");
  assert.equal(bin.line.qty, 4, "two bins in each of two wardrobes");
  assert.equal(rail.line.unit_cost_source_id, "hw-rail", "it names the library row it is priced from");
  assert.equal(rail.line.product_unit_cost_ex_gst, 0, "and carries no price of its own");
  assert.match(rail.line.description, /Oval Hanging Rail — Wardrobe 900 — Bedroom/);
  assert.match(rail.line.notes, /2024mm from the bottom/, "where it goes");
  assert.match(rail.line.notes, /Inside width 868mm/, "and how long to cut it");
});

test("a cabinet with nothing fitted adds no lines", () => {
  assert.equal(imported(wardrobe({ accessories: [] })).filter(({ part }) => part === "accessories").length, 0);
});

test("unticking accessories on the staging tree drops them and nothing else", () => {
  const item = wardrobe();
  const lines = generateImportLines({
    importableItems: [item],
    selections: { [item.id]: { accessories: false } },
    selectedCabinetItems: [item],
    roomNameById: new Map([[ROOM.id, ROOM.name]]),
    roomById: new Map([[ROOM.id, ROOM]]),
    items: [item],
  });
  assert.equal(lines.filter(({ part }) => part === "accessories").length, 0);
  assert.ok(lines.some(({ part }) => part === "cabinet"), "the cabinet is still there");
});

// ── Priced from the library, every time ─────────────────────────────────────

test("the price comes from the hardware library when the quote is staged", () => {
  const lines = imported(wardrobe()).map(({ line }) => line);
  const { lines: priced, missing } = withLibraryHardwareRates(lines, [
    { id: "hw-rail", brand: "Hafele", name: "Oval Hanging Rail", unit_cost_ex_gst: 34.5 },
  ]);
  const rail = priced.find((line) => line.hardware_type === "wardrobe_hanging_rail");
  assert.equal(rail.product_unit_cost_ex_gst, 34.5, "today's price, not the one on the design");
  assert.equal(rail.product_name, "Hafele Oval Hanging Rail", "and today's name");
  assert.equal(missing.length, 0);

  // A board line has no catalogue row behind it and must be left alone.
  const board = priced.find((line) => line.product_type !== "Hardware");
  assert.deepEqual(board, lines.find((line) => line.product_type !== "Hardware"));
});

test("a retired library row is reported, never quietly quoted at nothing", () => {
  const { lines: priced, missing } = withLibraryHardwareRates(imported(wardrobe()).map(({ line }) => line), []);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].name, "Oval Hanging Rail");
  assert.equal(priced.find((line) => line.product_type === "Hardware").product_unit_cost_ex_gst, 0);

  const route = read("app/api/admin/design/projects/[projectId]/import/route.js");
  assert.match(route, /withLibraryHardwareRatesForGenerated\(/);
  assert.match(route, /not in the hardware library any more/, "and the staging preview says so");
  assert.match(route, /"accessories"\]/, "accessories are a part on the staging tree");
});

// ── Saved on the design, and staff only ─────────────────────────────────────

test("a cabinet saves its accessories, and refuses what is not one", () => {
  const row = buildItemRow({ item_type: "base_cabinet", accessories: [RAIL, { hardware_id: "x", type: "handle" }] }, "p1");
  assert.equal(row.accessories.length, 1, "the handle is dropped on the way in");
  assert.equal(row.accessories[0].hardware_id, "hw-rail");
  assert.deepEqual(buildItemRow({ item_type: "base_cabinet" }, "p1").accessories, [], "a cabinet starts with none");
  assert.equal(buildItemPatch({ accessories: [RAIL] }).accessories.length, 1);
  assert.deepEqual(buildItemPatch({ accessories: [] }).accessories, [], "removing the last one saves");
  assert.ok(!("accessories" in buildItemPatch({ label: "Wardrobe" })), "a patch that says nothing about them changes nothing");
});

test("the public planner cannot set them", () => {
  const cleaned = stripForbiddenItemFields({ item_type: "base_cabinet", accessories: [RAIL], label: "Wardrobe" });
  assert.ok(!("accessories" in cleaned), "staff only, like the handle and the hinge");
  assert.equal(cleaned.label, "Wardrobe");
});

test("a design saves before the migration is run", () => {
  const io = read("lib/pcd-design-item-io.js");
  const list = io.slice(io.indexOf("export const DESIGN_COLOUR_SOURCE_COLUMNS"), io.indexOf("export function withoutDesignColourSource"));
  assert.match(list, /"accessories"/, "the save retries without the column rather than failing");
  const migration = read("supabase/202609131000_pcd_design_item_accessories.sql");
  assert.match(migration, /add column if not exists accessories jsonb not null default '\[\]'::jsonb/);
  assert.match(migration, /comment on column public\.pcd_design_items\.accessories/);
});

// ── THE SHAPE, DRAWN THE SAME WAY IN BOTH VIEWS ─────────────────────────────
//
// Phase B: an oval tube spanning the inside with a cup at each end, from the
// photograph Ashleigh supplied on 13 September 2026.

test("an oval hanging rail is a tube across the inside with a cup at each end", () => {
  const item = wardrobe();
  const parts = accessoryParts({ ...RAIL, height_mm: 1800 }, item);
  assert.deepEqual(parts.map((p) => p.id), ["tube", "cup-left", "cup-right"]);

  const [tube, left, right] = parts;
  assert.equal(tube.shape, "tube");
  assert.equal(tube.x0Mm, 0);
  assert.equal(tube.x1Mm, 868, "it runs the full inside width, into the cups");
  assert.equal(tube.yMm, 1800, "at the height it is set to");
  assert.equal(tube.depthMm, 30);
  assert.equal(tube.heightMm, 15, "30 by 15 is what makes it an oval rather than a round bar");
  assert.equal(tube.finish, "chrome");
  // Centred in the depth, so a coat clears the back board and the door.
  assert.equal(tube.zMm, insideDepthMm(item) / 2);
  assert.equal(left.x0Mm, 0);
  assert.equal(right.x1Mm, 868);
  assert.ok(left.heightMm > tube.heightMm, "the cup is taller than the tube it holds");
});

test("the drawing follows the height, and a kind with no drawing is simply not pictured", () => {
  const item = wardrobe();
  assert.equal(accessoryParts({ ...RAIL, height_mm: 900 }, item)[0].yMm, 900);
  // Blank still draws: it is drawn where that kind goes.
  assert.equal(accessoryParts(RAIL, item)[0].yMm, 2024);
  assert.deepEqual(accessoryParts(BIN, item), [], "the bin has no drawing yet, which is not an error");
  assert.equal(hasAccessoryDrawing(RAIL), true);
  assert.equal(hasAccessoryDrawing(BIN), false);
  assert.equal(accessoryParts(RAIL, { width_mm: 0 }).length, 0, "nothing to draw across no cabinet");
});

test("a pull out shoe rail is two solid ribbed trays, at the size we sell", () => {
  assert.equal(isAccessoryType("pull_out_shoe_rail"), true);
  // The list in code and the list the database will accept are the same list.
  assert.match(read("supabase/202609131500_pcd_hardware_shoe_rail.sql"), /'pull_out_shoe_rail'/);

  const item = wardrobe({ width_mm: 900 });
  const rack = {
    id: "sr1", hardware_id: "hw-shoe", name: "Finista Pull Out Shoe Rail",
    type: "pull_out_shoe_rail", qty: 1, height_mm: 400,
    size: { width_mm: 800, depth_mm: 450, height_mm: 300 },
  };
  const parts = accessoryParts(rack, item);
  const byId = Object.fromEntries(parts.map((p) => [p.id, p]));

  // Both trays, each with its sides, its front rail, its back upstand and its
  // closed bed, plus the posts carrying the upper one at each corner.
  ["lower", "upper"].forEach((tier) => {
    [`${tier}-side-left`, `${tier}-side-right`, `${tier}-front-rail`, `${tier}-back-upstand`, `${tier}-bed`, `${tier}-rib-0`]
      .forEach((id) => assert.ok(byId[id], `${id} is drawn`));
  });
  ["post-0-left-front", "post-0-right-front", "post-0-left-back", "post-0-right-back"]
    .forEach((id) => assert.ok(byId[id], `${id} is drawn`));

  // 800 wide rack, centred in an 868 inside: 34 either side.
  assert.equal(byId["lower-side-left"].x0Mm, 34);
  assert.equal(byId["lower-side-right"].x1Mm, 834);
  assert.equal(byId["lower-side-left"].depthMm, 450, "the depth the library says");

  // THE BED IS CLOSED, not a set of bars you could see the carcass through.
  assert.equal(byId["lower-bed"].depthMm, 450);

  // THE UPPER TRAY IS HALF THE DEPTH AND SITS AT THE BACK, which is what leaves
  // the front of the tray below it open from above.
  assert.equal(byId["upper-bed"].depthMm, 225);
  assert.equal(byId["upper-side-left"].depthMm, 225);
  assert.equal(byId["upper-bed"].zMm - byId["upper-bed"].depthMm / 2, 225, "its front edge is halfway back");
  assert.equal(
    byId["upper-bed"].zMm + byId["upper-bed"].depthMm / 2,
    byId["lower-bed"].zMm + byId["lower-bed"].depthMm / 2,
    "and its back is flush with the back of the rack"
  );
  // The posts stand at the UPPER tray's corners, which is where the load is.
  assert.equal(byId["post-0-left-front"].zMm, 230);
  assert.ok(byId["post-0-left-back"].zMm > byId["post-0-left-front"].zMm);

  // The library height is the WHOLE rack: bottom tray to the top of the upper
  // upstand. 300 high, a 58 upstand, so the trays sit 242 apart.
  assert.equal(byId["upper-side-left"].yMm - byId["lower-side-left"].yMm, 242);
  const top = byId["upper-back-upstand"].yMm + byId["upper-back-upstand"].heightMm / 2;
  assert.equal(top - 400, 300, "and the whole thing is exactly as tall as the library says");

  // The ribs run ACROSS the width, spaced front to back, standing proud of the
  // bed rather than replacing it.
  const ribs = parts.filter((p) => p.id.startsWith("lower-rib-"));
  assert.ok(ribs.length >= 8, "a ribbed bed, not two lines");
  assert.ok(ribs.every((r) => r.x0Mm === 50 && r.x1Mm === 818), "each spans between the sides");
  const gaps = ribs.slice(1).map((r, i) => r.zMm - ribs[i].zMm);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < 0.001, "evenly spaced front to back");
  assert.ok(ribs.every((r) => r.yMm > byId["lower-bed"].yMm), "sitting on the bed");
  assert.ok(ribs.every((r) => r.yMm < byId["lower-front-rail"].yMm), "and below the front rail");

  // The back is what a heel rests against, so it is taller than the front, and
  // it is at the back.
  assert.ok(byId["lower-back-upstand"].heightMm > byId["lower-front-rail"].heightMm);
  assert.ok(byId["lower-back-upstand"].zMm > byId["lower-front-rail"].zMm);

  // Anthracite, as the rack is finished, not chrome.
  assert.ok(parts.every((p) => p.finish === "anthracite"));
});

test("a shoe rack with no size in the library still fits the cabinet", () => {
  const parts = accessoryParts({ id: "sr2", hardware_id: "hw", type: "pull_out_shoe_rail", height_mm: 300 }, wardrobe());
  const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
  assert.equal(byId["lower-side-left"].x0Mm, 12, "a runner's width in from the inside face");
  assert.equal(byId["lower-side-right"].x1Mm, 856);
  // No height either, so it falls back to the rack we sell.
  const top = byId["upper-back-upstand"].yMm + byId["upper-back-upstand"].heightMm / 2;
  assert.equal(top - 300, 300);
});

test("a shoe rack too short for a shoe still leaves room under the top tray", () => {
  // A row measured wrongly, or measured over one tray only, must not produce
  // two trays stacked on top of each other with no gap.
  const parts = accessoryParts(
    { id: "sr5", hardware_id: "hw", type: "pull_out_shoe_rail", height_mm: 200, size: { width_mm: 800, height_mm: 80, depth_mm: 450 } },
    wardrobe()
  );
  const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
  assert.equal(byId["upper-side-left"].yMm - byId["lower-side-left"].yMm, 120, "the least a shoe needs");
});

test("the size on an accessory is for the drawing, and only ever a size", () => {
  const list = withAccessory(wardrobe({ accessories: [] }), {
    hardware_id: "hw-shoe", type: "pull_out_shoe_rail", name: "Finista",
    size: { width_mm: 800, depth_mm: 450, height_mm: 110, unit_cost_ex_gst: 290 },
  });
  assert.deepEqual(list[0].size, { width_mm: 800, height_mm: 110, depth_mm: 450 }, "a price cannot ride in on the size");
  assert.deepEqual(sizeFromHardware({ length_mm: 900, projection_mm: 60 }), { width_mm: 900, depth_mm: 60 },
    "a rail listed by length is that wide");
  assert.deepEqual(sizeFromHardware({}), {}, "a row with no size says nothing");
  assert.match(read("app/admin/design/_components/DesignRightPanel.js"), /size: sizeFromHardware\(picked\)/);
});

test("a pull out trouser rack is a frame with a row of arms", () => {
  assert.equal(isAccessoryType("pull_out_trouser_rack"), true);
  // The newest migration carries the whole list, so running it is enough.
  const migration = read("supabase/202609131600_pcd_hardware_trouser_rack.sql");
  assert.match(migration, /'pull_out_trouser_rack'/);
  assert.match(migration, /'pull_out_shoe_rail'/, "and the shoe rail with it");

  const item = wardrobe();
  const rack = {
    id: "tr1", hardware_id: "hw-trouser", name: "Pull Out Trouser Rack",
    type: "pull_out_trouser_rack", qty: 1, height_mm: 1900,
    size: { width_mm: 850, depth_mm: 500 },
  };
  const parts = accessoryParts(rack, item);
  const ids = parts.map((p) => p.id);
  assert.deepEqual(ids.slice(0, 4), ["side-left", "side-right", "front-rail", "back-rail"]);

  const arms = parts.filter((p) => p.id.startsWith("arm-"));
  assert.ok(arms.length >= 8, "a row of arms across the rack, not two");
  assert.ok(arms.every((arm) => arm.x1Mm - arm.x0Mm === 12), "each one an arm's width, seen end on from the front");
  const gaps = arms.slice(1).map((arm, i) => arm.x0Mm - arms[i].x0Mm);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < 0.001, "evenly spaced");
  assert.equal(arms.length + 4, parts.length, "the frame and the arms, and nothing else");
  // And it starts near the top, because trousers need the drop.
  assert.equal(accessoryDefaultHeightMm("pull_out_trouser_rack", item), 1934);
});

// ── NOTHING IS DRAWN ON A RACK ──────────────────────────────────────────────
//
// There were mock trousers hanging off the trouser rack and mock shoes on the
// shoe rack. Ashleigh took one look on 13 September 2026: the trousers did not
// look like trousers, and a shape that is nearly a thing is worse than no shape
// at all. Both racks now draw the product and only the product.

test("no mock contents are drawn on any rack", () => {
  const item = wardrobe();
  ["pull_out_trouser_rack", "pull_out_shoe_rail"].forEach((type) => {
    const parts = accessoryParts({ id: "x", hardware_id: "hw", type, height_mm: 900 }, item);
    assert.ok(parts.length, `${type} is still drawn`);
    assert.equal(parts.filter((p) => p.shape === "fabric" || p.shape === "shoe").length, 0, type);
    assert.ok(parts.every((p) => !/trousers|shoe-\d/.test(p.id)), type);
  });
  // And neither view still carries a way to draw them.
  const elevation = read("app/admin/design/_components/FrontElevationView.js");
  const threeD = read("app/admin/design/_components/Design3DView.js");
  [elevation, threeD].forEach((source) => {
    assert.ok(!/shape === "shoe"/.test(source));
    assert.ok(!/shape === "fabric"/.test(source));
  });
});

test("a finish is one colour, wherever it is drawn", () => {
  assert.equal(partColour({ finish: "chrome" }), "#b9bec4");
  assert.equal(partColour({ finish: "gunmetal" }), "#4a4f55");
  assert.equal(partColour({ finish: "anthracite" }), "#3a3d42");
  assert.equal(partColour({ finish: "nonsense" }), "#b9bec4", "an unknown finish is chrome, not nothing");
  assert.equal(partIsMetal({ finish: "gunmetal" }), true);
  // Both views ask this rather than holding a colour of their own.
  assert.match(read("app/admin/design/_components/FrontElevationView.js"), /fill=\{partColour\(part\)\}/);
  assert.match(read("app/admin/design/_components/Design3DView.js"), /const colour = partColour\(part\)/);
});

test("both views draw it from the one shape, and it drags like a shelf", () => {
  const elevation = read("app/admin/design/_components/FrontElevationView.js");
  assert.match(elevation, /accessoryParts[^\n]*from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/pcd-accessory-shapes"/, "drawn from the shared shape");
  assert.match(elevation, /readAccessories\(item\)\.map\(\(entry\) =>/, "drawn on the cabinet");
  assert.match(elevation, /type:\s+"accessory",/, "and dragged");
  assert.match(elevation, /drag\.T \* 1\.5, Math\.min\(drag\.hMm - drag\.T \* 1\.5/, "clamped inside the box like a shelf");
  assert.match(elevation, /onItemChange\(drag\.itemId, \{ accessories: patchAccessory\(item, drag\.accessoryId, \{ height_mm: height \}\) \}\)/,
    "the height is saved on release, not on every pixel");

  const threeD = read("app/admin/design/_components/Design3DView.js");
  assert.match(threeD, /function AccessoryMesh\(/);
  assert.match(threeD, /<AccessoryMesh item=\{item\} W=\{W\} D=\{D\} \/>/, "and it is actually rendered");
  assert.match(threeD, /accessoryParts\(entry, item\)/, "from the same shape the elevation reads");
  assert.match(threeD, /<cylinderGeometry/, "a tube, not a board");
  assert.match(threeD, /accessoryShowsInRoom\(entry, item\)/, "hidden behind a closed front, like a shelf");
  // The 3D chunk must never import three itself: it is reached through r3f and
  // drei, or the whole design chunk pulls a second copy of three in.
  assert.ok(!/^import .*from "three"/m.test(threeD), "three is reached through r3f and drei only");
});

// ── On screen ───────────────────────────────────────────────────────────────

test("the design tool asks it in its own section, with the library as pictures", () => {
  const panel = read("app/admin/design/_components/DesignRightPanel.js");
  assert.match(panel, /<ConfigSection title="Accessories" summary=\{accessorySummary\(draft\)\}/);
  assert.match(panel, /setOpenWin\("accessories"\)/, "and a button that opens the picker");
  assert.match(panel, /openWin === "accessories" &&/);
  assert.match(panel, /parts=\{ACCESSORY_TYPES\.map/, "the kinds down the side");
  assert.match(panel, /<AccessoryTile/, "the items as pictures");
  assert.match(panel, /setNow\("accessories", withAccessory\(latestRef\.current/);
  assert.match(panel, /setNow\("accessories", withoutAccessory\(latestRef\.current/);
  assert.match(panel, /patchAccessory\(latestRef\.current, entry\.id, \{ height_mm/);
  assert.match(read("app/admin/design/_components/StageQuoteModal.js"), /accessories: "Accessories"/);
});

// ── A KIND NOBODY HAS DRAWN YET ─────────────────────────────────────────────
//
// The library has more kinds in it than anybody has drawn, and a hamper still
// takes up the space that decides where the shelf above it goes. So a kind with
// no picture of its own is drawn as its own box, and only a row with no size at
// all is left off the drawing altogether.

test("a kind with no drawing of its own is drawn as the space it takes up", () => {
  const item = wardrobe({ accessories: [] });
  const hamper = {
    id: "a1", hardware_id: "hw-hamper", name: "Hafele Laundry Hamper", type: "cabinet_inserts",
    qty: 1, height_mm: 400, size: { width_mm: 500, height_mm: 300, depth_mm: 450 },
  };
  const parts = accessoryParts(hamper, item);
  assert.equal(parts.length, 1);
  const [box] = parts;
  assert.equal(box.shape, "box", "an outline of the room it needs, not a picture of the thing");
  assert.equal(box.x1Mm - box.x0Mm, 500, "as wide as the library says");
  assert.equal(box.heightMm, 300);
  assert.equal(box.depthMm, 450);
  // Centred across the inside, and sitting ON the height it was put at rather
  // than straddling it, the same as everything else.
  assert.equal(box.x0Mm, (insideWidthMm(item) - 500) / 2);
  assert.equal(box.yMm, 400 + 150);
});

test("a box is never drawn wider or deeper than the cabinet holding it", () => {
  const narrow = wardrobe({ width_mm: 400, depth_mm: 300, accessories: [] });
  const [box] = accessoryParts({
    id: "a1", hardware_id: "hw-big", name: "Too big", type: "cabinet_inserts",
    qty: 1, height_mm: 500, size: { width_mm: 900, height_mm: 300, depth_mm: 600 },
  }, narrow);
  assert.equal(box.x0Mm, 0);
  assert.equal(box.x1Mm, insideWidthMm(narrow));
  assert.ok(box.depthMm <= insideDepthMm(narrow));
});

test("a kind with no drawing and no size in the library is not pictured", () => {
  assert.equal(hasAccessoryDrawing({ hardware_id: "hw-x", type: "cabinet_inserts", qty: 1 }), false);
  assert.equal(hasAccessoryDrawing({
    hardware_id: "hw-x", type: "cabinet_inserts", qty: 1,
    size: { width_mm: 500, height_mm: 300, depth_mm: 450 },
  }), true);
});

test("the trouser rack frame is as deep as the library row says", () => {
  const item = wardrobe({ accessories: [] });
  const rack = (height) => ({
    id: "a1", hardware_id: "hw-tr", name: "Salice Trouser Pull-Out", type: "pull_out_trouser_rack",
    qty: 1, height_mm: 1500, size: { width_mm: 860, height_mm: height, depth_mm: 500 },
  });
  const side = (parts) => parts.find((p) => p.id === "side-left");
  // A thin section in the library still draws thick enough to read.
  assert.equal(side(accessoryParts(rack(10), item)).heightMm, 26);
  assert.equal(side(accessoryParts(rack(52), item)).heightMm, 52, "and a chunky one draws as it is");
  // Within reason: a row measured over the whole assembly must not fill the
  // wardrobe with frame.
  assert.equal(side(accessoryParts(rack(300), item)).heightMm, 80);
});

test("both views draw the plain box, and see through in 3D", () => {
  const elevation = read("app/admin/design/_components/FrontElevationView.js");
  assert.match(elevation, /part\.shape === "box"/);
  assert.match(elevation, /strokeDasharray="4 2"/, "an outline, so it reads as room set aside");
  const threeD = read("app/admin/design/_components/Design3DView.js");
  assert.match(threeD, /part\.shape === "box"/);
  assert.match(threeD, /transparent opacity=\{0\.35\}/, "see through, not a solid block");
});

// ── KEEPING UP WITH THE LIBRARY ─────────────────────────────────────────────
//
// The kind, the name and the size are copied onto the accessory when it is
// picked, so correcting the library row afterwards would otherwise leave every
// cabinet already carrying it stuck with the old answer.

test("an accessory picks up a corrected kind, name and size from the library", () => {
  const item = wardrobe({
    accessories: [{
      id: "a1", hardware_id: "hw-shoe", name: "Hafele Shoe Rack", type: "cabinet_inserts",
      qty: 2, height_mm: 900, size: { width_mm: 900, height_mm: 300, depth_mm: 500 },
    }],
  });
  const next = refreshedAccessories(item, [{
    id: "hw-shoe", brand: "Hafele", name: "Finista Shoe Rack Pull-Out", type: "pull_out_shoe_rail",
    width_mm: 860, height_mm: 300, depth_mm: 480,
  }]);
  assert.ok(next, "the list is rewritten");
  assert.equal(next[0].type, "pull_out_shoe_rail");
  assert.equal(next[0].name, "Hafele Finista Shoe Rack Pull-Out");
  assert.deepEqual(next[0].size, { width_mm: 860, height_mm: 300, depth_mm: 480 });
  assert.equal(next[0].height_mm, 900, "where the designer put it is theirs, not the library's");
  assert.equal(next[0].qty, 2);
});

test("nothing is rewritten when the library already agrees, or has lost the row", () => {
  const rows = [{ id: "hw-rail", brand: "", name: "Oval Hanging Rail", type: "wardrobe_hanging_rail" }];
  assert.equal(refreshedAccessories(wardrobe(), rows), null, "no needless save on opening a cabinet");
  // A row deleted or retired leaves the accessory exactly as it is: losing one
  // off a cabinet is worse than showing a name that has moved on.
  assert.equal(refreshedAccessories(wardrobe(), []), null);
});

test("the panel puts them right when the cabinet is opened", () => {
  const panel = read("app/admin/design/_components/DesignRightPanel.js");
  assert.match(panel, /refreshedAccessories\(latestRef\.current, accessoryCatalogue\.rows\)/);
  assert.match(panel, /if \(next\) setNow\("accessories", next\)/, "and saves only when something actually moved");
});

// ── A MIXED FRONT IS JUDGED BAY BY BAY ──────────────────────────────────────
//
// A rail added to a wardrobe set up as drawers below and open space above did
// not appear in the 3D room at all. The check was "is the whole front open", so
// a mixed cabinet hid everything inside it, open bay included. Shelves already
// knew better; accessories now follow the same rule.

const MIXED = {
  front_type: "mixed",
  section_config: {
    sections: [
      { type: "open", height_mm: 1050 },
      { type: "drawers", height_mm: 1050 },
    ],
  },
};

test("an accessory in the open bay of a mixed front is drawn in the room", () => {
  const item = wardrobe({ ...MIXED, accessories: [] });
  // 2100 tall, split in half: the open bay runs 1050 to 2100.
  const inOpen = { ...RAIL, height_mm: 1990 };
  const inDrawers = { ...RAIL, height_mm: 500 };
  assert.equal(accessoryShowsInRoom(inOpen, item), true);
  assert.equal(accessoryShowsInRoom(inDrawers, item), false, "down in the drawer bank, so behind a front");

  // A wholly open cabinet shows everything, and a fronted one shows nothing.
  assert.equal(accessoryShowsInRoom(inDrawers, wardrobe()), true);
  assert.equal(accessoryShowsInRoom(inOpen, wardrobe({ front_type: "doors" })), false);

  // The 3D view asks, rather than checking the front itself.
  const threeD = read("app/admin/design/_components/Design3DView.js");
  assert.match(threeD, /readAccessories\(item\)\.filter\(\(entry\) => accessoryShowsInRoom\(entry, item\)\)/);
  assert.ok(!/\(item\.front_type \|\| "none"\) !== "none"\) return null/.test(threeD), "the old whole-front check is gone");
});

test("a rail added to a mixed cabinet starts in the open bay, not in the drawers", () => {
  const item = wardrobe({ ...MIXED, accessories: [] });
  // The open bay runs 1050 to 2100, so a rail hangs 60 under 2100, not 60 under
  // the cabinet's own inside top.
  assert.equal(accessoryDefaultHeightMm("wardrobe_hanging_rail", item), 2040);
  assert.equal(accessoryDefaultHeightMm("cabinet_inserts", item), 2100);
  // A bin stands on the floor of the open bay rather than under the drawers.
  assert.equal(accessoryDefaultHeightMm("slide_out_bin", item), 1050);
  assert.equal(accessoryShowsInRoom({ ...RAIL, height_mm: null }, item), true, "so it shows the moment it is added");

  // A cabinet switched back to plain doors is not judged on bays it used to
  // have: those mean nothing now.
  const wasMixed = wardrobe({ ...MIXED, front_type: "doors", accessories: [] });
  assert.equal(accessoryDefaultHeightMm("wardrobe_hanging_rail", wasMixed), 2024);
});
