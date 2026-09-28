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
//
// ── TWO BOARDS, ONE CONFIGURATOR ─────────────────────────────────────────────
//
// Decided 28 September 2026: the shop sells Polytec thermolaminate as well as
// decorative board, on the same three product pages, with Material as the
// first question. A thermolaminate line adds the quote builder's own
// profileType, profile and edgeMould, and loses the banded edges, because a
// wrapped front has no edge to tape. It is priced from the thermolaminate rate
// card, and anything the card will not price goes to the quote list instead of
// the cart. The server decides which, never the browser. See
// lib/pcd-shop-pricing.js.

import { validateDetail } from "./pcd-contact-details";
import { BANDED_EDGES, PANEL_USES } from "./pcd-line-details";
import { hingeCount, hingePositionLines, hingeProblems, hingesForHeight } from "./pcd-hinges";
import { isThermoMade } from "./pcd-thermo-pricing";

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
//
// DECORATIVE BOARD ONLY. Thermolaminate is marked up at the rate card's own
// margin, the one set in Settings > Thermolaminate Pricing, the same as a
// quoted thermolaminate front. Decided 27 September 2026.
export const SHOP_MARKUP_PERCENT = 100;

export const SHOP_BRAND = "Polytec";
export const SHOP_MATERIAL = "Decorative Board";
export const SHOP_THERMO_MATERIAL = "Thermolaminate";

/** The two boards the shop sells, in the order the Material question asks. */
export const SHOP_MATERIALS = [SHOP_MATERIAL, SHOP_THERMO_MATERIAL];

/** A line pressed and wrapped rather than cut and edged. */
export const isThermoShopLine = (line = {}) => line?.material === SHOP_THERMO_MATERIAL;

/**
 * The thicknesses a thermolaminate front can be asked for. Both are offered
 * whatever the colour, because 21mm is priced by hand anyway and the person
 * pricing it checks the colour comes in it.
 */
export const SHOP_THERMO_THICKNESSES = ["18mm", "21mm"];

/**
 * WHY A THERMOLAMINATE FRONT IS PRICED BY HAND, in the customer's words.
 *
 * `code` is the rate card's own (see priceThermoLine), or one of the shop's:
 * "below_minimum" for a piece smaller than Polytec will press that profile,
 * "unavailable" for a rate card that could not be read, and "zero" for a price
 * that came out at nothing. Staff see the rate card's sentence; this is what
 * goes on the product page.
 */
export function thermoHandPricedReason(code, line = {}, { minimum = null, only21 = false } = {}) {
  const profile = String(line.profile || "").trim();
  switch (code) {
    case "thickness":
      return only21 && profile
        ? `${profile} is only made 21mm thick, and 21mm fronts are priced by hand.`
        : `${line.thickness || "That"} fronts are priced by hand.`;
    case "profile_category":
      return `${line.profileType || "These"} fronts are made to order and priced by hand.`;
    case "finish_tier":
      return `${line.finish || "That finish"} is priced by hand.`;
    case "facia":
      return "A piece this narrow is made as a facia strip, which we price by hand.";
    case "oversize":
      return "A piece this big is priced by hand.";
    case "below_minimum":
      return minimum
        ? `${profile} can only be pressed from ${minimum.minHeightMm} (H) x ${minimum.minWidthMm} (W) mm, so this one is priced by hand.`
        : `${profile} cannot be pressed this small, so this one is priced by hand.`;
    case "unavailable":
      return "Thermolaminate cannot be priced online just now, so this one is priced by hand.";
    default:
      return "This one is priced by hand.";
  }
}

/**
 * What is for sale: a door, a drawer front and a panel, each in either board.
 * The slugs are the ones the pages were first published under, kept so no
 * link to them breaks.
 */
export const SHOP_PRODUCTS = [
  {
    slug: "flat-door",
    name: "Door",
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
      "A replacement door made to the millimetre, flat in Polytec decorative board or with a routed profile in " +
      "Polytec thermolaminate, and bored for hinges if you want it. Made in Perth.",
    card: "Flat or profiled, made to size and bored for hinges",
    // WHICH CABINETS IT GOES ON, named. The shop said nothing about IKEA or
    // Kaboodle anywhere, so the one page that could sell somebody a Kaboodle
    // replacement door never used the words they were searching for. Carried on
    // the product rather than written into the page, because it also goes in
    // that page's meta description.
    fits:
      "A door fits IKEA Metod, Pax and Besta cabinets, Kaboodle cabinets from Bunnings, and any cabinet " +
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
    blurb:
      "A drawer front made to the millimetre, flat in Polytec decorative board or with a routed profile in " +
      "Polytec thermolaminate. Made in Perth.",
    card: "Flat or profiled, made to size",
    fits:
      "A drawer front is made to the set heights IKEA Metod and Kaboodle use, or to any size you " +
      "measure, and is supplied undrilled so it can be fixed through your existing drawer box.",
  },
  {
    slug: "flat-panel",
    name: "Panel",
    type: "Panel",
    image: "/images/website/categories/panels.png",
    imageAlt: "A finished cabinet panel standing against a plain wall",
    plural: "panels",
    blurb:
      "An end panel, filler, kickboard or back panel made to the millimetre, in Polytec decorative board or " +
      "Polytec thermolaminate. Made in Perth.",
    card: "End panels, fillers and kickboards",
    fits:
      "A panel covers an exposed cabinet side, fills a gap the cabinet range does not make a size for, " +
      "or finishes a kickboard, in the same colour as the doors beside it.",
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
    // Thermolaminate only. Blank on decorative board, which has no routed face.
    profileType: "",
    profile: "",
    edgeMould: "",
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
 * Everything a line still needs, in the customer's words. Empty means it is
 * fully answered: the server then either prices it for the cart or says it is
 * priced by hand and belongs on the quote list. The server asks exactly this
 * again before it charges.
 *
 * `colour` is the catalogue row behind colourLibraryId, or null when there is
 * none; `hinge` the catalogue hinge they chose to have supplied. `profiles`
 * and `edges` are the catalogue's Polytec door and edge profiles, which a
 * thermolaminate line has to name one of; null skips that check, for a caller
 * that has not loaded them. `notMade` is thermoNotMadeByFinish of the rate
 * card: the profile categories Polytec does not make in a finish at all.
 *
 * TWO DIFFERENT KINDS OF NO. A front Polytec does not make, Detailed in Gloss,
 * is a problem here: it cannot be ordered at all, so it has to be changed and
 * is never offered on the page. A front that is made but that the rate card
 * will not price, 21mm or a facia, is NOT a problem: it is a complete answer
 * with no online price, which is a quote list item. Only the server can tell
 * that second kind, because only the server holds the card.
 */
export function shopLineProblems(
  line = {},
  { limit = shopSizeLimit(), colour = null, hinge = null, profiles = null, edges = null, notMade = null } = {}
) {
  const problems = [];
  const thermo = isThermoShopLine(line);
  if (!shopProduct(line.product)) problems.push("which product this is");
  if (!SHOP_MATERIALS.includes(line.material)) problems.push("a material");
  // THE COLOUR HAS TO BE A ROW OF THE BOARD THEY CHOSE. A decorative board
  // colour on a thermolaminate line, or the other way round, is a colour we do
  // not make in that board, whatever it is called.
  if (!line.colourLibraryId || !colour || (colour.material && colour.material !== line.material)) {
    problems.push("a colour");
  } else if (!thermo && !colour.priced) problems.push("a colour we hold a price on");
  if (!line.thickness || (thermo && !SHOP_THERMO_THICKNESSES.includes(line.thickness))) problems.push("a thickness");

  if (thermo) {
    const profile = String(line.profile || "").trim();
    if (!line.profileType || !profile) problems.push("a front profile");
    else if (line.finish && !isThermoMade(notMade, line.finish, line.profileType)) {
      problems.push(`a profile family made in ${line.finish}`);
    } else if (Array.isArray(profiles)) {
      const made = String(line.thickness || "").startsWith("21") ? "available21mm" : "available18mm";
      const row = profiles.find((entry) => entry.name === profile && entry.category === line.profileType);
      if (!row) problems.push("a front profile we make");
      else if (row[made] === false) problems.push(`a front profile made ${line.thickness || "that"} thick`);
    }
    if (!line.edgeMould) problems.push("an edge profile");
    else if (Array.isArray(edges) && !edges.some((entry) => entry.name === line.edgeMould)) {
      problems.push("an edge profile we make");
    }
  }

  // Said as what it still needs, like everything else in this list. The exact
  // sentence about each box sits under the box itself.
  if (!line.height || !line.width) problems.push("a height and a width");
  if (thermo) {
    // No range here on purpose. A thermolaminate size the rate card will not
    // price, a facia or an oversize piece, is priced by hand, not refused.
    if (line.height && !(Number(line.height) > 0)) problems.push("a height in millimetres");
    if (line.width && !(Number(line.width) > 0)) problems.push("a width in millimetres");
  } else {
    const size = shopSizeProblems(line, limit);
    if (size.height) problems.push(`a height between ${limit.minHeightMm} and ${limit.maxHeightMm}mm`);
    if (size.width) problems.push(`a width between ${limit.minWidthMm} and ${limit.maxWidthMm}mm`);
  }

  if (!thermo && Array.isArray(line.bandedEdges) && line.bandedEdges.some((edge) => !BANDED_EDGES.includes(edge))) {
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

/**
 * "Classic White door", "Classic White Bathurst door", or the product on its
 * own before a colour.
 */
export function shopLineTitle(line = {}) {
  const product = shopProduct(line.product);
  const kind = line.panelUse || product?.name || line.type || "Item";
  const colour = String(line.colour || "").trim();
  const profile = isThermoShopLine(line) ? String(line.profile || "").trim() : "";
  return colour ? [colour, profile, kind.toLowerCase()].filter(Boolean).join(" ") : kind;
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
  const thermo = isThermoShopLine(line);
  rows.push(["Board", [SHOP_BRAND, thermo ? "thermolaminate" : "decorative board", line.thickness].filter(Boolean).join(" ")]);
  if (thermo) {
    rows.push(["Front profile", [line.profileType, line.profile].filter(Boolean).join(", ")]);
    rows.push(["Edge profile", line.edgeMould || ""]);
  }
  if (line.height && line.width) rows.push(["Size", `${line.height} (H) x ${line.width} (W) mm`]);

  // A wrapped front has no edge to tape, so it has no edging row at all.
  if (!thermo) {
    const edges = Array.isArray(line.bandedEdges) ? line.bandedEdges : BANDED_EDGES;
    rows.push([
      "Edging",
      edges.length === 4 ? "All four edges" : edges.length ? `Banded ${edges.join(", ").toLowerCase()}` : "No edging",
    ]);
  }

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

// ── HANDING A LINE TO THE QUOTE LIST ─────────────────────────────────────────

/**
 * A shop line as a quote list line, for one we cannot price online. Everything
 * they set up goes across, sizes, profile and hinge positions and all, rather
 * than being typed again. The product page and the cart both hand a line over
 * through this, so a line moved from either says the same thing.
 *
 * `hingeName` is the hinge they wanted supplied, which a quote list line has no
 * field for, so it rides in the note.
 */
export function shopLineToQuoteLine(line = {}, { hingeName = "" } = {}) {
  const product = shopProduct(line.product);
  const type = product?.type || line.type || "";
  const thermo = isThermoShopLine(line);
  const drilled = type === "Door" && Boolean(line.preDrill);
  return {
    id: `shop-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    type,
    panelUse: line.panelUse || "",
    material: thermo ? SHOP_THERMO_MATERIAL : SHOP_MATERIAL,
    supplierName: SHOP_BRAND,
    thickness: line.thickness || "",
    finish: line.finish || "",
    colour: line.colour || "",
    colourSrc: line.colourSrc || "",
    colourLibraryId: line.colourLibraryId || "",
    height: line.height || "",
    width: line.width || "",
    qty: line.qty || 1,
    bandedEdges: thermo ? null : line.bandedEdges ?? null,
    preDrill: drilled,
    holeType: drilled ? line.holeType || "" : "",
    hingeQty: drilled ? line.hingeQty || "" : "",
    hingeSide: drilled ? line.hingeSide || "" : "",
    hingeFromBottomMm: drilled ? line.hingeFromBottomMm ?? "" : "",
    hingeFromTopMm: drilled ? line.hingeFromTopMm ?? "" : "",
    hingeMiddlesMm: drilled ? line.hingeMiddlesMm || [] : [],
    hingeMiddlesTouched: drilled ? Boolean(line.hingeMiddlesTouched) : false,
    edgeMould: thermo ? line.edgeMould || "" : "",
    profileType: thermo ? line.profileType || "" : "",
    profile: thermo ? line.profile || "" : "",
    cabinetBrand: "",
    hardwareId: "",
    hardwareName: "",
    note: ["Set up on the shop.", drilled && line.supplyHinges && hingeName ? `Would like ${hingeName} hinges supplied.` : ""]
      .filter(Boolean)
      .join(" "),
  };
}

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
  const thermo = isThermoShopLine(line);
  const piece = {
    ...line,
    type: product?.type || line.type,
    panelUse: product?.type === "Panel" ? line.panelUse || "" : "",
    material: thermo ? SHOP_THERMO_MATERIAL : SHOP_MATERIAL,
    supplierName: SHOP_BRAND,
    qty: Math.max(1, Math.round(Number(line.qty) || 1)),
    // The routed face and its edge, on a wrapped front only.
    profileType: thermo ? line.profileType || "" : "",
    profile: thermo ? line.profile || "" : "",
    edgeMould: thermo ? line.edgeMould || "" : "",
    // Written out in full on a paid order. The product page shows all four
    // until an edge is turned off, so all four is what they bought, and the
    // bench should read it as an instruction rather than as nobody answering.
    // A wrapped front is not taped, so it carries none.
    bandedEdges: thermo ? null : Array.isArray(line.bandedEdges) ? line.bandedEdges : [...BANDED_EDGES],
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
