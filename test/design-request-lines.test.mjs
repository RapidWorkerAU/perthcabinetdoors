// The public planner's "Send to PCD" must produce quote-request lines that the
// rest of the system understands: one line per real piece, a product_type the
// quote editor recognises, and Title Case materials.
//
// This exists because it did none of those things. A three-drawer cabinet came
// through as a single line with the carcass size on it and a product type of
// "Base cabinet", which is not a type the quote editor has.

import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCT_TYPES } from "../lib/pcd-materials.js";
import { partsForItem, buildPreset, selectedPartKeys, quotableItems } from "../lib/pcd-design-parts.js";
import { requestLinesForItem } from "../lib/pcd-design-request-lines.js";
import { cabinetSpecFromDesignItem } from "../lib/pcd-cabinet-from-design.js";

// product_type is copied straight onto the quote line when a request is
// converted (app/api/admin/quote-requests/route.js), so anything outside this
// set lands as a blank Type on the quote.
const VALID_TYPES = new Set([...PRODUCT_TYPES, "base_cabinet"]);

const CTX = { roomName: "Kitchen", roomHeightMm: 2400 };

const doorStyle = {
  material: "decorative board", finish: "Woodmatt", colour: "Bottega Oak",
  thickness_mm: 18, profile_type: "", profile: "", edge_mould: "1mm Square Edge",
};
const drawerStyle = { ...doorStyle };

const baseDoors = {
  id: "b1", item_type: "base_cabinet", label: "Base 900",
  width_mm: 900, height_mm: 720, depth_mm: 560, qty: 1,
  front_type: "doors", door_config: { columns: 2 }, door_style: doorStyle,
  has_kickboard: true, kickboard_height_mm: 150, end_panel_right: true,
  material: "decorative board", finish: "Woodmatt", colour: "Bottega Oak",
  carcass_thickness_mm: 16, shelf_qty: 1,
};

const baseDrawers = {
  id: "b2", item_type: "base_cabinet", label: "Base 600 drawers",
  width_mm: 600, height_mm: 720, depth_mm: 560, qty: 1,
  front_type: "drawers", drawer_config: { heights_mm: [180, 270, 270] }, drawer_style: drawerStyle,
  has_kickboard: true, kickboard_height_mm: 150,
  material: "decorative board", finish: "Woodmatt", colour: "Bottega Oak",
};

// A PAX wardrobe the customer already owns, exactly the case that produced
// "Fronts & panels only (customer's own cabinet)" lines at frame size.
const paxProp = {
  id: "k1", item_type: "tall_cabinet", label: "Pax 1000", preset_ref: "ikea:pax:frame:1000x2360",
  width_mm: 1000, height_mm: 2360, depth_mm: 580, qty: 1,
  front_type: "doors", door_config: { columns: 2 }, door_style: doorStyle,
};

// The same, with no colour chosen — the blank rows in the reported screenshot.
const paxPropNoColour = {
  ...paxProp, id: "k2", label: "Pax 500", width_mm: 500, door_config: { columns: 1 }, door_style: {},
  // Item-level fields describe the IKEA box, and must NOT leak onto the doors.
  material: "compact laminate", finish: "Woodmatt", colour: "Bottega Oak",
};

function linesFor(item, keys) {
  return requestLinesForItem(item, keys, CTX);
}
function allParts(item) {
  return partsForItem(item).map((p) => p.key);
}

test("every line carries a product type the quote editor understands", () => {
  const items = [baseDoors, baseDrawers, paxProp, paxPropNoColour];
  for (const item of items) {
    for (const line of linesFor(item, allParts(item))) {
      assert.ok(
        VALID_TYPES.has(line.productType),
        `${item.label}: "${line.productType}" is not a valid product type`
      );
    }
  }
});

test("a three drawer cabinet produces drawer front lines, not one cabinet line", () => {
  const lines = linesFor(baseDrawers, ["drawers"]);
  assert.ok(lines.length > 0, "drawer fronts must appear at all — they used to be missing entirely");
  assert.ok(lines.every((l) => l.productType === "Drawer front"));

  // Identical fronts merge into one line carrying a qty, the same way the admin
  // importer groups them, so it is the total that must come to three.
  const total = lines.reduce((n, l) => n + l.qty, 0);
  assert.equal(total, 3, "three drawer fronts in total");

  // The sizes are the fronts, never the 720 carcass.
  assert.ok(lines.every((l) => l.height !== 720), "no line carries the carcass height");
  assert.ok(lines.every((l) => l.height < 720 && l.height > 0));
});

test("doors are sized as doors, not as the cabinet", () => {
  const lines = linesFor(baseDoors, ["doors"]);
  assert.equal(lines.length, 1, "two identical doors merge into one line of qty 2");
  assert.equal(lines[0].productType, "Door");
  assert.equal(lines[0].qty, 2);
  assert.ok(lines[0].width < 900, `door width ${lines[0].width} should be under the 900 cabinet`);
  assert.ok(lines[0].height < 720, `door height ${lines[0].height} should be under the 720 cabinet`);
});

test("material is Title Case so it matches the quote editor's dropdown", () => {
  const lines = linesFor(baseDoors, allParts(baseDoors));
  const materials = [...new Set(lines.map((l) => l.material).filter(Boolean))];
  assert.deepEqual(materials, ["Decorative Board"]);
  assert.ok(!materials.some((m) => m === m.toLowerCase()), "no lowercase material survives");
});

test("a carcass line carries no dimensions, so the editor cannot reprice it as a flat sheet", () => {
  const [line] = linesFor(baseDoors, ["carcass"]);
  assert.equal(line.productType, "base_cabinet");
  assert.equal(line.width, undefined);
  assert.equal(line.height, undefined);
  assert.match(line.notes, /720 high × 900 wide × 560 deep/, "the real size is in the notes, height first");
});

// THE BOX HAS TO TRAVEL AS DATA, not only as a sentence.
//
// It used to travel only as the sentence. So a cabinet from a customer's design
// converted with no height, width, depth or shelves, and whoever opened the
// configurator got its built-in starting values (720 high x 900 wide x 560
// deep, no shelves) with nothing on screen saying the real ones had been lost.
test("a carcass line carries the cabinet itself, not just a description of it", () => {
  const [line] = linesFor(baseDoors, ["carcass"]);
  const spec = line.cabinetSpec;
  assert.ok(spec, "the cabinet line carries no box, so the conversion has nothing to build");
  assert.equal(spec.height_mm, 720);
  assert.equal(spec.width_mm, 900);
  assert.equal(spec.depth_mm, 560);
  assert.equal(spec.carcass_thickness_mm, 16);
  assert.equal(spec.shelf_qty, 1);
  assert.equal(spec.back_panel_included, true);
  // Title Case, like every other value that reaches a quote line.
  assert.equal(spec.carcass_material, "Decorative Board");
  // And which item it was drawn as, so a quote line can be traced back to it.
  assert.equal(line.designItemId, "b1");
});

// One builder, called by the request path and by the admin importer. Two
// builders is how the same drawing came to produce two different cabinets.
test("the box is built by the shared builder, not spelled out again", () => {
  const [line] = linesFor(baseDoors, ["carcass"]);
  assert.deepEqual(line.cabinetSpec, cabinetSpecFromDesignItem(baseDoors));
});

test("kickboard and end panel come through as their own Panel lines", () => {
  const lines = linesFor(baseDoors, ["endpanels", "kickboard"]);
  assert.ok(lines.every((l) => l.productType === "Panel"), "a kickboard and an end panel are both Panels");
  const names = lines.map((l) => l.productName);
  assert.ok(names.includes("Kickboard"));
  assert.ok(names.includes("End Panel (Right)"));
  // A finished end that stands proud of the run needs its own kickboard return,
  // which the website's own builder never made and the shared one always did.
  assert.ok(names.includes("Kickboard — Right End"), "the finished end's kickboard return is missing");
  const kick = lines.find((l) => l.productName === "Kickboard");
  assert.equal(kick.width, 900);
  assert.equal(kick.height, 150);
});

test("a customer's own cabinet never produces a carcass line", () => {
  assert.ok(!allParts(paxProp).includes("carcass"));
  const lines = linesFor(paxProp, allParts(paxProp));
  assert.ok(!lines.some((l) => l.productType === "base_cabinet"));
  assert.ok(lines.every((l) => /carcass NOT supplied/i.test(l.notes)));
});

test("a Pax door is quoted at door size, not at the 1000x2360 frame", () => {
  const lines = linesFor(paxProp, ["doors"]);
  assert.ok(lines.length >= 1);
  for (const line of lines) {
    assert.notEqual(line.width, 1000, "the frame width must not become a door width");
    assert.notEqual(line.height, 2360, "the frame height must not become a door height");
  }
});

test("an unstyled front does not inherit the IKEA carcass finish, and says it is unset", () => {
  const lines = linesFor(paxPropNoColour, ["doors"]);
  assert.ok(lines.length >= 1);
  for (const line of lines) {
    assert.equal(line.colour, "", "the box's colour must not leak onto a new door");
    assert.equal(line.material, "");
    assert.match(line.notes, /No colour chosen yet/);
  }
});

test("a cabinet we ARE making does inherit its own finish when the front has none", () => {
  const bare = { ...baseDoors, door_style: {} };
  const [line] = linesFor(bare, ["doors"]);
  assert.equal(line.colour, "Bottega Oak");
  assert.equal(line.material, "Decorative Board");
});

test("lines say when the carcass was not asked for", () => {
  const withBox = linesFor(baseDoors, ["carcass", "doors"]);
  assert.ok(!withBox.some((l) => /not requested/i.test(l.notes || "")));

  const withoutBox = linesFor(baseDoors, ["doors"]);
  assert.ok(withoutBox.every((l) => /Carcass not requested/i.test(l.notes)));
});

test("selecting nothing on an item produces no lines", () => {
  assert.deepEqual(linesFor(baseDoors, []), []);
});

test("the everything preset covers every part of every item with no unknown types", () => {
  const items = quotableItems([baseDoors, baseDrawers, paxProp]);
  const selection = buildPreset(items, "everything");
  const lines = items.flatMap((item) => requestLinesForItem(item, selectedPartKeys(selection, item), CTX));
  assert.ok(lines.length > items.length, "more lines than items, because parts are itemised");
  assert.ok(lines.every((l) => VALID_TYPES.has(l.productType)));
  assert.ok(lines.every((l) => Number(l.qty) > 0));
  // Every board line needs a size; a carcass line deliberately has none.
  for (const line of lines.filter((l) => l.productType !== "base_cabinet")) {
    assert.ok(Number(line.width) > 0, `${line.productName} has no width`);
    assert.ok(Number(line.height) > 0, `${line.productName} has no height`);
  }
});

// ── regressions found by checking the review prototype against real output ──

test("a door grid counts columns AND rows", async () => {
  const { frontCounts, partsForItem: parts } = await import("../lib/pcd-design-parts.js");
  // A pantry as one column of two doors is two doors, not one.
  const pantry = {
    id: "t1", item_type: "tall_cabinet", label: "Pantry 600",
    width_mm: 600, height_mm: 2100, depth_mm: 560, qty: 1,
    front_type: "doors", door_config: { columns: 1, rows: 2 }, door_style: doorStyle,
  };
  assert.equal(frontCounts(pantry).doors, 2);
  assert.equal(parts(pantry).find((p) => p.key === "doors").detail, "2 doors");

  // And the picker's count must agree with what the request actually carries.
  const lineQty = linesFor(pantry, ["doors"]).reduce((n, l) => n + l.qty, 0);
  assert.equal(lineQty, frontCounts(pantry).doors, "the card and the quote must agree");
});

test("a standalone panel is measured across its face, not its edge", async () => {
  const { frontPiecesForItem } = await import("../lib/pcd-design-parts.js");
  // width_mm is the 18mm on-edge thickness; depth_mm is the finished face width.
  const panel = { id: "p1", item_type: "panel", label: "End panel", width_mm: 18, height_mm: 870, depth_mm: 560, qty: 1 };
  const { box } = frontPiecesForItem(panel);
  assert.deepEqual(box, { width: 560, height: 870 });

  const [line] = linesFor(panel, ["body"]);
  assert.equal(line.width, 560, "the quote line uses the face width too");
  assert.equal(line.height, 870);
});

// ── the quote editor's own rules per product type ───────────────────────────
// Mirrors applyProductLinePatch in app/admin/quotes/[id]/QuoteEditor.js. If a
// line arrives carrying a field that type is not allowed, the editor blanks it
// and the detail is lost silently, so it must not be there in the first place.

const HINGE_FIELDS = ["hingeHoles", "hingeQty"];

test("only Door lines carry hinge fields", () => {
  const items = [baseDoors, baseDrawers, paxProp];
  for (const item of items) {
    for (const line of linesFor(item, allParts(item))) {
      if (line.productType === "Door") continue;
      for (const f of HINGE_FIELDS) {
        assert.ok(!line[f], `${line.productType} "${line.productName}" must not carry ${f}`);
      }
    }
  }
});

test("a Door's hinge qty reads as a number the drilling cost can parse", () => {
  const [line] = linesFor(baseDoors, ["doors"]);
  if (line.hingeHoles) {
    assert.match(line.hingeQty, /^\d+ hinges$/, "hingeCount() reads the first number out of this");
    assert.ok(Number(line.hingeQty.match(/\d+/)[0]) > 0);
  }
});

test("a cabinet line carries nothing the editor would blank", () => {
  const [line] = linesFor(baseDoors, ["carcass"]);
  assert.equal(line.productType, "base_cabinet");
  for (const f of ["width", "height", "edgeMould", "profileType", "profile", ...HINGE_FIELDS]) {
    assert.ok(!line[f], `a cabinet line must not carry ${f}`);
  }
});

test("a cabinet's notes are a brief someone can configure from", () => {
  const [line] = linesFor(baseDoors, ["carcass"]);
  // description on the quote line comes from notes, and the Cabinets tab shows
  // it under the name while the line reads "Needs configuration".
  assert.match(line.notes, /720 high × 900 wide × 560 deep/);
  assert.match(line.notes, /16mm carcass board/);
  assert.match(line.notes, /1 shelf/);
  assert.match(line.notes, /Back included/);
});

test("a wall cabinet's notes say how high it hangs", () => {
  const wall = { ...baseDoors, id:"w9", item_type:"wall_cabinet", label:"Wall 900", mount_height_mm: 1500, shelf_qty: 0 };
  const [line] = linesFor(wall, ["carcass"]);
  assert.match(line.notes, /Hangs 1500mm off the floor/);
  assert.match(line.notes, /No shelves/);
});

test("a drawer front always states its runner", () => {
  const lines = linesFor(baseDrawers, ["drawers"]);
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.match(line.notes, /Runner \(supplied with drawer\):/);
  }
});

test("a filler with no height shouts about it rather than shipping a zero", () => {
  // On a tall cabinet: a filler closes the gap to the ceiling, so a base
  // cabinet never has one and the shared builder refuses to make one.
  const noHeight = { ...baseDoors, id:"f1", item_type:"tall_cabinet", height_mm:2100, has_filler_panel:true, filler_panel_height_mm:0 };
  const [line] = linesFor(noHeight, ["filler"]);
  assert.match(line.notes, /HEIGHT NOT SET/);
});

test("a bookcase plinth is named and noted as a plinth rail, not a kickboard", () => {
  const bookcase = { ...baseDoors, id:"o1", item_type:"bookcase", label:"Bookcase", front_type:"none" };
  const [line] = linesFor(bookcase, ["kickboard"]);
  assert.equal(line.productName, "Plinth Rail");
  assert.match(line.notes, /set back between the bookcase sides/);
});

test("a panel that runs to the ceiling says so", () => {
  const tall = { ...baseDoors, id:"e1", panel_to_ceiling:true, panel_to_floor:true };
  const lines = linesFor(tall, ["endpanels"]);
  assert.ok(lines.length > 0);
  assert.match(lines[0].notes, /runs down to the floor and runs up to the ceiling/);
});

test("every line has a product name and notes, so nothing lands blank", () => {
  const items = [baseDoors, baseDrawers, paxProp, paxPropNoColour];
  for (const item of items) {
    for (const line of linesFor(item, allParts(item))) {
      assert.ok(String(line.productName || "").trim(), "product name must not be blank");
      assert.ok(String(line.notes || "").trim(), `${line.productName} must carry notes`);
    }
  }
});

test("a whole mixed design converts with every line fitting the editor", () => {
  const mixed = {
    id: "t1", item_type: "tall_cabinet", label: "Pantry 600",
    width_mm: 600, height_mm: 2100, depth_mm: 560, qty: 1, carcass_thickness_mm: 16,
    front_type: "mixed",
    section_config: { sections: [
      { type: "doors",  height_mm: 1400, door: { columns: 1 } },
      { type: "drawers", height_mm: 700, drawer: { heights_mm: [350, 350] } },
      { type: "appliance", height_mm: 0 },
    ] },
    door_style: doorStyle, drawer_style: drawerStyle,
    material: "decorative board", finish: "Woodmatt", colour: "Bottega Oak",
    has_kickboard: true, kickboard_height_mm: 150, has_filler_panel: true, filler_panel_height_mm: 300,
  };
  const bookcase = {
    id: "o1", item_type: "bookcase", label: "Bookcase 800",
    width_mm: 800, height_mm: 1800, depth_mm: 300, qty: 1, carcass_thickness_mm: 16,
    front_type: "none", shelf_qty: 4, has_kickboard: true, kickboard_height_mm: 100,
    material: "decorative board", finish: "Woodmatt", colour: "Bottega Oak",
  };
  const window = { id: "win", item_type: "window", label: "Window", width_mm: 1200, height_mm: 900 };

  const all = [baseDoors, baseDrawers, mixed, bookcase, paxProp, window];
  const q = quotableItems(all);
  assert.equal(q.length, 5, "the window is not quotable");

  const selection = buildPreset(q, "everything");
  const lines = q.flatMap((item) => requestLinesForItem(item, selectedPartKeys(selection, item), CTX));

  // A mixed front contributes both a door and drawer lines; the appliance bay
  // is an opening and contributes nothing.
  const fromPantry = lines.filter((l) => /Pantry 600/.test(l.notes));
  assert.ok(fromPantry.some((l) => l.productType === "Door"));
  assert.ok(fromPantry.some((l) => l.productType === "Drawer front"));

  for (const line of lines) {
    assert.ok(VALID_TYPES.has(line.productType), `${line.productName}: bad type`);
    assert.ok(Number(line.qty) > 0);
    assert.ok(String(line.notes || "").trim(), `${line.productName}: no notes`);
    if (line.productType === "base_cabinet") {
      assert.ok(!line.width && !line.height, "cabinet lines carry no size");
    } else {
      assert.ok(Number(line.width) > 0 && Number(line.height) > 0, `${line.productName}: no size`);
    }
    if (line.productType !== "Door") assert.ok(!line.hingeHoles && !line.hingeQty);
  }
});

// ── Every piece must carry a thickness, or it can never be priced ─────────────
//
// The public colour picker deliberately never asked the customer for a
// thickness, so it wrote none into the style. boardFields read the style and
// nothing else, so EVERY line from a design arrived with the Thickness column
// blank. Board prices in the colour library are held per finish AND thickness,
// so a blank there is not cosmetic: the line cannot be matched to a price at
// all, and it lands on the quote at $0.
//
// The picker now records the thickness it resolved. These lock the fallback
// that covers designs saved before it did.

// Same cabinet, but with the styles a pre-fix design would have saved: colour
// and finish, no thickness_mm anywhere.
const styleWithoutThickness = { material: "decorative board", finish: "Woodmatt", colour: "Bottega Oak" };

test("a front with no thickness on its style still gets the board it is made from", () => {
  const item = { ...baseDoors, door_style: styleWithoutThickness };
  const lines = requestLinesForItem(item, ["doors"], CTX);

  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.equal(line.thickness, "18mm", "a door is an 18mm board");
  }
});

test("a finished panel falls back to its own board, not the door's", () => {
  const item = { ...baseDoors, door_style: styleWithoutThickness, finish_panel_style: styleWithoutThickness };
  const panels = requestLinesForItem(item, ["endpanels"], CTX);

  assert.ok(panels.length > 0);
  for (const line of panels) assert.equal(line.thickness, "18mm");
});

test("a kickboard is priced off its own thinner board, not the door's 18mm", () => {
  const item = { ...baseDoors, door_style: styleWithoutThickness, kickboard_thickness_mm: 16 };
  const [kick] = requestLinesForItem(item, ["kickboard"], CTX);

  assert.equal(kick.thickness, "16mm");
});

test("a thickness the customer's pick DID record still wins over the fallback", () => {
  const item = { ...baseDoors, door_style: { ...styleWithoutThickness, thickness_mm: 21 } };
  const lines = requestLinesForItem(item, ["doors"], CTX);

  for (const line of lines) assert.equal(line.thickness, "21mm");
});

test("the colour library row the customer picked is carried onto the line", () => {
  // This is what lets the conversion price the piece off the exact board rather
  // than re-matching on a colour name two suppliers can share.
  const item = {
    ...baseDoors,
    door_style: { ...styleWithoutThickness, colour_library_id: "lib-row-7", supplier: "Laminex" },
  };
  const lines = requestLinesForItem(item, ["doors"], CTX);

  for (const line of lines) {
    assert.equal(line.colourLibraryId, "lib-row-7");
    assert.equal(line.supplierName, "Laminex");
  }
});

test("every non cabinet line from a whole design carries a thickness", () => {
  // Styles stripped of thickness_mm throughout, the shape a design saved before
  // the picker recorded one would have.
  const strip = (item) => ({
    ...item,
    door_style: item.door_style ? { ...item.door_style, thickness_mm: undefined } : item.door_style,
    drawer_style: item.drawer_style ? { ...item.drawer_style, thickness_mm: undefined } : item.drawer_style,
  });
  const q = quotableItems([baseDoors, baseDrawers, paxProp].map(strip));
  const selection = buildPreset(q, "everything");
  const lines = q.flatMap((item) => requestLinesForItem(item, selectedPartKeys(selection, item), CTX));

  for (const line of lines) {
    if (line.productType === "base_cabinet") continue;
    assert.match(String(line.thickness), /^\d+mm$/, `${line.productName}: no thickness, so it cannot be priced`);
  }
});
