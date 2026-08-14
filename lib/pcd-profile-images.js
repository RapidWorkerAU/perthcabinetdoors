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

export function profileImageSrc(family, name) {
  if (!PROFILE_IMAGE_FAMILIES.includes(family) || !name) return null;
  const slug = String(name).trim().toLowerCase().replace(/\s+/g, "-");
  if (!slug) return null;
  return `/images/profiles/${family.toLowerCase()}/${slug}.jpg`;
}
