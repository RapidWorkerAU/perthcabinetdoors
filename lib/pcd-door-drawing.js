// THE DOOR, DRAWN TO SIZE.
//
// A line drawing rather than a photograph, for three reasons a photograph
// cannot answer:
//
//   it is drawn at the size somebody actually typed, so a 900 wide drawer front
//   and a 150 filler look like what they are;
//
//   it can show which edges are banded and where the hinge cups land, which are
//   the two things somebody buying a door needs to check and neither of which a
//   photograph of a sample door will ever show;
//
//   and it costs nothing to load.
//
// The colour is the tile image from the colour library, used as a fill, so a
// woodgrain looks like a woodgrain rather than an average of one.
//
// ── THE ROUTED PROFILE ───────────────────────────────────────────────────────
//
// Drawn from lib/pcd-profile-geometry.js, which holds the inset in millimetres
// of every routed line, measured off the Polytec photographs. Because they are
// millimetres and not a stretched picture, a wide door gets the same border as
// a narrow one and MORE grooves across it rather than wider ones, which is what
// a real door does.
//
// The two lines that decide the door, the outer edge of the routed border and
// the inner edge of it, come from Polytec's own published rail start and route
// width rather than from a photograph. Our measurements keep the detail between
// them.
//
// ELEVEN of the ninety seven are cathedral doors, whose border arches across
// the top, and this draws a border as a rectangle: so those are held back at
// the table rather than drawn wrong, and say on the drawing that we have no
// drawing for them and that the door is still made to that profile. When the
// arch is modelled the table lights them up and nothing here changes.
//
// A Style 1 door is held back for the opposite reason: nothing is routed into
// its face at all, so the plain drawing is right and the note says so.
//
// The photograph sits beside the drawing either way. It is exactly right for
// all ninety seven, and the drawing carries what it cannot: this door at this
// size, in this colour, with these edges banded and the cups where they land.
//
// ── FRONT AND BACK ARE NOT THE SAME FACE ─────────────────────────────────────
//
// The profile is routed into the FRONT. The cups are bored into the BACK. No
// door is ever both, and drawing them together is a promise we would have to
// break. Worse, the side flips: a door hinged on the left as you stand at the
// cupboard has its cups down the RIGHT when it is turned over on the bench.
//
// Pure, and returns markup rather than elements, so it can be tested without a
// browser and rendered by anything.

import { profileGeometry } from "./pcd-profile-geometry.js";
import { hasRoutedFace } from "./pcd-profile-specs.js";

const BOARD_STROKE = "rgba(26,26,24,.35)";
const GROOVE_STROKE = "rgba(26,26,24,.30)";
const ARRIS_STROKE = "rgba(255,255,255,.42)";
const DIM_STROKE = "rgba(26,26,24,.45)";
// The hinge dimensions, in the site's green so they read as a different set
// of numbers from the overall size.
const CUP_DIM_STROKE = "#2d5e28";
// The holes, light with a dark ring: one of the two always contrasts with the
// board, whatever colour it is.
const HOLE_FILL = "#ffffff";
const HOLE_RING = "#1a1a18";
const BAND_FILL = "#2d5e28";
const BLANK_FILL = "#f0ede4";

// A routed step narrower than this on screen is a smudge, not a line. Drawing
// it anyway is how a crisp two step profile turns into a grey haze.
const FINEST_VISIBLE_PX = 1.6;
// The innermost line has to leave a panel behind it. A ring that has eaten the
// whole face is a door with no panel, which is not what anybody ordered.
const RING_CLEARANCE_PX = 10;
// Past four, concentric rectangles stop reading as a moulding and start reading
// as a target. The outermost win: they are the ones somebody sees from across a
// kitchen, and the inner ones are the fine detail the photograph is there for.
const MAX_DRAWN_RINGS = 4;
// How far apart the hinge dimension lines sit, one lane per middle cup.
const CUP_LANE_PX = 20;

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Which side the cups are on, as you are looking at this face. */
export function cupsOnLeft({ hingeSide, face }) {
  const hungLeft = String(hingeSide || "").toLowerCase().startsWith("l");
  // Turned over on the bench, a left hung door has its cups down the right.
  return face === "back" ? !hungLeft : hungLeft;
}

/**
 * The drawing, as an svg string.
 *
 * Everything is optional. A door with no colour, no profile and no size still
 * draws: it is the shape somebody is part way through describing, and going
 * blank while they type is worse than a rectangle.
 */
export function doorSvgMarkup({
  heightMm,
  widthMm,
  face = "front",
  colourTile = "",
  colourName = "",
  material = "",
  profile = "",
  bandedEdges = null,
  hingeHoles = false,
  hingeCount = 0,
  cupsMm = [],
  hingeSide = "",
  holeType = "",
  box = 430,
  id = "door",
} = {}) {
  const h = num(heightMm, 720);
  const w = num(widthMm, 397);
  // Where the cups land, worked out before the door is sized: each middle cup
  // gets its own dimension line out to the side, and they need room. Worked out
  // for BOTH faces, so flipping the door over does not also resize it.
  const cupsForSize = hingeHoles ? cupList({ cupsMm, hingeCount, heightMm: h }) : [];
  const middleCount = Math.max(0, cupsForSize.length - 2);
  const padY = 58;
  const padX = Math.max(58, 42 + middleCount * CUP_LANE_PX);
  const scale = Math.min((box - padX * 2) / w, (box - padY * 2) / h);
  const dw = w * scale;
  const dh = h * scale;
  const x = (box - dw) / 2;
  const y = (box - dh) / 2;

  const onBack = face === "back";
  const patternId = `${id}-tile`;

  let out = `<svg viewBox="0 0 ${box} ${box}" class="pcdDoorSvg" role="img" aria-label="${esc(
    `${h} by ${w} millimetre ${colourName || "door"}, ${onBack ? "back" : "front"}`
  )}">`;

  // The colour, as the actual tile from the library. A woodgrain is a picture,
  // not a value, and averaging it to one colour is how a drawing starts lying.
  //
  // On both faces. The back used to be drawn as plain white backing board on a
  // thermolaminate door, and a colour on one side and white on the other read
  // as the colour having gone missing when the door was turned over.
  const showTile = Boolean(colourTile);
  if (showTile) {
    out +=
      `<defs><pattern id="${patternId}" patternUnits="userSpaceOnUse" x="${x}" y="${y}" ` +
      `width="${Math.max(24, dw)}" height="${Math.max(24, dh)}">` +
      `<image href="${esc(colourTile)}" x="0" y="0" width="${Math.max(24, dw)}" height="${Math.max(24, dh)}" ` +
      `preserveAspectRatio="xMidYMid slice"/></pattern></defs>`;
  }

  const fill = showTile ? `url(#${patternId})` : BLANK_FILL;
  out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${dw.toFixed(1)}" height="${dh.toFixed(
    1
  )}" fill="${fill}" stroke="${BOARD_STROKE}" stroke-width="1"/>`;

  // THE ROUTED PROFILE. Front only, from the measured table, and in millimetres
  // so it holds its shape at any size. Nothing is drawn for a profile we cannot
  // draw honestly: the note under the drawing says so in words instead.
  const geometry = onBack ? null : profileGeometry(profile);
  if (geometry) {
    // The rings, outermost first, each one a rectangle set in from the edge of
    // the door by its own measurement.
    let drawn = 0;
    let lastMm = null;
    for (const step of geometry.rings) {
      if (drawn >= MAX_DRAWN_RINGS) break;
      const inset = step.mm * scale;
      const rw = dw - inset * 2;
      const rh = dh - inset * 2;
      if (rw < RING_CLEARANCE_PX || rh < RING_CLEARANCE_PX) break;
      // Against the last one DRAWN, not the last one looked at. Measuring from
      // a step we skipped lets a run of fine steps through one at a time, each
      // close enough to its neighbour to be invisible and the run of them thick
      // enough to look like a target.
      if (lastMm !== null && (step.mm - lastMm) * scale < FINEST_VISIBLE_PX) continue;
      // A groove is a shadow and an arris is the light caught on the edge above
      // it, which is the whole reason a routed face reads as depth rather than
      // as lines ruled on a flat board.
      const stroke = step.kind === "a" ? ARRIS_STROKE : GROOVE_STROKE;
      // Only the BORDER arches. A line outside it is the edge arris, which runs
      // parallel to the edge of the door the whole way round: the door is a
      // rectangle and stays one, and it is the routed panel inside it that
      // curves.
      const arch = geometry.arch && step.mm >= geometry.arch.fromMm ? geometry.arch : null;
      if (arch) {
        // A CATHEDRAL DOOR. Square on three sides and arched across the top,
        // so it is a path rather than a rectangle.
        //
        // Each ring inside the outer one is the same curve pushed DOWN by how
        // far in it sits, which is what a router following the first line does.
        // The arch stretches across whatever width the door is and its rise
        // does not change with it: a wider door gets a wider arch of the same
        // height. That is a decision rather than a measurement, and it is
        // written down beside the curve in lib/pcd-profile-geometry.js.
        const off = (step.mm - arch.fromMm) * scale;
        const x0 = x + inset;
        const x1 = x + dw - inset;
        const crownY = y + arch.crownMm * scale + off;
        const riseY = arch.riseMm * scale;
        const curve = arch.samples
          .map(([t, d]) => `${(x0 + t * (x1 - x0)).toFixed(1)} ${(crownY + d * riseY).toFixed(1)}`)
          .join(" L ");
        out +=
          `<path d="M ${x0.toFixed(1)} ${(y + dh - inset).toFixed(1)} L ${curve} L ${x1.toFixed(1)} ` +
          `${(y + dh - inset).toFixed(1)} Z" fill="none" stroke="${stroke}" stroke-width="1"/>`;
      } else {
        out +=
          `<rect x="${(x + inset).toFixed(1)}" y="${(y + inset).toFixed(1)}" width="${rw.toFixed(
            1
          )}" height="${rh.toFixed(1)}" fill="none" ` +
          `stroke="${stroke}" stroke-width="1"/>`;
      }
      drawn += 1;
      lastMm = step.mm;
    }

    // The run of grooves, on their measured spacing. They keep their gap and
    // the door gets MORE of them as it widens, which is what a reeded door
    // does and the whole reason this is millimetres and not a stretched image.
    //
    // They stop at the panel. You cannot rout a flute across a stile, and
    // running them over the border was drawing a door that cannot be made.
    if (geometry.grooveGapMm > 0) {
      const gap = geometry.grooveGapMm * scale;
      if (gap >= FINEST_VISIBLE_PX) {
        const panel = lastMm === null ? 0 : lastMm * scale;
        const top = y + panel;
        const bottom = y + dh - panel;
        for (let mm = geometry.grooveStartMm; mm < w; mm += geometry.grooveGapMm) {
          const gx = x + mm * scale;
          if (gx <= x + panel + 1 || gx >= x + dw - panel - 1) continue;
          out +=
            `<line x1="${gx.toFixed(1)}" y1="${top.toFixed(1)}" x2="${gx.toFixed(1)}" y2="${bottom.toFixed(
              1
            )}" stroke="${GROOVE_STROKE}" stroke-width="1"/>`;
        }
      }
    }
  }

  // THE BANDED EDGES. Only the ones chosen, because the whole reason they are
  // asked one at a time is so the drawing can show exactly what the bench will
  // do. Null means nobody was asked, which is not the same as none.
  if (Array.isArray(bandedEdges)) {
    const t = Math.max(2.5, Math.min(4, dw * 0.012));
    const bands = {
      Top: [x, y, dw, t],
      Bottom: [x, y + dh - t, dw, t],
      Left: [x, y, t, dh],
      Right: [x + dw - t, y, t, dh],
    };
    for (const edge of Object.keys(bands)) {
      if (!bandedEdges.includes(edge)) continue;
      const [bx, by, bw, bh] = bands[edge];
      out += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(
        1
      )}" fill="${BAND_FILL}" opacity=".8"/>`;
    }
  }

  // THE CUPS. Back only, on the side they land on when it is turned over.
  const cups = onBack ? cupsForSize : [];
  const left = cupsOnLeft({ hingeSide, face });
  const cupX = left ? x + Math.min(15, dw * 0.13) : x + dw - Math.min(15, dw * 0.13);
  const cupR = Math.max(3.4, Math.min(7.5, dw * 0.032));
  if (cups.length) {
    for (const mm of cups) {
      const cy = y + dh - mm * scale;
      // A light hole with a dark ring, so it reads on any board from white to
      // black. It used to be a faint dark tint, which vanished on a dark board.
      out +=
        `<circle class="pcdCup" cx="${cupX.toFixed(1)}" cy="${cy.toFixed(1)}" r="${cupR.toFixed(1)}" ` +
        `fill="${HOLE_FILL}" stroke="${HOLE_RING}" stroke-width="1.2"/>`;
      // The two dowels either side of the cup, on 45mm centres and 9.5mm off
      // the centreline, which is what makes it an Inserta boring rather than a
      // bare 35mm cup. Both measurements run the way the door does.
      if (String(holeType).toLowerCase().includes("inserta")) {
        const dx = cupX + (left ? 1 : -1) * 9.5 * scale;
        for (const side of [-1, 1]) {
          out +=
            `<circle class="pcdDowel" cx="${dx.toFixed(1)}" cy="${(cy + side * 22.5 * scale).toFixed(1)}" ` +
            `r="${Math.max(1.6, cupR * 0.32).toFixed(1)}" fill="${HOLE_FILL}" stroke="${HOLE_RING}" stroke-width=".9"/>`;
        }
      }
    }
  }

  // The measurements, written height first, the way a size is written
  // everywhere else here.
  //
  // The overall height goes on the side AWAY from the cups, so the hinge
  // dimensions below have that side to themselves.
  const heightOnRight = cups.length > 0 && left;
  out += `<g stroke="${DIM_STROKE}" fill="${DIM_STROKE}" font-size="12" font-family="Arial, sans-serif">`;
  out += verticalDimension({
    lineX: heightOnRight ? x + dw + 24 : x - 24,
    outward: heightOnRight ? 1 : -1,
    fromY: y,
    toY: y + dh,
    label: `${h}mm`,
  });
  out +=
    `<line x1="${x}" y1="${y + dh + 24}" x2="${x + dw}" y2="${y + dh + 24}" stroke-width="1"/>` +
    `<line x1="${x}" y1="${y + dh + 19}" x2="${x}" y2="${y + dh + 29}" stroke-width="1"/>` +
    `<line x1="${x + dw}" y1="${y + dh + 19}" x2="${x + dw}" y2="${y + dh + 29}" stroke-width="1"/>` +
    `<text x="${x + dw / 2}" y="${y + dh + 43}" text-anchor="middle" stroke="none">${w}mm</text></g>`;

  // THE HINGE POSITIONS, to the centre of each cup, drawn from the same numbers
  // the form sends so they move as the fields are typed in.
  //
  // Measured the way the form asks for them: the bottom cup up from the bottom
  // edge, the top cup down from the top edge, and any middle cup up from the
  // bottom. Each middle cup gets its own line further out, because two
  // measurements sharing a line from the same edge cannot be told apart.
  if (cups.length) {
    const outward = left ? -1 : 1;
    const edgeX = left ? x : x + dw;
    const sorted = [...cups].sort((a, b) => a - b);
    const marks = sorted.map((mm, index) => {
      const isTop = sorted.length >= 2 && index === sorted.length - 1;
      const isBottom = index === 0;
      return {
        cupY: y + dh - mm * scale,
        fromTop: isTop,
        lane: isTop || isBottom ? 0 : index,
        label: `${Math.round(isTop ? h - mm : mm)}mm`,
      };
    });
    out += `<g stroke="${CUP_DIM_STROKE}" fill="${CUP_DIM_STROKE}" font-size="11" font-family="Arial, sans-serif">`;
    for (const mark of marks) {
      const lineX = edgeX + outward * (22 + mark.lane * CUP_LANE_PX);
      // A leader from the cup out to its dimension line, so it is clear which
      // cup a number belongs to once there are three or four of them. It starts
      // at the edge of the hole rather than its centre, and runs over a light
      // underlay, so the part crossing the board still shows on a dark one.
      const startX = cupX + outward * cupR;
      const endX = lineX + outward * 5;
      out +=
        `<line x1="${startX.toFixed(1)}" y1="${mark.cupY.toFixed(1)}" x2="${endX.toFixed(1)}" ` +
        `y2="${mark.cupY.toFixed(1)}" stroke="${HOLE_FILL}" stroke-width="2.6" stroke-opacity=".85"/>` +
        `<line x1="${startX.toFixed(1)}" y1="${mark.cupY.toFixed(1)}" x2="${endX.toFixed(1)}" ` +
        `y2="${mark.cupY.toFixed(1)}" stroke-width=".9" stroke-dasharray="2 2"/>`;
      out += verticalDimension({
        lineX,
        outward,
        fromY: mark.fromTop ? y : mark.cupY,
        toY: mark.fromTop ? mark.cupY : y + dh,
        label: mark.label,
        // A 100mm measurement on a pantry door is shorter than its own label.
        // Written across the ticks it is unreadable, so a figure that will not
        // fit moves to just past the cup, towards the middle of the door, where
        // nothing else is drawn on that line.
        overflowPast: mark.fromTop ? "to" : "from",
      });
    }
    out += `</g>`;
  }

  return `${out}</svg>`;
}

// One vertical dimension: the line, a tick at each end and the figure turned to
// run along it, set on the outside of the line so it never sits on the door.
//
// `overflowPast` names the end a figure moves beyond when the line is too short
// to hold it: "from" is the upper end, "to" the lower. The text is turned to
// read bottom to top, so "start" runs it upward from its point and "end" runs
// it downward to it.
function verticalDimension({ lineX, outward, fromY, toY, label, overflowPast = null }) {
  const textX = lineX + outward * 8;
  const span = Math.abs(toY - fromY);
  const fits = span >= String(label).length * 6.4 + 8;
  let textY = (fromY + toY) / 2;
  let anchor = "middle";
  if (!fits && overflowPast === "from") { textY = fromY - 4; anchor = "start"; }
  if (!fits && overflowPast === "to") { textY = toY + 4; anchor = "end"; }
  return (
    `<line x1="${lineX.toFixed(1)}" y1="${fromY.toFixed(1)}" x2="${lineX.toFixed(1)}" y2="${toY.toFixed(1)}" stroke-width="1"/>` +
    `<line x1="${(lineX - 5).toFixed(1)}" y1="${fromY.toFixed(1)}" x2="${(lineX + 5).toFixed(1)}" y2="${fromY.toFixed(1)}" stroke-width="1"/>` +
    `<line x1="${(lineX - 5).toFixed(1)}" y1="${toY.toFixed(1)}" x2="${(lineX + 5).toFixed(1)}" y2="${toY.toFixed(1)}" stroke-width="1"/>` +
    `<text x="${textX.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" stroke="none" ` +
    `transform="rotate(-90 ${textX.toFixed(1)} ${textY.toFixed(1)})">${esc(label)}</text>`
  );
}

/**
 * Where the cups sit, measured up from the bottom.
 *
 * What was measured wins. Where nothing was, they are spread evenly, which is
 * what "our standard positions" means and what almost every door wants.
 */
export function cupList({ cupsMm = [], hingeCount = 0, heightMm = 0 }) {
  const measured = (Array.isArray(cupsMm) ? cupsMm : [])
    .map((mm) => Number(mm))
    .filter((mm) => Number.isFinite(mm) && mm > 0);
  if (measured.length) return measured;

  const n = Math.max(0, Math.round(Number(hingeCount) || 0));
  const h = num(heightMm, 0);
  if (n < 2 || !h) return [];
  const bottom = 110;
  const top = Math.max(bottom + 60, h - 110);
  if (n === 2) return [bottom, top];
  const gap = (top - bottom) / (n - 1);
  return Array.from({ length: n }, (unused, i) => Math.round(bottom + gap * i));
}

/**
 * What the drawing is showing, in words, and where it stops.
 *
 * Said rather than left to be worked out, because the two faces carry different
 * things and somebody who does not know that reads the front as the whole door.
 */
export function faceNote({ face = "front", hingeSide = "", drilled = false, profile = "" }) {
  if (face === "back") {
    const parts = ["The back, as it sits on the bench."];
    if (drilled) {
      const hungLeft = String(hingeSide || "").toLowerCase().startsWith("l");
      parts.push(
        hingeSide
          ? `A ${hungLeft ? "left" : "right"} hung door has its cups down the ${hungLeft ? "right" : "left"} from behind.`
          : "The cups are bored into this face."
      );
    } else {
      parts.push("Nothing is bored into this face.");
    }
    return parts.join(" ");
  }

  const parts = ["The face you look at."];
  if (drilled) parts.push("The hinge cups are bored into the back, so they are not on this side.");
  // A profile we hold back is SAID rather than quietly left off. Somebody who
  // picked a cathedral door and got a plain rectangle back would reasonably
  // think we had lost it, and somebody who did not notice would think that was
  // the door. Both are worse than one honest line.
  //
  // THERE ARE TWO REASONS A DOOR DRAWS PLAIN AND THEY ARE NOT THE SAME REASON.
  // A minimal door is FLAT: nothing is routed into its face, the drawing is
  // right, and telling somebody we have no drawing of it yet would be
  // apologising for getting it exactly right. The other reason is that we
  // genuinely cannot draw it, which is worth saying.
  if (profile) {
    if (!hasRoutedFace(profile)) {
      parts.push(
        `The ${profile} profile is a shape on the edge of the door rather than a line on its face, so the face is flat. The photograph beside this shows the edge.`
      );
    } else if (profileGeometry(profile)) {
      parts.push(`The ${profile} profile is routed into this face.`);
    } else {
      parts.push(
        `We have no drawing of the ${profile} profile yet. It is still made to that profile, and the photograph beside this is it.`
      );
    }
  }
  return parts.join(" ");
}
