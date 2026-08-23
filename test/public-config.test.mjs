// The parts a customer configures in the public tool, and the rules that keep
// every choice buildable.
//
// The whole point of this module is that nothing is ever offered that has no
// real board behind it, so most of these tests hand it a stand-in colour
// library and check that what comes back matches what is in it.
import test from "node:test";
import assert from "node:assert/strict";
import {
  PUBLIC_PARTS,
  publicPartDef,
  publicPartsFor,
  readPartBoard,
  writePartBoard,
  boardsInStock,
  thicknessesInStock,
  coloursInStock,
  profileTypesInStock,
  profileNamesInStock,
  profileNeeds21,
  edgesFor,
  canProfile,
  areasForPart,
  partIsComplete,
  BOARD_NOTES,
} from "../lib/pcd-public-config.js";

// Stand-in for /api/colour-library?items=1 — the same shape getDatabaseColourItems
// returns, because that is what the window is handed at runtime.
const row = (material, mm, colour, finish = "Matt", supplier = "Polytec") => ({
  material, materialLabel: material, thickness: `${mm}mm`, thicknessMm: mm,
  colour, finish, supplier, id: `${material}-${mm}-${colour}`,
});
const ROWS = [
  row("Thermolaminate", 18, "Classic White"),
  row("Thermolaminate", 18, "Deep Forest"),
  row("Thermolaminate", 21, "Classic White"),
  row("Decorative Board", 16, "Classic White"),
  row("Decorative Board", 18, "Ecru Oak", "Woodmatt"),
  row("Compact Laminate", 13, "Charred Ash", "Natural", "Laminex"),
];

const cab = (over = {}) => ({
  item_type: "base_cabinet", front_type: "doors",
  end_panel_left: true, has_kickboard: true, has_benchtop: true, shelf_qty: 1,
  ...over,
});

test("only the parts a cabinet actually has are offered", () => {
  const keys = publicPartsFor(cab()).map((p) => p.key);
  assert.deepEqual(keys, ["doors", "end_left", "kickboard", "shelves", "benchtop"]);
  assert.ok(!keys.includes("end_right"), "an end that is switched off is not offered");
  assert.ok(!keys.includes("drawers"), "a doors-only cabinet has no drawer fronts");
});

test("a mixed front has both fronts, an open one has neither", () => {
  assert.ok(publicPartsFor(cab({ front_type: "mixed" })).some((p) => p.key === "drawers"));
  assert.ok(publicPartsFor(cab({ front_type: "mixed" })).some((p) => p.key === "doors"));
  const open = publicPartsFor(cab({ front_type: "none" })).map((p) => p.key);
  assert.ok(!open.includes("doors") && !open.includes("drawers"));
});

test("a corner names its ends by wall", () => {
  const parts = publicPartsFor(cab({ item_type: "corner_base_cabinet", end_panel_left: true, end_panel_right: true }));
  assert.equal(parts.find((p) => p.key === "end_left").label, "Wall 1 end panel");
  assert.equal(parts.find((p) => p.key === "end_right").label, "Wall 2 end panel");
});

test("the two ends are separate boards", () => {
  assert.equal(publicPartDef("end_left").styleKey, "end_left_style");
  assert.equal(publicPartDef("end_right").styleKey, "end_right_style");
});

test("a part's board is read and written wherever it actually lives", () => {
  // Shelves and a standalone board keep their finish in plain columns; every
  // other part keeps it in a style blob. Callers should not have to know which.
  const item = cab({ shelf_material: "decorative board", shelf_colour: "Ecru Oak", shelf_thickness_mm: 18 });
  assert.equal(readPartBoard(item, "shelves").colour, "Ecru Oak");
  assert.equal(writePartBoard(item, "shelves", { material: "x", colour: "y", thickness_mm: 16 }).shelf_colour, "y");

  const doored = cab({ door_style: { material: "thermolaminate", colour: "Deep Forest" } });
  assert.equal(readPartBoard(doored, "doors").colour, "Deep Forest");
  assert.equal(writePartBoard(doored, "doors", { colour: "Classic White" }).door_style.colour, "Classic White");
});

test("writing one field on a style keeps the rest of it", () => {
  const item = cab({ door_style: { material: "thermolaminate", colour: "Deep Forest", thickness_mm: 18 } });
  const patch = writePartBoard(item, "doors", { colour: "Classic White" });
  assert.equal(patch.door_style.material, "thermolaminate", "the board is not lost when only the colour changes");
  assert.equal(patch.door_style.thickness_mm, 18);
});

test("boards, thicknesses and colours all come from real stock", () => {
  assert.deepEqual(boardsInStock(ROWS).sort(), ["Compact Laminate", "Decorative Board", "Thermolaminate"]);
  assert.deepEqual(thicknessesInStock(ROWS, "Thermolaminate"), [18, 21]);
  assert.deepEqual(thicknessesInStock(ROWS, "Decorative Board"), [16, 18]);
  assert.equal(coloursInStock(ROWS, "Thermolaminate", 21).length, 1);
  assert.equal(coloursInStock(ROWS, "Decorative Board", 21).length, 0, "a thickness we do not stock offers nothing");
});

test("nothing is offered for a board the library does not carry", () => {
  assert.deepEqual(thicknessesInStock(ROWS, "Marble"), []);
  assert.deepEqual(profileTypesInStock(ROWS, "Marble", 18), []);
});

test("profiles are a Thermolaminate-only option", () => {
  assert.ok(profileTypesInStock(ROWS, "Thermolaminate", 18).length > 0);
  assert.deepEqual(profileTypesInStock(ROWS, "Decorative Board", 18), []);
  assert.deepEqual(profileTypesInStock(ROWS, "Compact Laminate", 13), []);
  assert.equal(canProfile(cab(), "doors", "Thermolaminate"), true);
  assert.equal(canProfile(cab(), "doors", "Decorative Board"), false);
});

test("Fluted is 21mm only, and is not offered at 18mm", () => {
  assert.ok(!profileTypesInStock(ROWS, "Thermolaminate", 18).includes("Fluted"));
  assert.ok(profileTypesInStock(ROWS, "Thermolaminate", 21).includes("Fluted"));
});

test("the 21mm-only shapes are recognised without restating their list", () => {
  assert.equal(profileNeeds21("Fluted", "Cove 25"), true);
  assert.equal(profileNeeds21("Detailed", "Hampshire"), true);
  assert.equal(profileNeeds21("Detailed", "Hampton"), false, "an ordinary Detailed shape is fine at 18mm");
  assert.equal(profileNeeds21("Minimal", "Hamilton"), false);
});

test("a shape with no board behind it is not offered", () => {
  // Same catalogue, but the library has no 21mm Thermolaminate at all.
  const no21 = ROWS.filter((r) => !(r.materialLabel === "Thermolaminate" && r.thicknessMm === 21));
  assert.deepEqual(profileNamesInStock(no21, "Fluted", "Thermolaminate", 21), []);
  assert.ok(!profileTypesInStock(no21, "Thermolaminate", 21).includes("Fluted"));
});

test("edges differ by board, and compact has none", () => {
  assert.equal(edgesFor("Thermolaminate").length, 11);
  assert.deepEqual(edgesFor("Decorative Board"), ["1mm Square Edge", "1mm Bevel Edge"]);
  assert.deepEqual(edgesFor("Compact Laminate"), []);
});

test("a panel offers copying first, then its reach, then its board in order", () => {
  const ids = areasForPart(cab(), "end_left", ROWS).map((a) => a.id);
  // Brand sits directly after the board: it decides which thicknesses, shapes,
  // edges and colours exist, so it cannot be asked after any of them.
  assert.deepEqual(ids, ["copy", "reach", "board", "brand", "thickness", "profile", "edge", "colour"]);
});

test("only panels that can run somewhere are asked about reach", () => {
  const kick = areasForPart(cab(), "kickboard", ROWS).map((a) => a.id);
  assert.ok(!kick.includes("reach"), "a kickboard already sits on the floor");
  const doors = areasForPart(cab(), "doors", ROWS).map((a) => a.id);
  assert.ok(!doors.includes("reach"));
});

test("a part that cannot be profiled is not asked about it", () => {
  const top = areasForPart(cab({ has_top_panel: true }), "top", ROWS).map((a) => a.id);
  assert.ok(!top.includes("profile"));
});

test("the benchtop leads with the fact that we do not supply it", () => {
  const areas = areasForPart(cab(), "benchtop", ROWS);
  assert.equal(areas[1].id, "benchtop_note", "right after the copy shortcut");
  assert.match(areas[1].note, /don't supply benchtops/i);
  assert.ok(!areas.some((a) => a.id === "edge"), "a benchtop we never make needs no edge mould");
});

test("each area names what it depends on, so the order cannot be skipped", () => {
  const areas = areasForPart(cab(), "doors", ROWS);
  const by = Object.fromEntries(areas.map((a) => [a.id, a]));
  // The brand is answered straight after the board, and everything that
  // depends on the range follows it, the thickness included: somebody after
  // Laminex who picks 21mm first would find no Laminex and conclude we do not
  // sell it, when they had only chosen a thickness Laminex does not make.
  assert.equal(by.brand.needs, "board");
  assert.equal(by.thickness.needs, "brand");
  assert.equal(by.profile.needs, "thickness");
  assert.equal(by.edge.needs, "profile");
  // The colour waits on the SHAPE, not on the edge. An edge is optional, so it
  // always reads as answered, which made it useless as a gate: the colour step
  // was never locked at all and could be opened before a board was chosen, on
  // an empty grid headed "Showing  mm only". A shape is not optional on
  // thermolaminate and can force 21mm and clear the colour under it, so that is
  // the last thing the colour has to wait for.
  assert.equal(by.colour.needs, "profile");
});

test("the colour is locked until the part can actually have one", () => {
  // areasForPart carries the lock down the whole chain, so this asks it rather
  // than re-deriving one step of it here and calling that the rule.
  const locks = (item, key) =>
    Object.fromEntries(areasForPart(item, key, ROWS).map((a) => [a.id, a.locked]));

  assert.equal(locks(cab(), "doors").colour, true, "nothing chosen yet");
  const noShape = cab({ door_style: { material: "thermolaminate", supplier: "Polytec", thickness_mm: 18 } });
  assert.equal(locks(noShape, "doors").colour, true, "thermolaminate with no shape yet");
  const shaped = cab({
    door_style: { material: "thermolaminate", supplier: "Polytec", thickness_mm: 18, profile_type: "Soft", profile: "Bendigo" },
  });
  assert.equal(locks(shaped, "doors").colour, false, "shape chosen, the colour opens");
  // A flat board takes no shape, so the profile reads as answered and the
  // colour opens as soon as the thickness is set.
  const flat = cab({ door_style: { material: "decorative board", supplier: "Polytec", thickness_mm: 18 } });
  assert.equal(locks(flat, "doors").colour, false, "a flat board waits on the thickness only");
});

test("a part is complete once it has a board, a thickness and a colour", () => {
  assert.equal(partIsComplete(cab(), "doors"), false);
  const done = cab({ door_style: { material: "thermolaminate", thickness_mm: 18, colour: "Deep Forest" } });
  assert.equal(partIsComplete(done, "doors"), true);
  const noColour = cab({ door_style: { material: "thermolaminate", thickness_mm: 18 } });
  assert.equal(partIsComplete(noColour, "doors"), false, "a board with no colour cannot be priced");
});

test("every board we sell has a note saying what it is for", () => {
  for (const b of ["Decorative Board", "Thermolaminate", "Compact Laminate"]) {
    assert.ok(BOARD_NOTES[b] && BOARD_NOTES[b].length > 40, b);
  }
  assert.match(BOARD_NOTES.Thermolaminate, /profiled/i);
  assert.match(BOARD_NOTES["Compact Laminate"], /cladding|wet areas/i);
});

test("every part names somewhere to keep its board", () => {
  // A part with no styleKey has to be one this module reads by hand, or its
  // colour would silently go nowhere.
  for (const p of PUBLIC_PARTS) {
    assert.ok(p.styleKey || p.shelves || p.body, p.key);
  }
});

test("profile and edge images resolve to the files we actually have", async () => {
  // The pickers show photos of the real routed door and the real edge. A slug
  // rule that drifts from the filenames shows a broken image on every tile,
  // which is worse than the drawn fallback it replaced.
  //
  // The Polytec photos moved under profiles/polytec/ when the Laminex range
  // arrived and needed a folder of its own. This test is what caught the slug
  // rule still pointing at the old flat layout, which had made every Polytec
  // profile on the finishes page a broken image.
  const { profileImageSrc, edgeImageSrc } = await import("../lib/pcd-profile-images.js");
  const { existsSync } = await import("node:fs");
  const PUBLIC_ROOT = new URL("../public", import.meta.url).pathname.replace(/^\//, "");

  assert.equal(profileImageSrc("Soft", "Mona Vale"), "/images/profiles/polytec/soft/mona-vale.jpg");
  assert.equal(profileImageSrc("Sharp", "Calcutta 35"), "/images/profiles/polytec/sharp/calcutta-35.jpg");
  assert.equal(edgeImageSrc("EM1 6mm Pencil Round"), "/images/edges/em1-6mm-pencil-round.png");
  assert.equal(edgeImageSrc("EM12 Small Chamfer"), "/images/edges/em12-small-chamfer.png");

  // Asserting the STRING alone is what let a folder rename go unnoticed. These
  // check the file is really there, so moving the library fails here.
  [
    profileImageSrc("Soft", "Mona Vale"),
    profileImageSrc("Sharp", "Calcutta 35"),
    edgeImageSrc("EM1 6mm Pencil Round"),
  ].forEach((path) => {
    assert.ok(existsSync(`${PUBLIC_ROOT}${path}`), `${path} is not on disk, so this tile shows a broken image`);
  });
});

test("the shapes with no photo are exactly the ones we know have none", async () => {
  // Fluted has no folder at all and the ten 21mm-only Detailed shapes have no
  // file, so those must fall back to a drawing rather than a broken image.
  const { profileImageSrc } = await import("../lib/pcd-profile-images.js");
  assert.equal(profileImageSrc("Fluted", "Cove 25"), null, "no Fluted photos exist");
  assert.ok(profileImageSrc("Detailed", "Hampton"), "an ordinary Detailed shape has one");
});

test("an edge with no name resolves to nothing rather than a bad path", async () => {
  const { edgeImageSrc } = await import("../lib/pcd-profile-images.js");
  assert.equal(edgeImageSrc(""), "");
  assert.equal(edgeImageSrc(null), "");
});

test("the tile aspects match the real image files", async () => {
  // Profile shots are 738x960 portrait doors; edge shots are 319x61 strips of
  // the moulded section. A tile built on the wrong ratio either crops the shape
  // someone is comparing or squashes it into a sliver.
  const { PROFILE_IMAGE_ASPECT, EDGE_IMAGE_ASPECT } = await import("../lib/pcd-profile-images.js");
  assert.equal(PROFILE_IMAGE_ASPECT, 738 / 960);
  assert.ok(PROFILE_IMAGE_ASPECT < 1, "a door photo is taller than it is wide");
  assert.equal(EDGE_IMAGE_ASPECT, 319 / 61);
  assert.ok(EDGE_IMAGE_ASPECT > 4, "an edge photo is a long shallow strip");
});

test("a Thermolaminate part is not finished until a shape is chosen", () => {
  // The colour is wrapped over a shaped face, so a flat Thermolaminate front is
  // not a thing we make — "no profile" would have been offering one. The edge
  // and the colour after it therefore stay locked until a shape is picked.
  const tl = cab({ door_style: { material: "thermolaminate", thickness_mm: 18 } });
  const areas = Object.fromEntries(areasForPart(tl, "doors", ROWS).map((a) => [a.id, a]));
  assert.equal(areas.profile.answered, false, "unanswered with no shape");

  const shaped = cab({ door_style: { material: "thermolaminate", thickness_mm: 18, profile_type: "Minimal", profile: "Hamilton" } });
  const done = Object.fromEntries(areasForPart(shaped, "doors", ROWS).map((a) => [a.id, a]));
  assert.equal(done.profile.answered, true);
});

test("a flat board's profile area is answered by the board itself", () => {
  // Decorative Board and Compact cannot take a profile, so the area exists to
  // say why rather than to be filled in — it must not block the colour.
  const db = cab({ door_style: { material: "decorative board", thickness_mm: 18 } });
  const areas = Object.fromEntries(areasForPart(db, "doors", ROWS).map((a) => [a.id, a]));
  assert.equal(areas.profile.answered, true);
});

test("a panel's profile counts even though it lives in panel_options", () => {
  // Panels keep their profile per panel rather than on the style blob, so the
  // area logic has to look in the right place or a shaped panel reads as
  // unfinished forever.
  const item = cab({
    end_panel_left: true,
    end_left_style: { material: "thermolaminate", thickness_mm: 18 },
    panel_options: { end_left: { profile_type: "Minimal", profile: "Hamilton" } },
  });
  const areas = Object.fromEntries(areasForPart(item, "end_left", ROWS).map((a) => [a.id, a]));
  assert.equal(areas.profile.answered, true);
});

test("a tile is a WHOLE part spec, so one click finishes the part", async () => {
  // Doors and drawer fronts are usually the same board, thickness, profile,
  // edge and colour. Copying only the colour would leave the profile and the
  // edge still to set, which is most of the work.
  const { partSpecsInUse } = await import("../lib/pcd-public-config.js");
  const design = [cab({
    id: "a", label: "Sink base",
    door_style: { material: "thermolaminate", thickness_mm: 18, finish: "Matt", colour: "Deep Forest", profile_type: "Detailed", profile: "Ascot", edge_mould: "EM1 6mm Pencil Round" },
  })];
  const [t] = partSpecsInUse(design, ROWS);
  assert.equal(t.materialLabel, "Thermolaminate");
  assert.equal(t.thicknessMm, 18);
  assert.equal(t.finish, "Matt");
  assert.equal(t.colour, "Deep Forest");
  assert.equal(t.profile_type, "Detailed");
  assert.equal(t.profile, "Ascot");
  assert.equal(t.edge_mould, "EM1 6mm Pencil Round");
  assert.equal(t.supplier, "Polytec", "the brand comes from the library row it names");
  assert.ok(t.usedOn.some((w) => w.includes("Sink base") && w.includes("Doors")));
});

test("a panel's profile is read from panel_options, a front's from its style", async () => {
  // They are kept in different places, and a tile that missed a panel's profile
  // would copy a shaped panel across as a flat one.
  const { partSpecsInUse } = await import("../lib/pcd-public-config.js");
  const design = [cab({
    id: "a", label: "Pantry", end_panel_left: true,
    end_left_style: { material: "thermolaminate", thickness_mm: 18, finish: "Matt", colour: "Deep Forest" },
    panel_options: { end_left: { profile_type: "Detailed", profile: "Ascot" } },
  })];
  const t = partSpecsInUse(design, ROWS).find((x) => x.colour === "Deep Forest");
  assert.equal(t.profile, "Ascot");
});

test("two parts differing only in edge stay two tiles", async () => {
  // Copying one when you wanted the other is exactly the mistake this prevents.
  const { partSpecsInUse } = await import("../lib/pcd-public-config.js");
  const base = { material: "thermolaminate", thickness_mm: 18, finish: "Matt", colour: "Deep Forest", profile_type: "Detailed", profile: "Ascot" };
  const design = [
    cab({ id: "a", label: "A", door_style: { ...base, edge_mould: "EM1 6mm Pencil Round" } }),
    cab({ id: "b", label: "B", door_style: { ...base, edge_mould: "EM0 Square" } }),
  ];
  assert.equal(partSpecsInUse(design, ROWS).length, 2);
});

test("the part being configured is never offered as a copy of itself", async () => {
  const { partSpecsInUse } = await import("../lib/pcd-public-config.js");
  const design = [cab({ id: "a", label: "Sink base", door_style: { material: "thermolaminate", thickness_mm: 18, finish: "Matt", colour: "Deep Forest" } })];
  assert.deepEqual(partSpecsInUse(design, ROWS, { excludeItemId: "a", excludePartKey: "doors" }), []);
});

test("identical parts collapse into one tile listing both places", async () => {
  const { partSpecsInUse } = await import("../lib/pcd-public-config.js");
  const spec = { material: "thermolaminate", thickness_mm: 18, finish: "Matt", colour: "Deep Forest" };
  const design = [
    cab({ id: "a", label: "Run 1", door_style: spec }),
    cab({ id: "b", label: "Run 2", door_style: spec }),
  ];
  const used = partSpecsInUse(design, ROWS);
  assert.equal(used.length, 1);
  assert.equal(used[0].usedOn.length, 2);
});

test("an unfinished part is not offered to copy", async () => {
  const { partSpecsInUse } = await import("../lib/pcd-public-config.js");
  assert.deepEqual(partSpecsInUse([cab({ door_style: { material: "thermolaminate", thickness_mm: 18 } })], ROWS), []);
  assert.deepEqual(partSpecsInUse([], ROWS), []);
  assert.deepEqual(partSpecsInUse(null, ROWS), []);
});

test("copying is the first thing offered on a part", async () => {
  // It is the one click that finishes the part outright, so burying it under
  // the colour step made it unfindable — which is where it started.
  const areas = areasForPart(cab(), "doors", ROWS);
  assert.equal(areas[0].id, "copy");
  assert.equal(areas[0].group, "Start here");
});

test("a kickboard is carcass board only", async () => {
  // It takes knocks from feet and vacuum cleaners, so a wrapped thermolaminate
  // face is the wrong thing down there and compact is an expensive way to make
  // one.
  const { partAllowsBoard } = await import("../lib/pcd-public-config.js");
  assert.equal(partAllowsBoard("kickboard", "Decorative Board"), true);
  assert.equal(partAllowsBoard("kickboard", "Thermolaminate"), false);
  assert.equal(partAllowsBoard("kickboard", "Compact Laminate"), false);
});

test("shelves and benchtops refuse thermolaminate", async () => {
  const { partAllowsBoard } = await import("../lib/pcd-public-config.js");
  for (const key of ["shelves", "benchtop"]) {
    assert.equal(partAllowsBoard(key, "Thermolaminate"), false, key);
    assert.equal(partAllowsBoard(key, "Decorative Board"), true, key);
    assert.equal(partAllowsBoard(key, "Compact Laminate"), true, key);
  }
});

test("every other part may be any board we stock", async () => {
  const { partAllowsBoard } = await import("../lib/pcd-public-config.js");
  for (const key of ["doors", "drawers", "end_left", "end_right", "back", "filler", "top", "underside"]) {
    for (const board of ["Decorative Board", "Thermolaminate", "Compact Laminate"]) {
      assert.equal(partAllowsBoard(key, board), true, `${key} / ${board}`);
    }
  }
});

test("a restricted part explains what is missing rather than just omitting it", async () => {
  const { boardsNotOffered } = await import("../lib/pcd-public-config.js");
  assert.match(boardsNotOffered("kickboard"), /carcass board/i);
  assert.match(boardsNotOffered("shelves"), /thermolaminate/i);
  assert.match(boardsNotOffered("benchtop"), /thermolaminate/i);
  assert.equal(boardsNotOffered("doors"), "", "an unrestricted part has nothing to explain");
});

test("the rule is spelled the same however the board is written", async () => {
  // The board list works in labels and a saved style works in the design tool's
  // lowercase spelling, so a rule that only matched one of them would be
  // enforced in the picker and walked around by a copy.
  const { partAllowsBoard } = await import("../lib/pcd-public-config.js");
  assert.equal(partAllowsBoard("kickboard", "thermolaminate"), false);
  assert.equal(partAllowsBoard("kickboard", "  Thermolaminate  "), false);
  assert.equal(partAllowsBoard("kickboard", "decorative board"), true);
});

test("every edge with a photo actually has one on disk", async () => {
  // The eleven thermolaminate moulds are the only edge photos we hold. If a
  // slug ever stops matching a filename, every tile silently drops to the
  // drawing and nobody notices, so the mapping is pinned.
  const fs = await import("node:fs");
  const { edgeImageSrc } = await import("../lib/pcd-profile-images.js");
  const { THERMOLAMINATE_EDGE_PROFILES } = await import("../lib/quote-form-data.js");
  for (const name of THERMOLAMINATE_EDGE_PROFILES) {
    const file = "public" + edgeImageSrc(name);
    assert.ok(fs.existsSync(file), `${name} -> ${file} is missing`);
  }
});

test("the two tape edges now have photos, and their drawings still differ", async () => {
  // They used to have no image at all, which is why the drawn fallback exists.
  // Both were uploaded to the edge bucket, so they resolve to a real URL now.
  //
  // The drawings stay, and stay DIFFERENT from each other: they are what shows
  // if storage cannot be reached, and one generic shape for both would make
  // square and bevel look identical, which is worse than no picture.
  const { edgeImageSrc, edgeSectionPath } = await import("../lib/pcd-profile-images.js");
  const { DECORATIVE_BOARD_EDGE_PROFILES } = await import("../lib/quote-form-data.js");

  for (const name of DECORATIVE_BOARD_EDGE_PROFILES) {
    assert.ok(edgeImageSrc(name), `${name} resolves to nothing`);
  }
  // "1mm Bevel Edge" is filed as bevel-edge.png, not 1mm-bevel-edge.png, so the
  // slug rule alone would miss it.
  assert.match(edgeImageSrc("1mm Bevel Edge"), /bevel-edge\.png$/);
  assert.match(edgeImageSrc("1mm Square Edge"), /1mm-square-edge\.png$/);

  const [square, bevel] = ["1mm Square Edge", "1mm Bevel Edge"].map(edgeSectionPath);
  assert.notEqual(square, bevel, "square and bevel must not draw the same shape");
});

test("the drawn section is read off the name, so a new edge is never a blank", async () => {
  const { edgeSectionPath } = await import("../lib/pcd-profile-images.js");
  const distinct = new Set(["EM0 Square", "EM1 6mm Pencil Round", "EM3 Large Bevel", "EM6 Roman", "EM2 Thumb Mould", "EM5 Step Bevel"].map(edgeSectionPath));
  assert.equal(distinct.size, 6, "each of those is a different shape");
  assert.ok(edgeSectionPath("Something We Have Never Sold").length > 0, "an unknown edge still draws as a square");
});
