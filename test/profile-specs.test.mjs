/*
 * WHAT POLYTEC SAYS, AGAINST WHAT WE MEASURED.
 *
 * lib/pcd-profile-geometry.js holds routed line positions read off the Polytec
 * photographs. lib/pcd-profile-specs.js holds what Polytec publishes about the
 * same doors. Two independent accounts of one set of doors, which is worth far
 * more than either alone: where they agree the measurements are trustworthy,
 * and where they disagree the published number is the door.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  allProfileSpecs,
  hasRoutedFace,
  isFlutedStyle,
  profileBorder,
  profileMinimumSize,
  profileSpec,
} from "../lib/pcd-profile-specs.js";
import { drawableProfileNames, profileGeometry } from "../lib/pcd-profile-geometry.js";

// ── THE TRANSCRIPTION ────────────────────────────────────────────────────────

test("the whole document is here, not a useful-looking half of it", () => {
  const specs = allProfileSpecs();
  assert.equal(specs.length, 162);
  for (const spec of specs) {
    assert.ok(spec.style >= 1 && spec.style <= 6, `${spec.name} has no style`);
    assert.ok(spec.minHeightMm > 0 && spec.minWidthMm > 0, `${spec.name} has no minimum size`);
  }
});

test("a name is found however it is written", () => {
  assert.equal(profileSpec("Mona Vale").style, 2);
  assert.equal(profileSpec("mona vale").style, 2);
  assert.equal(profileSpec("  Calcutta 25  ").style, 4);
  assert.equal(profileSpec("Nothing We Make"), null);
});

// ── STYLE 1 IS A FLAT FACE ───────────────────────────────────────────────────
//
// No rail start, no route width, no route depth: there is nothing routed into
// the face at all. We had measured lines on eight of them, and those lines are
// the EDGE MOULD, which is a shape cut into the edge rather than a line on the
// face. Drawing them put a border on a door that has none, and no amount of
// measuring the photograph could have told us: only the specification could.

test("a minimal door has nothing routed into its face", () => {
  for (const name of ["Brussels", "Guilford", "Hamilton", "Munich", "Napoli", "Paterson", "Sanda", "Softline"]) {
    assert.equal(hasRoutedFace(name), false, `${name} is Style 1`);
    assert.equal(profileGeometry(name), null, `${name} still draws a border`);
    assert.equal(profileBorder(name), null);
  }
});

test("and every other style does have one", () => {
  for (const name of ["Amsterdam", "Yass", "Woongarrah", "Cove 25"]) {
    assert.equal(hasRoutedFace(name), true, name);
  }
});

test("a profile we have never heard of is assumed to have a face", () => {
  // The alternative is drawing a new profile as a blank board, which reads as
  // a bug rather than as a door we know nothing about.
  assert.equal(hasRoutedFace("Something New"), true);
});

// ── THE BORDER COMES FROM THE MANUFACTURER ───────────────────────────────────

test("the border starts at the rail and is as wide as the route", () => {
  assert.deepEqual(profileBorder("Amsterdam"), { outerMm: 60, innerMm: 104 });
  assert.deepEqual(profileBorder("Cambridge"), { outerMm: 60, innerMm: 108 });
});

test("a door with a rail but no published route width gets the one line", () => {
  // Half an answer beats a made up second half.
  assert.deepEqual(profileBorder("Woongarrah"), { outerMm: 60, innerMm: null });
});

test("the drawing uses the published lines, not the ones near them", () => {
  // Atlanta measured a line at 54.9 and Polytec publishes the rail at 60. They
  // are one routed step seen two ways, and drawing both drew it twice.
  const rings = profileGeometry("Atlanta").rings.map((r) => r.mm);
  assert.ok(rings.includes(60), "the published rail start");
  assert.ok(rings.includes(106), "and the published inner edge");
  assert.ok(!rings.some((mm) => mm !== 60 && Math.abs(mm - 60) <= 5), "no ghost beside it");
});

test("a reeded face keeps no border, whatever its rail start says", () => {
  // Bari has a 16mm rail start in the document and is reeded right across the
  // face. Applying the border to it put the frame straight back on the one door
  // the photograph had just proved has none.
  const bari = profileGeometry("Bari");
  assert.deepEqual(bari.rings, []);
  assert.ok(bari.grooveGapMm > 0);
});

test("a reeded PANEL still keeps its border", () => {
  // Calcutta is a framed door with flutes inside the panel. Two different
  // things, and only one of them loses its frame.
  const calcutta = profileGeometry("Calcutta");
  assert.ok(calcutta.rings.length > 0, "it has a frame");
  assert.ok(calcutta.grooveGapMm > 0, "and flutes in the panel");
});

// ── THE TWO ACCOUNTS AGREE ───────────────────────────────────────────────────
//
// This is the test that earns the rest of the geometry table its trust. If our
// photographs and Polytec's document stopped agreeing, one of them changed and
// somebody needs to find out which before anything is drawn from either.

test("our measurements land on the published rail start", () => {
  let compared = 0;
  let agreed = 0;
  for (const name of drawableProfileNames()) {
    const spec = profileSpec(name);
    const geometry = profileGeometry(name);
    if (!spec || !spec.railStartMm || !geometry || !geometry.rings.length) continue;
    compared += 1;
    if (geometry.rings.some((ring) => Math.abs(ring.mm - spec.railStartMm) <= 5)) agreed += 1;
  }
  assert.ok(compared >= 35, `only ${compared} profiles could be compared`);
  assert.equal(agreed, compared, "a profile drifted away from what Polytec publishes");
});

// ── THE MINIMUM SIZES ────────────────────────────────────────────────────────

test("the smallest we can press a profile is the manufacturer's number", () => {
  assert.deepEqual(profileMinimumSize("Cambridge"), { minHeightMm: 256, minWidthMm: 266 });
  assert.deepEqual(profileMinimumSize("Brussels"), { minHeightMm: 35, minWidthMm: 35 });
});

test("a profile we hold no size for says so rather than inventing one", () => {
  // A made up minimum refuses an order we could actually have made.
  assert.equal(profileMinimumSize("Something New"), null);
});

// ── A FLAT FACE AND AN UNDRAWABLE ONE ARE DIFFERENT ANSWERS ─────────────────
//
// Both draw a plain door, and saying the same thing about both is wrong twice.
// A minimal door IS flat, so the drawing is right and "we have no drawing of it
// yet" apologises for getting it exactly right. A cathedral door is one we
// genuinely cannot draw, which is worth saying.

test("a flat face says it is flat, not that we could not draw it", async () => {
  const { faceNote } = await import("../lib/pcd-door-drawing.js");
  const flat = faceNote({ face: "front", profile: "Hamilton" });
  assert.match(flat, /shape on the edge of the door rather than a line on its face/);
  assert.ok(!/no drawing/i.test(flat), "the drawing of a flat door is correct");

  // Federation's photograph is a thumbnail with nothing measurable on it, so it
  // is the case where we genuinely cannot draw the door. The cathedral doors
  // used to be here too and are drawn now.
  const held = faceNote({ face: "front", profile: "Federation" });
  assert.match(held, /no drawing of the Federation profile yet/);
  assert.match(held, /still made to that profile/, "so nobody thinks we lost it");

  assert.match(faceNote({ face: "front", profile: "Amsterdam" }), /routed into this face/);
  assert.match(faceNote({ face: "front", profile: "Cambridge" }), /routed into this face/, "arches draw now");
});

// ── THE PHOTOGRAPH HAS TO BE WHERE THE PHOTOGRAPH IS ────────────────────────
//
// The files moved under profiles/polytec/ when the Laminex range arrived, and
// the quote form kept a private copy of the path that never learned. Every
// profile photo on that page was a broken tile.

test("every page asks one module where a profile photo lives", async () => {
  const { readFileSync } = await import("node:fs");
  const form = readFileSync(
    new URL("../app/(site)/request-quote/RequestQuoteFormClient.js", import.meta.url),
    "utf8"
  );
  assert.match(form, /profileImageSrc as sharedProfileImageSrc/);
  assert.ok(
    !form.includes("`/images/profiles/${assetSlug(profileType)}"),
    "the page is building the path itself again"
  );
});

test("the path it gives is a file that is actually there", async () => {
  const { existsSync } = await import("node:fs");
  const { profileImageSrc, profileImageFallbackSrc } = await import("../lib/pcd-profile-images.js");
  for (const [family, name] of [
    ["Minimal", "Hamilton"],
    ["Sharp", "Bari"],
    ["Soft", "Mona Vale"],
    ["Detailed", "Classic Square"],
  ]) {
    for (const src of [profileImageSrc(family, name), profileImageFallbackSrc(family, name)]) {
      assert.ok(src, `${name} has no path`);
      const file = new URL(`../public${src}`, import.meta.url);
      assert.ok(existsSync(file), `${name}: nothing at ${src}`);
    }
  }
});

test("the fluted styles are named as such", () => {
  for (const name of ["Cove 25", "Cove 50", "Peak"]) assert.equal(isFlutedStyle(name), true, name);
  assert.equal(isFlutedStyle("Amsterdam"), false);
});
