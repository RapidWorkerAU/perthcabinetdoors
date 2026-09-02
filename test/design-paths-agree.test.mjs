// THE SAME DRAWING HAS TO PRODUCE THE SAME PIECES, whichever door it comes in
// through.
//
// A design becomes quote lines two ways. We draw it and import it, or the
// customer draws it on the website and sends it as a request that is later
// converted. For a long time those were two separate translations, and nothing
// anywhere compared them. They drifted exactly where you would expect:
//
//   * a cabinet from a customer's design arrived with no size and no shelves,
//     so whoever opened it re-typed the box off a sentence in the description
//   * a corner cabinet was sized as one flat door instead of two folding leaves
//   * a floating shelf was quoted as one board instead of the three it is made
//     of, at about 7% of the material
//   * a shelf and rail was quoted as one board instead of five
//
// Every one of those was silent. A wrong size on a quote looks exactly like a
// right one, so the only detector was somebody noticing on a live job.
//
// This is the detector. It walks one of every kind of thing a customer can draw
// through BOTH paths and asserts they describe the same pieces: same type, same
// size, same quantity. A new item type, or a change to how one is made, fails
// here the moment the two paths disagree.
//
// WHAT THE PUBLIC PATH IS ALLOWED NOT TO PRODUCE is listed in EXCLUDED below,
// with the reason. That list is the whole of the permitted difference. Anything
// else is a fault.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { generateImportLines } from "../lib/pcd-design-to-lines.js";
import { requestLinesForItem } from "../lib/pcd-design-request-lines.js";
import { partsForItem } from "../lib/pcd-design-parts.js";

const ROOM = { id: "room-1", name: "Kitchen", width_mm: 4000, depth_mm: 3000, height_mm: 2400 };

// What the public path is not expected to produce, and why. Each is a decision
// somebody made out loud, not a gap.
const EXCLUDED = {
  // The public planner draws a benchtop so the room reads correctly, and says
  // "Benchtop (drawing only)" on the part list. It is never quoted from a
  // website request; a benchtop is measured on site.
  Benchtop: "the public planner labels the benchtop drawing only",
  // Handles and hinge supply. The public form asks about hinges separately and
  // we drill rather than supply, and handles are not offered on the website.
  Hardware: "hardware is not offered on the public planner",
};

const style = {
  material: "thermolaminate",
  finish: "Smooth",
  colour: "Topiary",
  thickness_mm: 21,
  supplier: "Polytec",
  edge_mould: "EM0 Square",
  colour_library_id: "lib-1",
};

function cabinet(over = {}) {
  return {
    id: "item-1",
    room_id: ROOM.id,
    item_type: "base_cabinet",
    label: "Base 900",
    wall: "top",
    x_mm: 0,
    width_mm: 900,
    height_mm: 720,
    depth_mm: 560,
    qty: 1,
    material: "decorative board",
    finish: "Matt",
    colour: "Carcass",
    carcass_thickness_mm: 16,
    back_panel_included: true,
    back_panel_thickness_mm: 16,
    shelf_qty: 1,
    shelf_thickness_mm: 16,
    shelf_heights_mm: [360],
    front_type: "doors",
    door_config: { columns: 2 },
    door_style: style,
    ...over,
  };
}

// One of everything a customer can draw and ask us to quote.
const CASES = [
  { label: "base cabinet with doors", item: cabinet() },
  { label: "base cabinet with drawers", item: cabinet({ front_type: "drawers", drawer_config: { heights_mm: [248, 248, 249] }, drawer_style: style, door_style: null, shelf_qty: 0 }) },
  {
    label: "base cabinet with a mixed front",
    item: cabinet({
      front_type: "mixed",
      drawer_style: style,
      section_config: {
        sections: [
          { type: "drawers", height_mm: 360, drawer: { heights_mm: [360] } },
          { type: "doors", height_mm: 360, door: { columns: 1, rows: 1 } },
        ],
      },
    }),
  },
  { label: "wall cabinet", item: cabinet({ item_type: "wall_cabinet", height_mm: 720, depth_mm: 350, mount_height_mm: 1500, has_kickboard: false }) },
  { label: "tall cabinet", item: cabinet({ item_type: "tall_cabinet", height_mm: 2100 }) },
  { label: "bookcase", item: cabinet({ item_type: "bookcase", front_type: "none", door_config: null, door_style: null, carcass_thickness_mm: 18, shelf_qty: 3, shelf_heights_mm: [] }) },
  { label: "corner cabinet, L shape", item: cabinet({ item_type: "corner_base_cabinet", corner_style: "l_shape", secondary_width_mm: 900, secondary_wall: "left", door_config: { columns: 1, rows: 1 } }) },
  { label: "corner cabinet, diagonal", item: cabinet({ item_type: "corner_base_cabinet", corner_style: "diagonal", secondary_width_mm: 900, secondary_wall: "left", door_config: { columns: 1, rows: 1 } }) },
  { label: "cabinet with finished end panels", item: cabinet({ end_panel_left: true, end_panel_right: true }) },
  { label: "cabinet with a finished back, top and underside", item: cabinet({ item_type: "wall_cabinet", has_back_panel: true, has_top_panel: true, has_bottom_panel: true, has_kickboard: false }) },
  { label: "cabinet with a kickboard", item: cabinet({ has_kickboard: true, kickboard_height_mm: 150, kickboard_thickness_mm: 16, kickboard_style: style }) },
  { label: "cabinet with a filler panel", item: cabinet({ has_filler_panel: true, filler_panel_height_mm: 200, filler_panel_thickness_mm: 16 }) },
  { label: "standalone panel", item: { id: "item-1", room_id: ROOM.id, item_type: "panel", label: "End panel", wall: "top", qty: 1, width_mm: 18, height_mm: 900, depth_mm: 600, panel_thickness_mm: 18, material: "decorative board", finish: "Matt", colour: "Carcass", door_style: style } },
  { label: "floating shelf", item: { id: "item-1", room_id: ROOM.id, item_type: "floating_shelf", label: "Shelf", wall: "top", qty: 1, width_mm: 900, depth_mm: 250, height_mm: 40, mount_height_mm: 1500, carcass_thickness_mm: 18, material: "decorative board", finish: "Matt", colour: "Carcass", door_style: style } },
  { label: "shelf and rail", item: { id: "item-1", room_id: ROOM.id, item_type: "shelf_rail", label: "Rail", wall: "top", qty: 1, width_mm: 1200, depth_mm: 300, height_mm: 40, mount_height_mm: 1500, carcass_thickness_mm: 18, material: "decorative board", finish: "Matt", colour: "Carcass", shelf_rail_config: { shelves: 1, left_support: "wall", right_support: "wall" }, door_style: style } },
];

// A piece, said the same way for both paths: what it is, how big, how many.
// Names are deliberately not compared. The two paths describe a corner leaf
// differently on the page and that is fine; what must not differ is the board
// that gets cut.
function piece(productType, height, width, qty) {
  return `${productType} ${Math.round(Number(height) || 0)}h x ${Math.round(Number(width) || 0)}w x${Number(qty) || 1}`;
}

function sorted(list) {
  return [...list].sort();
}

// What the admin importer would make of this item, with everything ticked.
function adminPieces(item) {
  const generated = generateImportLines({
    importableItems: [item],
    selections: {},
    selectedCabinetItems: [item],
    roomNameById: new Map([[ROOM.id, ROOM.name]]),
    roomById: new Map([[ROOM.id, ROOM]]),
    items: [item],
  });
  return generated
    .map(({ line }) => line)
    .filter((line) => !EXCLUDED[line.product_type])
    .map((line) => piece(line.product_type, line.height_mm, line.width_mm, line.qty));
}

// What a customer asking for the same item would send, with every part ticked.
function publicPieces(item) {
  const keys = partsForItem(item).map((part) => part.key);
  return requestLinesForItem(item, keys, { roomName: ROOM.name, roomHeightMm: ROOM.height_mm })
    .filter((line) => !EXCLUDED[line.productType])
    .map((line) => piece(line.productType, line.height, line.width, line.qty));
}

for (const { label, item } of CASES) {
  test(`${label}: both paths make the same pieces`, () => {
    const admin = adminPieces(item);
    const asked = publicPieces(item);
    assert.ok(admin.length > 0, "the importer made nothing, so this case proves nothing");
    assert.deepEqual(
      sorted(asked),
      sorted(admin),
      `a ${label} is quoted differently depending on who drew it.\n` +
        `  from a customer's design: ${sorted(asked).join(" | ") || "(nothing)"}\n` +
        `  from ours:                ${sorted(admin).join(" | ") || "(nothing)"}`
    );
  });
}

// The cabinet box travels as data on both paths, and has to say the same thing.
// This is the fault that had three cabinets re-entered by hand off a sentence.
test("a cabinet's box is the same box on both paths", () => {
  for (const { label, item } of CASES) {
    const [adminCabinet] = generateImportLines({
      importableItems: [item],
      selections: {},
      selectedCabinetItems: [item],
      roomNameById: new Map([[ROOM.id, ROOM.name]]),
      roomById: new Map([[ROOM.id, ROOM]]),
      items: [item],
    })
      .map(({ line }) => line)
      .filter((line) => line.product_type === "base_cabinet");
    if (!adminCabinet) continue;

    const keys = partsForItem(item).map((part) => part.key);
    const asked = requestLinesForItem(item, keys, { roomName: ROOM.name, roomHeightMm: ROOM.height_mm })
      .find((line) => line.productType === "base_cabinet");
    assert.ok(asked, `${label}: a customer asking for this cabinet sends no cabinet line`);
    assert.ok(asked.cabinetSpec, `${label}: the cabinet arrives with no box, so its size and shelves are lost`);

    const admin = adminCabinet.cabinet_config;
    const box = asked.cabinetSpec;
    for (const field of ["height_mm", "width_mm", "depth_mm", "carcass_thickness_mm", "shelf_qty", "back_panel_included", "secondary_width_mm"]) {
      assert.deepEqual(box[field], admin[field], `${label}: ${field} differs between the two paths`);
    }
  }
});

// ── THE RULE ────────────────────────────────────────────────────────────────
//
// A new thing a customer can draw is not finished until it has a row in CASES
// above. That is the whole reason this file exists: the last four faults were
// all a kind of cabinet the public planner learned to draw before the
// translation learned to build it, and nothing said so.
//
// Enforced rather than written down somewhere, because "remember to" is what
// failed the first four times.
test("every kind of cabinetry the planner offers is covered above", () => {
  const client = readFileSync(new URL("../app/(site)/design/PublicDesignClient.js", import.meta.url), "utf8");
  const catalogue = client.slice(client.indexOf("const CATALOGUE = ["), client.indexOf("const CATALOGUE_CATEGORIES"));
  const offered = [...catalogue.matchAll(/\{ type: "([a-z_]+)"[^}]*category: "custom"/g)].map((m) => m[1]);
  assert.ok(offered.length >= 8, "the catalogue could not be read, so this test proves nothing");

  const covered = new Set(CASES.map(({ item }) => item.item_type));
  const missing = offered.filter((type) => !covered.has(type));
  assert.deepEqual(
    missing,
    [],
    `the planner offers ${missing.join(", ")} but nothing here checks that both paths build ${missing.length === 1 ? "it" : "them"} the same way`
  );
});
