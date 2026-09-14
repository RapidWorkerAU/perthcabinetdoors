// THE WEB SHOP, WRITTEN DOWN ONCE.
//
// What the shop sells, what it will make, what a line in the cart says, and
// what a line has to answer before it can be paid for. Read by the product
// page, the cart, the checkout, the server that prices and charges, and the
// confirmation email, so none of them can come to a different answer.
//
// Pure, and safe in the browser: nothing here knows a cost. Prices are worked
// out on the server by lib/pcd-shop-pricing.js, from the same functions the
// quote editor prices with. See the "Two Paths, One Website" plan, decided
// 8 and 11 September 2026.
//
// ── A SHOP LINE IS A QUOTE BUILDER LINE ──────────────────────────────────────
//
// Same fields, same names, same meaning: type, panelUse, material, thickness,
// finish, colour, colourLibraryId, height, width, qty, bandedEdges, preDrill,
// holeType, hingeQty, hingeSide and the hinge positions. So the shared step
// components draw it, the door drawing draws it, and "move this to my quote
// list" is handing the same object across. The shop adds only what a quote
// list never asks: which product page it came from, and the hinges we supply.

import { validateDetail } from "./pcd-contact-details";
import { BANDED_EDGES, PANEL_USES } from "./pcd-line-details";
import { hingeCount, hingePositionLines, hingeProblems, hingesForHeight } from "./pcd-hinges";

// WHAT THE SHOP MARKS UP AT, WHICH IS NOT WHAT A QUOTE MARKS UP AT.
//
// A quoted job is priced by hand and can be looked at before it goes out. A
// door bought off the website is priced by a machine, paid for on the spot and
// posted, and it carries costs a quoted job spreads over a whole kitchen:
// packing one piece, wrapping it, getting it onto a run, and the card fee on a
// small transaction. This rate is where that difference lives.
//
// IT IS NOT A BUSINESS DEFAULT AND MUST NOT BECOME ONE. Business Defaults price
// every quote in the business, and moving that number to suit the shop would
// reprice every job on the board with it. It is set on each line as it is built
// so the line carries its own answer into the quote behind the order. See
// priceShopLine.
//
// BOARD ONLY. It covers the piece we cut, edge and bore, and nothing else. The
// hinges on the same order are bought in and sold on, so they keep the rate
// every other hinge in the business is sold at, and hinge boring is a rate a
// hole rather than a cost with a margin on it. The test applies it where the
// item is our board rather than everywhere that is not a hinge, so a new kind
// of bought-in item added to the shop later does not quietly inherit it.
export const SHOP_MARKUP_PERCENT = 100;

export const SHOP_BRAND = "Polytec";
export const SHOP_MATERIAL = "Decorative Board";

/**
 * What is for sale. Decorative board only, so there is never a routed profile
 * question: a profile can only be pressed into a wrapped front.
 */
export const SHOP_PRODUCTS = [
  {
    slug: "flat-door",
    name: "Flat door",
    type: "Door",
    // THE CARD PICTURE, named on the product rather than in the page, so the
    // shop list and the product page cannot end up showing different things
    // for the same item. Square renders, 1024 x 1024, each with its own
    // background baked in, which is why the card frame is square too: cropping
    // one of these would cut its ground off as well as the piece.
    image: "/images/website/categories/doors.png",
    imageAlt: "A cabinet door standing against a plain wall",
    plural: "doors",
    blurb:
      "A flat replacement door, cut and edged to the millimetre from Polytec decorative board and bored for " +
      "hinges if you want it. Made in Perth.",
    card: "Cut to size, edged, and bored for hinges",
    // WHICH CABINETS IT GOES ON, named. The shop said nothing about IKEA or
    // Kaboodle anywhere, so the one page that could sell somebody a Kaboodle
    // replacement door never used the words they were searching for. Carried on
    // the product rather than written into the page, because it also goes in
    // that page's meta description.
    fits:
      "A flat door fits IKEA Metod, Pax and Besta cabinets, Kaboodle cabinets from Bunnings, and any cabinet " +
      "with a standard concealed hinge. Enter the height and width your cabinet takes and the price updates " +
      "as you type.",
  },
  {
    slug: "drawer-front",
    name: "Drawer front",
    type: "Drawer front",
    image: "/images/website/categories/drawer-fronts.png",
    imageAlt: "A cabinet drawer front standing against a plain wall",
    plural: "drawer fronts",
    blurb: "A flat drawer front, cut and edged to the millimetre from Polytec decorative board. Made in Perth.",
    card: "Cut to size and edged",
    fits:
      "A flat drawer front is made to the set heights IKEA Metod and Kaboodle use, or to any size you " +
      "measure, and is supplied undrilled so it can be fixed through your existing drawer box.",
  },
  {
    slug: "flat-panel",
    name: "Flat panel",
    type: "Panel",
    image: "/images/website/categories/panels.png",
    imageAlt: "A finished cabinet panel standing against a plain wall",
    plural: "panels",
    blurb:
      "An end panel, filler, kickboard or back panel, cut and edged to the millimetre from Polytec decorative " +
      "board. Made in Perth.",
    card: "End panels, fillers and kickboards",
    fits:
      "A flat panel covers an exposed cabinet side, fills a gap the cabinet range does not make a size for, " +
      "or finishes a kickboard, in the same colour as the doors beside it. Cut to any size up to 2380 high " +
      "by 1180 wide.",
  },
];

export function shopProduct(slug) {
  return SHOP_PRODUCTS.find((product) => product.slug === slug) || null;
}

/** The kinds a shop panel can say it is. Plain "Panel" is a real answer. */
export const SHOP_PANEL_USES = ["", ...PANEL_USES];

// ── SIZES ────────────────────────────────────────────────────────────────────
//
// The biggest piece is a whole 1200 x 2400 board less the trim taken off each
// edge, which is a Business Default, so a change of blade or supplier moves the
// shop with it. The smallest is 100mm either way. Height is the long way of the
// board, the same way round every size here is written. Decided 11 September.

export const SHOP_BOARD = { heightMm: 2400, widthMm: 1200 };
export const SHOP_MIN_MM = 100;

export function shopSizeLimit(defaults = {}) {
  const trim = Math.max(0, Number(defaults.board_edge_trim_mm ?? 10) || 0);
  return {
    minHeightMm: SHOP_MIN_MM,
    maxHeightMm: SHOP_BOARD.heightMm - trim * 2,
    minWidthMm: SHOP_MIN_MM,
    maxWidthMm: SHOP_BOARD.widthMm - trim * 2,
  };
}

/** What is wrong with each size box, in the customer's words. */
export function shopSizeProblems(line = {}, limit = shopSizeLimit()) {
  const out = {};
  const check = (key, label, min, max) => {
    const raw = line[key];
    if (raw === "" || raw === null || raw === undefined) return;
    const mm = Number(raw);
    if (!Number.isFinite(mm) || mm <= 0) out[key] = `Give the ${label} in millimetres.`;
    else if (mm < min) out[key] = `The smallest ${label} we cut is ${min}mm.`;
    else if (mm > max) out[key] = `The largest ${label} we can cut from one board is ${max}mm.`;
  };
  check("height", "height", limit.minHeightMm, limit.maxHeightMm);
  check("width", "width", limit.minWidthMm, limit.maxWidthMm);
  return out;
}

// ── DELIVERY ─────────────────────────────────────────────────────────────────
//
// Delivered, never collected: nobody comes to the workshop. Perth metro is a
// flat rate and anywhere else is emailed for a freight price before ordering.
// Metro is decided by postcode, 6000 to 6199. Decided 11 September 2026.

export const METRO_POSTCODES = { from: 6000, to: 6199 };

export function isMetroPostcode(postcode) {
  const written = String(postcode ?? "").trim();
  if (!/^\d{4}$/.test(written)) return false;
  const number = Number(written);
  return number >= METRO_POSTCODES.from && number <= METRO_POSTCODES.to;
}

// ── WHO AND WHERE ────────────────────────────────────────────────────────────

/** What the checkout asks for, in the order it asks. */
export const CHECKOUT_FIELDS = ["name", "email", "phone", "street", "suburb", "postcode"];

/**
 * What is wrong with the checkout details, per field, in the customer's words.
 * Empty means ready. The page shows these and the server asks them again
 * before it writes anything. The rules are the ones quote acceptance uses.
 */
export function checkoutDetailProblems(details = {}) {
  const problems = {};
  for (const key of CHECKOUT_FIELDS) {
    // validateDetail knows a phone as "mobile"; the rule is the same.
    const message = validateDetail(key === "phone" ? "mobile" : key, details[key]);
    if (message) problems[key] = message.startsWith("Required") ? "We need this to deliver your order." : message;
  }
  if (!problems.postcode && !isMetroPostcode(details.postcode)) {
    problems.postcode =
      "We deliver to Perth metro postcodes, 6000 to 6199. For anywhere else, email us for a freight price before you order.";
  }
  return problems;
}

// ── HINGES ───────────────────────────────────────────────────────────────────

/**
 * The boring a catalogue hinge needs. An Inserta hinge knocks into a cup with
 * two dowel holes beside it and will not go into a bare 35mm cup; every other
 * hinge we sell screws into the cup alone.
 */
export function boringForHinge(hinge) {
  const named = [hinge?.brand, hinge?.name, hinge?.description].filter(Boolean).join(" ");
  return /inserta/i.test(named) ? "Blum Inserta" : "35mm cup only";
}

export function hingeLabel(hinge) {
  return [hinge?.brand, hinge?.name].filter(Boolean).join(" ").trim();
}

/** How many hinge holes a line is bored with, per piece. */
export function shopHingeCount(line = {}) {
  return line.type === "Door" && line.preDrill ? hingeCount(line.hingeQty) : 0;
}

/** The hinge count a door of this height starts at, as the form writes it. */
export function hingeQtyForHeight(heightMm) {
  const n = hingesForHeight(heightMm);
  return n ? `${n} hinges` : "";
}

// ── A NEW LINE ───────────────────────────────────────────────────────────────

export function newShopLine(product, { id = "", hinge = null } = {}) {
  const drilled = product?.type === "Door";
  return {
    id: id || `shop-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    product: product?.slug || "",
    type: product?.type || "",
    panelUse: "",
    material: SHOP_MATERIAL,
    supplierName: SHOP_BRAND,
    thickness: "",
    finish: "",
    colour: "",
    colourSrc: "",
    colourLibraryId: "",
    height: "",
    width: "",
    qty: 1,
    // Null is all four, our standard, until somebody leaves an edge raw.
    bandedEdges: null,
    // A door is bored unless they say not. The side is never guessed: getting
    // it wrong is how a pair arrives as two identical doors.
    preDrill: drilled,
    holeType: drilled ? (hinge ? boringForHinge(hinge) : "Blum Inserta") : "",
    hingeQty: "",
    hingeQtyTouched: false,
    hingeSide: "",
    hingeFromBottomMm: "",
    hingeFromTopMm: "",
    hingeMiddlesMm: [],
    hingeMiddlesTouched: false,
    supplyHinges: drilled && Boolean(hinge),
    hingeHardwareId: drilled && hinge ? hinge.id : "",
  };
}

// ── WHAT STOPS A LINE BEING PAID FOR ─────────────────────────────────────────

/**
 * Everything a line still needs, in the customer's words. Empty means it can
 * go in the cart. The server asks exactly this again before it charges.
 *
 * `colour` is the catalogue row behind colourLibraryId, or null when there is
 * none; `hinge` the catalogue hinge they chose to have supplied.
 */
export function shopLineProblems(line = {}, { limit = shopSizeLimit(), colour = null, hinge = null } = {}) {
  const problems = [];
  if (!shopProduct(line.product)) problems.push("which product this is");
  if (!line.colourLibraryId || !colour) problems.push("a colour");
  else if (!colour.priced) problems.push("a colour we hold a price on");
  if (!line.thickness) problems.push("a thickness");

  // Said as what it still needs, like everything else in this list. The exact
  // sentence about each box sits under the box itself.
  if (!line.height || !line.width) problems.push("a height and a width");
  const size = shopSizeProblems(line, limit);
  if (size.height) problems.push(`a height between ${limit.minHeightMm} and ${limit.maxHeightMm}mm`);
  if (size.width) problems.push(`a width between ${limit.minWidthMm} and ${limit.maxWidthMm}mm`);

  if (Array.isArray(line.bandedEdges) && line.bandedEdges.some((edge) => !BANDED_EDGES.includes(edge))) {
    problems.push("edges we recognise");
  }

  const qty = Number(line.qty);
  if (!Number.isInteger(qty) || qty < 1) problems.push("how many");

  if (line.type === "Door" && line.preDrill) {
    problems.push(
      ...hingeProblems({
        hinge_holes: true,
        hinge_qty: line.hingeQty,
        hinge_side: line.hingeSide,
        hole_type: line.holeType,
        hinge_from_bottom_mm: line.hingeFromBottomMm,
        hinge_from_top_mm: line.hingeFromTopMm,
        height_mm: line.height,
      })
    );
    if (line.supplyHinges) {
      if (!line.hingeHardwareId || !hinge) problems.push("which hinge to supply");
      else if (boringForHinge(hinge) !== line.holeType) {
        problems.push(`${line.holeType || "these"} holes to suit the ${hingeLabel(hinge)}`);
      }
    }
  }
  return problems;
}

/** The problems as one sentence, for under the button. */
export function describeProblems(problems = []) {
  if (!problems.length) return "";
  if (problems.length === 1) return problems[0];
  return `${problems.slice(0, -1).join(", ")} and ${problems[problems.length - 1]}`;
}

// ── HOW A LINE READS ─────────────────────────────────────────────────────────

/** "Classic White flat door", or the product on its own before a colour. */
export function shopLineTitle(line = {}) {
  const product = shopProduct(line.product);
  const kind = line.panelUse || product?.name || line.type || "Item";
  const colour = String(line.colour || "").trim();
  return colour ? `${colour} ${kind.toLowerCase()}` : kind;
}

/**
 * The specification of one line, as label and value pairs. The product page's
 * price card, the cart, the checkout, the confirmation page and the email all
 * print this, so a line and the door that made it cannot say different things.
 *
 * Positions are read back the way they were asked: bottom from the bottom, top
 * from the top. See hingePositionLines.
 */
export function shopLineSpec(line = {}, { hinge = null } = {}) {
  const rows = [];
  if (line.panelUse) rows.push(["Kind", line.panelUse]);
  if (line.colour) rows.push(["Colour", [line.colour, line.finish].filter(Boolean).join(", ")]);
  rows.push(["Board", [SHOP_BRAND, "decorative board", line.thickness].filter(Boolean).join(" ")]);
  if (line.height && line.width) rows.push(["Size", `${line.height} (H) x ${line.width} (W) mm`]);

  const edges = Array.isArray(line.bandedEdges) ? line.bandedEdges : BANDED_EDGES;
  rows.push([
    "Edging",
    edges.length === 4 ? "All four edges" : edges.length ? `Banded ${edges.join(", ").toLowerCase()}` : "No edging",
  ]);

  if (line.type === "Door") {
    if (line.preDrill) {
      const count = hingeCount(line.hingeQty);
      rows.push([
        "Hinge holes",
        [
          count ? `${count} holes` : "",
          line.hingeSide ? `hinged ${String(line.hingeSide).toLowerCase()}` : "",
          line.holeType || "",
        ]
          .filter(Boolean)
          .join(", "),
      ]);
      const positions = hingePositionLines({
        hinge_holes: true,
        hinge_qty: line.hingeQty,
        hinge_from_bottom_mm: line.hingeFromBottomMm,
        hinge_from_top_mm: line.hingeFromTopMm,
        hinge_middles_mm: line.hingeMiddlesTouched ? line.hingeMiddlesMm : [],
        height_mm: line.height,
      });
      rows.push(["Positions", positions ? positions.join(", ") : "Our standard positions"]);
      rows.push(["Hinges", line.supplyHinges && hinge ? hingeLabel(hinge) : "Not supplied"]);
    } else {
      rows.push(["Hinge holes", "Not drilled"]);
    }
  }
  return rows.filter((row) => row[1]);
}

// ── THE CART ─────────────────────────────────────────────────────────────────

export function cartPieceCount(lines = []) {
  return (Array.isArray(lines) ? lines : []).reduce((total, line) => total + Math.max(1, Number(line.qty) || 1), 0);
}

export const money = (value) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value) || 0);

// ── HANDING A LINE TO THE QUOTE MACHINERY ────────────────────────────────────

/**
 * A shop line as the quote builder's line objects: the piece itself, and the
 * hinges we supply as their own Hardware line, the same shape as a hinge
 * picked on the quote form. The server feeds these through exactly the path a
 * quote request takes to become a quote, so a web order is priced and carried
 * to the bench the way every other job is.
 */
export function shopLineItems(line = {}, { hinge = null } = {}) {
  const product = shopProduct(line.product);
  const piece = {
    ...line,
    type: product?.type || line.type,
    panelUse: product?.type === "Panel" ? line.panelUse || "" : "",
    material: SHOP_MATERIAL,
    supplierName: SHOP_BRAND,
    qty: Math.max(1, Math.round(Number(line.qty) || 1)),
    // Written out in full on a paid order. The product page shows all four
    // until an edge is turned off, so all four is what they bought, and the
    // bench should read it as an instruction rather than as nobody answering.
    bandedEdges: Array.isArray(line.bandedEdges) ? line.bandedEdges : [...BANDED_EDGES],
    preDrill: product?.type === "Door" && Boolean(line.preDrill),
    holeType: product?.type === "Door" && line.preDrill ? line.holeType : "",
    note: "",
  };
  const items = [piece];
  const holes = shopHingeCount(piece);
  if (holes && line.supplyHinges && hinge) {
    items.push({
      type: "Hardware",
      hardwareId: hinge.id,
      hardwareName: hingeLabel(hinge),
      qty: holes * piece.qty,
      note: `For ${piece.qty} ${product?.plural || "doors"}, ${holes} each.`,
    });
  }
  return items;
}
