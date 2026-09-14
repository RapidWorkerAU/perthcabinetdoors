// WHAT AN ACCESSORY LOOKS LIKE, IN MILLIMETRES.
//
// One description of each accessory's shape, read by the elevation and by the
// 3D view, so the rail a customer is shown from the front and the rail they are
// shown in the room are the same rail. Phase B of the accessories work, decided
// 13 September 2026.
//
// ── WHAT A SHAPE IS ──────────────────────────────────────────────────────────
//
// A list of parts, each a plain box or tube in the cabinet's own millimetres:
//
//   xMm      across the cabinet, 0 at the INSIDE face of the left hand side
//   yMm      up from the bottom of the carcass, the datum heights use
//   zMm      back from the front edge of the carcass
//
// Both views turn that into their own space, so neither holds a measurement of
// its own. Nothing here knows about pixels, cameras or SVG.
//
// ── THE OVAL HANGING RAIL ────────────────────────────────────────────────────
//
// An oval tube spanning the inside of the cabinet with a cup at each end,
// screwed to the side panels, that the tube sits in. Drawn from the photograph
// Ashleigh supplied: a 30mm x 15mm chrome oval, cups a little taller than the
// tube and proud of the side by about a finger's width.

import { accessoryHeightMm, carcassThicknessMm, insideWidthMm } from "./pcd-cabinet-accessories";

/** A chrome oval hanging rail, as the trade sells it. */
export const RAIL = {
  tubeWidthMm: 30,   // across the depth of the cabinet
  tubeHeightMm: 15,  // the flat way, which is what makes it an oval
  cupWidthMm: 12,    // how far the cup stands proud of the side panel
  cupHeightMm: 34,   // the flange, taller than the tube it holds
  cupDepthMm: 42,
};

// ── THE PULL OUT SHOE RAIL ───────────────────────────────────────────────────
//
// TWO SLATTED TRAYS, ONE ABOVE THE OTHER, in dark anthracite. Redrawn 13
// September 2026 from the Finista photograph Ashleigh supplied, which is the
// whole rack rather than a single tray: each tray is a slatted bed between two
// formed side rails, with a low rail across the front and a taller upstand
// across the back for the heels to rest against, and the upper tray is carried
// above and set back on a post at each corner.
//
// EACH TRAY IS A SOLID PANEL, RIBBED. The ribs run across the width, spaced
// front to back, as they do in the photograph, but they are mouldings on a
// closed bed rather than bars with daylight between them: drawn as open bars
// you could see the carcass through the rack, which is not what the product
// looks like. Seen from the front the bed hides behind the front rail, so the
// elevation shows two banded rails and the ribs only read in 3D.
//
// THE UPPER TRAY IS HALF THE DEPTH OF THE LOWER ONE, sitting at the back on a
// post at each corner. That is what leaves the front of the bottom tray open
// from above, so a shoe can be got at rather than posted into a slot.
//
// Its size is the one in the hardware library, because these come in module
// widths and the rack is what it is: the library height is the WHOLE assembly,
// bottom tray to the top of the upper upstand, and the tiers are spaced to fill
// it. Where the row says nothing, it fills the cabinet less the runner room.
export const SHOE_RAIL = {
  tiers: 2,
  sideRailWidthMm: 16,     // the formed side of a tray, seen end on at the front
  sideRailHeightMm: 26,
  bedThicknessMm: 5,       // the closed bed of the tray
  ribDepthMm: 16,          // one rib, measured front to back
  ribHeightMm: 5,          // how proud it stands of the bed
  ribGapMm: 22,            // between ribs
  maxRibs: 20,
  frontRailHeightMm: 26,
  backUpstandMm: 58,       // the raised back of a tray, where a heel sits
  upstandThicknessMm: 7,
  postWidthMm: 10,         // the corner posts carrying the upper tray
  upperDepthFraction: 0.5, // the upper tray, as a share of the rack's depth
  minTierRiseMm: 120,      // a shoe has to fit under it
  defaultHeightMm: 300,
  sideClearanceMm: 12,     // runner either side, when the library gives no width
  depthClearanceMm: 40,
};

// ── THE PULL OUT TROUSER RACK ────────────────────────────────────────────────
//
// A frame on runners with a row of arms running front to back, each one holding
// a pair of trousers. Drawn from the photograph Ashleigh supplied.
//
// SEEN FROM THE FRONT, THE ARMS ARE END ON: what you see is the frame with a
// row of small squares along it. So that is what the elevation draws, and the
// arms only read as arms in the 3D view.
export const TROUSER_RACK = {
  sideRailWidthMm: 14,
  frameHeightMm: 26,
  armWidthMm: 12,
  armThicknessMm: 10,
  armSpacingMm: 62,   // centre to centre, as the photograph has them
  maxArms: 14,
  depthClearanceMm: 40,
  sideClearanceMm: 12,
};

// NOTHING IS DRAWN ON A RACK. There were mock trousers hanging off the trouser
// rack and mock shoes standing on the shoe rack, so each read as what it was at
// a glance. Ashleigh took one look on 13 September 2026: the trousers did not
// look like trousers, and a shape that is nearly a thing is worse than no shape
// at all. Draw the product, and only the product. If contents ever go back on,
// they have to be good enough that nobody has to be told what they are.

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// WHAT EACH FINISH LOOKS LIKE, once, so the elevation and the 3D view show the
// same chrome and the same denim.
const FINISH_COLOURS = {
  chrome: "#b9bec4",
  gunmetal: "#4a4f55",
  // The dark anthracite the shoe rack and the trouser rack are both finished
  // in, which is nearly black in the photographs but reads as a hole at that
  // value on screen.
  anthracite: "#3a3d42",
};

/** The colour of one part, from its finish. */
export function partColour(part = {}) {
  return FINISH_COLOURS[part.finish] || FINISH_COLOURS.chrome;
}

/** Everything on a rack is metal, and takes a highlight in 3D. */
export function partIsMetal(part = {}) {
  return part.finish !== "matt";
}

/** How deep the inside of the cabinet is, front to back board. */
export function insideDepthMm(item = {}) {
  const depth = number(item.depth_mm);
  const back = item?.back_panel_included === false
    ? 0
    : number(item.back_panel_thickness_mm) || carcassThicknessMm(item);
  return Math.max(0, depth - back);
}

/**
 * The parts of one accessory, in the cabinet's own millimetres.
 *
 * Returns [] for a kind we have no drawing for yet, which is how a new kind
 * added to the hardware library behaves until somebody draws it: it is still
 * chosen, still priced and still on the quote, it simply is not pictured.
 */
export function accessoryParts(entry = {}, item = {}) {
  const width = insideWidthMm(item);
  const depth = insideDepthMm(item);
  const y = accessoryHeightMm(entry, item);
  if (!(width > 0)) return [];

  if (entry.type === "wardrobe_hanging_rail") {
    // Centred in the depth, which is where a rail hangs so a coat clears the
    // back and the door both.
    const z = Math.max(RAIL.tubeWidthMm, depth / 2);
    return [
      {
        id: "tube",
        shape: "tube",
        // Into the cups at each end, rather than stopping short of them.
        x0Mm: 0,
        x1Mm: width,
        yMm: y,
        heightMm: RAIL.tubeHeightMm,
        zMm: z,
        depthMm: RAIL.tubeWidthMm,
        finish: "chrome",
      },
      {
        id: "cup-left",
        shape: "plate",
        x0Mm: 0,
        x1Mm: RAIL.cupWidthMm,
        yMm: y,
        heightMm: RAIL.cupHeightMm,
        zMm: z,
        depthMm: RAIL.cupDepthMm,
        finish: "chrome",
      },
      {
        id: "cup-right",
        shape: "plate",
        x0Mm: width - RAIL.cupWidthMm,
        x1Mm: width,
        yMm: y,
        heightMm: RAIL.cupHeightMm,
        zMm: z,
        depthMm: RAIL.cupDepthMm,
        finish: "chrome",
      },
    ];
  }

  if (entry.type === "pull_out_shoe_rail") {
    const size = entry.size || {};
    // The rack we sell, where the library says; otherwise what fits.
    const rackW = Math.min(number(size.width_mm, 0) || Math.max(0, width - SHOE_RAIL.sideClearanceMm * 2), width);
    const rackD = Math.min(number(size.depth_mm, 0) || Math.max(0, depth - SHOE_RAIL.depthClearanceMm), depth);
    if (!(rackW > 0) || !(rackD > 0)) return [];
    // Centred across the cabinet, which is where a rack on runners ends up.
    const x0 = (width - rackW) / 2;
    const x1 = x0 + rackW;

    // THE LIBRARY HEIGHT IS THE WHOLE RACK, bottom tray to the top of the upper
    // upstand, so the rise between the trays is whatever is left over once the
    // upstand is taken off. A row with no height, or one too short for a shoe to
    // fit under the upper tray, falls back to a rise that works.
    const rackH = number(size.height_mm, 0) || SHOE_RAIL.defaultHeightMm;
    const rise = Math.max(SHOE_RAIL.minTierRiseMm, rackH - SHOE_RAIL.backUpstandMm);
    const parts = [];

    for (let tier = 0; tier < SHOE_RAIL.tiers; tier += 1) {
      const tierY = y + rise * tier;
      // The upper tray is half the depth and sits at the BACK, which is what
      // leaves the front of the tray below it open from above.
      const tierD = tier === 0 ? rackD : rackD * SHOE_RAIL.upperDepthFraction;
      const zFront = rackD - tierD;
      const midZ = zFront + tierD / 2;
      const tag = tier === 0 ? "lower" : "upper";

      parts.push(
        // The formed sides, seen end on from the front.
        {
          id: `${tag}-side-left`, shape: "bar",
          x0Mm: x0, x1Mm: x0 + SHOE_RAIL.sideRailWidthMm,
          yMm: tierY + SHOE_RAIL.sideRailHeightMm / 2, heightMm: SHOE_RAIL.sideRailHeightMm,
          zMm: midZ, depthMm: tierD, finish: "anthracite",
        },
        {
          id: `${tag}-side-right`, shape: "bar",
          x0Mm: x1 - SHOE_RAIL.sideRailWidthMm, x1Mm: x1,
          yMm: tierY + SHOE_RAIL.sideRailHeightMm / 2, heightMm: SHOE_RAIL.sideRailHeightMm,
          zMm: midZ, depthMm: tierD, finish: "anthracite",
        },
        // The rail across the front: the band you actually see from the front,
        // and the one thing that stops a shoe sliding off.
        {
          id: `${tag}-front-rail`, shape: "bar",
          x0Mm: x0, x1Mm: x1,
          yMm: tierY + SHOE_RAIL.frontRailHeightMm / 2, heightMm: SHOE_RAIL.frontRailHeightMm,
          zMm: zFront + SHOE_RAIL.upstandThicknessMm / 2, depthMm: SHOE_RAIL.upstandThicknessMm,
          finish: "anthracite",
        },
        // The upstand across the back, taller, for the heels to sit against.
        {
          id: `${tag}-back-upstand`, shape: "bar",
          x0Mm: x0, x1Mm: x1,
          yMm: tierY + SHOE_RAIL.backUpstandMm / 2, heightMm: SHOE_RAIL.backUpstandMm,
          zMm: Math.max(rackD - SHOE_RAIL.upstandThicknessMm / 2, midZ),
          depthMm: SHOE_RAIL.upstandThicknessMm, finish: "anthracite",
        },
        // THE BED, CLOSED. A solid panel between the sides, the full depth of
        // the tray, so the rack is a rack rather than a set of bars you can see
        // the carcass through.
        {
          id: `${tag}-bed`, shape: "bar",
          x0Mm: x0 + SHOE_RAIL.sideRailWidthMm, x1Mm: x1 - SHOE_RAIL.sideRailWidthMm,
          yMm: tierY + SHOE_RAIL.bedThicknessMm / 2, heightMm: SHOE_RAIL.bedThicknessMm,
          zMm: midZ, depthMm: tierD, finish: "anthracite",
        }
      );

      // The ribs moulded across it, front to back at the spacing the photograph
      // has them. As many as fit the depth, so a shallow rack gets fewer rather
      // than squashed ones.
      const bedD = Math.max(0, tierD - SHOE_RAIL.upstandThicknessMm * 2);
      const pitch = SHOE_RAIL.ribDepthMm + SHOE_RAIL.ribGapMm;
      const ribs = Math.max(0, Math.min(SHOE_RAIL.maxRibs, Math.floor(bedD / pitch)));
      for (let i = 0; i < ribs; i += 1) {
        parts.push({
          id: `${tag}-rib-${i}`, shape: "bar",
          x0Mm: x0 + SHOE_RAIL.sideRailWidthMm, x1Mm: x1 - SHOE_RAIL.sideRailWidthMm,
          yMm: tierY + SHOE_RAIL.bedThicknessMm + SHOE_RAIL.ribHeightMm / 2,
          heightMm: SHOE_RAIL.ribHeightMm,
          zMm: zFront + SHOE_RAIL.upstandThicknessMm + (bedD / ribs) * (i + 0.5),
          depthMm: SHOE_RAIL.ribDepthMm, finish: "anthracite",
        });
      }

      // The posts carrying the tray above this one, one at each of ITS corners,
      // which is where the load is: the upper tray is shallower, so a post at
      // the lower tray's front corner would hold up nothing.
      if (tier + 1 < SHOE_RAIL.tiers) {
        const aboveFront = rackD - rackD * SHOE_RAIL.upperDepthFraction;
        [
          ["front", aboveFront + SHOE_RAIL.postWidthMm / 2],
          ["back", Math.max(rackD - SHOE_RAIL.postWidthMm / 2, aboveFront + SHOE_RAIL.postWidthMm)],
        ].forEach(([end, postZ]) => {
          [["left", x0], ["right", x1 - SHOE_RAIL.postWidthMm]].forEach(([side, postX]) => {
            parts.push({
              id: `post-${tier}-${side}-${end}`, shape: "bar",
              x0Mm: postX, x1Mm: postX + SHOE_RAIL.postWidthMm,
              yMm: tierY + rise / 2, heightMm: rise,
              zMm: postZ, depthMm: SHOE_RAIL.postWidthMm, finish: "anthracite",
            });
          });
        });
      }
    }
    return parts;
  }

  if (entry.type === "pull_out_trouser_rack") {
    const size = entry.size || {};
    const rackW = Math.min(number(size.width_mm, 0) || Math.max(0, width - TROUSER_RACK.sideClearanceMm * 2), width);
    const rackD = Math.min(number(size.depth_mm, 0) || Math.max(0, depth - TROUSER_RACK.depthClearanceMm), depth);
    if (!(rackW > 0) || !(rackD > 0)) return [];
    const x0 = (width - rackW) / 2;
    const x1 = x0 + rackW;
    const midZ = rackD / 2;
    // The frame is as deep as the library says it is, within reason: the one in
    // the photograph is a chunky section and a thin line does not read as it.
    const frameH = Math.min(80, Math.max(TROUSER_RACK.frameHeightMm, number(size.height_mm, 0)));
    const frameY = y + frameH / 2;
    const parts = [
      // The frame: a rail down each side on the runners, and one across the
      // front and the back.
      {
        id: "side-left", shape: "bar",
        x0Mm: x0, x1Mm: x0 + TROUSER_RACK.sideRailWidthMm,
        yMm: frameY, heightMm: frameH, zMm: midZ, depthMm: rackD, finish: "gunmetal",
      },
      {
        id: "side-right", shape: "bar",
        x0Mm: x1 - TROUSER_RACK.sideRailWidthMm, x1Mm: x1,
        yMm: frameY, heightMm: frameH, zMm: midZ, depthMm: rackD, finish: "gunmetal",
      },
      {
        id: "front-rail", shape: "bar",
        x0Mm: x0, x1Mm: x1,
        yMm: frameY, heightMm: frameH,
        zMm: frameH / 2, depthMm: frameH, finish: "gunmetal",
      },
      {
        id: "back-rail", shape: "bar",
        x0Mm: x0, x1Mm: x1,
        yMm: frameY, heightMm: frameH,
        zMm: Math.max(rackD - frameH / 2, midZ), depthMm: frameH,
        finish: "gunmetal",
      },
    ];

    // The arms, end on from the front and running back in the room. Spaced as
    // the rack spaces them, however many fit between the side rails.
    const inner0 = x0 + TROUSER_RACK.sideRailWidthMm;
    const inner1 = x1 - TROUSER_RACK.sideRailWidthMm;
    const span = inner1 - inner0;
    const arms = Math.max(0, Math.min(TROUSER_RACK.maxArms, Math.floor(span / TROUSER_RACK.armSpacingMm)));
    const armGap = arms > 0 ? span / (arms + 1) : 0;
    for (let i = 0; i < arms; i += 1) {
      const centre = inner0 + armGap * (i + 1);
      parts.push({
        id: `arm-${i}`, shape: "bar",
        x0Mm: centre - TROUSER_RACK.armWidthMm / 2, x1Mm: centre + TROUSER_RACK.armWidthMm / 2,
        yMm: y + frameH - TROUSER_RACK.armThicknessMm / 2,
        heightMm: TROUSER_RACK.armThicknessMm,
        zMm: midZ, depthMm: rackD - frameH, finish: "gunmetal",
      });
    }

    return parts;
  }

  // ANYTHING ELSE, AS THE SPACE IT TAKES UP.
  //
  // A kind nobody has drawn yet still has a size in the hardware library, and
  // the room it occupies is worth seeing: a hamper is the reason the shelf
  // above it sits where it does. So it is drawn as its own box, plainly, until
  // somebody draws the thing itself.
  //
  // A row with no size at all is still not pictured. Inventing a size for it
  // would put a box in the cabinet that is not the size of anything.
  const size = entry.size || {};
  if (size.width_mm > 0 && size.height_mm > 0 && size.depth_mm > 0) {
    const boxW = Math.min(size.width_mm, width);
    const boxD = Math.min(size.depth_mm, depth);
    const x0 = (width - boxW) / 2;
    return [{
      id: "body",
      shape: "box",
      x0Mm: x0,
      x1Mm: x0 + boxW,
      yMm: y + size.height_mm / 2,
      heightMm: size.height_mm,
      zMm: boxD / 2,
      depthMm: boxD,
      finish: "chrome",
    }];
  }
  return [];
}

/** True when we have a drawing for this kind. */
export function hasAccessoryDrawing(entry = {}) {
  return accessoryParts(entry, { width_mm: 600, height_mm: 2000, depth_mm: 500, carcass_thickness_mm: 16 }).length > 0;
}

/**
 * Every part of every accessory on a cabinet, tagged with the accessory it
 * belongs to so a view can make one draggable as a whole.
 */
export function accessoryDrawing(list = [], item = {}) {
  return (Array.isArray(list) ? list : []).flatMap((entry) =>
    accessoryParts(entry, item).map((part) => ({ ...part, accessoryId: entry.id, type: entry.type }))
  );
}
