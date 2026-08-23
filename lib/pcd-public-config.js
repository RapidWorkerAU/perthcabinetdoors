// The parts a customer configures in the public design tool, and the order the
// questions have to be asked in.
//
// A cabinet is a set of parts, and each one can be a different board — a
// profiled Thermolaminate door beside a plain Decorative Board end is an
// ordinary job. So every part carries its own board, its own profile and its
// own edge, and the sidebar's job is only to say which parts exist.
//
// Everything here is pure: it takes the item and the live colour-library rows
// and returns what may be chosen. Nothing is ever offered that has no real
// board behind it, because availability is computed from those rows rather than
// from a hard-coded list.

import { hasKickboard, isCornerType } from "./pcd-kickboard-utils";
import { materialLabelForType } from "./pcd-colour-library";
import {
  PROFILE_NAMES_BY_TYPE,
  PROFILE_TYPES,
  profileTypesForSelection,
  profileNamesForSelection,
  edgeProfilesForMaterial,
} from "./quote-form-data";
import { BENCHTOP_NOT_SUPPLIED, bodyIsTheProduct } from "./pcd-public-parts";

// What each board is actually used for, in a customer's words. Shown on the
// board cards themselves rather than after the choice, because the one moment a
// note cannot help is once you have already committed.
export const BOARD_NOTES = {
  "Decorative Board": "Most flat doors and panels are made in this. Timber grains and solid colours on a flat board, with no routed profile.",
  "Thermolaminate": "The one for profiled doors. The colour is wrapped over the shaped face, so it is the only board a profile can be routed into. Also fine left flat.",
  "Compact Laminate": "For wall cladding, table tops, outdoor kitchens and wet areas. Hard wearing and solid all the way through, with no profiles and no edge moulds.",
};

// ---- The parts ----
//
// `styleKey` is the jsonb column that part's board lives in. `panelKey` is what
// it is called in panel_options, where its reach and profile are kept.
// `reach` marks the panels for which "run to the floor" and "run to the ceiling"
// mean anything: a kickboard is already on the floor and a filler already
// reaches the ceiling.
export const PUBLIC_PARTS = [
  { key: "doors",     label: "Doors",              group: "Fronts", styleKey: "door_style",         panelKey: null,        profileable: true, build: "doorLayout",
    when: (i) => ["doors", "mixed"].includes(i.front_type) },
  { key: "drawers",   label: "Drawer fronts",      group: "Fronts", styleKey: "drawer_style",       panelKey: null,        profileable: true, build: "drawerLayout",
    when: (i) => ["drawers", "mixed"].includes(i.front_type) },
  { key: "end_left",  label: "Left end panel",     group: "Panels", styleKey: "end_left_style",     panelKey: "end_left",  profileable: true, reach: true,
    when: (i) => Boolean(i.end_panel_left) },
  { key: "end_right", label: "Right end panel",    group: "Panels", styleKey: "end_right_style",    panelKey: "end_right", profileable: true, reach: true,
    when: (i) => Boolean(i.end_panel_right) },
  { key: "back",      label: "Finished back panel",group: "Panels", styleKey: "back_panel_style",   panelKey: "back",      profileable: true, reach: true,
    when: (i) => Boolean(i.has_back_panel) },
  // A kickboard is a carcass-board part: it takes knocks from feet and vacuum
  // cleaners, so a wrapped thermolaminate face is the wrong thing down there,
  // and compact is an expensive way to make one.
  { key: "kickboard", label: "Kickboard",          group: "Panels", styleKey: "kickboard_style",    panelKey: "kickboard", profileable: true,
    boards: ["Decorative Board"],
    when: (i) => hasKickboard(i) },
  { key: "filler",    label: "Top filler panel",   group: "Panels", styleKey: "filler_panel_style", panelKey: "filler",    profileable: true,
    when: (i) => Boolean(i.has_filler_panel) },
  { key: "top",       label: "Top panel",          group: "Panels", styleKey: "top_panel_style",    panelKey: "top",       profileable: false,
    when: (i) => Boolean(i.has_top_panel) },
  { key: "underside", label: "Underside panel",    group: "Panels", styleKey: "bottom_panel_style", panelKey: "underside", profileable: false,
    when: (i) => Boolean(i.has_bottom_panel) },
  // Shelves keep their finish in their own columns rather than a style blob,
  // which is why they name no styleKey and are read and written by hand.
  // A shelf is a flat board with no shaped face, so thermolaminate buys
  // nothing on it.
  { key: "shelves",   label: "Shelves",            group: "Inside", styleKey: null,                 panelKey: null,        profileable: false, shelves: true, build: "shelfCount",
    boards: ["Decorative Board", "Compact Laminate"],
    when: (i) => Number(i.shelf_qty) > 0 || i.front_type === "none" },
  // The board a standalone panel, floating shelf or bookcase IS. Not a carcass:
  // the customer is buying this board, so it is theirs to choose.
  { key: "body",      label: "Board",              group: "Inside", styleKey: null,                 panelKey: null,        profileable: true, body: true,
    when: (i) => bodyIsTheProduct(i) },
  // Drawn only, but still shown in boards we would actually top a kitchen in.
  { key: "benchtop",  label: "Benchtop",           group: "Top",    styleKey: "benchtop_colour_style", panelKey: null,     profileable: false, benchtop: true, build: "waterfall",
    boards: ["Decorative Board", "Compact Laminate"],
    when: (i) => Boolean(i.has_benchtop) },
];

export const BUILD_LABELS = {
  doorLayout: "Doors and handles",
  drawerLayout: "Drawers and handles",
  shelfCount: "How many shelves",
  waterfall: "Waterfall ends",
  bays: "Bays",
};

const BY_KEY = new Map(PUBLIC_PARTS.map((p) => [p.key, p]));
export function publicPartDef(key) {
  return BY_KEY.get(key) || null;
}

// The parts this item actually has, in menu order. Drives the sidebar list, so
// there is never a part to configure that does not exist and never a part that
// exists with nowhere to configure it.
export function publicPartsFor(item) {
  if (!item) return [];
  return PUBLIC_PARTS.filter((p) => {
    try { return p.when(item); } catch { return false; }
  }).map((p) => ({ ...p, label: partLabel(p, item) }));
}

function partLabel(p, item) {
  if (p.key === "end_left" && isCornerType(item)) return "Wall 1 end panel";
  if (p.key === "end_right" && isCornerType(item)) return "Wall 2 end panel";
  if (p.key === "body") {
    if (item.item_type === "bookcase") return "Bookcase";
    if (item.item_type === "panel") return "Panel";
    return "Board";
  }
  return p.label;
}

// ---- Reading and writing a part's board ----
//
// Shelves and the standalone body keep their finish in plain columns; every
// other part keeps it in a style blob. One pair of functions so no caller has
// to remember which is which.
export function readPartBoard(item, key) {
  const def = publicPartDef(key);
  if (!def || !item) return {};
  if (def.shelves) {
    return {
      material: item.shelf_material || "",
      finish: item.shelf_finish || "",
      colour: item.shelf_colour || "",
      thickness_mm: Number(item.shelf_thickness_mm) || null,
      // A shelf is a board we buy, so it has a brand like every other board.
      // These two columns exist on the item and were being dropped on the way
      // through, which is why the brand step never appeared on a shelf.
      supplier: item.shelf_supplier_name || "",
      colour_library_id: item.shelf_colour_library_id || null,
    };
  }
  if (def.body) {
    return {
      material: item.material || "",
      finish: item.finish || "",
      colour: item.colour || "",
      thickness_mm: Number(item.panel_thickness_mm) || Number(item.carcass_thickness_mm) || null,
      supplier: item.supplier_name || "",
      colour_library_id: item.colour_library_id || null,
    };
  }
  return item[def.styleKey] || {};
}

export function writePartBoard(item, key, board) {
  const def = publicPartDef(key);
  if (!def) return {};
  if (def.shelves) {
    return {
      shelf_material: board.material || "",
      shelf_finish: board.finish || "",
      shelf_colour: board.colour || "",
      shelf_thickness_mm: board.thickness_mm || null,
      shelf_supplier_name: board.supplier || "",
      shelf_colour_library_id: board.colour_library_id || null,
    };
  }
  if (def.body) {
    return {
      material: board.material || "",
      finish: board.finish || "",
      colour: board.colour || "",
      supplier_name: board.supplier || "",
      colour_library_id: board.colour_library_id || null,
      ...(item?.item_type === "panel" ? { panel_thickness_mm: board.thickness_mm || null } : {}),
    };
  }
  return { [def.styleKey]: { ...(item?.[def.styleKey] || {}), ...board } };
}

// ---- What may be chosen ----

const norm = (v) => String(v || "").trim().toLowerCase();

/**
 * The brand behind a board, including one that never recorded it.
 *
 * Shelves and the standalone board kept a colour with no brand against them
 * until the brand step reached them, so an older design would otherwise open
 * with that step unanswered and everything after it locked, over an answer its
 * own colour already implies. Where the library knows that colour under exactly
 * one brand, that is the brand and nothing needs re-picking.
 *
 * Two brands selling a colour of the same name is the case we do have to ask
 * about, and it returns nothing so the step asks.
 */
export function supplierFromBoard(rows, board) {
  const saved = String(board?.supplier || "").trim();
  if (saved) return saved;
  const colour = norm(board?.colour);
  if (!colour) return "";
  const brands = [];
  (rows || []).forEach((row) => {
    if (norm(row.colour) !== colour) return;
    const brand = String(row.supplier || "").trim();
    if (brand && !brands.some((name) => norm(name) === norm(brand))) brands.push(brand);
  });
  return brands.length === 1 ? brands[0] : "";
}

// Distinct material labels the library actually stocks.
// Whether this part may be made from this board at all, before stock is even
// considered. Used by the board list AND by the copy tiles, so a rule cannot be
// enforced in one and walked around in the other.
export function partAllowsBoard(partKey, materialLabel) {
  const def = publicPartDef(partKey);
  if (!def || !def.boards) return true;
  return def.boards.some((b) => norm(b) === norm(materialLabel));
}

// Why a board is missing, said in the customer's terms rather than left as an
// absence they have to work out for themselves.
export function boardsNotOffered(partKey) {
  const def = publicPartDef(partKey);
  if (!def || !def.boards) return "";
  if (partKey === "kickboard") return "A kickboard is always carcass board. It takes knocks from feet and vacuum cleaners, so a wrapped face is the wrong thing down there.";
  if (partKey === "shelves") return "A shelf is a flat board with no shaped face, so thermolaminate is not offered here.";
  if (partKey === "benchtop") return "Thermolaminate is not a benchtop material, so it is not offered here even on the drawing.";
  return "";
}

export function boardsInStock(rows) {
  const seen = new Map();
  for (const r of rows || []) {
    const label = r.materialLabel || materialLabelForType(r.material);
    if (label && !seen.has(label)) seen.set(label, label);
  }
  return [...seen.values()];
}

/**
 * The thicknesses we stock this board in, for one brand if one is given.
 *
 * The brand is chosen before the thickness, so its own list is the right one.
 * Offering a Laminex part 21mm would be the same wrong turn the order was
 * changed to prevent, one step later.
 */
export function thicknessesInStock(rows, materialLabel, brand = "") {
  const wantedBrand = String(brand || "").trim().toLowerCase();
  const out = [];
  for (const r of rows || []) {
    const label = r.materialLabel || materialLabelForType(r.material);
    if (norm(label) !== norm(materialLabel)) continue;
    if (wantedBrand && String(r.supplier || "").trim().toLowerCase() !== wantedBrand) continue;
    const mm = Number(r.thicknessMm) || parseInt(r.thickness, 10) || 0;
    if (mm && !out.includes(mm)) out.push(mm);
  }
  return out.sort((a, b) => a - b);
}

export function coloursInStock(rows, materialLabel, thicknessMm) {
  return (rows || []).filter((r) => {
    const label = r.materialLabel || materialLabelForType(r.material);
    if (norm(label) !== norm(materialLabel)) return false;
    if (!thicknessMm) return true;
    return (Number(r.thicknessMm) || parseInt(r.thickness, 10) || 0) === Number(thicknessMm);
  });
}

// Profiles are a Thermolaminate-only option, and some shapes are 21mm only.
// Both rules come from quote-form-data, and are then intersected with what the
// library actually stocks, so a shape with no board behind it is never offered.
/**
 * The brands that stock this board at this thickness.
 *
 * From the colour rows themselves rather than a list in code, so a brand
 * appears the moment its first colour does and Formica needs no change here.
 */
/**
 * The brands that stock this board.
 *
 * Deliberately NOT narrowed by thickness: the brand is chosen first and the
 * thickness list is built from it. Narrowing both by each other would leave
 * the two waiting on one another, and it is the reason the brand moved ahead
 * of the thickness in the first place.
 */
export function brandsInStock(rows, materialLabel) {
  const found = [];
  coloursInStock(rows, materialLabel, null).forEach((row) => {
    const supplier = String(row.supplier || "").trim();
    if (supplier && !found.some((name) => name.toLowerCase() === supplier.toLowerCase())) found.push(supplier);
  });
  return found.sort((a, b) => a.localeCompare(b));
}

/** The colours in stock for one brand. Empty is a real answer. */
export function coloursInStockForBrand(rows, materialLabel, thicknessMm, brand) {
  const wanted = String(brand || "").trim().toLowerCase();
  const all = coloursInStock(rows, materialLabel, thicknessMm);
  if (!wanted) return all;
  return all.filter((row) => String(row.supplier || "").trim().toLowerCase() === wanted);
}

export function profileTypesInStock(rows, materialLabel, thicknessMm) {
  const thicknessLabel = thicknessMm ? `${thicknessMm}mm` : "";
  return profileTypesForSelection(materialLabel, thicknessLabel)
    .filter((type) => profileNamesInStock(rows, type, materialLabel, thicknessMm).length > 0);
}

export function profileNamesInStock(rows, type, materialLabel, thicknessMm) {
  const thicknessLabel = thicknessMm ? `${thicknessMm}mm` : "";
  const names = profileNamesForSelection(type, materialLabel, thicknessLabel);
  if (!names.length) return [];
  // The shape only exists if there is a board of this material and thickness to
  // route it into.
  return coloursInStock(rows, materialLabel, thicknessMm).length ? names : [];
}

// Whether a shape needs 21mm board, worked out by asking the real rule rather
// than restating its list: it is offered at 21mm and refused at 18mm.
export function profileNeeds21(type, name) {
  const at18 = profileNamesForSelection(type, "Thermolaminate", "18mm");
  const at21 = profileNamesForSelection(type, "Thermolaminate", "21mm");
  return at21.includes(name) && !at18.includes(name);
}

export function edgesFor(materialLabel) {
  return edgeProfilesForMaterial(materialLabel) || [];
}

export function canProfile(item, key, materialLabel) {
  const def = publicPartDef(key);
  if (!def || !def.profileable) return false;
  return norm(materialLabel) === "thermolaminate";
}

// ---- The areas of one part, in the order they must be answered ----
//
// Each area names what it depends on, so a colour can never be chosen before
// the board it has to exist in. That is what makes an impossible combination
// unreachable rather than something caught later on save.
// Where a part keeps its profile: a panel in panel_options, a front on its own
// style. One reader so the area logic does not have to know which.
function profileOf(item, def) {
  if (!def?.panelKey) return "";
  const opts = item?.panel_options;
  const o = opts && typeof opts === "object" ? opts[def.panelKey] : null;
  return (o && (o.profile_type || o.profile)) || "";
}

export function areasForPart(item, key, rows) {
  const def = publicPartDef(key);
  if (!def) return [];
  const board = readPartBoard(item, key);
  const materialLabel = board.material ? materialLabelForType(board.material) : "";
  const thicknessMm = Number(board.thickness_mm) || null;
  const areas = [];

  // Copying another part comes first: it is the one click that finishes this
  // one outright, so it belongs at the top of the menu rather than buried
  // inside the last step.
  areas.push({ id: "copy", label: "Same as another part", group: "Start here" });

  // How many doors, which side they hinge, the bay split and the waterfall ends
  // stay in the sidebar: they are segmented pickers and toggles rather than long
  // lists, and the bay editor in particular is intricate enough that having one
  // copy of it matters more than which panel it sits in. BUILD_LABELS names them
  // so the sidebar and any future move agree on what each one is called.
  if (def.reach) areas.push({ id: "reach", label: "How far this panel runs", group: "This part" });
  if (def.benchtop) areas.push({ id: "benchtop_note", label: "About benchtops", group: "This part", note: BENCHTOP_NOT_SUPPLIED });

  areas.push({ id: "board", label: "Board", group: "Its board" });
  // WHICH PARTS ARE ASKED FOR A BRAND: every board we actually supply.
  //
  // Shelves and the standalone board were left out of this, because their board
  // lives in flat columns rather than a style blob and those columns had no
  // supplier field to save a brand into. They do now, and readPartBoard carries
  // it, so the reason is gone: a shelf is a board we buy, it comes off one
  // brand's range at that brand's price, and its colour list should be that
  // brand's list like every other part's.
  //
  // A benchtop is drawn but not something we make, so it still goes straight
  // from thickness to colour.
  const asksBrand = !def.benchtop;
  if (asksBrand) areas.push({ id: "brand", label: "Brand", group: "Its board", needs: "board" });
  // The thickness is the brand's thickness, so it waits on the brand wherever
  // there is one to wait for.
  areas.push({ id: "thickness", label: "Thickness", group: "Its board", needs: asksBrand ? "brand" : "board" });
  const afterBrand = "thickness";
  if (def.profileable) areas.push({ id: "profile", label: "Profile", group: "Its board", needs: afterBrand });
  if (!def.benchtop) areas.push({ id: "edge", label: "Edge", group: "Its board", needs: def.profileable ? "profile" : afterBrand });
  // THE COLOUR WAITS ON THE LAST REQUIRED STEP, NOT ON THE EDGE.
  //
  // An edge is optional: leave it and the board gets our standard tape or mould,
  // which is why it always reads as answered. That made it useless as a gate, so
  // the colour was never locked at all and could be opened before a board was
  // even chosen, on an empty grid headed "Showing  mm only".
  //
  // A shape is not optional on thermolaminate, and it can force 21mm and clear
  // the colour underneath it, so it stays ahead of the colour wherever the part
  // can take one.
  areas.push({
    id: "colour",
    label: "Colour",
    group: "Its board",
    needs: def.profileable && !def.benchtop ? "profile" : "thickness",
  });

  // Values, so the menu doubles as the summary.
  const has = {
    copy: true,
    reach: true,
    benchtop_note: true,
    doorLayout: true,
    drawerLayout: true,
    shelfCount: true,
    waterfall: true,
    bays: true,
    board: Boolean(materialLabel),
    thickness: Boolean(thicknessMm),
    brand: Boolean(supplierFromBoard(rows, board)),
    // Thermolaminate is always profiled — the colour is wrapped over a shaped
    // face, so a flat one is a different board rather than a different option
    // here. A part on that board is therefore not finished until a shape is
    // chosen, and the edge and colour after it stay locked until it is.
    profile: !canProfile(item, key, materialLabel) || Boolean(board.profile_type || board.profile || profileOf(item, def)),
    edge: true,
    colour: Boolean(board.colour),
  };
  // WHAT IS LOCKED, worked out here rather than by whoever renders this.
  //
  // An area is locked while ANYTHING it waits on is still to answer, walked the
  // whole way back rather than one step. One step was not enough: a flat board
  // reads its profile step as answered, because there is nothing to route into
  // it, so a colour that waits on the profile came unlocked before a board had
  // been chosen at all and opened an empty grid headed "Showing  mm only".
  //
  // Every area names one earlier in the list, so a single forward pass carries
  // the lock down the chain.
  //
  // blockedBy is the first step back up that chain that is genuinely
  // unanswered, so a screen can say what to do about it. Naming the immediate
  // one is no help when that step is only waiting on something itself.
  const byId = {};
  return areas.map((a) => {
    const dep = a.needs ? byId[a.needs] : null;
    let blocker = dep;
    while (blocker && blocker.answered) blocker = blocker.needs ? byId[blocker.needs] : null;
    const next = {
      ...a,
      answered: Boolean(has[a.id]),
      locked: Boolean(dep && (dep.locked || !dep.answered)),
      blockedBy: blocker ? blocker.label : "",
      materialLabel,
      thicknessMm,
    };
    byId[a.id] = next;
    return next;
  });
}

// A part is ready to quote once it names a board, a thickness and a colour.
export function partIsComplete(item, key) {
  const b = readPartBoard(item, key);
  return Boolean(b.material && b.colour && (b.thickness_mm || publicPartDef(key)?.benchtop));
}

// ---- Parts already configured in this design ----
//
// A cabinet's doors and its drawer fronts are usually the same board, the same
// thickness, the same profile, the same edge and the same colour. Configuring
// the second one should be a single click on the first, not five steps that
// arrive at the same answer.
//
// So a tile here is a WHOLE part spec, and picking one copies all of it. It is
// deliberately not a colour shortcut: a colour on its own leaves the profile
// and the edge still to set, which is most of the work.
export function partSpecsInUse(items, rows, { excludeItemId = null, excludePartKey = null } = {}) {
  const norm2 = (v) => String(v || "").trim().toLowerCase();
  const bySpec = new Map();

  for (const item of items || []) {
    for (const part of publicPartsFor(item)) {
      if (item.id && item.id === excludeItemId && part.key === excludePartKey) continue;
      const board = readPartBoard(item, part.key);
      if (!board || !board.colour || !board.material) continue;

      const def = publicPartDef(part.key);
      const prof = partProfileOf(item, def, board);
      const spec = {
        material: board.material,
        materialLabel: materialLabelForType(board.material),
        thicknessMm: Number(board.thickness_mm) || null,
        finish: board.finish || "",
        colour: board.colour,
        supplier: board.supplier || "",
        colour_library_id: board.colour_library_id || null,
        profile_type: prof.profile_type,
        profile: prof.profile,
        edge_mould: board.edge_mould || "",
      };
      // Keyed on the ENTIRE spec, so two parts that differ only in their edge
      // stay two tiles — copying one when you wanted the other is exactly the
      // mistake this is meant to prevent.
      const key = [spec.materialLabel, spec.thicknessMm || "", spec.finish, spec.colour, spec.profile_type, spec.profile, spec.edge_mould]
        .map(norm2).join("|");

      const held = bySpec.get(key) || { ...spec, usedOn: [] };
      const where = [item.label || itemLabelFor(item), part.label].filter(Boolean).join(" · ");
      if (where && !held.usedOn.includes(where)) held.usedOn.push(where);
      bySpec.set(key, held);
    }
  }

  // The swatch image and the brand come from the library row this spec names.
  return [...bySpec.values()].map((u) => {
    const row = (rows || []).find((r) =>
      norm2(r.materialLabel || materialLabelForType(r.material)) === norm2(u.materialLabel) &&
      norm2(r.finish) === norm2(u.finish) &&
      norm2(r.colour) === norm2(u.colour) &&
      (!u.thicknessMm || (Number(r.thicknessMm) || parseInt(r.thickness, 10) || 0) === u.thicknessMm)
    );
    return { ...u, src: row?.src || "", supplier: u.supplier || row?.supplier || "", colour_library_id: u.colour_library_id || row?.id || null };
  }).sort((a, b) => String(a.colour).localeCompare(String(b.colour)));
}

// A part's profile lives in panel_options for a panel and on the style blob for
// a front, so one reader rather than every caller knowing which.
function partProfileOf(item, def, board) {
  if (def?.panelKey) {
    const opts = item?.panel_options;
    const o = opts && typeof opts === "object" ? opts[def.panelKey] : null;
    return { profile_type: o?.profile_type || "", profile: o?.profile || "" };
  }
  return { profile_type: board?.profile_type || "", profile: board?.profile || "" };
}

// A readable name for an item that has none of its own, so "used on" reads as
// a place rather than a row id.
function itemLabelFor(item) {
  return {
    base_cabinet: "Base cabinet",
    wall_cabinet: "Wall cabinet",
    tall_cabinet: "Tall cabinet",
    corner_base_cabinet: "Corner base",
    corner_tall_cabinet: "Corner tall",
    blind_corner_cabinet: "Blind corner",
    bookcase: "Bookcase",
    panel: "Panel",
    floating_shelf: "Floating shelf",
    shelf_rail: "Shelf & rail",
  }[item?.item_type] || "Cabinet";
}
