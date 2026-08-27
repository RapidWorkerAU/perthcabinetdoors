// TURNING A NAME INTO A STORED VALUE, AND BACK AGAIN.
//
// ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────────
//
// lib/pcd-lists.js reads the built-in items out of the modules that define
// them, so pcd-order-issues, pcd-payment-settlement and the rest cannot import
// anything back from it without making a cycle. These two functions are the bit
// they all need, so they live somewhere neither side owns.
//
// Nothing is imported here, deliberately, and nothing should be.

/**
 * The stored value for a newly typed name.
 *
 * ── WHY A KEY AND NOT JUST THE NAME ──────────────────────────────────────────
 *
 * Because the name can be corrected later. Somebody types "Damaged in transt",
 * ten orders record it, and then they fix the spelling. If the name were the
 * stored value those ten orders would still hold the typo, or would have to be
 * rewritten. The key is fixed at birth and the name is free to change.
 *
 * ── AND WHY IT IS READABLE ───────────────────────────────────────────────────
 *
 * "damaged_in_transit" turns back into "Damaged in transit" on its own, which
 * matters wherever a label is needed somewhere the list cannot be read, such as
 * a PDF built from pure functions. The fallback is the right words rather than
 * a raw code.
 */
export function itemKeyFrom(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** A key read back as words, for when the list itself is out of reach. */
export function keyAsWords(key) {
  const words = String(key || "").replace(/_/g, " ").trim();
  if (!words) return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}
