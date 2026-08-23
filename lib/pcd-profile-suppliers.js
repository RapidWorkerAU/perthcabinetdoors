// WHO MAKES A DOOR PROFILE, AND WHO MAKES AN EDGE.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// Colours already carry their brand: the colour library records Polytec or
// Laminex against every one, and the finishes page filters on it. Door profiles
// and edge profiles carried nothing, because until now they were all Polytec and
// nothing needed saying.
//
// Laminex has its own door profiles, and the two ranges cannot be mixed: a
// Laminex colour cannot be pressed onto a Polytec profile, or the other way
// round. A profile with no maker recorded is a profile somebody can pair with
// the wrong colour, and the first anybody would know is when the door arrives.
//
// So every profile and every edge now says who makes it. Everything that existed
// before this file is Polytec, which is a statement of fact rather than a
// default: those are the ranges we have been selling.
//
// ── WHERE THE TWO RANGES LIVE ────────────────────────────────────────────────
//
// Polytec profiles are the hardcoded lists in lib/quote-form-data.js, which is
// also what the quote form offers for selection.
//
// Laminex profiles are in lib/pcd-laminex-profiles.js, deliberately NOT in the
// quote form lists. They are on the finishes page for customers to look at, and
// they must not appear in the quote form until the pairing rule below is wired
// into it, or somebody could pick a Laminex profile for a Polytec colour with
// nothing stopping them.

import { LAMINEX_NAMES_BY_GROUP } from "./pcd-laminex-profiles";
import { PROFILE_NAMES_BY_TYPE } from "./quote-form-data";

// Every Polytec profile name, for the clash check in profileSupplier below.
const POLYTEC_PROFILE_NAMES = new Set(Object.values(PROFILE_NAMES_BY_TYPE).flat());

export const PROFILE_SUPPLIERS = ["Polytec", "Laminex"];

/** The one everything that predates this file belongs to. */
export const DEFAULT_PROFILE_SUPPLIER = "Polytec";

/**
 * Laminex door profiles, by group, read from the range itself so the two can
 * never disagree about what Laminex makes.
 */
export const LAMINEX_PROFILE_NAMES_BY_TYPE = LAMINEX_NAMES_BY_GROUP;

/**
 * Laminex edge profiles.
 *
 * Empty because Laminex does not make any. That is a fact about the range, not
 * a gap waiting to be filled, so every edge profile is and stays Polytec.
 */
export const LAMINEX_EDGE_PROFILES = [];

/**
 * Who makes this door profile.
 *
 * Anything not explicitly Laminex is Polytec, because Polytec is what the
 * catalogue was before Laminex existed in it. That is safe in the one direction
 * that matters: a name we have never heard of resolves to the range we actually
 * stock rather than to one we may not.
 */
export function profileSupplier(profileName, group = null) {
  const name = String(profileName || "").trim();
  if (!name) return null;

  // When the group is known, it answers outright. The finishes page has it,
  // because each tile carries the range it came from.
  if (group) {
    return Object.prototype.hasOwnProperty.call(LAMINEX_PROFILE_NAMES_BY_TYPE, group)
      ? "Laminex"
      : DEFAULT_PROFILE_SUPPLIER;
  }

  // POLYTEC IS CHECKED FIRST, AND THAT ORDER IS THE POINT.
  //
  // "Country Square" is a real profile in BOTH ranges. Asked by name alone there
  // is no way to tell them apart, so the answer has to be the one that is right
  // about the data we hold: every profile ever recorded on a quote, an order or
  // a design is Polytec, because Laminex has never been offered in the quote
  // form. Answering "Laminex" would make the pairing rule refuse a Polytec
  // colour on a Polytec door.
  //
  // Pass the group when you have it and this ambiguity does not arise.
  if (POLYTEC_PROFILE_NAMES.has(name)) return DEFAULT_PROFILE_SUPPLIER;

  const laminex = Object.values(LAMINEX_PROFILE_NAMES_BY_TYPE).flat();
  return laminex.includes(name) ? "Laminex" : DEFAULT_PROFILE_SUPPLIER;
}

/** Who makes this edge profile. Same rule. */
export function edgeSupplier(edgeName) {
  const name = String(edgeName || "").trim();
  if (!name) return null;
  return LAMINEX_EDGE_PROFILES.includes(name) ? "Laminex" : DEFAULT_PROFILE_SUPPLIER;
}

/**
 * Can this colour be pressed onto this profile?
 *
 * The rule the whole file exists for. A Laminex colour cannot go on a Polytec
 * profile and a Polytec colour cannot go on a Laminex one.
 *
 * Returns true when either side is UNKNOWN. That is deliberate: a colour with no
 * brand recorded, or a line being filled in halfway, must not be declared a
 * mismatch. This says "these two are definitely wrong together", never "these
 * two are definitely right", and the difference matters because a false refusal
 * stops somebody doing work they are entitled to do.
 */
export function profileMatchesColour(profileName, colourSupplier) {
  const profileBrand = profileSupplier(profileName);
  const colourBrand = String(colourSupplier || "").trim();
  if (!profileBrand || !colourBrand) return true;
  return profileBrand.toLowerCase() === colourBrand.toLowerCase();
}

/** The same question for an edge. */
export function edgeMatchesColour(edgeName, colourSupplier) {
  const edgeBrand = edgeSupplier(edgeName);
  const colourBrand = String(colourSupplier || "").trim();
  if (!edgeBrand || !colourBrand) return true;
  return edgeBrand.toLowerCase() === colourBrand.toLowerCase();
}

/**
 * What to say when they do not match.
 *
 * Named brands rather than "invalid selection", because the person reading it
 * needs to know which of the two to change.
 */
export function mismatchMessage(profileName, colourSupplier, kind = "profile") {
  const brand = profileSupplier(profileName);
  return (
    `${brand} ${kind}s cannot be used with ${String(colourSupplier || "").trim()} colours. ` +
    `Choose a ${String(colourSupplier || "").trim()} ${kind}, or change the colour.`
  );
}
