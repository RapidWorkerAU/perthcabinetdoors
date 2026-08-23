// THE LAMINEX DOOR PROFILE RANGE.
//
// ── WHY EACH FILE IS NAMED EXPLICITLY ────────────────────────────────────────
//
// The Polytec photos follow a slug rule: "Mona Vale" becomes soft/mona-vale.jpg,
// so the file can be worked out from the name. The Laminex files cannot. They
// carry the product technology as a suffix (Settler-FW, Newport-CT), spell sizes
// differently to the way they are displayed (settler-10mm.jpg is "Settler 10"),
// and mix .png with .jpg.
//
// So every one is written out. A guessed path that misses shows a customer an
// empty tile with no explanation, and a rule with six exceptions is worse than a
// list. The list is checked by a test that reads the folder, so a renamed or
// missing file fails there rather than on the page.
//
// ── THE GROUPS ───────────────────────────────────────────────────────────────
//
// Named as Laminex names them, not as the folders are named. Series 4 and 5 are
// not called "Series" at all in the catalogue: they are Glazed Door Frames and
// Drawers & Accessories.
//
// Laminex has NO edge profiles. That is why lib/pcd-profile-suppliers.js leaves
// LAMINEX_EDGE_PROFILES empty: it is a fact about the range, not a gap.

import { laminexProfileUrl } from "./pcd-profile-image-source";

// The copy in /public, for a tile whose bucket URL failed to load.
const LOCAL_ROOT = "/images/profiles/laminex";

export const LAMINEX_PROFILE_GROUPS = [
  {
    key: "laminex-s1",
    label: "Series 1: Flat Face Doors",
    folder: "series-1",
    profiles: [
      { name: "Classic", file: "Classic-Square-Edge.png" },
      { name: "Soft Bevelled Edge", file: "CT-Soft-Bevelled-Edge.jpg" },
    ],
  },
  {
    key: "laminex-s2",
    label: "Series 2: Recessed Handles and Face Routered Doors",
    folder: "series-2",
    profiles: [
      { name: "Finger Pull", file: "Finger-Pull.png" },
      { name: "Chicago", file: "Chicago.jpg" },
      { name: "Colonial Square", file: "Colonial-Square-FW.png" },
      { name: "Country Square", file: "Country-Square-FW.jpg" },
      { name: "Country V", file: "Country-V.jpg" },
      { name: "Homestead", file: "Homestead.png" },
      { name: "Metro", file: "Metro.jpg" },
      { name: "Newport", file: "Newport-CT.jpg" },
    ],
  },
  {
    key: "laminex-s3",
    label: "Series 3: Pocket Routered Doors",
    folder: "series-3",
    profiles: [
      { name: "Nostalgia Soft Arch", file: "Nostalgia-Soft-Arch.png" },
      { name: "Nostalgia Square", file: "Nostalgia-Square.png" },
      { name: "Nouvo", file: "Nouvo.jpg" },
      { name: "Settler", file: "Settler-FW.png" },
      { name: "Settler Planked", file: "Settler-Planked-FW.png" },
      { name: "Settler 10", file: "settler-10mm.jpg" },
      { name: "Settler 20", file: "settler-20mm.jpg" },
      { name: "Settler 40", file: "settler-40mm.jpg" },
      { name: "Shaker", file: "Shaker-FW.png" },
    ],
  },
  {
    key: "laminex-glazed",
    label: "Glazed Door Frames",
    folder: "series4",
    profiles: [
      { name: "1 Pane Arch", file: "1-Arch-1-Pane.png" },
      { name: "2 Pane Arch", file: "2-Pane-Horizontal-Arch.jpg" },
      { name: "4 Pane Arch", file: "4-Arch-1-Pane.png" },
      { name: "1 Pane Square", file: "1-Pane-Square.png" },
      { name: "2 Pane Square", file: "2-Pane-Square.png" },
      { name: "4 Pane Square", file: "4-Pane-Square.png" },
    ],
  },
  {
    key: "laminex-drawers",
    label: "Drawers & Accessories",
    folder: "drawers-accessories",
    profiles: [
      { name: "Drawer Bank", file: "Drawer-Bank.jpg" },
      { name: "Drawer Set", file: "Drawer-Set.jpg" },
    ],
  },
];

/** Every Laminex profile, flat, with its group and its image. */
export const LAMINEX_PROFILES = LAMINEX_PROFILE_GROUPS.flatMap((group) =>
  group.profiles.map((profile) => ({
    name: profile.name,
    family: group.label,
    supplier: "Laminex",
    // Supabase storage is the source; the local copy is what a failed load
    // falls back to, so a hiccup shows the photo we already have.
    imageUrl:
      laminexProfileUrl(group.folder, profile.file) || `${LOCAL_ROOT}/${group.folder}/${profile.file}`,
    fallbackUrl: `${LOCAL_ROOT}/${group.folder}/${profile.file}`,
  }))
);

/** The same shape the Polytec range uses, so both can be read the same way. */
export const LAMINEX_NAMES_BY_GROUP = Object.fromEntries(
  LAMINEX_PROFILE_GROUPS.map((group) => [group.label, group.profiles.map((profile) => profile.name)])
);

export const LAMINEX_PROFILE_NAMES = LAMINEX_PROFILES.map((profile) => profile.name);

/** The photo for one Laminex profile, or null when the name is not one of ours. */
export function laminexProfileImageSrc(name) {
  const wanted = String(name || "").trim().toLowerCase();
  if (!wanted) return null;
  const found = LAMINEX_PROFILES.find((profile) => profile.name.toLowerCase() === wanted);
  return found ? found.imageUrl : null;
}
