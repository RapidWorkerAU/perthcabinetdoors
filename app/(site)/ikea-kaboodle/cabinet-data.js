// Standard cabinet sizes and the front layouts each one is made in, for the
// public IKEA / Kaboodle configurator.
//
// ─────────────────────────────────────────────────────────────────────────────
// SIZES ARE THE REAL CATALOGUE, NOT CALCULATED.
//
// This file used to hold frame sizes and work the fronts out with arithmetic -
// splitting a frame height into quarters for a drawer stack, 60/40 for a pantry,
// frame width for a Pax door. Almost every size that produced was one nobody
// sells. IKEA and Kaboodle fronts are a fixed catalogue you pick from, so every
// piece below is a size that is genuinely stocked.
//
// Audited 14 Aug 2026 against ikea.com.au and bunnings.com.au. IKEA sizes were
// confirmed by cross-checking five independent front ranges (Veddinge, Bodbyn,
// Askersund, Lerhyttan, Havstorp), so they are the system list rather than one
// range's quirk. Sliding doors are excluded - we do not make them.
//
// Anything not in here is a custom size and goes through /request-quote.
//
// Sizes are NOMINAL, the way IKEA and Bunnings label them. The front we actually
// cut is 3mm smaller each way in both systems.
// ─────────────────────────────────────────────────────────────────────────────
//
// ── PRICING ──────────────────────────────────────────────────────────────────
//
// FLAT ONLY. Flat fronts are decorative board, and every decorative board colour
// now carries a real per-square-metre cost in pcd_colour_library, so a flat
// front can price itself: rate x area, marked up, plus GST, with a floor.
//
// PROFILED FRONTS ARE DELIBERATELY NOT PRICED. Thermolaminate is still $0 in the
// colour library, and a routed profile costs more than the board it is cut from
// in a way the sqm rate knows nothing about. Those go on the list as "Quote" and
// we price them by hand. Do not price them off RATES-style guesswork - put real
// profile prices in first.
//
// The estimate covers THE FRONT ONLY. No hinge drilling, no delivery. The
// configurator never asks how the cabinet is hinged, so there is nothing to
// calculate drilling from, and the page says so rather than quietly under-
// quoting.

// Board cost in the library is ex-GST supplier cost. This is what turns it into
// a number we can show a customer.
export const PUBLIC_MARKUP_PERCENT = 75;
export const GST_RATE = 0.1;

// A front never costs less than this, inc GST, however small it is. Without it a
// 400x100 Metod drawer front prices at about $4 - the sqm rate is a board
// material rate and knows nothing about edging, handling or setting a machine up.
export const MINIMUM_PIECE_PRICE_INC_GST = 35;

// Only these materials price themselves. See the note above before adding to it.
export const PRICED_MATERIAL_KEYS = ["decorative_board"];

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Cost per sqm for a colour library row, falling back to the per-board price
// over the board area the way the admin variation editor does, so a colour with
// only one of the two columns filled in still prices.
//
// A zero here means "not priced yet", which is exactly what $0 means in the
// colour library - all of thermolaminate and compact laminate sit at 0. It is
// never a legitimate free board, so treating it as unpriced is correct.
export function costPerSqmFromRow(row) {
  const perSqm = Number(row?.cost_per_sqm_ex_gst) || 0;
  if (perSqm > 0) return perSqm;

  const perBoard = Number(row?.cost_per_board_ex_gst) || 0;
  const width = Number(row?.preferred_board_width_mm) || 0;
  const height = Number(row?.preferred_board_height_mm) || 0;
  const boardArea = width > 0 && height > 0 ? (width * height) / 1000000 : 0;
  return perBoard > 0 && boardArea > 0 ? roundMoney(perBoard / boardArea) : 0;
}

// Supplier cost -> what the customer sees, per square metre, inc GST.
//
// This runs on the SERVER and only the result is sent to the browser. Sending
// cost_per_sqm_ex_gst to the client would publish our supplier pricing to
// anyone who opens the page source.
export function publicRatePerSqmIncGst(row) {
  const cost = costPerSqmFromRow(row);
  if (cost <= 0) return 0;
  return roundMoney(cost * (1 + PUBLIC_MARKUP_PERCENT / 100) * (1 + GST_RATE));
}

// One front, inc GST, floored at the minimum. ratePerSqm is already marked up
// and GST-inclusive, so the floor compares like with like.
export function piecePriceIncGst(piece, ratePerSqm) {
  const rate = Number(ratePerSqm) || 0;
  if (rate <= 0) return 0;
  const area = ((Number(piece?.width) || 0) / 1000) * ((Number(piece?.height) || 0) / 1000);
  if (area <= 0) return 0;
  return roundMoney(Math.max(area * rate, MINIMUM_PIECE_PRICE_INC_GST));
}

// A whole front layout - a 3-drawer stack is three fronts, each floored
// separately, because each one is a piece we cut, edge and handle.
export function layoutPriceIncGst(layout, ratePerSqm) {
  if (!layout?.pieces?.length) return 0;
  return roundMoney(
    layout.pieces.reduce((total, piece) => total + piecePriceIncGst(piece, ratePerSqm), 0)
  );
}

// The $ tier shown on a profile tile. Presentation only - profiles are not
// priced, so there is no multiplier here any more.
export const PROFILE_TIERS = {
  Minimal: { tier: 1 },
  Soft: { tier: 2 },
  Sharp: { tier: 2 },
  Detailed: { tier: 3 },
  Fluted: { tier: 4 },
};

export const TIER_LABELS = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };

export const SYSTEMS = [
  { id: "metod", name: "IKEA Metod", note: "Kitchen cabinets" },
  { id: "pax", name: "IKEA Pax", note: "Wardrobes" },
  { id: "besta", name: "IKEA Besta", note: "Living room storage" },
  { id: "kaboodle", name: "Kaboodle", note: "Bunnings kitchens" },
];

// ── piece + layout builders ──────────────────────────────────────────────────
//
// `arrangement` tells the tile graphic how the pieces actually sit on the
// cabinet: "columns" for fronts hung side by side, "rows" for a stack, "single"
// for one face. Without it the drawing was guesswork and showed, say, a pair of
// doors stacked when they hang beside each other.

const door = (width, height) => ({ width, height, type: "Door" });
const drawer = (width, height) => ({ width, height, type: "Drawer front" });
const panel = (width, height) => ({ width, height, type: "Panel" });
const L = (name, pieces, arrangement = "single") => ({ name, pieces, arrangement });

// One entry per size we will make, carrying its own real front layouts. Building
// the layouts here rather than deriving them later is the whole point: the sizes
// cannot drift away from what is actually sold.
const size = (width, height, layouts) => ({ width, height, layouts });

// ── METOD ────────────────────────────────────────────────────────────────────
//
// FRAME SIZES re-checked against ikea.com.au on 18 Aug 2026: every base, wall
// and high frame IKEA lists, and nothing else. IKEA names a frame width x DEPTH
// x height in cm, so 60x37x80 and 60x60x80 are two different cabinets at the
// same face size, and base and high frames each come in both depths. There is
// no 450 wide frame in any of the three, and no 1000 wide base.
//
// Real door sizes, all five ranges agreeing:
//   200x800
//   300x600  300x800
//   400x400  400x600  400x800  400x1000  400x1200  400x1400  400x2000
//   450x800
//   600x400  600x600  600x800  600x1000  600x1200  600x1400  600x2000
// There is no 500 wide door and no 800 wide door. An 800 cabinet takes two 400s.
// Nothing is taller than 2000. The 450 door stays on this list because IKEA
// still sells it, but no METOD frame is 450 wide, so it is not offered as a
// frame size below.
//
// Real drawer fronts: 400, 600 and 800 wide at 100, 200 and 400 high. 800 is the
// one width where a drawer front exists and a door does not.

// A base cabinet is 800 high. Every stack has to add to 800 out of 100/200/400,
// and "1 drawer + 1 door" works because 200 + 600 are both real at 400 and 600
// wide.
function metodBaseLayouts(width) {
  const layouts = [];

  if (width === 800) {
    layouts.push(L("2 doors", [door(400, 800), door(400, 800)], "columns"));
  } else {
    layouts.push(L("1 door", [door(width, 800)]));
  }

  // Drawer fronts only exist 400, 600 and 800 wide.
  if (width === 400 || width === 600 || width === 800) {
    layouts.push(L("2 drawers", [drawer(width, 400), drawer(width, 400)], "rows"));
    layouts.push(
      L("3 drawers", [drawer(width, 200), drawer(width, 200), drawer(width, 400)], "rows")
    );
    layouts.push(
      L(
        "4 drawers",
        [drawer(width, 200), drawer(width, 200), drawer(width, 200), drawer(width, 200)],
        "rows"
      )
    );
    // The 100 high front is the shallow cutlery drawer. It only adds to 800
    // paired up, so this is the layout that uses it.
    layouts.push(
      L(
        "4 drawers, shallow top",
        [drawer(width, 100), drawer(width, 100), drawer(width, 200), drawer(width, 400)],
        "rows"
      )
    );
    // Only where the door half is a real size: 400x600 and 600x600 are, and
    // there is no 800 wide door to pair with an 800 wide drawer front.
    if (width !== 800) {
      layouts.push(L("1 drawer + 1 door", [drawer(width, 200), door(width, 600)], "rows"));
    }
  }

  return layouts;
}

// Wall cabinets are fronted with a single door, or two on an 800.
function metodWallLayouts(width, height) {
  if (width === 800) {
    return [L("2 doors", [door(400, height), door(400, height)], "columns")];
  }
  return [L("1 door", [door(width, height)])];
}

// A 2000 high cabinet is one 2000 door or a real pair that adds to 2000. A 2200
// is a pair that adds to 2200, or a 2000 door with a 200 drawer front under it,
// which is how IKEA covers the extra 200.
//
// ORDER MATTERS HERE. A "rows" layout is drawn TOP PIECE FIRST, so the array
// reads down the face of the cabinet. On a tall cabinet each short piece has one
// place it belongs, and it is not wherever it happens to land:
//   800 at the BOTTOM - the joint sits 880 off the floor, the same line as the
//                       base cabinet doors next to it
//   600 at the TOP    - the joint sits at 1480, the same line as the underside
//                       of the wall cabinets
//   200 drawer at the BOTTOM - it is a shallow bottom drawer. It cannot go on
//                       top: a drawer 2000mm off the floor is not one anybody
//                       can open, and there is no 200 high DOOR in the
//                       catalogue to put up there instead.
function metodTallLayouts(width, height) {
  if (width === 800) {
    return [L("2 tall doors", [door(400, 2000), door(400, 2000)], "columns")];
  }

  if (height === 2000) {
    return [
      L("1 tall door", [door(width, 2000)]),
      L("2 doors, 1200 over 800", [door(width, 1200), door(width, 800)], "rows"),
      L("2 doors, 600 over 1400", [door(width, 600), door(width, 1400)], "rows"),
    ];
  }

  return [
    L("2 doors, 1400 over 800", [door(width, 1400), door(width, 800)], "rows"),
    L("Tall door over a drawer", [door(width, 2000), drawer(width, 200)], "rows"),
  ];
}

const metodPanel = (width, height) => size(width, height, [L("Cover panel", [panel(width, height)])]);

// A depth is a different cabinet, not a variation on one, so each depth gets
// its own group. Two frames can share a width and a height, and the tile says
// which depth it is rather than leaving the customer to guess from the heading.
const METOD = [
  {
    group: "Base cabinets, 600 deep",
    note: "800mm high frame, sitting on adjustable legs",
    depth: 600,
    sizeLabel: "mm frame, 600 deep",
    items: [200, 300, 400, 600, 800].map((width) =>
      size(width, 800, metodBaseLayouts(width))
    ),
  },
  {
    group: "Base cabinets, 370 deep",
    note: "The same 800mm high frame, half the depth. Not made 200 wide.",
    depth: 370,
    sizeLabel: "mm frame, 370 deep",
    items: [300, 400, 600, 800].map((width) =>
      size(width, 800, metodBaseLayouts(width))
    ),
  },
  {
    group: "Wall cabinets",
    note: "Four frame heights, all 370 deep",
    depth: 370,
    sizeLabel: "mm frame, 370 deep",
    items: [
      // 400 high starts at 400 wide.
      ...[400, 600, 800].map((width) => size(width, 400, metodWallLayouts(width, 400))),
      // 600 high adds a 300 wide door.
      ...[300, 400, 600, 800].map((width) => size(width, 600, metodWallLayouts(width, 600))),
      // 800 high is the fullest set, and the only height made 200 wide.
      ...[200, 300, 400, 600, 800].map((width) => size(width, 800, metodWallLayouts(width, 800))),
      ...[400, 600, 800].map((width) => size(width, 1000, metodWallLayouts(width, 1000))),
    ],
  },
  {
    group: "High cabinets, 600 deep",
    note: "Pantry and oven housings. The only depth made 2200 high.",
    depth: 600,
    sizeLabel: "mm frame, 600 deep",
    items: [
      ...[400, 600].map((width) => size(width, 2000, metodTallLayouts(width, 2000))),
      ...[400, 600].map((width) => size(width, 2200, metodTallLayouts(width, 2200))),
    ],
  },
  {
    group: "High cabinets, 370 deep",
    note: "2000 high only, and the only tall frame made 800 wide",
    depth: 370,
    sizeLabel: "mm frame, 370 deep",
    items: [400, 600, 800].map((width) => size(width, 2000, metodTallLayouts(width, 2000))),
  },
  {
    group: "Cover panels",
    note: "Sizes vary a little by range, these are the ones most ranges share",
    // A panel is a board, not a carcass. The 3D preview reads depth straight
    // off this, so 18 draws it as the board it is rather than a 560 deep box.
    depth: 18,
    sizeLabel: "mm panel",
    items: [
      metodPanel(390, 860),
      metodPanel(390, 1060),
      metodPanel(390, 2400),
      metodPanel(620, 800),
      metodPanel(620, 2400),
      metodPanel(910, 2440),
    ],
  },
];

// ── PAX ──────────────────────────────────────────────────────────────────────
//
// Hinged doors come in three widths and two heights, full stop:
//   250x1950  250x2290  370x2290  500x1950  500x2290
// The door is only ever the width of the frame on a 500 frame. Door height
// follows frame height: a 2010 frame takes 1950 doors, a 2360 takes 2290.
// We do not offer sliding fronts, so this is hinged doors only.
function paxLayouts(width, frameHeight) {
  const h = frameHeight === 2360 ? 2290 : 1950;

  if (width === 1000) {
    return [L("2 doors", [door(500, h), door(500, h)], "columns")];
  }

  if (width === 750) {
    const layouts = [L("1 wide + 1 narrow door", [door(500, h), door(250, h)], "columns")];
    // The 370 wide door is Bergsbo only, and Bergsbo only makes it at 2290.
    if (h === 2290) {
      layouts.push(L("2 doors, 370 each", [door(370, 2290), door(370, 2290)], "columns"));
    }
    return layouts;
  }

  return [
    L("1 door", [door(500, h)]),
    L("2 narrow doors", [door(250, h), door(250, h)], "columns"),
  ];
}

const PAX = [
  {
    group: "Wardrobe frames",
    note: "Two frame heights, three widths. Hinged doors only.",
    depth: 580,
    items: [
      ...[500, 750, 1000].map((width) => size(width, 2010, paxLayouts(width, 2010))),
      ...[500, 750, 1000].map((width) => size(width, 2360, paxLayouts(width, 2360))),
    ],
  },
];

// ── BESTA ────────────────────────────────────────────────────────────────────
//
// Three front sizes, all 600 wide: 600x260 (drawer front only), 600x380 (door or
// drawer front) and 600x640 (door only). 260 and 380 add to exactly 640, which
// is how a 640 frame becomes a two drawer stack. There is no 1280 high front, so
// the tall frame always takes a stack.
const BESTA = [
  {
    group: "Frames",
    note: "Wall-hung or standing on legs",
    depth: 400,
    items: [
      size(600, 380, [
        L("1 door", [door(600, 380)]),
        L("1 drawer front", [drawer(600, 380)]),
      ]),
      size(600, 640, [
        L("1 door", [door(600, 640)]),
        L("2 drawer fronts", [drawer(600, 260), drawer(600, 380)], "rows"),
      ]),
      size(600, 1280, [
        L("2 doors", [door(600, 640), door(600, 640)], "rows"),
        // Drawers get deeper towards the floor, the same way the 640 frame above
        // stacks 260 over 380.
        L("1 door + 2 drawers", [door(600, 640), drawer(600, 260), drawer(600, 380)], "rows"),
      ]),
      size(1200, 380, [L("2 doors", [door(600, 380), door(600, 380)], "columns")]),
      size(1200, 640, [L("2 doors", [door(600, 640), door(600, 640)], "columns")]),
    ],
  },
];

// ── KABOODLE ─────────────────────────────────────────────────────────────────
//
// Kaboodle is not laid out like Metod and should not be treated as if it were.
// Base and wall cabinets are BOTH 720 high, so they share one door height of
// 717. Doors are named by width alone for exactly that reason.
//
// Drawer panels are not sold as individual sizes, they come as a matched set per
// cabinet. Verified individual panel heights are 287 (1 panel set) and 357 (2
// panel set). The make-up of the 3 and 4 panel sets is arithmetic that fits a
// 717 opening and has NOT been confirmed with Bunnings - see the note on
// KABOODLE_UNCONFIRMED below before relying on those two.
const KABOODLE_DOOR_HEIGHT = 717;
const KABOODLE_PANTRY_DOOR_HEIGHT = 2055;

// Flagged so it is greppable rather than buried in a comment. Confirm the 3 and
// 4 drawer sets against a Bunnings pack before we cut to them.
export const KABOODLE_UNCONFIRMED = ["1 drawer + 1 door", "3 drawers", "4 drawers"];

function kaboodleDoorLayouts(width) {
  if (width === 900) {
    return [L("2 doors", [door(450, KABOODLE_DOOR_HEIGHT), door(450, KABOODLE_DOOR_HEIGHT)], "columns")];
  }
  return [L("1 door", [door(width, KABOODLE_DOOR_HEIGHT)])];
}

function kaboodleBaseLayouts(width) {
  const layouts = kaboodleDoorLayouts(width);

  // Drawer panel sets are made 450, 600 and 900 wide.
  if (width === 450 || width === 600 || width === 900) {
    // A 287 panel on its own left two thirds of a 720 frame with no front on
    // it. The real Kaboodle cabinet is a drawer over a door, so that is what
    // this is now. The 424 door is NOT off a Bunnings pack - it is what is left
    // of the 717 opening under a 287 panel, using the same 3mm gap the 2 panel
    // set leaves. Confirm it before we cut one.
    layouts.push(L("1 drawer + 1 door", [drawer(width, 287), door(width, 424)], "rows"));
    layouts.push(L("2 drawers", [drawer(width, 357), drawer(width, 357)], "rows"));
    layouts.push(L("3 drawers", [drawer(width, 177), drawer(width, 177), drawer(width, 357)], "rows"));
    layouts.push(
      L(
        "4 drawers",
        [drawer(width, 177), drawer(width, 177), drawer(width, 177), drawer(width, 177)],
        "rows"
      )
    );
  }

  return layouts;
}

function kaboodlePantryLayouts(width) {
  if (width === 900) {
    return [
      L(
        "2 pantry doors",
        [door(450, KABOODLE_PANTRY_DOOR_HEIGHT), door(450, KABOODLE_PANTRY_DOOR_HEIGHT)],
        "columns"
      ),
    ];
  }
  return [L("1 pantry door", [door(width, KABOODLE_PANTRY_DOOR_HEIGHT)])];
}

const kaboodlePanel = (width, height) => size(width, height, [L("End panel", [panel(width, height)])]);

const KABOODLE = [
  {
    group: "Base cabinets",
    note: "720mm high frame",
    depth: 560,
    items: [300, 400, 450, 600, 900].map((width) => size(width, 720, kaboodleBaseLayouts(width))),
  },
  {
    group: "Wall cabinets",
    note: "Also 720mm high, so the doors are the same height as the base",
    depth: 320,
    items: [300, 400, 450, 600, 900].map((width) => size(width, 720, kaboodleDoorLayouts(width))),
  },
  {
    group: "Pantry cabinets",
    note: "2345mm finished height, fronted with a 2055mm door",
    depth: 560,
    items: [450, 600, 900].map((width) => size(width, 2345, kaboodlePantryLayouts(width))),
  },
  {
    group: "End and filler panels",
    note: "",
    depth: 18,
    sizeLabel: "mm panel",
    items: [
      kaboodlePanel(320, 720),
      kaboodlePanel(420, 720),
      kaboodlePanel(580, 864),
      kaboodlePanel(650, 2055),
      kaboodlePanel(650, 2200),
      kaboodlePanel(100, 720),
    ],
  },
];

// Frame sizes, grouped the way a customer thinks about their kitchen.
export const CABINETS = {
  metod: METOD,
  pax: PAX,
  besta: BESTA,
  kaboodle: KABOODLE,
};

// Which front layouts a given size is made in. Every layout is now carried on
// the size itself, so this is a lookup rather than the pile of arithmetic it
// used to be. Kept as a function because the whole configurator calls it.
export function frontLayoutsFor(systemId, cabinet) {
  return cabinet?.layouts || [];
}

export const CUSTOM_ITEM_TYPES = [
  "Door",
  "Drawer front",
  "End panel",
  "Floating shelf",
  "Kick or filler",
  // A whole new cabinet is just another thing to quote. It used to be a link
  // off to /kitchen-refresh, which threw away the list the customer had built.
  "New cabinet",
];
