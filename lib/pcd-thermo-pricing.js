// WHAT POLYTEC CHARGES US FOR A THERMOLAMINATE PIECE, worked out rather than
// looked up in their portal.
//
// Thermolaminate is made to order. Somebody used to key every size into the
// Polytec portal, copy the price back and add 75%. This reproduces the portal's
// price from a rate card, so a line prices itself the way a decorative board
// line does, and can still be typed over.
//
// ── WHERE THE NUMBERS CAME FROM ──────────────────────────────────────────────
//
// 27 September 2026: about 300 portal prices, one piece at a time, 18mm, Thumb
// Mould, SS TBLR, across every category and every finish. The edge mould does
// not change the price. The shape of the formula was found from those prices,
// not guessed, and test/thermo-pricing.test.mjs holds every one of them so a
// change here cannot drift away from the portal without a test failing.
//
// ── THE FORMULA ──────────────────────────────────────────────────────────────
//
// 1. Round the size UP to Polytec's steps. Height is charged at the next of
//    200, 400, 600, 750, 900, 1200 ... 2400; width at no less than 300, then the
//    next 50 to 650, then 800, 1000, 1200. A 720 x 450 door is charged as
//    750 x 450, which is why 300 high x 600 wide costs more than 600 x 300.
//
// 2. price = per piece
//          + rate factor x ( edge rate x (height + width) in metres
//                          + area rate x area in m2
//                          + tall charge x each height step above 750 )
//
//    The edge, area and tall rates belong to the profile CATEGORY (Minimal,
//    Soft, Sharp, Detailed). The per-piece charge and the rate factor belong to
//    the category AND the finish tier (Smooth and Matt cost the same; Woodmatt,
//    Natura and Ravine cost the same; and so on).
//
// 3. A piece the full 1200 wide from 1800 high up carries a surcharge
//    (measured about 15% at 2100 and 2400 high).
//
// Checked against every portal price: average 0.1% out, and every Minimal and
// every Smooth price to the cent.
//
// ── WHAT IT WILL NOT PRICE ───────────────────────────────────────────────────
//
// It says so, with the reason, and leaves the line for a person, rather than
// guessing: 21mm, other suppliers, Fluted, anything over 2400 x 1200, and
// facias (under 150 in either direction), which the portal prices another way.
//
// Everything a supplier could change lives in the rate card, stored in Settings
// and cleaned here, so a price rise is a settings change and never a code one.

import { roundMoney } from "./pcd-money";

export const THERMO_CATEGORIES = ["Minimal", "Soft", "Sharp", "Detailed"];

export const DEFAULT_THERMO_RATE_CARD = {
  supplier: "Polytec",
  thickness_mm: 18,
  // Our margin on a thermolaminate piece, written into the line's markup.
  margin_percent: 75,
  // A small uplift on the calculated cost, if you want every error to fall on
  // our side. The fit is within 0.1% on average, so it starts at nothing.
  safety_percent: 0,
  effective_from: "2026-09-27",
  height_steps_mm: [200, 400, 600, 750, 900, 1200, 1500, 1800, 2100, 2400],
  width_steps_mm: [300, 350, 400, 450, 500, 550, 600, 650, 800, 1000, 1200],
  tall_above_mm: 750,
  facia_below_mm: 150,
  full_width: { width_mm: 1200, from_height_mm: 1800, factor: 1.154 },
  categories: {
    Minimal: { edge_per_m: 5.095, area_per_sqm: 84.74, tall_step: 0 },
    Soft: { edge_per_m: 5.077, area_per_sqm: 110.16, tall_step: 3.4 },
    Sharp: { edge_per_m: 5.068, area_per_sqm: 135.62, tall_step: 3.39 },
    Detailed: { edge_per_m: 5.057, area_per_sqm: 165.67, tall_step: 3.4 },
  },
  finish_tiers: [
    { key: "raw", label: "Raw (no wrap)", finishes: ["Raw", "Raw Finish"] },
    { key: "texture", label: "Texture", finishes: ["Texture"] },
    { key: "standard", label: "Smooth and Matt", finishes: ["Smooth", "Matt"] },
    { key: "gloss", label: "Gloss", finishes: ["Gloss"] },
    { key: "woodgrain", label: "Woodgrain", finishes: ["Woodmatt", "Natura", "Ravine", "Ashgrain", "Woodgrain"] },
  ],
  // null means Polytec does not make that category in that finish.
  tier_rates: {
    raw: {
      Minimal: { per_piece: 13.12, rate_factor: 0.6015 },
      Soft: { per_piece: 15.19, rate_factor: 0.6014 },
      Sharp: { per_piece: 17.23, rate_factor: 0.6014 },
      Detailed: { per_piece: 20.24, rate_factor: 0.6142 },
    },
    texture: {
      Minimal: { per_piece: 17.03, rate_factor: 0.9091 },
      Soft: { per_piece: 20.11, rate_factor: 0.9091 },
      Sharp: { per_piece: 22.9, rate_factor: 0.9103 },
      Detailed: { per_piece: 27.83, rate_factor: 0.9114 },
    },
    standard: {
      Minimal: { per_piece: 18.31, rate_factor: 1 },
      Soft: { per_piece: 21.72, rate_factor: 1 },
      Sharp: { per_piece: 25.1, rate_factor: 1 },
      Detailed: { per_piece: 30.2, rate_factor: 1 },
    },
    gloss: {
      Minimal: { per_piece: 22.14, rate_factor: 1.2728 },
      Soft: { per_piece: 26.48, rate_factor: 1.2727 },
      Sharp: { per_piece: 30.79, rate_factor: 1.2728 },
      Detailed: null,
    },
    woodgrain: {
      Minimal: { per_piece: 23.94, rate_factor: 1.4 },
      Soft: { per_piece: 28.7, rate_factor: 1.4 },
      Sharp: { per_piece: 33.45, rate_factor: 1.4 },
      Detailed: { per_piece: 40.99, rate_factor: 1.3639 },
    },
  },
};

// ── Cleaning ─────────────────────────────────────────────────────────────────

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function nonNegative(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function steps(value, fallback) {
  const list = (Array.isArray(value) ? value : String(value ?? "").split(/[\s,]+/))
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  return sorted.length ? sorted : fallback;
}
const clean = (s) => String(s ?? "").trim();
const lower = (s) => clean(s).toLowerCase();

/**
 * A stored rate card, made safe to price from. Anything missing or nonsense
 * falls back to the value above, one field at a time, so a half-filled card
 * still prices, and a card nobody has saved yet prices from the measured rates.
 */
export function normalizeThermoRateCard(stored = {}) {
  const s = stored && typeof stored === "object" ? stored : {};
  const d = DEFAULT_THERMO_RATE_CARD;

  const categories = {};
  for (const cat of THERMO_CATEGORIES) {
    const src = s.categories?.[cat] || {};
    const def = d.categories[cat];
    categories[cat] = {
      edge_per_m: nonNegative(src.edge_per_m, def.edge_per_m),
      area_per_sqm: nonNegative(src.area_per_sqm, def.area_per_sqm),
      tall_step: nonNegative(src.tall_step, def.tall_step),
    };
  }

  const tierSource = Array.isArray(s.finish_tiers) && s.finish_tiers.length ? s.finish_tiers : d.finish_tiers;
  const finish_tiers = tierSource
    .map((t) => ({
      key: clean(t?.key),
      label: clean(t?.label) || clean(t?.key),
      finishes: (Array.isArray(t?.finishes) ? t.finishes : String(t?.finishes ?? "").split(","))
        .map(clean)
        .filter(Boolean),
    }))
    .filter((t) => t.key);

  const tier_rates = {};
  for (const tier of finish_tiers) {
    tier_rates[tier.key] = {};
    for (const cat of THERMO_CATEGORIES) {
      const has = s.tier_rates && tier.key in s.tier_rates && s.tier_rates[tier.key] && cat in s.tier_rates[tier.key];
      const src = has ? s.tier_rates[tier.key][cat] : d.tier_rates[tier.key]?.[cat];
      if (src === null || src === undefined || src?.available === false) {
        tier_rates[tier.key][cat] = null;
        continue;
      }
      const def = d.tier_rates[tier.key]?.[cat] || { per_piece: 0, rate_factor: 1 };
      tier_rates[tier.key][cat] = {
        per_piece: nonNegative(src.per_piece, def.per_piece),
        rate_factor: positive(src.rate_factor, def.rate_factor),
      };
    }
  }

  const fw = s.full_width || {};
  return {
    supplier: clean(s.supplier) || d.supplier,
    thickness_mm: positive(s.thickness_mm, d.thickness_mm),
    margin_percent: nonNegative(s.margin_percent, d.margin_percent),
    safety_percent: num(s.safety_percent, d.safety_percent),
    effective_from: clean(s.effective_from) || d.effective_from,
    height_steps_mm: steps(s.height_steps_mm, d.height_steps_mm),
    width_steps_mm: steps(s.width_steps_mm, d.width_steps_mm),
    tall_above_mm: nonNegative(s.tall_above_mm, d.tall_above_mm),
    facia_below_mm: nonNegative(s.facia_below_mm, d.facia_below_mm),
    full_width: {
      width_mm: positive(fw.width_mm, d.full_width.width_mm),
      from_height_mm: positive(fw.from_height_mm, d.full_width.from_height_mm),
      factor: positive(fw.factor, d.full_width.factor),
    },
    categories,
    finish_tiers,
    tier_rates,
  };
}

// ── Reading a line ───────────────────────────────────────────────────────────

/** Is this a thermolaminate board line at all (door, drawer front, panel...). */
export function isThermoLine(line = {}) {
  if (lower(line.material).replace(/\s+/g, "") !== "thermolaminate") return false;
  const type = lower(line.product_type);
  return !["base_cabinet", "hardware", "benchtop"].includes(type);
}

/** Which of our four categories a profile type is, or "". */
export function thermoCategory(profileType) {
  const wanted = lower(profileType);
  return THERMO_CATEGORIES.find((c) => c.toLowerCase() === wanted) || "";
}

/** The tier a finish belongs to on this card, or null. */
export function thermoFinishTier(finish, card) {
  const wanted = lower(finish);
  if (!wanted) return null;
  return card.finish_tiers.find((t) => t.finishes.some((f) => lower(f) === wanted)) || null;
}

/**
 * WHAT POLYTEC DOES NOT MAKE AT ALL, finish by finish: the profile categories
 * the card marks as null for that finish's tier. Detailed in Gloss, today.
 *
 * Keyed by the finish in lower case, so "Gloss" and "gloss" are one answer.
 * This is not a price and says nothing about one, so it is safe for a browser
 * to hold. It is different from a finish the card has no rate for, which is
 * still made and is priced by hand.
 */
export function thermoNotMadeByFinish(card) {
  const out = {};
  if (!card?.finish_tiers) return out;
  for (const tier of card.finish_tiers) {
    const missing = THERMO_CATEGORIES.filter((category) => card.tier_rates?.[tier.key]?.[category] === null);
    if (!missing.length) continue;
    for (const finish of tier.finishes) out[lower(finish)] = missing;
  }
  return out;
}

/** Is this profile category made in this finish? True when nothing says it is not. */
export function isThermoMade(notMade, finish, category) {
  return !(notMade?.[lower(finish)] || []).includes(category);
}

/** The size a piece is charged at: the next step up, or null past the last. */
export function chargedStep(mm, list) {
  const value = Number(mm);
  if (!(value > 0)) return null;
  return list.find((s) => value <= s) ?? null;
}

function thicknessMm(value) {
  const match = String(value ?? "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

const round2 = (v) => roundMoney(v);

/**
 * THE PRICE OF ONE THERMOLAMINATE PIECE, before our margin.
 *
 * @returns {{ ok: true, unitCost: number, chargedHeight: number, chargedWidth: number,
 *             category: string, tier: string, tierLabel: string, surcharge: boolean,
 *             parts: object, label: string }
 *         | { ok: false, applies: boolean, reason: string, code: string }}
 *   `code` names which rule refused it, so a screen can word it for its own
 *   reader without reading the staff sentence apart.
 *   `applies` is false for a line that is not thermolaminate at all, so callers
 *   can leave every other line exactly as it was.
 */
export function priceThermoLine(line = {}, cardInput = null) {
  if (!isThermoLine(line)) return { ok: false, applies: false, reason: "" };
  const card = cardInput && cardInput.tier_rates ? cardInput : normalizeThermoRateCard(cardInput || {});
  const fail = (reason, code) => ({ ok: false, applies: true, reason, code });

  const supplier = clean(line.supplier_name);
  if (supplier && lower(supplier) !== lower(card.supplier)) {
    return fail(`Only ${card.supplier} thermolaminate is priced automatically. Price this ${supplier} line by hand.`, "supplier");
  }
  const t = thicknessMm(line.thickness);
  if (!t) return fail("Pick a thickness to price this line.", "thickness_missing");
  if (t !== card.thickness_mm) return fail(`${t}mm thermolaminate is priced by hand. Only ${card.thickness_mm}mm is priced automatically.`, "thickness");

  const category = thermoCategory(line.profile_type);
  if (!clean(line.profile_type)) return fail("Pick a profile to price this line.", "profile_missing");
  if (!category) return fail(`${clean(line.profile_type)} profiles are priced by hand.`, "profile_category");

  if (!clean(line.finish)) return fail("Pick a colour to price this line.", "finish_missing");
  const tier = thermoFinishTier(line.finish, card);
  if (!tier) return fail(`${clean(line.finish)} is not on the thermolaminate rate card. Add it to a finish tier in Settings, or price by hand.`, "finish_tier");
  const rates = card.tier_rates[tier.key]?.[category];
  if (!rates) return fail(`${card.supplier} does not make ${category} profiles in ${tier.label}.`, "not_made");

  const height = Number(line.height_mm);
  const width = Number(line.width_mm);
  if (!(height > 0) || !(width > 0)) return fail("Enter the height and width to price this line.", "size_missing");
  if (Math.min(height, width) < card.facia_below_mm) {
    return fail(`Under ${card.facia_below_mm}mm in one direction ${card.supplier} makes it as a facia, which is priced by hand.`, "facia");
  }
  const chargedHeight = chargedStep(height, card.height_steps_mm);
  const chargedWidth = chargedStep(width, card.width_steps_mm);
  if (!chargedHeight || !chargedWidth) {
    const maxH = card.height_steps_mm[card.height_steps_mm.length - 1];
    const maxW = card.width_steps_mm[card.width_steps_mm.length - 1];
    return fail(`Over ${maxH} x ${maxW} is priced by hand.`, "oversize");
  }

  const cat = card.categories[category];
  const tallSteps = card.height_steps_mm.filter((s) => s > card.tall_above_mm && s <= chargedHeight).length;
  const edge = cat.edge_per_m * ((chargedHeight + chargedWidth) / 1000);
  const area = cat.area_per_sqm * ((chargedHeight * chargedWidth) / 1000000);
  const tall = cat.tall_step * tallSteps;
  let cost = rates.per_piece + rates.rate_factor * (edge + area + tall);
  const surcharge = chargedWidth >= card.full_width.width_mm && chargedHeight >= card.full_width.from_height_mm;
  if (surcharge) cost *= card.full_width.factor;
  if (card.safety_percent) cost *= 1 + card.safety_percent / 100;
  const unitCost = round2(cost);

  const sized = chargedHeight !== height || chargedWidth !== width
    ? `charged as ${chargedHeight} x ${chargedWidth}`
    : `${chargedHeight} x ${chargedWidth}`;
  return {
    ok: true,
    applies: true,
    unitCost,
    chargedHeight,
    chargedWidth,
    category,
    tier: tier.key,
    tierLabel: tier.label,
    surcharge,
    parts: {
      per_piece: round2(rates.per_piece),
      edge: round2(rates.rate_factor * edge),
      area: round2(rates.rate_factor * area),
      tall: round2(rates.rate_factor * tall),
      tall_steps: tallSteps,
      full_width_factor: surcharge ? card.full_width.factor : 1,
      safety_percent: card.safety_percent || 0,
    },
    label: `${card.supplier} thermolaminate rate card: ${category}, ${tier.label}, ${sized}${surcharge ? ", full width surcharge" : ""}`,
  };
}

/**
 * A line priced from the card, in the fields a quote line carries. Only a
 * line in automatic mode takes the price; a manual line keeps what was typed
 * and still gets the calculated figure beside it, so "Reset" can offer it.
 * A line that is not thermolaminate comes back untouched.
 */
export function withThermoPrice(line = {}, card, { forceAuto = false } = {}) {
  const result = priceThermoLine(line, card);
  if (!result.applies) return line;
  const next = { ...line, calculated_unit_cost_ex_gst: result.ok ? result.unitCost : 0, unit_cost_per_sqm_ex_gst: 0 };
  // Nothing typed is nothing to protect: a line at $0 takes the rate card price
  // even when it says manual, which is how a new line starts out.
  const typed = Number(line.product_unit_cost_ex_gst) > 0;
  if (forceAuto || (result.ok && !typed)) next.unit_cost_mode = "auto";
  if (result.ok) {
    next.unit_cost_source_label = result.label;
    if (next.unit_cost_mode === "auto") next.product_unit_cost_ex_gst = result.unitCost;
  }
  return next;
}

/**
 * A converted quote line, priced from the card when it is thermolaminate.
 *
 * The colour library holds no rate for thermolaminate, because it is made to
 * order, so the board match a converted line arrives with always says so. The
 * card prices it instead, and the markup becomes our thermolaminate margin: the
 * one on a freshly converted line is only the business default, not anybody's
 * decision. One the card cannot price stays made to order, saying why.
 *
 * Shared by the quote request conversion and the web shop, so a door bought
 * online and the same door quoted are the same number.
 *
 * `entry` is what convertedQuoteLine returns. Without a card, and for every
 * line that is not thermolaminate, it comes back untouched.
 */
export function withThermoRateCard(entry, card) {
  if (!card || !entry || entry.skipped) return entry;
  const result = priceThermoLine(entry.line, card);
  if (!result.applies) return entry;
  if (!result.ok) return { ...entry, thermo: result, match: { ok: false, reason: "made_to_order", message: result.reason } };
  const line = { ...withThermoPrice(entry.line, card, { forceAuto: true }), markup_percent: card.margin_percent };
  return { ...entry, thermo: result, line, match: { ok: true, reason: "thermo_rate_card" } };
}
