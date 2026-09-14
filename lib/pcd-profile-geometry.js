// WHERE THE ROUTED LINES ARE, IN MILLIMETRES.
//
// ── HOW THIS WAS MADE ────────────────────────────────────────────────────────
//
// Measured off the Polytec photographs in public/images/profiles/polytec, not
// traced by hand. A routed step shows up in a photograph as a trough where the
// shadow sits in the groove and a peak where the light catches the arris, so
// walking in from the edge of the door and recording every place the shading
// turns over gives the exact inset of every line.
//
// The photographs are of a 397mm wide sample door, which is the number every
// millimetre below is scaled from.
//
// ── HOW TO READ IT ───────────────────────────────────────────────────────────
//
//   "3.2g 4.8g 6.5a"   three routed steps, at 3.2, 4.8 and 6.5mm in from the
//                      edge of the door. g is a groove, a is an arris.
//   "...|135,61"       and a run of grooves across the face, the first 135mm in
//                      and one every 61mm after it.
//
// Rings and grooves are held apart because they behave differently when the
// door changes size. A ring stays the same distance from the edge however big
// the door is, and a run of grooves keeps its spacing, so a wider door gets
// MORE grooves rather than wider ones. That is what a real door does, and it is
// the whole reason this is a table of millimetres and not a stretched picture.
//
// ── THE CATHEDRAL DOORS ──────────────────────────────────────────────────────
//
// A border here is an INSET: so many millimetres in from every edge. Eleven of
// the ninety seven are cathedral doors, whose border arches across the top, and
// an inset cannot say that. They were held back for a long time rather than
// drawn as a square door, which would have been a different door.
//
// They are drawn now. ARCHES below carries the curve, and a profile that has
// one comes back with it beside its rings so the drawing can bend the top of
// each one instead of squaring it off.
//
// ── ALSO ABSENT ──────────────────────────────────────────────────────────────
//
// Federation, whose file is a 108x140 thumbnail with nothing to measure.
// Kiama, Kunda, Manchester and Vienna, which really are a soft radiused edge
// with no routed line anywhere on the face. And the thirteen with no photograph
// at all: the ten 21mm only Detailed names and the three Fluted ones.

// What Polytec publishes about each profile. Where their numbers and ours
// disagree, theirs win: ours are read off a photograph and theirs are the door.
import { hasRoutedFace, profileBorder } from "./pcd-profile-specs.js";

/* ── THE ELEVEN CATHEDRAL DOORS ─────────────────────────────────────────────
 *
 * Their panel border arches across the top instead of squaring off, and for a
 * long time they were held back rather than drawn as a different door. This is
 * the arch, traced off the same photographs the lines came from.
 *
 * ── HOW TO READ ONE ──────────────────────────────────────────────────────────
 *
 *   crownMm    how far down from the top of the door the peak of the border is
 *   riseMm     how much lower the border sits where it meets the stile than at
 *              the peak, so crownMm + riseMm is the shoulder
 *   samples    the curve between them, as thirteen points. t runs 0 to 1 across
 *              the panel and d runs 0 at the peak to 1 at the shoulder.
 *
 * ── THE RULE, WHICH IS A DECISION AND NOT A MEASUREMENT ──────────────────────
 *
 * THE RISE STAYS FIXED. A wider door gets a wider arch of the same height, not
 * a taller one. Three rules all agree at the sample door and disagree badly on
 * a pantry door, so this could not be measured from one photograph of each: it
 * was settled by Ashleigh, and it is written here because the next person will
 * wonder the same thing.
 *
 * ── THIS LIST WAS WRONG TWICE, AND HOW ───────────────────────────────────────
 *
 * It first held THIRTY SIX, from a detector that compared the border's depth at
 * the middle of the door against its depth at the quarter point. Two points is
 * not a curve. It called twenty six square doors arched, and it missed
 * Cambridge, Lima and Seoul, which are as plainly arched as any door here.
 *
 * These eleven come from walking the border right across the door, throwing
 * away the columns where the scan latched onto something else, and averaging
 * the result against its own mirror so the lighting falloff that makes one side
 * of every photograph look lower cancels out. Then every one of the ninety
 * seven tops was looked at, which is the part that actually settled it.
 *
 * The traced span comes out at 57 to 339mm on a 397mm door, which is Polytec's
 * published 60mm rail start on both sides. Nothing here was told that number.
 */
const ARCHES = {
  "bali": {
    crownMm: 60.1, riseMm: 27.9,
    samples: [[0, 1], [0.083, 1], [0.167, 0.837], [0.25, 0.559], [0.333, 0.24], [0.417, 0.054], [0.5, 0], [0.583, 0.054], [0.667, 0.24], [0.75, 0.559], [0.833, 0.837], [0.917, 1], [1, 1]],
  },
  "bathurst": {
    crownMm: 52.5, riseMm: 33.3,
    samples: [[0, 1], [0.083, 0.818], [0.167, 0.698], [0.25, 0.457], [0.333, 0.197], [0.417, 0.051], [0.5, 0], [0.583, 0.051], [0.667, 0.197], [0.75, 0.457], [0.833, 0.698], [0.917, 0.818], [1, 1]],
  },
  "bega": {
    crownMm: 49.4, riseMm: 36.1,
    samples: [[0, 1], [0.083, 0.773], [0.167, 0.635], [0.25, 0.401], [0.333, 0.172], [0.417, 0.038], [0.5, 0], [0.583, 0.038], [0.667, 0.172], [0.75, 0.401], [0.833, 0.635], [0.917, 0.773], [1, 1]],
  },
  "cambridge": {
    crownMm: 49.4, riseMm: 29.5,
    samples: [[0, 1], [0.083, 0.96], [0.167, 0.792], [0.25, 0.506], [0.333, 0.223], [0.417, 0.06], [0.5, 0], [0.583, 0.06], [0.667, 0.223], [0.75, 0.506], [0.833, 0.792], [0.917, 0.96], [1, 1]],
  },
  "cleveland": {
    crownMm: 50.1, riseMm: 32.4,
    samples: [[0, 1], [0.083, 0.886], [0.167, 0.737], [0.25, 0.486], [0.333, 0.225], [0.417, 0.065], [0.5, 0], [0.583, 0.065], [0.667, 0.225], [0.75, 0.493], [0.833, 0.737], [0.917, 0.886], [1, 1]],
  },
  "cooma": {
    crownMm: 49.4, riseMm: 32.9,
    samples: [[0, 1], [0.083, 0.864], [0.167, 0.708], [0.25, 0.449], [0.333, 0.202], [0.417, 0.063], [0.5, 0], [0.583, 0.063], [0.667, 0.202], [0.75, 0.449], [0.833, 0.708], [0.917, 0.864], [1, 1]],
  },
  "lima": {
    crownMm: 60.3, riseMm: 28.1,
    samples: [[0, 1], [0.083, 1], [0.167, 0.832], [0.25, 0.548], [0.333, 0.237], [0.417, 0.059], [0.5, 0], [0.583, 0.059], [0.667, 0.237], [0.75, 0.548], [0.833, 0.832], [0.917, 1], [1, 1]],
  },
  "lithgow": {
    crownMm: 58.6, riseMm: 28.1,
    samples: [[0, 1], [0.083, 1], [0.167, 0.829], [0.25, 0.547], [0.333, 0.235], [0.417, 0.057], [0.5, 0], [0.583, 0.057], [0.667, 0.235], [0.75, 0.547], [0.833, 0.829], [0.917, 1], [1, 1]],
  },
  "seoul": {
    crownMm: 50.4, riseMm: 29.3,
    samples: [[0, 1], [0.083, 0.945], [0.167, 0.77], [0.25, 0.48], [0.333, 0.2], [0.417, 0.035], [0.5, 0.002], [0.583, 0.035], [0.667, 0.2], [0.75, 0.48], [0.833, 0.77], [0.917, 0.945], [1, 1]],
  },
  "tokyo": {
    crownMm: 49.3, riseMm: 29.6,
    samples: [[0, 1], [0.083, 0.951], [0.167, 0.786], [0.25, 0.502], [0.333, 0.221], [0.417, 0.056], [0.5, 0], [0.583, 0.056], [0.667, 0.221], [0.75, 0.502], [0.833, 0.786], [0.917, 0.951], [1, 1]],
  },
  "washington": {
    crownMm: 50.4, riseMm: 29.4,
    samples: [[0, 1], [0.083, 0.952], [0.167, 0.784], [0.25, 0.494], [0.333, 0.218], [0.417, 0.048], [0.5, 0], [0.583, 0.048], [0.667, 0.218], [0.75, 0.494], [0.833, 0.784], [0.917, 0.952], [1, 1]],
  },
};

const PROFILE_GEOMETRY = {
  "albury": "61.1g 62.7g 74.5a",
  "amsterdam": "3.2g 7a 61.2g 62.8g 74.6a 76.2a 89.1a 92.3g 94.4a",
  "argentina": "55.4a 60.2g 61.9g 64a 69.9g 71.5g 74.8a 76.4a 81.2g 103.3a 104.9a",
  "ascot": "3.2g 4.8g 36a 39.3g 40.9g 43.6a",
  "atlanta": "3.8g 5.9a 54.9a 60.8g 70.5a",
  "auckland": "58.9g 62.1a 63.8a 68.6g 70.2g 72.3a 73.9a 78.8g 82a 83.6a",
  "bali": "3.8g 7a 59.6g 61.2g 62.8a 67.6g 69.2g 88a",
  "ballarat": "3.2g 5.4a 7a 55.4a 59.7g 61.3g 62.9a 69.9g 71.5g 75.3a",
  // CORRECTED BY HAND, against the photograph. The walk in from the edge read
  // Bari as twelve steps and it drew as four nested rectangles. It is a reeded
  // door: vertical flutes right across the face and no frame anywhere on it. A
  // second, independent measurement put the pitch at 15.1mm against a 16mm rail
  // start, which is what the photograph shows and what the name of the route
  // width says. The extractor is not wrong about where the lines are, it is
  // wrong about what they are, which no threshold here could have told it.
  "bari": "|7.5,15.1",
  "bathurst": "3.2g 4.8g 7a 61.6g 63.2g 64.8a 66.4a 68.6g 70.2g 79.3a 83g 85.2a",
  "bayswater": "3.2g 6.4a 8.1a 56.9a 64.5g 66.1g 67.7a 69.3g 73.6a",
  "bega": "59g 60.6g 62.2a 64.4g 66g 67.6a 69.2g 70.8g 74a 83.7a 85.3a 86.9g 88.5a 90.7g 92.8a",
  "beirut": "3.2g 5.4a 55.4a 59.2g 60.8g 62.4a 68.3g 73.2a 75.3g 87.7a",
  "bendigo": "3.8g 5.9a 55.4a 57a 60.2g 62.4a 65.6g 67.2g 70.5a 72.1a 74.2g 79.6a 84.5g 86.6a 88.2a",
  "berrilee": "62.9g 64.6g",
  "berrima": "40.8g 42.4g 62.3g",
  "bowral": "3.8g 7a 59.6g 61.2g 62.9a 68.2g 69.8g 73.6a|122,50",
  "broadway": "59.1g 60.7g 70.9a 72.5a",
  "broome": "3.3g 6.6a 59.5g 61.1g 62.8a 64.4a 68.8g 70.5g 74.3a",
  "brussels": "3.2g 4.8g 6.5a",
  "calcutta": "58.6a 61.2g 65.5a|130,66",
  "calcutta-10": "|4,9",
  "calcutta-25": "16.7g 18.3g 20.4a 22a 37.6g 39.2g 41.9a 59.1g 60.7g 62.9a 64.5a 80g 81.7g 83.8a 85.4a 101g 102.6g 104.8a 106.4a 109.6g",
  "calcutta-35": "|30,33",
  "cambridge": "61.7g 75.6a 83.2g 104.6a 106.2a",
  "cammeray": "51.6a 53.2a 56.4g 58g",
  "carlton": "3.2g 4.8g 6.4a 59.6g 61.2g 62.8a 66.5g 68.1g 76.7a 96.6a 104.1g 106.2a 107.8a",
  "casino": "60.2g 66.1a",
  "chesterfield": "61.8g 70.4a 74.1g",
  "chifley": "8.6g 10.2g",
  "christchurch": "3.2g 6.5a 59.7g 61.3g 62.9a 68.3g 69.9g 73.7a 85a",
  "classic-square": "5.4g 8.1a 59.1g 60.7g 62.3a 65g 70.4a 72a",
  "cleveland": "56.5a 60.2g 62.9a 64.6a 66.7g 72.6a 76.9g 79.1a",
  "colombo": "61.2g 62.8g 75.6a 82.1g 104.6a",
  "cooma": "2.7a 60.6g 62.2g 74.6a",
  "copenhagen": "3.2g 4.8g 7a 56.3a 61.2g 71.4a 73a 75.6g 89.1a",
  "country-square": "5.4g 7.5a 9.1a 58.6g 60.2g 61.8a 64.5g 66.1g 69.8a 71.4a",
  "croydon": "58.6g 60.2g 62.3a 63.9a 113.4g 115g 117.1a 118.7a",
  "dorrigo": "59.1g 60.7g 62.9a 64.5a",
  "dublin": "3.2g 5.9a 7.5a 55.4a 59.2g 61.9a 63.5a 67.8g 69.4g 72.6a 74.2a 78g 83.4a 88.2g 91.4a 93.1a",
  "dural": "2.7g 5.4a 7a 51.6g 55.4a 58.6g 60.8a 65.1g 66.7g 70.5a",
  "edinburgh": "55.9a 57.6a 65.1g 66.7g 68.3a 70.5g 74.2a 75.8a 79.1g",
  "farmhouse": "5.9g 8.6a 59.1g 60.7g 62.3a 64.5g 66.1g 70.4a 72a|135,61",
  "farnborough": "4.8g 7.5a 58.6g 60.2g 61.8a 64.5g 66.1g 70.4a|135,62",
  "gerroa": "|37,9",
  "grafton": "3.2g 5.9a 7.5a 55.3a 56.9a 59.6g 61.2g 62.9a 64.5a 70.4g 72g 75.2a 76.8a|122,50",
  "guilford": "10.8g",
  "hamilton": "21a",
  "hampton": "47.9g 49.5g",
  "hanoi": "57a 59.7g 61.3g 62.9a 64.6a 66.2g 67.8g 72.1a 73.7a 75.8g 77.5g 79.1a",
  "jersey": "78.4g",
  "leon": "60.7g 62.3g 69.3a 70.9a",
  "lima": "3.2g 4.8g 6.4a 55.3a 59.1g 60.7g 62.3a 67.7g 69.3g 72.5a 74.1a 77.9g 83.3a 88.1g 90.8a 92.4a",
  "lismore": "55.3a 61.2g 73.1a",
  "lithgow": "3.2g 4.8g 6.4a 55.9a 57.5a 60.7g 62.9a 66.1g 67.7g 70.9a 72.5a 74.1g 79.5a 84.3g 87a",
  "longreach": "83.1a",
  "macquarie": "3.8g 7a 52.1g 55.9a 65.5g 67.2g 68.8a 74.1g 75.7g 79.5a|126,48",
  "madrid": "31.7g 33.3g 35.4a 37a 51.5g 53.1g 55.3a 56.9a",
  "mallee": "|70,6",
  "manhattan": "77.9g 79.5g 81.7a",
  "maroochydore": "59.6g 61.2g 74.6a",
  "mildura": "3.8g 7a 59.6g 61.2g 62.9a 65g 66.6g 80.6a 82.7g 84.3g 86a",
  "molong": "2.7g 61.2g 62.9g 66.1a 67.7a",
  "mona-vale": "58.6g 60.3g 62.5a 64.2a",
  "monterey": "2.7g 4.3g 6.4a",
  "mudgee": "60.1g 61.7g 64.9a 66.5a 114.3g 115.9g 119.1a",
  "munich": "11.8g 22g",
  "napoli": "12.4g",
  "oberon": "59.6g 61.2g",
  "parkes": "2.7a 58g 59.6g 62.9a 64.5a",
  "paterson": "15g",
  "patonga": "4.3g 6.4a 8.1a 59.6g 61.2g 62.9a 67.2g 76.8a|138,59",
  "portsea": "18.8g",
  "prague": "59.1g 60.7g 62.3a 65g 66.6g 74.1a",
  "preston": "55.3a 56.9a 60.7g 62.3g 68.8a",
  "rio": "55.9a 60.7g 62.9a 65g 67.7a 69.8g 73.6a 75.2a 80g 85.4a 88.6g 91.3a",
  "sanda": "2.7a",
  "seoul": "14g 55.9a 60.7g 62.9a 64.5g 66.1g 67.7a 69.8g 73.6a 75.2a 80g 84.9a 86.5a 88.1g 90.8a 92.4a 100.5g",
  "softline": "20.4g 22.6a",
  "stratford": "59.2g 61.3a 63.5g 67.8a",
  "sussex": "13.4g 15g",
  "swan": "2.7a 61.3g 63.5a 66.2g 67.8g",
  "tamworth": "3.2g 5.9a 7.5a 11.3g 55.3a 61.2g 73.1a|124,50",
  "teralba": "58.5g 60.1g 62.2a 63.8a 113.7g 117.5a",
  "tokyo": "62.1g 72.9a 90a",
  "torino": "2.7a 21.5g 29a 30.6a",
  "valencia": "55.3a 59.6g 61.2g 62.9a 68.2g 69.8g 73.6a 79g 101.5g",
  "valla": "|36,9",
  "washington": "3.8g 7a 57.4a 64.9g 66.5g 68.7a 70.8g 74.6a 76.2a",
  "wellington": "60.1g 61.7g 63.3a 64.9a 71.4g 77.3a 91.2a 98.2g 100.3a 101.9a 106.8g",
  "woongarrah": "3.2g 4.8g 6.5a 55.9a 59.2g 60.8g 62.4a 68.3g 76.4a",
  "yass": "4.3g 6.4a 61.7g 63.3g 64.9a 66.5a 68.7g 70.3g 79.4a 83.2g 85.3a 86.9a",
};

const slug = (name) => String(name || "").trim().toLowerCase().replace(/\s+/g, "-");

/* A groove and the arris above it are the same step. Five millimetres apart is
   comfortably inside one routed step and comfortably outside two. The cluster
   keeps the OUTERMOST measurement, because that is where the step begins. */
const CLUSTER_MM = 5;

/**
 * The routed lines for one profile, or null when there are none we can draw
 * honestly.
 *
 * Null is deliberately the same answer for a missing photograph, an unusable
 * one and a genuinely flat face, because there is one sensible thing to do
 * about all three: draw the door plain and say so.
 *
 * A cathedral door is no longer one of them. It comes back with an ARCH beside
 * its rings, and the drawing bends the top of every one of them to it.
 */
export function profileGeometry(name) {
  const key = slug(name);

  // STYLE 1 IS A FLAT FACE, and the manufacturer says so: no rail start, no
  // route width, no route depth. We had measured lines on eight of them
  // anyway. Those lines are the EDGE MOULD, which is a shape cut into the edge
  // and not a line on the face, and drawing them put a border on a door that
  // has none. Measurement could not have caught this; only the spec could.
  if (!hasRoutedFace(name)) return null;

  const raw = PROFILE_GEOMETRY[key];
  if (!raw) return null;

  const [ringPart, groovePart] = String(raw).split("|");
  const measured = ringPart
    ? ringPart
        .split(" ")
        .filter(Boolean)
        .map((step) => ({ mm: parseFloat(step), kind: step.slice(-1) }))
        .filter((step) => Number.isFinite(step.mm))
    : [];

  let grooveStartMm = 0;
  let grooveGapMm = 0;
  if (groovePart) {
    const [start, gap] = groovePart.split(",");
    grooveStartMm = Number(start) || 0;
    grooveGapMm = Number(gap) || 0;
  }

  // ONE PHYSICAL STEP, NOT ITS TWO SHADOWS.
  //
  // A routed step shows up in the photograph twice: the shadow in the groove
  // and the light on the arris a millimetre or two above it. Both were
  // recorded, which is right, and drawing both is not: it turns a crisp
  // three step door into six rectangles a millimetre apart.
  const rings = clusterSteps(measured, CLUSTER_MM);

  // A REGULAR RUN IS REEDS, NOT A BORDER.
  //
  // Calcutta 25 measured as five steps twenty one millimetres apart, which is
  // not a border with five frames inside it, it is a twenty five millimetre
  // reeded door, and the walk in from the edge crossed the reeds one at a
  // time. Evenly spaced is the tell, and it is the difference between a reeded
  // door and a target.
  const run = evenRun(rings);
  if (run) return { rings: [], grooveStartMm: run.startMm, grooveGapMm: run.gapMm, arch: null };

  // A face that is NOTHING BUT a run of flutes has no border to draw, whatever
  // the table says its rail start is. Bari has a 16mm rail start and is reeded
  // right across, so applying this to it put the frame straight back on the
  // door the photograph had just proved has none. A reeded PANEL, like
  // Calcutta, keeps its border: it has rings as well as a run.
  const reededFace = grooveGapMm > 0 && !rings.length;

  // THE TWO LINES THAT DECIDE THE DOOR, FROM THE MANUFACTURER.
  //
  // The border starts railStartMm in from the edge and is routeWidthMm wide.
  // Those two are published; ours are read off a photograph. Sixty eight of the
  // seventy four we could compare agreed within 5mm, which is why the rest of
  // this table is trusted, but where they differ the published number wins and
  // the six that were further out stop being wrong.
  //
  // Our own measurements keep the detail BETWEEN those two lines, which is the
  // part no table publishes and the part that tells one profile from another.
  const border = reededFace ? null : profileBorder(name);
  if (border) {
    const inner = border.innerMm;
    const published = [border.outerMm, inner].filter((mm) => mm);
    // A measurement within CLUSTER_MM of a published line IS that line, seen
    // through a photograph. Keeping both draws one routed step as two, which is
    // what put a line at 55.9 hard against the published 60 on Seoul.
    const kept = rings.filter((step) => published.every((mm) => Math.abs(step.mm - mm) > CLUSTER_MM));
    const framed = [
      ...kept.filter((step) => step.mm < border.outerMm || !inner || step.mm < inner),
      { mm: border.outerMm, kind: "g" },
      ...(inner ? [{ mm: inner, kind: "a" }] : []),
    ].sort((a, b) => a.mm - b.mm);
    // THE ARCH BELONGS TO THE BORDER, NOT TO THE DOOR.
    //
    // fromMm says where it starts. Everything outside it is the EDGE ARRIS, a
    // line that runs parallel to the edge of the door all the way round and
    // never curves, and everything from it inward follows the arch.
    //
    // Without this the drawing anchored the arch on the outermost line it had,
    // which on Bali is an arris 3.8mm in. So the arris was drawn as an arch
    // floating near the top of the door, and the border it belongs to sat
    // fifty six millimetres too low.
    const arch = ARCHES[key] ? { ...ARCHES[key], fromMm: border.outerMm } : null;
    return { rings: framed, grooveStartMm, grooveGapMm, arch };
  }

  if (!rings.length && !grooveGapMm) return null;
  const arch = ARCHES[key] ? { ...ARCHES[key], fromMm: rings[0] ? rings[0].mm : 0 } : null;
  return { rings, grooveStartMm, grooveGapMm, arch };
}

function clusterSteps(steps, within) {
  const out = [];
  // Each step is measured against the one BEFORE IT, not against the start of
  // the cluster it would join. Measuring from the start splits a chain of four
  // close steps into two arbitrary pairs, which is how a reeded door came out
  // as nine rectangles instead of one run of reeds.
  let prevMm = null;
  for (const step of steps) {
    if (prevMm !== null && step.mm - prevMm <= within) {
      // An arris anywhere in the cluster makes it a lit step, which is what
      // decides how it is drawn.
      if (step.kind === "a") out[out.length - 1].kind = "a";
      prevMm = step.mm;
      continue;
    }
    out.push({ ...step });
    prevMm = step.mm;
  }
  return out;
}

/**
 * Evenly spaced steps, which means the measurement walked across a run of reeds
 * rather than in through a border.
 *
 * Four, not three. Two of anything are evenly spaced by definition, and three
 * are evenly spaced often enough by accident: Seoul is a shaker with a wide
 * moulding whose three steps happen to sit 43mm apart, and three was enough to
 * turn it into a fluted door. Four points spaced the same is a run.
 */
function evenRun(rings) {
  if (rings.length < 4) return null;
  const gaps = rings.slice(1).map((ring, i) => ring.mm - rings[i].mm);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean < 6) return null;
  if (gaps.some((gap) => Math.abs(gap - mean) > mean * 0.15)) return null;
  return { startMm: rings[0].mm, gapMm: mean };
}


/** Does this one's border arch across the top rather than square off? */
export function profileIsArched(name) {
  return Boolean(ARCHES[slug(name)]);
}

/** The arch itself, for anything that wants to draw one. */
export function profileArch(name) {
  return ARCHES[slug(name)] || null;
}

/** Every profile we hold measurements for. */
export function drawableProfileNames() {
  return Object.keys(PROFILE_GEOMETRY);
}
