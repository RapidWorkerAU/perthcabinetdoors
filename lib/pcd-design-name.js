// WHAT A DESIGN IS CALLED.
//
// ── THE PROBLEM THIS FIXES ───────────────────────────────────────────────────
//
// Every design made in the public planner was created with the name "My
// design", because the planner never asked and the route had to write
// something. In the admin list they were therefore all called the same thing,
// and telling one from another meant opening each in turn.
//
// So the planner asks first, before anything is drawn, and the row is not
// created until there is a name to create it with.
//
// ── NOT PRE-FILLED ───────────────────────────────────────────────────────────
//
// The field starts empty, with a placeholder that goes the moment the field is
// clicked into. A pre-filled suggestion would be accepted by most people
// without reading it, and we would be back to every design sharing one name
// with extra steps.
//
// ── THE FALLBACK SAYS IT IS A FALLBACK ───────────────────────────────────────
//
// If a name ever fails to arrive the row is called "Untitled design", not "My
// design". The first tells whoever opens the admin list that nobody named it;
// the second looks like somebody's answer.

/** Long enough for a street address, short enough for a list column. */
export const DESIGN_NAME_MAX = 80;

/** Two characters, so a stray keystroke does not count as naming something. */
export const DESIGN_NAME_MIN = 2;

// A specific example rather than "My kitchen": the whole point is telling one
// design from another, and the placeholder is the only chance to say so without
// writing a paragraph. It disappears the moment the field is clicked into, so
// nobody ever has to delete it.
export const DESIGN_NAME_PLACEHOLDER = "Kitchen at 14 Marine Parade";

export const FALLBACK_DESIGN_NAME = "Untitled design";

/**
 * A name as it should be stored.
 *
 * Runs of whitespace collapse, because a name pasted out of a document arrives
 * with line breaks in it and reads as broken in a table. Trimmed and capped, so
 * neither an empty string nor a paragraph can be saved.
 */
export function cleanDesignName(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DESIGN_NAME_MAX);
}

/** Is this enough of a name to build a design around? */
export function isUsableDesignName(value) {
  return cleanDesignName(value).length >= DESIGN_NAME_MIN;
}

/**
 * The name to store, or the fallback.
 *
 * Used by the route rather than the screen, so a hand rolled POST that skips
 * the planner still produces something a person can read in the admin list.
 */
export function designNameOrFallback(value) {
  const name = cleanDesignName(value);
  return isUsableDesignName(name) ? name : FALLBACK_DESIGN_NAME;
}

// NAMES THAT ARE NOT NAMES.
//
// "My design" is what every public design was called before the planner asked,
// and there are a lot of them. Somebody coming back to one of those resumes it
// from their saved link and would never be asked, so those designs would keep
// the shared name for ever and the admin list would stay unreadable for exactly
// as long as anybody kept using an old session.
//
// So a resumed design whose name is one of these gets asked once, on the way
// in. Somebody who genuinely wants to call their design "My design" can type it
// again, which is a very small price for clearing out the back catalogue.
const PLACEHOLDER_NAMES = new Set(["my design", "untitled design", "untitled", "new design", "design"]);

/** Is this a design that has never really been named? */
export function isPlaceholderDesignName(value) {
  const name = cleanDesignName(value);
  if (!isUsableDesignName(name)) return true;
  return PLACEHOLDER_NAMES.has(name.toLowerCase());
}
