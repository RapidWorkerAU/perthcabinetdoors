// WHO MAKES A DOOR PROFILE, AND WHO MAKES AN EDGE.
//
// ── WHY THIS MATTERS ─────────────────────────────────────────────────────────
//
// Colours already carried their brand. Door profiles and edge profiles carried
// nothing, because until now every one of them was Polytec and nothing needed
// saying.
//
// Laminex has its own door profiles, and the ranges cannot be mixed: a Laminex
// colour cannot be pressed onto a Polytec profile, or the other way round. A
// profile with no maker recorded is one somebody can pair with the wrong colour,
// and the first anybody would know is when the door arrives.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// fileURLToPath, NOT pathname with the leading slash stripped. That idiom turns
// "/C:/Users/..." into a usable Windows path and "/home/runner/..." into a
// RELATIVE one, so these checks quietly passed here and failed everywhere else
// the first time they were ever run outside Windows.
import { fileURLToPath } from "node:url";

import {
  DEFAULT_PROFILE_SUPPLIER,
  edgeMatchesColour,
  edgeSupplier,
  LAMINEX_EDGE_PROFILES,
  LAMINEX_PROFILE_NAMES_BY_TYPE,
  mismatchMessage,
  profileMatchesColour,
  profileSupplier,
} from "../lib/pcd-profile-suppliers.js";
import { PROFILE_NAMES_BY_TYPE, THERMOLAMINATE_EDGE_PROFILES } from "../lib/quote-form-data.js";

// ── everything we already sell is Polytec ──────────────────────────────────

test("every existing door profile is marked Polytec", () => {
  const laminex = Object.values(LAMINEX_PROFILE_NAMES_BY_TYPE).flat();
  const wrong = Object.values(PROFILE_NAMES_BY_TYPE)
    .flat()
    .filter((name) => !laminex.includes(name))
    .filter((name) => profileSupplier(name) !== "Polytec");
  assert.deepEqual(wrong, [], "these are the ranges we have been selling, so this is a fact, not a default");
});

test("every existing edge profile is marked Polytec", () => {
  const wrong = THERMOLAMINATE_EDGE_PROFILES.filter((name) => edgeSupplier(name) !== "Polytec");
  assert.deepEqual(wrong, []);
});

test("a name nobody has heard of falls to the range we actually stock", () => {
  assert.equal(profileSupplier("Something Invented"), DEFAULT_PROFILE_SUPPLIER);
  assert.equal(edgeSupplier("EM99 Nonsense"), DEFAULT_PROFILE_SUPPLIER);
});

test("nothing at all has no maker, rather than a guessed one", () => {
  assert.equal(profileSupplier(""), null);
  assert.equal(profileSupplier(null), null);
  assert.equal(edgeSupplier(undefined), null);
});

// ── the rule the file exists for ───────────────────────────────────────────

test("a Polytec colour cannot go on a Laminex profile, or the other way round", () => {
  assert.equal(profileMatchesColour("Brussels", "Polytec"), true, "Brussels is a Polytec profile");
  assert.equal(profileMatchesColour("Brussels", "Laminex"), false, "this is the pairing that arrives wrong");
});

test("the same rule applies to edges", () => {
  assert.equal(edgeMatchesColour("EM1 6mm Pencil Round", "Polytec"), true);
  assert.equal(edgeMatchesColour("EM1 6mm Pencil Round", "Laminex"), false);
});

test("brand comparison is not case sensitive", () => {
  assert.equal(profileMatchesColour("Brussels", "polytec"), true, "a stored lowercase brand is the same brand");
});

// A false refusal stops somebody doing work they are entitled to do, so this
// only ever says "these two are definitely wrong together", never "these two are
// definitely right".
test("an unknown brand on either side is not called a mismatch", () => {
  assert.equal(profileMatchesColour("Brussels", ""), true, "a colour with no brand recorded is not a mismatch");
  assert.equal(profileMatchesColour("Brussels", null), true);
  assert.equal(profileMatchesColour("", "Laminex"), true, "a line being filled in halfway is not a mismatch");
  assert.equal(edgeMatchesColour("", "Laminex"), true);
});

test("the refusal names both brands, so it says which one to change", () => {
  const message = mismatchMessage("Brussels", "Laminex");
  assert.match(message, /Polytec/);
  assert.match(message, /Laminex/);
  assert.doesNotMatch(message, /invalid/i, "an error that does not say what to do is not worth showing");
});

// ── ready for Laminex ──────────────────────────────────────────────────────

test("the Laminex range is loaded and grouped", () => {
  assert.equal(typeof LAMINEX_PROFILE_NAMES_BY_TYPE, "object");
  assert.ok(Array.isArray(LAMINEX_EDGE_PROFILES));
  assert.equal(Object.keys(LAMINEX_PROFILE_NAMES_BY_TYPE).length, 5, "five groups, as Laminex publishes them");
  assert.ok(Object.values(LAMINEX_PROFILE_NAMES_BY_TYPE).flat().length >= 27);
});

// Proves adding a name is all it takes: the same lookup then reports Laminex,
// and the pairing rule flips with it.
test("adding a Laminex name is the whole job", () => {
  LAMINEX_PROFILE_NAMES_BY_TYPE.Trial = ["Test Profile"];
  try {
    assert.equal(profileSupplier("Test Profile"), "Laminex");
    assert.equal(profileMatchesColour("Test Profile", "Laminex"), true);
    assert.equal(profileMatchesColour("Test Profile", "Polytec"), false);
  } finally {
    delete LAMINEX_PROFILE_NAMES_BY_TYPE.Trial;
  }
});

// ── the finishes page shows it ─────────────────────────────────────────────

const BROWSER = readFileSync(new URL("../app/(site)/finishes/FinishesBrowser.js", import.meta.url), "utf8");

test("profiles and edges carry their brand onto the page", () => {
  // The family is passed, because the page knows it and a name alone cannot
  // separate the two Country Squares.
  assert.match(BROWSER, /supplier: profileSupplier\(name, type\)/);
  assert.match(BROWSER, /supplier: edgeSupplier\(name\)/);
});

test("the brand filter works on every tab, not only on colours", () => {
  assert.match(
    BROWSER,
    /if \(supplier !== ALL && item\.supplier !== supplier\) return false;/,
    "the filter used to be inside a colours-only branch"
  );
  assert.match(BROWSER, /suppliers\.length > 1/, "and it only shows when there is more than one brand to choose between");
});

// The brand list has to describe what is on screen. Built from the colours it
// would offer brands that say nothing about the profiles being looked at.
//
// It reads `scoped` rather than `dataset` since the product type filter went in:
// same thing, with what you are making taken off it first, so choosing profiled
// fronts and then opening the brand list cannot offer a brand with nothing left
// under it.
test("the brand list is built from whatever tab is open", () => {
  assert.match(BROWSER, /scoped\.forEach\(\(item\) => \{[\s\S]{0,120}item\.supplier/);
  assert.match(BROWSER, /const scoped = useMemo\(\(\) => dataset\.filter/);
});

// ── THE LAMINEX RANGE ──────────────────────────────────────────────────────
//
// Every Laminex file is named explicitly rather than derived from a slug rule,
// because the files carry the product technology as a suffix (Settler-FW,
// Newport-CT), spell sizes differently to the way they display (settler-10mm.jpg
// is "Settler 10"), and mix .png with .jpg.
//
// A guessed path that misses shows a customer an empty tile with no explanation.
// So these read the folder on disk: a renamed or deleted file fails here, not
// on the page.

import { readdirSync } from "node:fs";
import { LAMINEX_PROFILE_GROUPS, LAMINEX_PROFILES, laminexProfileImageSrc } from "../lib/pcd-laminex-profiles.js";

const PROFILE_ROOT = fileURLToPath(new URL("../public/images/profiles/laminex/", import.meta.url));

test("every Laminex profile points at a file that is really there", () => {
  const missing = [];
  LAMINEX_PROFILE_GROUPS.forEach((group) => {
    const onDisk = new Set(readdirSync(`${PROFILE_ROOT}${group.folder}`));
    group.profiles.forEach((profile) => {
      if (!onDisk.has(profile.file)) missing.push(`${group.label}: ${profile.name} wants ${group.folder}/${profile.file}`);
    });
  });
  assert.deepEqual(missing, [], "a guessed path that misses is an empty tile with no explanation");
});

// The other direction. A photo uploaded and never listed is a profile the
// customer cannot see, which is the failure that is easiest to miss because
// nothing looks broken.
test("no Laminex photo is sitting in the folder unlisted", () => {
  const unlisted = [];
  LAMINEX_PROFILE_GROUPS.forEach((group) => {
    const listed = new Set(group.profiles.map((profile) => profile.file));
    readdirSync(`${PROFILE_ROOT}${group.folder}`).forEach((file) => {
      if (!listed.has(file)) unlisted.push(`${group.folder}/${file}`);
    });
  });
  assert.deepEqual(unlisted, [], "these photos exist and no customer can see them");
});

test("the five groups are named the way Laminex names them", () => {
  assert.deepEqual(
    LAMINEX_PROFILE_GROUPS.map((group) => group.label),
    [
      "Series 1: Flat Face Doors",
      "Series 2: Recessed Handles and Face Routered Doors",
      "Series 3: Pocket Routered Doors",
      "Glazed Door Frames",
      "Drawers & Accessories",
    ],
    "the last two are not called Series in the catalogue"
  );
});

test("every Laminex profile is marked Laminex when its group is given", () => {
  const wrong = LAMINEX_PROFILES.filter((profile) => profileSupplier(profile.name, profile.family) !== "Laminex");
  assert.deepEqual(wrong.map((profile) => profile.name), []);
});

// "Country Square" really is a profile in BOTH ranges. Asked by name alone
// there is no way to tell them apart, so the answer has to be right about the
// data we hold: every profile ever recorded is Polytec, because Laminex has
// never been offered in the quote form. Answering "Laminex" would make the
// pairing rule refuse a Polytec colour on a Polytec door.
test("a name in both ranges resolves to Polytec, which is what the records hold", () => {
  const polytec = new Set(Object.values(PROFILE_NAMES_BY_TYPE).flat());
  const shared = LAMINEX_PROFILES.map((profile) => profile.name).filter((name) => polytec.has(name));
  assert.ok(shared.includes("Country Square"), "this is the clash that exists today");
  shared.forEach((name) => {
    assert.equal(profileSupplier(name), "Polytec", name + " is on records as Polytec");
  });
});

test("passing the group removes the ambiguity entirely", () => {
  assert.equal(profileSupplier("Country Square", "Soft"), "Polytec", "a Polytec family");
  assert.equal(
    profileSupplier("Country Square", "Series 2: Recessed Handles and Face Routered Doors"),
    "Laminex",
    "the finishes page knows the group, so it never has to guess"
  );
});

test("a profile photo can be found by name", () => {
  assert.match(laminexProfileImageSrc("Settler 10"), /settler-10mm\.jpg$/);
  assert.match(laminexProfileImageSrc("settler 10"), /settler-10mm\.jpg$/, "case must not matter");
  assert.equal(laminexProfileImageSrc("Brussels"), null, "a Polytec name is not ours to answer for");
  assert.equal(laminexProfileImageSrc(""), null);
});

test("Laminex still has no edge profiles, which is a fact and not a gap", () => {
  assert.deepEqual(LAMINEX_EDGE_PROFILES, []);
  assert.equal(edgeSupplier("EM1 6mm Pencil Round"), "Polytec");
});

// They are for customers to look at. Offering them in the quote form before the
// pairing rule is wired into it would let somebody pick a Laminex profile for a
// Polytec colour with nothing stopping them.
test("no Laminex GROUP has been added to the quote form lists", () => {
  const quoteFormFamilies = new Set(Object.keys(PROFILE_NAMES_BY_TYPE));
  const leaked = Object.keys(LAMINEX_PROFILE_NAMES_BY_TYPE).filter((group) => quoteFormFamilies.has(group));
  assert.deepEqual(leaked, [], "the pairing rule is not wired into the quote form yet, so they must not be offered there");
});

test("the finishes page lists both ranges", () => {
  assert.match(BROWSER, /LAMINEX_PROFILES/);
  assert.match(BROWSER, /families\.map/, "the family filter has to follow the brand, not stay Polytec only");
});
