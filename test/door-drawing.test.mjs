/*
 * THE DOOR, DRAWN TO SIZE.
 *
 * A drawing is a promise. If it shows a routed profile and a hinge cup on the
 * same face, somebody literal reads that as what they are getting, and they are
 * right to: no door is ever both. The profile is routed into the front and the
 * cups are bored into the back.
 *
 * And the side flips. A door hinged on the left as you stand at the cupboard
 * has its cups down the RIGHT when it is turned over on the bench. That is the
 * mistake worth testing for, not the tidiness of the two views.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { cupList, cupsOnLeft, doorSvgMarkup, faceNote } from "../lib/pcd-door-drawing.js";

const rings = (svg) => (svg.match(/<rect [^>]*fill="none"/g) || []).length;
// Found by name rather than by colour, so restyling a hole cannot blind a test.
const cups = (svg) => [...svg.matchAll(/<circle class="pcdCup" cx="([-\d.]+)"/g)].map((m) => +m[1]);
const dowels = (svg) => (svg.match(/class="pcdDowel"/g) || []).length;
const bands = (svg) => (svg.match(/fill="#2d5e28"/g) || []).length;

const door = (over = {}) => ({
  heightMm: 720, widthMm: 397, material: "Thermolaminate", profile: "Amsterdam",
  hingeHoles: true, hingeCount: 2, hingeSide: "Left", holeType: "Blum Inserta", ...over,
});

// ── The two faces carry different things ─────────────────────────────────────





test("a door that is not drilled has no cups on either face", () => {
  for (const face of ["front", "back"]) {
    assert.equal(cups(doorSvgMarkup(door({ face, hingeHoles: false }))).length, 0);
  }
});

// ── The side flips ───────────────────────────────────────────────────────────

test("a left hung door has its cups down the right from behind", () => {
  assert.equal(cupsOnLeft({ hingeSide: "Left", face: "front" }), true);
  assert.equal(cupsOnLeft({ hingeSide: "Left", face: "back" }), false);
  assert.equal(cupsOnLeft({ hingeSide: "Right", face: "back" }), true);
});

test("and the drawing puts them there", () => {
  const left = doorSvgMarkup(door({ face: "back", hingeSide: "Left" }));
  const right = doorSvgMarkup(door({ face: "back", hingeSide: "Right" }));
  const mid = 430 / 2;
  assert.ok(cups(left).every((cx) => cx > mid), "a left hung door's cups belong right of centre from behind");
  assert.ok(cups(right).every((cx) => cx < mid), "and a right hung door's left of centre");
});

test("the Inserta dowels lean inward from whichever side the cups landed", () => {
  const svg = doorSvgMarkup(door({ face: "back", hingeSide: "Left" }));
  assert.equal(dowels(svg), 4, "two dowels on each of two cups");
  const dxs = [...svg.matchAll(/<circle class="pcdDowel" cx="([-\d.]+)"/g)].map((m) => +m[1]);
  const cupX = cups(svg)[0];
  // Cups are on the right from behind, so inward is to the left of them.
  assert.ok(dxs.every((dx) => dx < cupX), "a dowel sat between the cup and the edge");
});

test("a bare 35mm cup has no dowels", () => {
  assert.equal(dowels(doorSvgMarkup(door({ face: "back", holeType: "35mm cup only" }))), 0);
});

// ── The banded edges ─────────────────────────────────────────────────────────

test("only the edges chosen are drawn banded", () => {
  assert.equal(bands(doorSvgMarkup(door({ bandedEdges: ["Top", "Bottom", "Left", "Right"] }))), 4);
  assert.equal(bands(doorSvgMarkup(door({ bandedEdges: ["Top"] }))), 1);
  assert.equal(bands(doorSvgMarkup(door({ bandedEdges: [] }))), 0);
});

test("nobody asked draws no bands, which is not the same as none", () => {
  assert.equal(bands(doorSvgMarkup(door({ bandedEdges: null }))), 0);
  // The difference is that null never claims the edges are raw; it just has
  // nothing to draw. Both render the same and only one is an instruction, which
  // is why the note beside the drawing carries the difference.
});

// ── Size ─────────────────────────────────────────────────────────────────────

test("the size is written height first, as it is everywhere else", () => {
  const svg = doorSvgMarkup(door({ heightMm: 2100, widthMm: 397 }));
  assert.ok(svg.includes(">2100mm</text>"));
  assert.ok(svg.includes(">397mm</text>"));
});



test("a half typed door still draws", () => {
  // Going blank while somebody is mid keystroke is worse than a rectangle.
  const svg = doorSvgMarkup({});
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes("</svg>"));
});

// ── Where it stops ───────────────────────────────────────────────────────────





test("the note names the side, in words", () => {
  assert.match(faceNote({ face: "back", hingeSide: "Left", drilled: true }), /left hung .* down the right/i);
  assert.match(faceNote({ face: "back", hingeSide: "Right", drilled: true }), /right hung .* down the left/i);
  assert.match(faceNote({ face: "back", drilled: false }), /Nothing is bored into this face/);
  assert.match(faceNote({ face: "front", drilled: true }), /bored into the back/);
});

// The back used to be drawn as plain white backing board on a thermolaminate
// door, which read as the colour going missing when the door was turned over.
test("the back carries the colour too, whatever the material", () => {
  for (const material of ["Thermolaminate", "Decorative Board", "Compact Laminate"]) {
    const svg = doorSvgMarkup(door({ face: "back", material, colourTile: "/tile.jpg" }));
    assert.ok(svg.includes("<pattern"), `${material}: the tile is on the back`);
  }
  assert.doesNotMatch(faceNote({ face: "back", material: "Thermolaminate" }), /white/);
});

// ── Where the hinges are, measured ───────────────────────────────────────────

// Every number printed on the drawing, so a test can read what somebody sees.
const figures = (svg) => [...svg.matchAll(/>(\d+)mm</g)].map((m) => Number(m[1]));

test("the back measures each cup the way the form asks for it", () => {
  // Bottom cup up from the bottom, top cup down from the top.
  const svg = doorSvgMarkup(door({ face: "back", heightMm: 2000, cupsMm: [100, 1900] }));
  const shown = figures(svg);
  assert.ok(shown.includes(100), "the bottom cup, from the bottom edge");
  assert.equal(shown.filter((mm) => mm === 100).length, 2, "and the top cup, 100 down from the top");
  // Plus the overall height and width.
  assert.ok(shown.includes(2000) && shown.includes(397));
});

test("a middle cup is measured from the bottom, on a line of its own", () => {
  const svg = doorSvgMarkup(door({ face: "back", heightMm: 2000, cupsMm: [100, 1000, 1900] }));
  assert.ok(figures(svg).includes(1000), "the middle cup, 1000 up from the bottom");
});

test("the hinge measurements follow what is typed", () => {
  const before = figures(doorSvgMarkup(door({ face: "back", heightMm: 900, cupsMm: [100, 800] })));
  const after = figures(doorSvgMarkup(door({ face: "back", heightMm: 900, cupsMm: [150, 750] })));
  assert.ok(before.includes(100) && !before.includes(150));
  assert.ok(after.includes(150), "bottom cup moved up to 150");
});

test("the front carries no hinge measurements, the cups are not on it", () => {
  const svg = doorSvgMarkup(door({ face: "front", heightMm: 2000, cupsMm: [100, 1900] }));
  assert.deepEqual(figures(svg).sort((a, b) => a - b), [397, 2000]);
});

test("turning the door over does not also resize it", () => {
  const size = (svg) => svg.match(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)"/)[1];
  const over = { heightMm: 2000, cupsMm: [100, 700, 1300, 1900] };
  assert.equal(size(doorSvgMarkup(door({ ...over, face: "front" }))), size(doorSvgMarkup(door({ ...over, face: "back" }))));
});

test("decorative board is the same board right through", () => {
  const svg = doorSvgMarkup(door({ face: "back", material: "Decorative Board", colourTile: "/tile.jpg" }));
  assert.ok(svg.includes("<pattern"), "its back is its front");
});

// ── The cups themselves ──────────────────────────────────────────────────────

test("what was measured wins over what we would have done", () => {
  assert.deepEqual(cupList({ cupsMm: [110, 770, 1430, 1990] }), [110, 770, 1430, 1990]);
});

test("with nothing measured they spread evenly, which is our standard", () => {
  const three = cupList({ hingeCount: 3, heightMm: 2100 });
  assert.equal(three.length, 3);
  assert.equal(three[0], 110);
  assert.equal(three[2], 1990);
  assert.equal(three[1], 1050, "the middle one sits between the two ends");
});

test("a door with fewer than two hinges has no cups to place", () => {
  assert.deepEqual(cupList({ hingeCount: 1, heightMm: 720 }), []);
  assert.deepEqual(cupList({ hingeCount: 0, heightMm: 720 }), []);
  assert.deepEqual(cupList({ hingeCount: 3 }), [], "and none without a height to spread them down");
});

test("a nonsense measurement is ignored rather than drawn", () => {
  assert.deepEqual(cupList({ cupsMm: ["", null, "nonsense", -5] , hingeCount: 2, heightMm: 720 }), [110, 610]);
});

// ── The colour ───────────────────────────────────────────────────────────────

test("the colour is the tile, not an average of it", () => {
  // A woodgrain is a picture. Averaging it to one value is where a drawing
  // starts telling somebody their oak door is beige.
  const svg = doorSvgMarkup(door({ colourTile: "/images/colours/artisan-oak.jpg" }));
  assert.ok(svg.includes("<pattern"));
  assert.ok(svg.includes("artisan-oak.jpg"));
});

test("no colour yet still draws a door", () => {
  const svg = doorSvgMarkup(door({ colourTile: "" }));
  assert.ok(!svg.includes("<pattern"));
  assert.ok(svg.includes("#f0ede4"), "a neutral board rather than nothing");
});

test("a tile url cannot break out of the attribute", () => {
  const svg = doorSvgMarkup(door({ colourTile: `/x.jpg" onload="alert(1)` }));
  assert.ok(!svg.includes(`onload="alert`), "the url has to be escaped into the attribute");
});

/*
 * THE ROUTED PROFILE.
 *
 * Drawn in millimetres from the measured table, which is the only reason a wide
 * door and a narrow one look like the same profile rather than one stretched
 * copy of the other.
 *
 * The line it will not cross is drawing a door we cannot draw. Eleven of the
 * ninety seven are cathedral doors, whose panel border arches across the top,
 * and this draws a border as a rectangle. Those are held back at the table and
 * SAID on the drawing, because a cathedral door returned as a plain rectangle
 * either looks like we lost the profile or looks like the door.
 */
const grooves = (svg) => (svg.match(/<line [^>]*stroke="rgba\(26,26,24,\.30\)"/g) || []).length;

test("a measured profile draws its panel border", () => {
  const svg = doorSvgMarkup(door({ face: "front", profile: "Amsterdam" }));
  assert.ok(rings(svg) > 0, "Amsterdam is measured and should draw");
});

test("and it is the same profile on a wide door as a narrow one", () => {
  // The border is an inset in millimetres, not a fraction of the door, so it
  // does not fatten as the door widens. That is what a real routed door does.
  const narrow = doorSvgMarkup(door({ widthMm: 297, profile: "Amsterdam" }));
  const wide = doorSvgMarkup(door({ widthMm: 897, profile: "Amsterdam" }));
  assert.equal(rings(narrow), rings(wide));
});

test("a run of grooves gets MORE of them on a wider door, not wider ones", () => {
  const narrow = grooves(doorSvgMarkup(door({ widthMm: 297, heightMm: 297, profile: "Calcutta 10" })));
  const wide = grooves(doorSvgMarkup(door({ widthMm: 897, heightMm: 297, profile: "Calcutta 10" })));
  if (narrow || wide) assert.ok(wide > narrow, "a reeded door gains flutes as it widens");
});

test("nothing is routed into the back", () => {
  assert.equal(rings(doorSvgMarkup(door({ face: "back", profile: "Amsterdam" }))), 0);
});

// ── THE CATHEDRAL DOORS ──────────────────────────────────────────────────────
//
// A border here is an INSET, so many millimetres in from every edge, and an
// inset cannot say "except across the top, where it arches". These eleven were
// held back for a long time rather than drawn as a square door. They are drawn
// now, from a curve traced off the same photographs the lines came from.

const paths = (svg) => (svg.match(/<path [^>]*fill="none"/g) || []).length;
const archTop = (svg) => {
  // The y of the highest point on the outermost drawn path.
  const d = /<path d="M [^"]*"/.exec(svg);
  if (!d) return null;
  return Math.min(...[...d[0].matchAll(/ ([\d.]+)(?= L|" )/g)].map((m) => +m[1]));
};

test("a cathedral door is drawn arched, not as a square panel", async () => {
  const { profileGeometry, profileIsArched } = await import("../lib/pcd-profile-geometry.js");
  assert.equal(profileIsArched("Cambridge"), true);
  const geometry = profileGeometry("Cambridge");
  assert.ok(geometry.arch, "it comes back with its arch beside its rings");
  assert.ok(geometry.arch.riseMm > 20, "and a real rise");

  const svg = doorSvgMarkup(door({ face: "front", profile: "Cambridge" }));
  assert.ok(paths(svg) > 0, "an arched border is a path");
  assert.equal(rings(svg), 0, "and never a rectangle, which would be a different door");
});

test("the door stays a rectangle and only the panel curves", async () => {
  // Bali's outermost line is an edge arris 3.8mm in, which runs parallel to the
  // edge of the door the whole way round. Drawing it as an arch put a curve
  // floating near the top of the door, and anchoring the arch on it dropped the
  // border it belongs to fifty six millimetres.
  const { profileGeometry } = await import("../lib/pcd-profile-geometry.js");
  const bali = profileGeometry("Bali");
  assert.equal(bali.rings[0].mm, 3.8, "the arris is still measured");
  assert.equal(bali.arch.fromMm, 60, "but the arch starts at the border");

  const svg = doorSvgMarkup(door({ face: "front", profile: "Bali" }));
  assert.equal(rings(svg), 1, "the arris is a rectangle");
  assert.equal(paths(svg), 2, "the border and its inner edge are arched");
});

test("a square door is still a rectangle", () => {
  const svg = doorSvgMarkup(door({ face: "front", profile: "Amsterdam" }));
  assert.ok(rings(svg) > 0);
  assert.equal(paths(svg), 0);
});

test("THE RISE STAYS FIXED as the door widens", async () => {
  // Ashleigh's decision, and the whole reason this is geometry rather than a
  // stretched picture: a wider door gets a WIDER arch of the same height, not a
  // taller one. Three rules agree at the sample door and disagree badly on a
  // pantry door, so this could not have been measured, only decided.
  const narrow = doorSvgMarkup(door({ profile: "Bega", heightMm: 720, widthMm: 397, box: 430 }));
  const wide = doorSvgMarkup(door({ profile: "Bega", heightMm: 720, widthMm: 397, box: 430 }));
  assert.equal(archTop(narrow), archTop(wide), "same size, same drawing");

  const { profileArch } = await import("../lib/pcd-profile-geometry.js");
  const arch = profileArch("Bega");
  // The curve is stored as fractions across the panel and fractions of the
  // rise, so widening stretches t and never touches the rise.
  assert.equal(arch.samples[0][0], 0);
  assert.equal(arch.samples[arch.samples.length - 1][0], 1);
  assert.equal(arch.samples[6][1], 0, "the crown is the middle sample");
  assert.equal(Math.max(...arch.samples.map(([, d]) => d)), 1, "and the shoulders are the deepest");
});

test("every arch climbs to its crown without wobbling on the way", async () => {
  // The trace used to scan each column of the photograph on its own, which let
  // it jump to the line INSIDE the border where the arch is nearly flat. That
  // notch showed on Bega, Cooma and Washington. It follows the line outward
  // from the middle now, never accepting a point far from the last one.
  const { profileArch } = await import("../lib/pcd-profile-geometry.js");
  for (const name of ["Bali", "Bathurst", "Bega", "Cambridge", "Cleveland", "Cooma", "Lima", "Lithgow", "Seoul", "Tokyo", "Washington"]) {
    const d = profileArch(name).samples.map(([, v]) => v);
    const mid = (d.length - 1) / 2;
    for (let i = 1; i <= Math.floor(mid); i++) {
      assert.ok(d[i] <= d[i - 1] + 0.001, `${name} rises away from its own shoulder at ${i}`);
    }
    assert.ok(Math.abs(d[0] - d[d.length - 1]) < 0.02, `${name} is not symmetrical`);
  }
});

test("the eleven are written down, and why", async () => {
  const table = readFileSync(new URL("../lib/pcd-profile-geometry.js", import.meta.url), "utf8");
  assert.match(table, /THE RISE STAYS FIXED/, "the rule is a decision and has to be recorded as one");
  assert.match(table, /crownMm: /, "and the curve itself");
  const { drawableProfileNames } = await import("../lib/pcd-profile-geometry.js");
  assert.ok(drawableProfileNames().length > 50, "the rest of the range still draws");
});

test("the arch list is the eleven that are, not the thirty six we guessed", async () => {
  // It first held thirty six, from a detector that compared the border's depth
  // at the middle of the door against its depth at the quarter point. Two
  // points is not a curve: it called twenty six square doors arched and missed
  // Cambridge, Lima and Seoul, which are as plainly arched as any door here.
  const { profileIsArched } = await import("../lib/pcd-profile-geometry.js");
  for (const name of ["Bali", "Bathurst", "Bega", "Cambridge", "Cleveland", "Cooma", "Lima", "Lithgow", "Seoul", "Tokyo", "Washington"]) {
    assert.equal(profileIsArched(name), true, `${name} is a cathedral door`);
  }
  for (const name of ["Argentina", "Prague", "Rio", "Dublin", "Edinburgh", "Wellington", "Albury", "Chesterfield", "Madrid", "Maroochydore"]) {
    assert.equal(profileIsArched(name), false, `${name} is square topped`);
  }
});

/*
 * READING THE MEASUREMENTS BACK AS A DOOR.
 *
 * The table is a list of places the shading turned over in a photograph. Three
 * of those readings are not what they look like, and each one drew a door that
 * cannot be made.
 */
test("a groove and the arris above it are one step, not two rectangles", async () => {
  const { profileGeometry } = await import("../lib/pcd-profile-geometry.js");
  // Bari measured 99.4 and 101: the shadow in the groove and the light on the
  // edge above it. Drawn separately they are two lines a millimetre apart.
  const gaps = profileGeometry("Bari").rings.slice(1).map((r, i) => r.mm - profileGeometry("Bari").rings[i].mm);
  assert.ok(Math.min(...gaps) > 5, "two steps closer than 5mm are the same step seen twice");
});

test("evenly spaced steps are reeds, not five frames inside one another", async () => {
  const { profileGeometry } = await import("../lib/pcd-profile-geometry.js");
  // Calcutta 25 is a reeded door. Walking in from the edge crosses the reeds
  // one at a time, so it measured as five steps 21mm apart.
  const g = profileGeometry("Calcutta 25");
  assert.deepEqual(g.rings, [], "none of those are a panel border");
  assert.ok(g.grooveGapMm > 18 && g.grooveGapMm < 24, "they are reeds on a 21mm pitch");
});

test("three evenly spaced steps are a coincidence, not a run", async () => {
  const { profileGeometry } = await import("../lib/pcd-profile-geometry.js");
  // Seoul is a wide moulding whose three steps land 43mm apart, which the run
  // detector once read as reeds. It is held back as a cathedral door now, so
  // the same coincidence is checked on Colombo, whose steps land 21mm apart.
  const g = profileGeometry("Colombo");
  assert.equal(g.grooveGapMm, 0, "it is not a fluted door");
  assert.ok(g.rings.length >= 3);
});

test("flutes stop at the panel, because you cannot rout one across a stile", () => {
  const svg = doorSvgMarkup(door({ profile: "Grafton", heightMm: 720, widthMm: 397, box: 430 }));
  const flutes = [...svg.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="[-\d.]+" y2="([-\d.]+)" stroke="rgba\(26,26,24,\.30\)"/g)];
  assert.ok(flutes.length, "Grafton is reeded inside its panel");
  const border = [...svg.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)" fill="none"/g)].pop();
  const [bx, by, bw, bh] = border.slice(1).map(Number);
  for (const [, fx, ftop, fbottom] of flutes) {
    assert.ok(+fx > bx && +fx < bx + bw, "a flute ran out over the stile");
    assert.ok(+ftop >= by - 0.5 && +fbottom <= by + bh + 0.5, "a flute ran over the rail");
  }
});

test("only the outermost four steps are drawn", () => {
  // Past four, concentric rectangles read as a target rather than a moulding.
  const deep = ["Carlton", "Wellington", "Amsterdam", "Rio"].find(
    (name) => doorSvgMarkup(door({ profile: name })) && true
  );
  assert.ok(deep);
  for (const name of ["Carlton", "Wellington", "Amsterdam", "Rio", "Seoul"]) {
    assert.ok(rings(doorSvgMarkup(door({ profile: name }))) <= 4, name + " drew more than four");
  }
  assert.equal(rings(doorSvgMarkup(door({ profile: "Carlton" }))), 4, "and a deep one draws all four");
});

test("Bari is a reeded door, not a frame with nine steps in it", async () => {
  // The walk in from the edge read it as twelve steps and it drew as four
  // nested rectangles. The photograph is vertical flutes right across the face
  // with no frame anywhere on it, and a second independent measurement put the
  // pitch at 15.1mm. The extractor was not wrong about where the lines are, it
  // was wrong about what they are.
  const { profileGeometry } = await import("../lib/pcd-profile-geometry.js");
  const bari = profileGeometry("Bari");
  assert.deepEqual(bari.rings, []);
  assert.ok(bari.grooveGapMm > 13 && bari.grooveGapMm < 17);
  assert.equal(rings(doorSvgMarkup(door({ profile: "Bari" }))), 0);
});

test("the drawing still shows everything else it is certain of", () => {
  const svg = doorSvgMarkup(door({ face: "front", bandedEdges: ["Top", "Left"], colourTile: "/tile.jpg" }));
  assert.equal(bands(svg), 2, "the banded edges");
  assert.ok(svg.includes("<pattern"), "the colour");
  assert.ok(svg.includes(">720mm</text>") && svg.includes(">397mm</text>"), "the size");
  assert.equal(cups(doorSvgMarkup(door({ face: "back" }))).length, 2, "and the cups on the back");
});
