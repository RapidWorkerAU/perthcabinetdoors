import { EDGE_FILE_NAMES, edgeProfileUrl, polytecProfileUrl } from "./pcd-profile-image-source";

// Resolves a door profile to its photo in /public/images/profiles.
//
// The library is laid out as profiles/<family>/<name>.jpg, all 738x960 portrait
// shots of the actual routed door. Every one of the 97 profiles available in
// 18mm board has an image and there are no orphan files, so the slug rule below
// is exact rather than a guess:
//
//   "Mona Vale"   -> soft/mona-vale.jpg
//   "Calcutta 35" -> sharp/calcutta-35.jpg
//
// The 13 profiles with no image are exactly the 21mm-only ones - the ten
// Detailed names in PROFILE_21MM_ONLY_BY_TYPE plus the three Fluted profiles,
// which have no folder at all. Callers should fall back to a drawn placeholder
// rather than a broken image, and should keep doing so on load error, so that
// dropping a new photo into the folder is all it takes to light it up.

export const PROFILE_IMAGE_FAMILIES = ["Minimal", "Soft", "Sharp", "Detailed"];

export const PROFILE_IMAGE_ASPECT = 738 / 960;

/**
 * The photo for a Polytec door profile.
 *
 * Supabase storage is the source. profileImageFallbackSrc below still returns
 * the copy in /public, so a tile that cannot load the bucket shows last week's
 * photo instead of an empty square.
 */
export function profileImageSrc(family, name) {
  if (!PROFILE_IMAGE_FAMILIES.includes(family) || !name) return null;
  const slug = String(name).trim().toLowerCase().replace(/\s+/g, "-");
  if (!slug) return null;
  return polytecProfileUrl(family, name) || `/images/profiles/polytec/${family.toLowerCase()}/${slug}.jpg`;
}

/**
 * The same photo from /public, for a tile whose bucket URL failed to load.
 *
 * The files moved under profiles/polytec/ when the Laminex range arrived and
 * needed a folder of its own.
 */
export function profileImageFallbackSrc(family, name) {
  if (!PROFILE_IMAGE_FAMILIES.includes(family) || !name) return null;
  const slug = String(name).trim().toLowerCase().replace(/s+/g, "-");
  return slug ? `/images/profiles/polytec/${family.toLowerCase()}/${slug}.jpg` : null;
}

// ---- Edge moulds ----
//
// The same idea for the edge photos in /public/images/edges, which have been
// there all along while four different screens each kept their own copy of this
// slug rule. One copy now, so a renamed file breaks in one place rather than
// silently missing on three screens and working on the fourth.
//
//   "EM1 6mm Pencil Round" -> em1-6mm-pencil-round.png
//
// Decorative board's two tape edges have no photo, so callers should fall back
// to a drawn placeholder and keep doing so on load error — dropping a file in
// is then all it takes to light it up.
// The edge shots are 319x61 strips of the moulded edge in section, so a tile
// built for the portrait profile photos letterboxes them into a sliver. Stated
// here beside the profile aspect so both come from one place.
export const EDGE_IMAGE_ASPECT = 319 / 61;

export function edgeImageSrc(name) {
  return edgeProfileUrl(name) || edgeImageFallbackSrc(name);
}

/**
 * The copy in /public, for a tile whose bucket URL failed to load.
 *
 * The two folders hold the same filenames, so the exceptions apply to both:
 * /public/images/edges/bevel-edge.png is named exactly as the bucket copy is.
 * Slugging the name straight through here asked for 1mm-bevel-edge.png and
 * got a 404, which is the bug this fixes.
 */
export function edgeImageFallbackSrc(name) {
  const clean = String(name || "").trim().toLowerCase();
  if (!clean) return "";
  const file = EDGE_FILE_NAMES[clean] || `${clean.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;
  return `/images/edges/${file}`;
}

// The SVG path for one edge in section, for the cases with no photo. Read off
// the name rather than a lookup table, so an edge added to the catalogue is
// drawn sensibly the day it appears rather than falling back to a square.
//
// Coordinates are a 52x28 box: a slab running in from the left, with the right
// hand side shaped.
export function edgeSectionPath(name) {
  const n = String(name || "");
  const has = (t) => n.toLowerCase().includes(t);
  if (has("pencil round") && has("step")) return "L38 6 L38 10 Q42 10 42 14 L42 18 Q42 22 38 22";
  if (has("step bevel")) return "L38 6 L38 10 L43 14 L43 16 L38 22";
  if (has("pencil round")) return has("3mm") ? "L42 6 Q44 6 44 9 L44 19 Q44 22 42 22" : "L40 6 Q44 6 44 10 L44 18 Q44 22 40 22";
  if (has("thumb")) return "L38 6 Q44 6 44 14 Q44 22 38 22";
  if (has("roman")) return "L37 6 Q41 6 41 11 Q45 12 44 17 Q43 22 38 22";
  if (has("softline")) return "L42 6 Q44 6 44 9 L44 19 Q44 22 42 22";
  if (has("large bevel")) return "L37 6 L44 12 L44 16 L37 22";
  // A 1mm tape bevel is a small chamfer off both corners, which is what makes
  // it read differently from the square edge beside it.
  if (has("bevel") || has("chamfer")) return "L41 6 L44 9 L44 19 L41 22";
  return "L44 6 L44 22"; // square
}
