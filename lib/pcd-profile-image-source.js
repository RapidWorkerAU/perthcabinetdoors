// WHERE A PROFILE PHOTO COMES FROM.
//
// ── ONE SOURCE OF TRUTH ──────────────────────────────────────────────────────
//
// Supabase storage. Three public buckets hold every profile and edge photo the
// site uses, and uploading a replacement there changes the site with no deploy,
// which is the entire point of having a profile library.
//
// Verified before this file was written: 97 Polytec door photos, 27 Laminex door
// photos and 13 edge photos, covering every profile the catalogue offers except
// the sixteen that have never had a photo at all.
//
// ── WHY /public/images IS STILL A FALLBACK ───────────────────────────────────
//
// The same files are still on disk, and a tile falls back to them if a bucket
// URL will not load. That is not indecision about the source of truth: the
// bucket is the truth, and the fallback exists so a Supabase hiccup degrades to
// last week's photo rather than to an empty square in front of a customer.
//
// The fallback is safe to delete the day storage has been reliable long enough
// to trust, and nothing else has to change when it goes.
//
// ── THE BUCKET NAME WITH A TYPO ──────────────────────────────────────────────
//
// The edge bucket is `polytec-edge-profies`, missing the l in "profiles". Named
// as it really is, because renaming a bucket breaks every URL already pointing
// at it. Worth fixing one day with a migration that moves the files and updates
// the library rows together; not worth breaking the site for today.

const BUCKETS = {
  polytecProfiles: "polytec-profiles",
  laminexProfiles: "laminex-profiles",
  polytecEdges: "polytec-edge-profies",
};

/**
 * The public base for storage, from the same variable the browser client uses.
 *
 * Returns "" when it is not set, and every builder below then returns null, so a
 * missing variable shows the drawn placeholder rather than a URL beginning
 * "undefined".
 */
function storageBase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return url ? `${url.replace(/\/+$/, "")}/storage/v1/object/public` : "";
}

function bucketUrl(bucket, path) {
  const base = storageBase();
  if (!base || !path) return null;
  // Each segment encoded separately: a slash between folders is structure, a
  // space or a bracket inside a filename is not.
  const encoded = String(path)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/${bucket}/${encoded}`;
}

/** Polytec door photos: profiles/<family>/<slug>.jpg, the rule they were filed under. */
export function polytecProfileUrl(family, name) {
  const slug = String(name || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (!family || !slug) return null;
  return bucketUrl(BUCKETS.polytecProfiles, `${String(family).toLowerCase()}/${slug}.jpg`);
}

/** Laminex door photos, whose filenames follow no rule and are mapped by hand. */
export function laminexProfileUrl(folder, file) {
  if (!folder || !file) return null;
  return bucketUrl(BUCKETS.laminexProfiles, `${folder}/${file}`);
}

// The two decorative board tape edges are the only edges whose file does not
// follow from the name: "1mm Bevel Edge" is filed as bevel-edge.png, not
// 1mm-bevel-edge.png. Written out rather than special-cased in the slug rule,
// because a rule with an exception hidden inside it is how the last folder
// rename went unnoticed.
export const EDGE_FILE_NAMES = {
  "1mm bevel edge": "bevel-edge.png",
};

/** Edge photos, all Polytec: one flat bucket, slugged from the name. */
export function edgeProfileUrl(name) {
  const clean = String(name || "").trim().toLowerCase();
  if (!clean) return null;
  const file =
    EDGE_FILE_NAMES[clean] ||
    `${clean.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;
  return bucketUrl(BUCKETS.polytecEdges, file);
}

export const PROFILE_BUCKETS = BUCKETS;
