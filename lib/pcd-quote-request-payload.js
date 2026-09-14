// WHAT GOES TO /api/quote-requests, WRITTEN DOWN ONCE.
//
// The builder used to hold this inline, which was fine while the builder was
// also the thing that sent it. Sending moved to /request-quote/send, so either
// this moved with it or there were two answers to "what do we send", and the
// one that got fixed would not be the one that ran.
//
// ── ONLY SENT WHERE IT WAS ASKED ─────────────────────────────────────────────
//
// A banding answer on a wrapped front, or a hinge boring on a line that is not
// drilled, is an answer to a question we never put. It reaches the workshop as
// an instruction anyway, which is how a door with no holes in it ends up on a
// sheet with hinge positions on it. So each of those is gated on the thing that
// made it a real question, not merely on somebody having typed it once before
// changing their mind.

import { evenMiddles, hingeCount } from "./pcd-hinges";

const text = (value) => String(value ?? "").trim();

function numberOrUndefined(raw) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Where the cups between the two ends go.
 *
 * What was typed wins, but only once somebody actually typed it: until then the
 * evenly spaced positions shown in the form are what we send, so the workshop
 * gets the same door the customer was looking at.
 */
export function hingeMiddlesFor(item = {}) {
  if (item.hingeMiddlesTouched && Array.isArray(item.hingeMiddlesMm) && item.hingeMiddlesMm.length) {
    return item.hingeMiddlesMm.map((mm) => Number(mm) || 0).filter((mm) => mm > 0);
  }
  return evenMiddles({
    height: item.height,
    count: hingeCount(item.hingeQty),
    fromBottom: item.hingeFromBottomMm,
    fromTop: item.hingeFromTopMm,
  });
}

/** Is there enough on this row to be worth sending at all? */
export function hasLineValue(item = {}) {
  return Boolean(
    item.type ||
      item.material ||
      item.thickness ||
      item.width ||
      item.height ||
      item.colour ||
      item.edgeMould ||
      item.profile
  );
}

/**
 * One builder row, as the endpoint wants it.
 *
 * Every field goes across as its own field. The finish used to be glued onto
 * the front of the colour here ("Matt - Classic White"), which put the finish
 * in the colour column all the way through to the quote editor, where the
 * colour picker could then not match it back to a library row: the line arrived
 * unpriced and unselectable. The finish already has its own key; it never
 * needed repeating inside the colour.
 *
 * colourLibraryId and supplierName come from the row the customer actually
 * clicked, so the back end can price the line exactly rather than matching on a
 * name two suppliers might share.
 */
export function quoteRequestLine(item = {}) {
  const drilled = item.type === "Door" && Boolean(item.preDrill);

  return {
    productType: item.type,
    // The hardware name, so the line reads as what they picked rather than the
    // word "Hardware", which is what it said before and what somebody then had
    // to email and ask about.
    productName: item.hardwareName || item.type || "Cabinetry item",
    hardwareCatalogueId: item.hardwareId || undefined,
    material: item.material,
    thickness: item.thickness,
    finish: item.finish,
    colour: item.colour,
    colourLibraryId: item.colourLibraryId || undefined,
    supplierName: item.supplierName || undefined,
    profileType: item.profileType,
    profile: item.profile,
    edgeMould: item.edgeMould,
    width: numberOrUndefined(item.width),
    height: numberOrUndefined(item.height),
    qty: numberOrUndefined(item.qty) || 1,
    // Which kind of panel, so a scribe arrives as a scribe rather than as one
    // of six things all reading "Panel".
    panelUse: item.panelUse || "",
    // Undefined rather than an empty array when nobody was asked. "Not asked"
    // and "none of the four" are different instructions and only one of them is
    // an instruction.
    bandedEdges: Array.isArray(item.bandedEdges) ? item.bandedEdges : undefined,
    holeType: drilled ? item.holeType || "" : "",
    hingeHoles: drilled,
    // Supplying hinges is deliberately not asked. We drill for them and do not
    // supply them, and a quote line cannot carry it either: hinge_supply is
    // forced to false and its cost to zero on every write path. Asking a
    // customer for something no part of the system can act on only sets an
    // expectation nobody meant to set.
    hingeQty: drilled ? item.hingeQty : "",
    // An untick that left a measurement behind would put hinge positions on a
    // workshop sheet for a door that has no holes in it.
    hingeSide: drilled ? item.hingeSide : "",
    hingeFromBottomMm: drilled ? item.hingeFromBottomMm : "",
    hingeFromTopMm: drilled ? item.hingeFromTopMm : "",
    hingeMiddlesMm: drilled ? hingeMiddlesFor(item) : [],
    cabinetBrand: item.cabinetBrand || "",
    notes: item.note || "",
  };
}

/**
 * The whole request.
 *
 * `details` is who they are, from the send page. The lines are the builder's
 * rows, filtered to the ones with anything on them: a blank starter row is not
 * an item somebody asked us to price.
 */
export function quoteRequestPayload({ items = [], details = {} } = {}) {
  return {
    source: "request_quote",
    customerName: [text(details.firstName), text(details.lastName)].filter(Boolean).join(" "),
    customerEmail: text(details.email),
    customerPhone: text(details.phone),
    deliverySuburb: text(details.suburb),
    cabinetBrand: text(details.cabinetBrand),
    notes: text(details.notes),
    lines: items.filter(hasLineValue).map(quoteRequestLine),
  };
}

/**
 * What is stopping this being sent.
 *
 * Returned rather than thrown, and named per field, because "please check the
 * form" is not something anybody can act on.
 */
export function detailProblems(details = {}) {
  const problems = {};
  if (!text(details.firstName)) problems.firstName = "Please enter your first name.";
  if (!text(details.email)) problems.email = "Please enter your email address.";
  if (!text(details.phone)) problems.phone = "Please enter your phone number.";
  return problems;
}
