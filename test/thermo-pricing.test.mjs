// Every Polytec portal price we have, checked against the thermolaminate rate
// card. Priced 27 September 2026, one piece at a time, 18mm, Thumb Mould,
// SS TBLR (the edge mould does not change the price).
//
// If a change to lib/pcd-thermo-pricing.js moves the calculated price away from
// what Polytec actually charged, this is where it shows. The two known oddities
// are named below rather than hidden by a loose tolerance.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_THERMO_RATE_CARD, normalizeThermoRateCard, priceThermoLine, withThermoPrice, chargedStep, isThermoLine,
} from "../lib/pcd-thermo-pricing.js";

const card = normalizeThermoRateCard({});
const line = (profile_type, finish, height_mm, width_mm, extra = {}) => ({
  product_type: "Door", material: "Thermolaminate", supplier_name: "Polytec", thickness: "18mm",
  profile_type, finish, height_mm, width_mm, qty: 1, ...extra,
});

const CORE = [[150, 300], [300, 600], [720, 450], [900, 600], [2100, 600], [2400, 900]];
const CORE_PRICES = {
  Smooth: { Minimal: [25.93, 43.72, 53.01, 71.73, 138.82, 238.99], Soft: [30.85, 53.23, 64.99, 92.22, 191.21, 323.74], Sharp: [35.77, 62.72, 76.95, 109.32, 226.63, 388.17], Detailed: [42.68, 75.01, 92.19, 130.66, 269.57, 465.37] },
  Matt: { Minimal: [25.93, 43.72, 53.01, 71.73, 138.82, 238.99], Soft: [30.85, 53.23, 64.99, 92.22, 191.21, 323.74], Sharp: [35.77, 62.72, 76.95, 109.32, 226.63, 388.17], Detailed: [42.68, 75.01, 92.19, 130.66, 269.57, 465.37] },
  Texture: { Minimal: [23.99, 40.15, 48.57, 65.57, 126.60, 217.67], Soft: [28.42, 48.78, 59.44, 84.21, 174.19, 294.69], Sharp: [31.94, 57.39, 70.37, 99.78, 206.41, 353.25], Detailed: [39.18, 68.68, 84.32, 119.41, 245.96, 424.44] },
  Gloss: { Minimal: [31.86, 54.52, 66.31, 90.13, 175.52, 303.04], Soft: [38.11, 66.59, 81.57, 116.19, 242.20, 410.87], Sharp: [44.36, 78.69, 96.79, 138.01, 287.27, 492.90] },
  Woodmatt: { Minimal: [34.63, 59.55, 72.53, 98.69, 192.67, 332.90], Soft: [41.51, 72.84, 89.30, 127.38, 265.98, 451.56], Sharp: [48.37, 86.13, 106.03, 151.39, 315.57, 541.74], Detailed: [58.04, 103.35, 124.04, 177.12, 369.22, 633.84] },
  Natura: { Minimal: [34.63, 59.55, 72.53, 98.69, 192.67, 332.90], Soft: [41.51, 72.84, 89.30, 127.38, 265.98, 451.56], Sharp: [48.37, 86.13, 106.03, 151.39, 315.57, 541.74], Detailed: [58.04, 103.35, 124.04, 177.12, 369.22, 633.84] },
  Ravine: { Minimal: [34.63, 59.55, 72.53, 98.69, 192.67, 332.90], Soft: [41.51, 72.84, 89.30, 127.38, 265.98, 451.56], Sharp: [48.37, 86.13, 106.03, 151.39, 315.57, 541.74], Detailed: [58.04, 103.35, 124.04, 177.12, 369.22, 633.84] },
  Raw: { Minimal: [17.72, 28.44, 34.00, 45.23, 85.61, 145.88], Soft: [20.68, 34.17, 41.21, 57.59, 117.12, 196.83], Sharp: [23.64, 39.86, 48.42, 67.87, 138.41, 235.57], Detailed: [27.90, 47.75, 58.36, 81.93, 167.14, 287.55] },
};

// Smooth, many sizes. [category, height, width, price]
const SMOOTH_SIZES = [
  // Minimal (Brussels): size run, size steps, surcharge tests
  ...[[150,300,25.93],[200,400,28.15],[300,300,32.05],[300,600,43.72],[600,300,38.13],[400,400,35.94],[200,800,36.96],[450,450,46.54],[600,600,54.92],[720,300,42.73],[720,450,53.01],[720,600,63.32],[900,600,71.73],[1200,600,88.49],[1500,600,105.26],[2100,600,138.82],[2100,450,111.38],[2400,600,155.62],[2400,900,238.99],[2400,1200,322.11],[720,1200,104.50],
    [650,600,63.32],[700,600,63.32],[750,600,63.32],[800,600,71.73],[850,600,71.73],[720,350,46.15],[720,400,49.62],[720,500,56.44],[720,550,59.89],[150,600,32.53],[200,600,32.53],[250,600,43.72],[400,600,43.72],[500,600,54.92],
    [2400,400,113.91],[2400,410,124.32],[2400,550,145.20],[2400,610,166.04],[2400,700,197.29],[2400,800,197.29],[2400,1000,238.99],[1200,610,93.81],[1200,900,131.21],[1200,1200,152.55],[1190,600,88.49],[1210,600,105.26],[1520,600,122.04],[1530,600,122.04],
    [1500,900,158.15],[1500,1200,184.61],[1800,900,185.10],[2100,900,212.04],[2100,1200,286.88],[720,200,42.73],[150,450,29.23]].map((r) => ["Minimal", ...r]),
  // Soft (Dorrigo) and Sharp (Bali)
  ...[[600,600,67.45],[650,600,78.15],[700,600,78.15],[750,600,78.15],[800,600,92.22],[850,600,92.22],[900,600,92.22],[720,300,51.84],[720,350,56.24],[720,400,60.58],[720,450,64.99],[720,500,69.36],[720,550,73.75],[720,600,78.15],[150,600,39.02],[200,600,39.02],[250,600,53.23],[300,600,53.23],[400,600,53.23],[500,600,67.45],[1200,600,116.98],[1500,600,141.72],[1800,600,166.46],[2100,600,191.21],[1500,300,90.61],[1500,450,116.15],[1500,900,209.84]].map((r) => ["Soft", ...r]),
  ...[[600,600,80.01],[650,600,92.98],[700,600,92.98],[750,600,92.98],[800,600,109.32],[850,600,109.32],[900,600,109.32],[720,300,60.93],[720,350,66.27],[720,400,71.61],[720,450,76.95],[720,500,82.31],[720,550,87.63],[720,600,92.98],[150,600,45.44],[200,600,45.44],[250,600,62.72],[300,600,62.72],[400,600,62.72],[500,600,80.01],[1200,600,138.65],[1500,600,167.97],[1800,600,197.29],[2100,600,226.63],[1500,300,105.44],[1500,450,136.70],[1500,900,251.38]].map((r) => ["Sharp", ...r]),
  // Detailed (Ascot)
  ...[[600,600,95.90],[650,600,111.58],[700,600,111.58],[750,600,111.58],[800,600,130.66],[850,600,130.66],[900,600,130.66],[720,300,72.80],[720,350,79.25],[720,400,85.72],[720,500,98.63],[720,550,105.13],[720,600,111.58],[150,600,54.13],[200,600,54.13],[250,600,75.01],[400,600,75.01],[500,600,95.90],[750,450,92.19],[800,450,107.49],[1050,600,165.36],[1200,600,165.36],[1500,600,200.10],[1800,600,234.85],[1500,300,124.03],[1500,450,162.08],[1500,900,301.54],[2400,450,243.92]].map((r) => ["Detailed", ...r]),
];

const pct = (a, b) => Math.abs(a - b) / b * 100;

test("every Smooth portal price, all four categories, within 0.6%", () => {
  let worst = 0, sum = 0;
  for (const [cat, h, w, price] of SMOOTH_SIZES) {
    const r = priceThermoLine(line(cat, "Smooth", h, w), card);
    assert.ok(r.ok, `${cat} ${h}x${w}: ${r.reason}`);
    const e = pct(r.unitCost, price);
    worst = Math.max(worst, e); sum += e;
    assert.ok(e <= 0.6, `${cat} ${h}x${w}: portal ${price}, calculated ${r.unitCost} (${e.toFixed(2)}%)`);
  }
  assert.ok(sum / SMOOTH_SIZES.length < 0.1, `average ${(sum / SMOOTH_SIZES.length).toFixed(3)}%`);
});

// The two combinations the portal prices a little off pattern, and a size below
// Bali's own published minimum. Named, with their own tolerance, not hidden.
const KNOWN_ODD = new Map([
  ["Texture|Sharp|150x300", 2.5], // Bali, below its Polytec minimum of 222 x 232
  ["Woodmatt|Detailed", 1.4], ["Natura|Detailed", 1.4], ["Ravine|Detailed", 1.4],
]);

test("every category in every finish, six core sizes", () => {
  let worst = 0, sum = 0, n = 0;
  for (const [finish, cats] of Object.entries(CORE_PRICES)) for (const [cat, prices] of Object.entries(cats)) {
    CORE.forEach(([h, w], i) => {
      const r = priceThermoLine(line(cat, finish, h, w), card);
      assert.ok(r.ok, `${finish} ${cat} ${h}x${w}: ${r.reason}`);
      const e = pct(r.unitCost, prices[i]);
      const allowed = KNOWN_ODD.get(`${finish}|${cat}|${h}x${w}`) ?? KNOWN_ODD.get(`${finish}|${cat}`) ?? 0.5;
      assert.ok(e <= allowed, `${finish} ${cat} ${h}x${w}: portal ${prices[i]}, calculated ${r.unitCost} (${e.toFixed(2)}%)`);
      worst = Math.max(worst, e); sum += e; n += 1;
    });
  }
  assert.ok(sum / n < 0.15, `average ${(sum / n).toFixed(3)}%`);
});

test("size is charged at the next step up", () => {
  assert.equal(chargedStep(720, card.height_steps_mm), 750);
  assert.equal(chargedStep(300, card.height_steps_mm), 400);
  assert.equal(chargedStep(1050, card.height_steps_mm), 1200);
  assert.equal(chargedStep(200, card.width_steps_mm), 300, "no narrower than 300");
  assert.equal(chargedStep(610, card.width_steps_mm), 650);
  assert.equal(chargedStep(700, card.width_steps_mm), 800);
  assert.equal(chargedStep(2410, card.height_steps_mm), null, "past the last step");
  const r = priceThermoLine(line("Minimal", "Smooth", 720, 450), card);
  assert.equal(r.chargedHeight, 750);
  assert.match(r.label, /charged as 750 x 450/);
});

test("what it will not price, it says why", () => {
  const why = (l) => priceThermoLine(l, card);
  assert.match(why(line("Minimal", "Smooth", 720, 450, { thickness: "21mm" })).reason, /21mm/);
  assert.match(why(line("Minimal", "Smooth", 720, 450, { supplier_name: "Laminex" })).reason, /Only Polytec/);
  assert.match(why(line("Fluted", "Smooth", 720, 450)).reason, /Fluted profiles are priced by hand/);
  assert.match(why(line("", "Smooth", 720, 450)).reason, /Pick a profile/);
  assert.match(why(line("Detailed", "Gloss", 720, 450)).reason, /does not make Detailed profiles in Gloss/);
  assert.match(why(line("Minimal", "Smooth", 100, 600)).reason, /facia/);
  assert.match(why(line("Minimal", "Smooth", 2700, 600)).reason, /Over 2400 x 1200/);
  assert.match(why(line("Minimal", "Venette", 720, 450)).reason, /not on the thermolaminate rate card/);
  assert.match(why(line("Minimal", "Smooth", "", 450)).reason, /height and width/);
  assert.equal(priceThermoLine({ material: "Decorative Board" }, card).applies, false, "other boards are left alone");
  assert.equal(isThermoLine({ material: "thermolaminate", product_type: "Door" }), true, "the design tool's spelling too");
});

test("an automatic line takes the price; a manual one keeps its own", () => {
  const auto = withThermoPrice({ ...line("Minimal", "Smooth", 720, 450), unit_cost_mode: "auto", product_unit_cost_ex_gst: 0 }, card);
  assert.ok(Math.abs(auto.product_unit_cost_ex_gst - 53.01) <= 0.02, `auto ${auto.product_unit_cost_ex_gst}`);
  assert.equal(auto.calculated_unit_cost_ex_gst, auto.product_unit_cost_ex_gst);
  const manual = withThermoPrice({ ...line("Minimal", "Smooth", 720, 450), unit_cost_mode: "manual", product_unit_cost_ex_gst: 60 }, card);
  assert.equal(manual.product_unit_cost_ex_gst, 60, "a typed cost is never replaced");
  assert.equal(manual.calculated_unit_cost_ex_gst, auto.product_unit_cost_ex_gst, "the calculated figure sits beside it for Reset");
  const other = { material: "Decorative Board", product_unit_cost_ex_gst: 12 };
  assert.equal(withThermoPrice(other, card), other);
});

test("a saved card is cleaned field by field, and bad values fall back", () => {
  const c = normalizeThermoRateCard({ margin_percent: "80", categories: { Minimal: { area_per_sqm: "nonsense" } }, height_steps_mm: "600, 200, 400" });
  assert.equal(c.margin_percent, 80);
  assert.equal(c.categories.Minimal.area_per_sqm, DEFAULT_THERMO_RATE_CARD.categories.Minimal.area_per_sqm);
  assert.deepEqual(c.height_steps_mm, [200, 400, 600]);
  const noGloss = normalizeThermoRateCard({ tier_rates: { gloss: { Minimal: null } } });
  assert.equal(noGloss.tier_rates.gloss.Minimal, null, "a category can be marked as not made");
});

test("a design import prices a thermolaminate line and gives it our margin", async () => {
  const { withCalculatedUnitCost } = await import("../lib/pcd-design-to-lines.js");
  const designLine = { product_type: "Door", material: "thermolaminate", supplier_name: "Polytec", thickness: "18mm", profile_type: "Minimal", finish: "Smooth", colour: "Gossamer White", height_mm: 720, width_mm: 450, qty: 2, unit_cost_mode: "auto" };
  const priced = withCalculatedUnitCost(designLine, { thermoCard: card });
  assert.ok(Math.abs(priced.product_unit_cost_ex_gst - 53.01) <= 0.02);
  assert.equal(priced.unit_cost_mode, "auto");
  assert.equal(priced.markup_percent, card.margin_percent);
  assert.equal(priced.material, "Thermolaminate");
  const noCard = withCalculatedUnitCost(designLine);
  assert.equal(Number(noCard.product_unit_cost_ex_gst) || 0, 0, "no card, no price: priced by hand as before");
});

test("a line at $0 marked manual is not a typed price: the rate card prices it", () => {
  const saved = { ...line("Soft", "Woodmatt", 720, 450), colour: "Ecru Oak", unit_cost_mode: "manual", product_unit_cost_ex_gst: 0 };
  const priced = withThermoPrice(saved, card);
  assert.equal(priced.unit_cost_mode, "auto");
  assert.ok(Math.abs(priced.product_unit_cost_ex_gst - 89.30) <= 0.1, `${priced.product_unit_cost_ex_gst}`);
});
