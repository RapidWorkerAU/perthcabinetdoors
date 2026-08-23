// THE PROFILE LIBRARY, AND THE LISTS IT WAS SEEDED FROM.
//
// ── THE STATE THIS IS WATCHING ───────────────────────────────────────────────
//
// The library is now the catalogue: door and edge profiles, their supplier,
// their category and their photo, managed on a screen instead of in a code file
// that needs a deploy.
//
// The hardcoded lists in lib/quote-form-data.js are still what the QUOTE FORM
// offers, because those lists also carry the 18mm/21mm rules the quote editor
// validates against on every save, and moving that is a separate job with real
// risk.
//
// So there are two sources for a while. That is exactly the state that produced
// every silent divergence this system has had, so these tests assert the seed
// covers the lists exactly: neither can grow, shrink or be renamed without a
// test failing.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DECORATIVE_BOARD_EDGE_PROFILES,
  PROFILE_21MM_ONLY_BY_TYPE,
  PROFILE_NAMES_BY_TYPE,
  THERMOLAMINATE_EDGE_PROFILES,
} from "../lib/quote-form-data.js";
import { LAMINEX_PROFILES } from "../lib/pcd-laminex-profiles.js";
import {
  categoriesBySupplier,
  profileKindLabel,
  profileLibraryGaps,
  profileLibraryRowFromDraft,
  PROFILE_KINDS,
} from "../lib/pcd-profile-library.js";

const MIGRATION = readFileSync(
  new URL("../supabase/202608231000_pcd_profile_library.sql", import.meta.url),
  "utf8"
);

// Every ('kind', 'Supplier', 'Category', 'Name', ...) tuple in the seed.
const SEEDED = [...MIGRATION.matchAll(/\('(door|edge)', '([^']+)', '((?:[^']|'')+)', '((?:[^']|'')+)'/g)].map(
  (match) => ({
    kind: match[1],
    supplier: match[2],
    category: match[3].replace(/''/g, "'"),
    name: match[4].replace(/''/g, "'"),
  })
);

test("the seed was actually read", () => {
  assert.ok(SEEDED.length > 100, `only parsed ${SEEDED.length} seed rows, so these tests would check nothing`);
});

// ── the seed covers the live lists, exactly ────────────────────────────────

test("every Polytec door profile in the quote form is in the library", () => {
  const seeded = new Set(
    SEEDED.filter((row) => row.kind === "door" && row.supplier === "Polytec").map((row) => `${row.category}|${row.name}`)
  );
  const missing = Object.entries(PROFILE_NAMES_BY_TYPE).flatMap(([family, names]) =>
    names.filter((name) => !seeded.has(`${family}|${name}`)).map((name) => `${family} / ${name}`)
  );
  assert.deepEqual(missing, [], "these can be quoted and are not in the catalogue");
});

test("the library holds no Polytec door profile the quote form does not", () => {
  const live = new Set(
    Object.entries(PROFILE_NAMES_BY_TYPE).flatMap(([family, names]) => names.map((name) => `${family}|${name}`))
  );
  const extra = SEEDED.filter((row) => row.kind === "door" && row.supplier === "Polytec")
    .filter((row) => !live.has(`${row.category}|${row.name}`))
    .map((row) => `${row.category} / ${row.name}`);
  assert.deepEqual(extra, [], "these are in the catalogue and cannot be quoted");
});

test("every Laminex profile is in the library, under its published group", () => {
  const seeded = new Set(
    SEEDED.filter((row) => row.supplier === "Laminex").map((row) => `${row.category}|${row.name}`)
  );
  const missing = LAMINEX_PROFILES.filter((profile) => !seeded.has(`${profile.family}|${profile.name}`)).map(
    (profile) => profile.name
  );
  assert.deepEqual(missing, []);
});

test("every edge profile is in the library, and all of them are Polytec", () => {
  const edges = SEEDED.filter((row) => row.kind === "edge");
  const names = new Set(edges.map((row) => row.name));
  [...THERMOLAMINATE_EDGE_PROFILES, ...DECORATIVE_BOARD_EDGE_PROFILES].forEach((name) => {
    assert.ok(names.has(name), `${name} is offered and is not in the catalogue`);
  });
  const notPolytec = edges.filter((row) => row.supplier !== "Polytec");
  assert.deepEqual(notPolytec, [], "Laminex makes no edge profiles, so none can be seeded against it");
});

// ── the thickness rule came across ─────────────────────────────────────────
//
// Thirteen Polytec profiles are only made in 21mm. That has always been real
// business data living in a hardcoded object, and it is the reason the library
// records it per profile rather than assuming every profile suits both boards.

test("the 21mm-only profiles are seeded as unavailable in 18mm", () => {
  const only21 = Object.values(PROFILE_21MM_ONLY_BY_TYPE).flat();
  assert.ok(only21.length > 0, "there really are some, so this test has something to check");
  only21.forEach((name) => {
    const row = MIGRATION.match(new RegExp(`'${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}', [^,]+, (true|false)`));
    assert.ok(row, `${name} is not in the seed at all`);
    assert.equal(row[1], "false", `${name} is 21mm only and the seed says it is available in 18mm`);
  });
});

// ── the table itself ───────────────────────────────────────────────────────

test("a name can repeat across suppliers, because Country Square really does", () => {
  assert.match(
    MIGRATION,
    /unique index[\s\S]{0,120}\(kind, supplier_name, name\)/,
    "keying on name alone would refuse the second Country Square"
  );
  const countrySquares = SEEDED.filter((row) => row.name === "Country Square");
  assert.equal(countrySquares.length, 2, "one Polytec, one Laminex");
});

test("re-running the seed cannot undo work done in the admin", () => {
  assert.match(MIGRATION, /on conflict \(kind, supplier_name, name\) do nothing/);
  assert.doesNotMatch(MIGRATION, /do update/, "a re-seed must not overwrite a photo somebody swapped");
});

test("door and edge profiles share one table, separated by kind", () => {
  assert.match(MIGRATION, /kind in \('door', 'edge'\)/);
  assert.ok(SEEDED.some((row) => row.kind === "door"));
  assert.ok(SEEDED.some((row) => row.kind === "edge"));
});

// ── the lib ────────────────────────────────────────────────────────────────

test("a draft is cleaned into a row, with sensible defaults", () => {
  const row = profileLibraryRowFromDraft({ name: "  Settler 20  ", category: " Series 3 ", supplier_name: "Laminex" });
  assert.equal(row.name, "Settler 20");
  assert.equal(row.category, "Series 3");
  assert.equal(row.supplier_name, "Laminex");
  assert.equal(row.kind, "door");
  assert.equal(row.is_active, true);
  assert.equal(row.image_url, null, "an empty image is null, not an empty string");
});

test("a supplier we do not deal with falls back rather than being stored", () => {
  assert.equal(profileLibraryRowFromDraft({ supplier_name: "Someone Else" }).supplier_name, "Polytec");
  assert.equal(profileLibraryRowFromDraft({ kind: "nonsense" }).kind, "door");
});

test("a profile with no name or no category is refused", () => {
  assert.deepEqual(profileLibraryGaps({ name: "", category: "" }), ["a name", "a category"]);
  assert.deepEqual(profileLibraryGaps({ name: "Shaker", category: "Soft" }), []);
});

// Plenty of real profiles have never had a photo. Blocking on it would stop
// somebody recording a profile they can already sell.
test("a profile with no image is allowed", () => {
  assert.deepEqual(profileLibraryGaps({ name: "Shaker", category: "Soft", image_url: "" }), []);
});

test("a profile available in neither thickness is refused, because it cannot be made", () => {
  const gaps = profileLibraryGaps({ name: "X", category: "Y", available_18mm: false, available_21mm: false });
  assert.match(gaps.join(" "), /thickness/);
});

test("categories are grouped by supplier, so a Laminex filter offers Laminex groups", () => {
  const grouped = categoriesBySupplier(
    [
      { kind: "door", supplier_name: "Polytec", category: "Soft" },
      { kind: "door", supplier_name: "Laminex", category: "Series 3: Pocket Routered Doors" },
      { kind: "edge", supplier_name: "Polytec", category: "Thermolaminate" },
    ],
    "door"
  );
  assert.deepEqual(grouped.get("Polytec"), ["Soft"]);
  assert.deepEqual(grouped.get("Laminex"), ["Series 3: Pocket Routered Doors"]);
  assert.equal(grouped.has("Thermolaminate"), false, "an edge category must not leak into the door list");
});

test("both kinds have a readable label", () => {
  assert.equal(PROFILE_KINDS.length, 2);
  assert.equal(profileKindLabel("edge"), "Edge profile");
  assert.equal(profileKindLabel("nonsense"), "Door profile", "an unknown kind is not a crash");
});

// ── THE SEED AND THE CODE MUST NAME THE SAME PHOTO ────────────────────────
//
// The Laminex folders were renamed mid-build, from S1-flat-faced-doors to
// series-1 and so on, and the seed was not updated with the code. The library
// would have been populated with paths to files that no longer existed: a
// catalogue of blank tiles, with nothing broken enough to notice.
//
// Both now point at storage, so this checks they point at the SAME object.

test("the seed and the code agree on where every Laminex photo lives", () => {
  const disagreed = LAMINEX_PROFILES.filter((profile) => {
    const file = profile.imageUrl.split("/").pop();
    return !MIGRATION.includes(file);
  }).map((profile) => `${profile.name} -> ${profile.imageUrl}`);
  assert.deepEqual(disagreed, [], "the finishes page and the library would show different photos");
});

// ── STORAGE IS THE SOURCE ──────────────────────────────────────────────────
//
// Every profile and edge photo lives in a public Supabase bucket, so replacing
// one is an upload rather than a deploy. Verified when this was written: all 137
// URLs in the seed returned HTTP 200.
//
// /public/images is kept only as a fallback for a tile whose bucket URL will not
// load, so a Supabase hiccup shows last week's photo rather than an empty square
// in front of a customer.

test("every seeded photo comes from storage, not from the app's own folder", () => {
  const local = [...MIGRATION.matchAll(/'(\/images\/[^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(
    local,
    [],
    "a seeded path into /public means that photo can only be changed by a deploy, which is what the library exists to end"
  );
});

test("the seed points at the three buckets and nothing else", () => {
  const buckets = new Set(
    [...MIGRATION.matchAll(/object\/public\/([a-z0-9-]+)\//g)].map((match) => match[1])
  );
  assert.deepEqual(
    [...buckets].sort(),
    ["laminex-profiles", "polytec-edge-profies", "polytec-profiles"],
    "a fourth bucket here is a photo nobody has verified is public"
  );
});

// The bucket is misspelled: polytec-edge-profies, no l in profiles. Asserted
// as it really is, so nobody "corrects" it in code and breaks every edge photo
// while the bucket itself keeps the old name.
test("the misspelled edge bucket is used as it is actually named", () => {
  assert.match(MIGRATION, /polytec-edge-profies/);
  assert.doesNotMatch(MIGRATION, /polytec-edge-profiles/, "that bucket does not exist; renaming needs a data migration too");
});

// These had no photo at all until they were uploaded. "1mm Bevel Edge" is filed
// as bevel-edge.png, which the slug rule alone would miss.
test("the two decorative board tape edges now carry photos", () => {
  const square = SEEDED.find((row) => row.name === "1mm Square Edge");
  const bevel = SEEDED.find((row) => row.name === "1mm Bevel Edge");
  assert.ok(square && bevel, "both are still in the catalogue");
  assert.match(MIGRATION, /'1mm Square Edge', 'https:[^']*1mm-square-edge\.png'/);
  assert.match(MIGRATION, /'1mm Bevel Edge', 'https:[^']*bevel-edge\.png'/);
});

test("only the sixteen that have never had a photo are seeded without one", () => {
  const withoutPhoto = MIGRATION.split("\n").filter((line) => /^\s+\('(door|edge)'/.test(line) && line.includes(", null,"));
  assert.equal(
    withoutPhoto.length,
    13,
    "the ten 21mm-only Detailed profiles and the three Fluted ones. Anything else here is a photo that went missing"
  );
});

// ── WHICH BOARD EACH RANGE CAN BE MADE IN ──────────────────────────────────
//
// The two ranges restrict in OPPOSITE directions, and neither can be inferred
// from the other:
//
//   Polytec  thirteen profiles are 21mm ONLY
//   Laminex  every profile is 18mm ONLY, per the FormWrap technical data sheet
//            (version 2, 08/2019), which gives 18mm nominal and lists no other
//
// Recording only one of the two would mean quoting a Laminex door in 21mm, which
// cannot be made.

test("every Laminex profile is 18mm only", () => {
  const laminexRows = MIGRATION.split("\n").filter((line) => line.includes("'Laminex'") && line.trim().startsWith("("));
  assert.equal(laminexRows.length, 27, "all 27, so this is checking the whole range");
  const wrong = laminexRows.filter((line) => !/,\s*true,\s*false,\s*true,\s*\d+\),?$/.test(line.trim()));
  assert.deepEqual(
    wrong.map((line) => line.match(/'([^']+)', 'https|'([^']+)', null/)?.[1] || line.slice(0, 60)),
    [],
    "FormWrap is 18mm nominal, so a Laminex profile offered in 21mm is a door that cannot be made"
  );
});

test("the thirteen Polytec 21mm-only profiles are 21mm only, not both", () => {
  const only21 = Object.values(PROFILE_21MM_ONLY_BY_TYPE).flat();
  only21.forEach((name) => {
    const line = MIGRATION.split("\n").find((entry) => entry.includes(`'${name}',`));
    assert.ok(line, `${name} is not in the seed`);
    assert.match(line, /null,\s*false,\s*true,/, `${name} should be unavailable in 18mm and available in 21mm`);
  });
});

test("an ordinary Polytec profile is available in both", () => {
  const brussels = MIGRATION.split("\n").find((line) => line.includes("'Brussels'"));
  assert.match(brussels, /,\s*true,\s*true,\s*true,\s*\d+\)/, "18mm, 21mm and active");
});

// Both columns are in the insert, so nothing relies on the table default. A
// default is right for a row somebody adds by hand and wrong for a seed, where
// silence about 21mm is what made every Laminex profile look 21mm-capable.
test("the seed states both thicknesses rather than leaning on the default", () => {
  assert.match(MIGRATION, /\(kind, supplier_name, category, name, image_url, available_18mm, available_21mm, is_active, sort_order\)/);
});

// ── WHEN THE SEED IS RIGHT AND THE TABLE IS NOT ────────────────────────────
//
// Every test above reads the seed FILE. That is the right thing to check, but it
// is not proof about the table, and on 2026-08-23 the two disagreed: all 27
// Laminex rows were sitting at available_21mm = true while the seed said false.
//
// The seed ends with `on conflict (kind, supplier_name, name) do nothing`, so
// once a row exists the seed can never correct it. Fixing the seed and rerunning
// it does nothing at all, silently, and the test above goes green either way.
//
// A correction to a seeded value therefore needs its own migration, and this
// checks the two agree. Change one without the other and this fails.

test("the 18mm-only rule is corrected in the table, not just written in the seed", () => {
  const correction = readFileSync(
    new URL("../supabase/202608231400_pcd_laminex_18mm_only.sql", import.meta.url),
    "utf8"
  );
  assert.match(correction, /update pcd_profile_library/, "the seed cannot fix a row that already exists");
  assert.match(correction, /set available_21mm = false/);
  assert.match(correction, /supplier_name ilike 'laminex'/);
});

// Narrowing a range must not empty it. A profile available in no thickness at
// all cannot be quoted anywhere, and it would disappear from every dropdown with
// nothing on screen to say why.
test("the correction refuses to leave a profile available in no thickness", () => {
  const correction = readFileSync(
    new URL("../supabase/202608231400_pcd_laminex_18mm_only.sql", import.meta.url),
    "utf8"
  );
  assert.match(correction, /raise exception/);
  assert.match(correction, /coalesce\(available_18mm, false\) = false/);
  assert.match(correction, /coalesce\(available_21mm, false\) = false/);
});

// ── THE BEVEL EDGE WITH NO PHOTO ───────────────────────────────────────────
//
// Reported from the live edge dropdown: the 1mm Square Edge showed its photo and
// the 1mm Bevel Edge did not, on decorative board.
//
// Neither row had an image_url, so every screen fell back to guessing a filename
// from the name. "1mm Square Edge" guesses 1mm-square-edge.png, which is what
// the file is called. "1mm Bevel Edge" guesses 1mm-bevel-edge.png, and the file
// is bevel-edge.png. The square edge worked by luck, not by design, which is
// what made the bug look like it was about the bevel specifically.
//
// Both photos had been in the bucket the whole time.

test("both decorative board edges have their photo recorded", () => {
  const correction = readFileSync(
    new URL("../supabase/202608231600_pcd_decorative_edge_images.sql", import.meta.url),
    "utf8"
  );
  assert.match(correction, /1mm-square-edge\.png/);
  assert.match(correction, /bevel-edge\.png/, "the file is bevel-edge.png, not 1mm-bevel-edge.png");
  assert.match(correction, /where kind = 'edge'/);
});

// The bucket name really is misspelled. Correcting it here would point at a
// bucket that does not exist.
test("the correction uses the bucket's real, misspelled name", () => {
  const correction = readFileSync(
    new URL("../supabase/202608231600_pcd_decorative_edge_images.sql", import.meta.url),
    "utf8"
  );
  assert.match(correction, /polytec-edge-profies/);
  assert.doesNotMatch(correction, /polytec-edge-profiles\//);
});

// ── ONE RULE FOR TURNING A NAME INTO A FILENAME ────────────────────────────
//
// There were five copies of it and only one knew the exceptions. A null
// image_url still has to fall back to something, so the fallback has to know
// them too, or filling these two rows would just move the bug to the next
// profile whose name does not match its file.

test("nothing works out an edge filename for itself any more", () => {
  [
    "app/admin/quotes/[id]/QuoteEditor.js",
    "app/admin/orders/[id]/variations/[variationId]/VariationEditor.js",
    "app/admin/products/_components/ProductEditorForm.js",
    "app/(site)/request-quote/RequestQuoteFormClient.js",
  ].forEach((path) => {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /`\/images\/edges\/\$\{assetSlug\([^)]*\)\}\.png`/,
      `${path} still slugs an edge name itself, so it does not know the exceptions`
    );
  });
});

test("the local fallback knows the same exceptions as the bucket builder", () => {
  const images = readFileSync(new URL("../lib/pcd-profile-images.js", import.meta.url), "utf8");
  assert.match(images, /EDGE_FILE_NAMES\[clean\]/, "the fallback reads the same list");
  const source = readFileSync(new URL("../lib/pcd-profile-image-source.js", import.meta.url), "utf8");
  assert.match(source, /export const EDGE_FILE_NAMES/, "and there is only one list to read");
  assert.match(source, /"1mm bevel edge": "bevel-edge\.png"/);
});

// This one had gone further and refused a photo to anything not called
// EMsomething, hiding the decorative board edges rather than finding them.
test("the variation editor no longer hides non-EM edges", () => {
  const source = readFileSync(
    new URL("../app/admin/orders/[id]/variations/[variationId]/VariationEditor.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /startsWith\("em"\)\) return ""/);
});
