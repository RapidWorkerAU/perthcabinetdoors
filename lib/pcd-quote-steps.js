// WHAT A LINE IS ASKED, AND IN WHAT ORDER.
//
// ── THE PROBLEM ──────────────────────────────────────────────────────────────
//
// Which questions a line gets is not one rule, it is six, and they were spread
// across six modules with no one place that put them together:
//
//   what kind of thing it is        lib/pcd-product-fields.js
//   which boards it can be made of  lib/pcd-materials.js
//   what thicknesses that board has lib/quote-form-data.js
//   which edge mould it can take    lib/quote-form-data.js
//   whether it has a routed face    lib/quote-form-data.js
//   which panel use it is           lib/pcd-line-details.js
//
// So every screen that asked a customer or a member of staff to describe a line
// re-derived the chain by hand, and they drifted. The public form asked for an
// edge mould on compact laminate, which takes none. It asked about hinges on a
// scribe, which is never drilled. It never asked which kind of panel at all.
//
// ── WHAT THIS IS ─────────────────────────────────────────────────────────────
//
// One function that answers "what do I ask about THIS line, right now" and one
// that answers "they just changed this, what is no longer valid". Nothing here
// invents a rule: every one is imported from the module that already owns it,
// so a change there reaches every screen through here.
//
// Pure and synchronous, so it can be tested without a browser and used by the
// public form, the admin editor and the order form import alike.

import { fieldsForProductType, productTypeChoices } from "./pcd-product-fields";
import { PRODUCT_TYPES, materialsForProductType } from "./pcd-materials";
import {
  edgeProfilesForMaterial,
  profileNamesForSelection,
  profileTypesForSelection,
  thicknessOptionsForMaterial,
} from "./quote-form-data";
import { PANEL_USES, PANEL_PRODUCT_TYPE, itemTypeFromValue, itemTypeValue } from "./pcd-line-details";

const text = (value) => String(value ?? "").trim();

/* ── WHAT A CUSTOMER MAY SAY THEY WANT ─────────────────────────────────────
 *
 * The product types a customer is offered, with the panel uses sitting under
 * Panel the way the admin picker does it. A panel use is NOT a product type: a
 * scribe is a Panel that says it is a scribe, and picking one sets both fields.
 *
 * Built from productTypeChoices so a type marked internal, like Laminate, is
 * absent here for the same reason it is absent from the request form today.
 */
/* What each kind of panel is, in the words somebody choosing one would use.
   The type cards already show a line under the name and a panel use without one
   would read as an afterthought beside the five that have it. */
const PANEL_USE_BLURBS = {
  "End panel": "Closes the end of a run of cabinets.",
  "Filler": "Fills the gap between a cabinet and a wall.",
  "Scribe": "A thin strip scribed to an uneven wall.",
  "Kickboard": "The board across the bottom, under the doors.",
  "Shelf": "A shelf cut to fit inside a cabinet.",
  "Back panel": "A finished back, for a cabinet you see behind.",
};

export function quoteItemTypes() {
  const out = [];
  for (const choice of productTypeChoices(PRODUCT_TYPES)) {
    out.push({
      value: choice.value,
      label: choice.label,
      blurb: choice.blurb || "",
      productType: choice.value,
      panelUse: "",
    });
    if (choice.value !== PANEL_PRODUCT_TYPE) continue;
    for (const use of PANEL_USES) {
      out.push({
        value: itemTypeValue({ product_type: PANEL_PRODUCT_TYPE, panel_use: use }),
        label: use,
        blurb: PANEL_USE_BLURBS[use] || "A panel, cut to your sizes.",
        productType: PANEL_PRODUCT_TYPE,
        panelUse: use,
      });
    }
  }
  return out;
}

/* ── THE CHAIN ─────────────────────────────────────────────────────────────
 *
 * Every question, in the order it is asked, with the options it has at this
 * moment. A step is only here if it has something to offer: a compact laminate
 * panel gets no edge step at all rather than an empty one, because an empty
 * dropdown is a question somebody tries to answer and cannot.
 */
export const STEP_KEYS = [
  "itemType",
  "cabinetBrand",
  "hardwareType",
  "material",
  "supplier",
  "thickness",
  "colour",
  "frontProfile",
  "edgeMould",
  "size",
  "bandedEdges",
  "hinges",
  "qty",
  "notes",
];

export function stepsForLine(line = {}) {
  const productType = text(line.productType) || "Door";
  const fields = fieldsForProductType(productType);
  const material = text(line.material);
  const thickness = text(line.thickness);
  const steps = [];
  const add = (key, label, options) => steps.push({ key, label, options: options || null });

  add("itemType", "What is it");

  // WHOSE CABINET. Asked of everything and required by nothing. It decides
  // none of the questions under it, which is exactly why it can sit this high:
  // it is the one thing somebody already knows before they know anything else,
  // and it is per line, because a kitchen is routinely Metod fronts with a
  // custom panel closing the end of a run.
  add("cabinetBrand", "Which cabinet is it for");

  // Hardware is bought, not cut. No board, no size, no finish, no edge.
  if (fields.hardware) {
    add("hardwareType", "Which kind");
    add("qty", "How many");
    add("notes", "Anything we should know");
    return steps;
  }

  if (fields.board) {
    const materials = materialsForProductType(productType);
    add("material", "Material", materials);
    // BRAND SITS MID CHAIN, between the board and its thickness, because it
    // narrows both what follows it. The thickness rules run in OPPOSITE
    // directions between the ranges and the colours are not shared, so an
    // unfiltered list is how a Laminex colour ends up beside a Polytec profile.
    add("supplier", "Brand");
    add("thickness", "Thickness", thicknessOptionsForMaterial(material));
    add("colour", "Colour and finish");
  }

  // A ROUTED FRONT IS A THERMOLAMINATE THING AND ONLY A THERMOLAMINATE THING.
  // It is a vinyl skin pressed over a routed face; there is nothing to press
  // onto a decorative board.
  const profileTypes = fields.profile ? profileTypesForSelection(material, thickness) : [];
  if (profileTypes.length) add("frontProfile", "Front profile", profileTypes);

  // Compact laminate takes no mould at all, so the step is not there to answer.
  const moulds = fields.edge ? edgeProfilesForMaterial(material) : [];
  if (moulds.length) add("edgeMould", "Edge profile", moulds);

  if (fields.size) add("size", "Size");

  // BANDING IS A DECORATIVE BOARD QUESTION AND ONLY A DECORATIVE BOARD ONE.
  // A thermolaminate front is wrapped round its edges and a compact laminate
  // panel is solid through the thickness. Neither is taped.
  //
  // After the size, because the drawing beside these questions can only show
  // which edges are banded once it knows what shape it is drawing.
  if (fields.edge && isBanded(material)) add("bandedEdges", "Which edges are banded");

  // ONLY A DOOR IS DRILLED. A drawer front, a panel, a filler, a scribe, a
  // kickboard, a shelf, a back panel and a table top are never asked.
  if (fields.hinges) add("hinges", "Hinges");

  add("qty", "How many");
  add("notes", "Anything we should know");
  return steps;
}

/** Is this board taped, or is it wrapped or solid through? */
export function isBanded(material) {
  return text(material).toLowerCase() === "decorative board";
}

/** Is this one question asked of this line at all? */
export function asksFor(line, key) {
  return stepsForLine(line).some((step) => step.key === key);
}

/* ── NARROWING ─────────────────────────────────────────────────────────────
 *
 * They changed one answer. Everything hanging off it has to be re-checked, or
 * the line ends up holding an EM6 Roman against a compact laminate panel, which
 * nothing downstream can make.
 *
 * An answer that is still valid is KEPT. Resetting a field somebody filled in,
 * when it is still a legal answer, throws away their work for nothing.
 */
export function narrowLine(line = {}) {
  const next = { ...line };
  next.productType = text(next.productType) || "Door";
  const fields = fieldsForProductType(next.productType);

  // A panel use only means anything on a Panel.
  if (next.productType !== PANEL_PRODUCT_TYPE) next.panelUse = "";

  if (!fields.board) {
    // Hardware carries none of the board answers, so it holds none of them.
    return {
      ...next,
      material: "", thickness: "", finish: "", colour: "", colourLibraryId: null, supplierName: "",
      profileType: "", profile: "", edgeMould: "", bandedEdges: null,
      hingeHoles: false, holeType: "", width: null, height: null,
    };
  }
  next.hardwareType = "";

  // The board has to be one this kind of thing can be made from.
  const materials = materialsForProductType(next.productType);
  if (materials.length && !materials.includes(next.material)) next.material = materials[0];

  // The thickness has to be one that board comes in.
  const thicknesses = thicknessOptionsForMaterial(next.material);
  if (thicknesses.length && !thicknesses.includes(next.thickness)) next.thickness = thicknesses[0];

  // The routed face.
  const profileTypes = fields.profile ? profileTypesForSelection(next.material, next.thickness) : [];
  if (!profileTypes.length) {
    next.profileType = "";
    next.profile = "";
  } else {
    if (!profileTypes.includes(next.profileType)) next.profileType = profileTypes[0];
    const names = profileNamesForSelection(next.profileType, next.material, next.thickness);
    if (!names.includes(next.profile)) next.profile = names[0] || "";
  }

  // The edge mould.
  const moulds = fields.edge ? edgeProfilesForMaterial(next.material) : [];
  next.edgeMould = moulds.includes(next.edgeMould) ? next.edgeMould : (moulds[0] || "");

  // The tape. Null rather than an empty list: nobody was asked is not the same
  // as none of the four, and only one of them is an instruction.
  if (!fields.edge || !isBanded(next.material)) next.bandedEdges = null;

  // The boring.
  if (!fields.hinges) {
    next.hingeHoles = false;
    next.holeType = "";
    next.hingeSide = "";
  }
  if (!next.hingeHoles) next.holeType = "";

  if (!fields.size) { next.width = null; next.height = null; }

  return next;
}

/**
 * Apply one answer and re-narrow. The only way a screen should change a line,
 * so no caller can set a field and forget what hangs off it.
 */
export function answerLine(line, key, value) {
  const next = { ...line };
  if (key === "itemType") {
    const picked = itemTypeFromValue(value);
    next.productType = picked.product_type;
    next.panelUse = picked.panel_use;
  } else {
    next[key] = value;
  }
  return narrowLine(next);
}

