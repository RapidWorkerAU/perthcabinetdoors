import { normaliseMaterialKey } from "./pcd-materials";

export const GST_RATE = 0.1;

// The values used when the settings row genuinely cannot be read. They are a
// last resort, not a source of wording or policy.
//
// WHY THE TERMS ARE BLANK. quote_terms used to hold the old "valid for 14 days"
// wording, which made this constant a live source of customer-facing text: any
// path that fell back to it reintroduced terms that had been deleted in
// settings, on a quote nobody had chosen them for. Terms are a business
// decision, so there is no sensible built-in for them. Blank means a quote with
// no terms prints no terms, which is honest and visible, rather than quietly
// printing wording nobody wrote.
export const DEFAULT_BUSINESS_DEFAULTS = {
  currency: "AUD",
  gst_rate: GST_RATE,
  markup_percent: 40,
  hinge_drilling_unit_cost_ex_gst: 10,
  hinge_supply_unit_cost_ex_gst: 0,
  quote_terms: "",
  variation_terms: "",
  // Signed onto every reply sent from the customer desk. Blank means no
  // signature, the same rule the terms follow: a business that has not written
  // one sends none rather than wording nobody chose.
  email_signature_html: "",
  worker_hourly_rate: 85,
  // Workshop labour hours allowed PER CABINET (audit p2-6). Each base-cabinet
  // line contributes labour_hours_per_cabinet × qty to the quote's labour total.
  // A starting estimate — adjust in Business Defaults.
  labour_hours_per_cabinet: 1.5,
  // Hours to make ONE door, drawer front or panel in house from decorative
  // board. Every such line adds this × its qty to the quote's labour hours,
  // alongside labour_hours_per_cabinet above. See calculateQuoteLine.
  inhouse_processing_hours_per_piece: 0,
  // ABS edging per lineal metre, ex GST, our cost plus our uplift. Charged on
  // the edges of every decorative board line. See edgingTotals.
  abs_edging_cost_per_lineal_metre_ex_gst: 0,
  // Quote-level costs a NEW quote starts with. Each one prefills the box of the
  // same name on the quote, which stays editable per job. They start at 0, so
  // until they are filled in a new quote looks exactly as it does today.
  //
  // default_installation_cost_ex_gst is the box labelled "Consumables". The
  // quote column is installation_cost_ex_gst and these names are kept in step
  // with it deliberately, so the mapping is one word either side.
  default_travel_cost_ex_gst: 0,
  default_delivery_cost_ex_gst: 0,
  default_installation_cost_ex_gst: 0,
  default_painting_cost_ex_gst: 0,
  default_glass_cost_ex_gst: 0,
  default_removal_cost_ex_gst: 0,
};

// The quote box each default fills, and the ONE place that mapping is written.
// Every path that makes a quote reads it from here, so a default can never
// apply on one route and quietly not on another.
export const QUOTE_COST_DEFAULT_BY_FIELD = {
  travel_cost_ex_gst: "default_travel_cost_ex_gst",
  delivery_cost_ex_gst: "default_delivery_cost_ex_gst",
  installation_cost_ex_gst: "default_installation_cost_ex_gst",
  painting_cost_ex_gst: "default_painting_cost_ex_gst",
  glass_cost_ex_gst: "default_glass_cost_ex_gst",
  removal_cost_ex_gst: "default_removal_cost_ex_gst",
};

export const PROJECT_LINE_STATUSES = [
  "Not Ordered",
  "Ordered",
  "Received",
  "Checked",
  "Installed",
  "Complete",
  "Issue Follow-Up",
];

export const PROJECT_STATUSES = ["active", "on_hold", "complete", "cancelled"];

// pending_deposit first, because that is where an order that needs a deposit
// begins. See lib/pcd-order-deposit.js for what promotes it to active.
export const ORDER_STATUSES = ["pending_deposit", "active", "on_hold", "complete", "cancelled"];

export const ORDER_LINE_STATUSES = [
  "Not Ordered",
  "Ordered",
  "Received",
  "Checked",
  "Installed",
  "Complete",
];

export const ORDER_PRODUCTION_STAGES = [
  "Not Started",
  "Materials Ready",
  "Cutting",
  "Edging",
  "Profiling",
  "Thermolaminating",
  "Drilling",
  "Quality Check",
  "Packed",
  "Ready for Install",
  "Complete",
];

export function toNumber(value, fallback = 0) {
  if (value === "" || value === null || typeof value === "undefined") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Several money columns are `not null default 0` in Postgres, so a row that was
// never given a value is indistinguishable from one deliberately set to zero —
// and toNumber(0, fallback) returns 0, not the fallback. For fields where zero
// is not a real business value (a worker does not cost $0/hour), zero has to
// mean "inherit the global default", or every quote created before the field
// was populated silently prices its labour at nothing.
//
// Only use this for fields where zero is genuinely meaningless. Line markup
// deliberately does NOT use it: 0% markup is a real choice on a pass-through
// item, and overriding it here would quietly reprice work that was quoted
// correctly.
export function inheritWhenZero(value, fallback = 0) {
  const number = toNumber(value, fallback);
  return number === 0 ? toNumber(fallback) : number;
}

export function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

// Every settings field the app is allowed to see, in one shape.
//
// This DROPS keys it does not list, which is easy to forget: a column added to
// pcd_business_defaults is invisible to the whole application until it is added
// here as well as to businessDefaultsToDbRow and the settings screen. That is
// exactly how the drawer runner rates ended up unreachable — they existed as
// constants, nothing carried them through, so every quote used the built-in
// number no matter what was configured.
export function normalizeBusinessDefaults(defaults = {}) {
  const text = (value, fallback) => String(value ?? fallback ?? "");
  return {
    currency: String(defaults.currency ?? defaults.currency_code ?? DEFAULT_BUSINESS_DEFAULTS.currency).toUpperCase(),
    gst_rate: toNumber(defaults.gst_rate ?? defaults.gstRate, DEFAULT_BUSINESS_DEFAULTS.gst_rate),
    markup_percent: toNumber(defaults.markup_percent ?? defaults.markupPercent, DEFAULT_BUSINESS_DEFAULTS.markup_percent),
    hinge_drilling_unit_cost_ex_gst: toNumber(
      defaults.hinge_drilling_unit_cost_ex_gst ?? defaults.hingeDrillingUnitCostExGst,
      DEFAULT_BUSINESS_DEFAULTS.hinge_drilling_unit_cost_ex_gst
    ),
    hinge_supply_unit_cost_ex_gst: 0,
    // Blank is a real answer for both of these: it means "this business has not
    // written terms", and a quote then carries none. It must never silently
    // become wording from a constant.
    quote_terms: text(defaults.quote_terms ?? defaults.quoteTerms, DEFAULT_BUSINESS_DEFAULTS.quote_terms),
    variation_terms: text(defaults.variation_terms ?? defaults.variationTerms, DEFAULT_BUSINESS_DEFAULTS.variation_terms),
    email_signature_html: text(defaults.email_signature_html, DEFAULT_BUSINESS_DEFAULTS.email_signature_html),
    // A stored 0 here means the field was never filled in, not that a worker
    // costs nothing an hour, so it inherits. Without this a single 0 saved in
    // settings prices the labour on every quote in the system at nothing, with
    // no warning anywhere. Same reasoning as inheritWhenZero above, applied one
    // level earlier so the whole app is covered rather than each caller.
    worker_hourly_rate: inheritWhenZero(
      defaults.worker_hourly_rate ?? defaults.workerHourlyRate,
      DEFAULT_BUSINESS_DEFAULTS.worker_hourly_rate
    ),
    labour_hours_per_cabinet: toNumber(
      defaults.labour_hours_per_cabinet ?? defaults.labourHoursPerCabinet,
      DEFAULT_BUSINESS_DEFAULTS.labour_hours_per_cabinet
    ),
    inhouse_processing_hours_per_piece: toNumber(
      defaults.inhouse_processing_hours_per_piece,
      DEFAULT_BUSINESS_DEFAULTS.inhouse_processing_hours_per_piece
    ),
    abs_edging_cost_per_lineal_metre_ex_gst: toNumber(
      defaults.abs_edging_cost_per_lineal_metre_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.abs_edging_cost_per_lineal_metre_ex_gst
    ),
    default_travel_cost_ex_gst: toNumber(
      defaults.default_travel_cost_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.default_travel_cost_ex_gst
    ),
    default_delivery_cost_ex_gst: toNumber(
      defaults.default_delivery_cost_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.default_delivery_cost_ex_gst
    ),
    default_installation_cost_ex_gst: toNumber(
      defaults.default_installation_cost_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.default_installation_cost_ex_gst
    ),
    default_painting_cost_ex_gst: toNumber(
      defaults.default_painting_cost_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.default_painting_cost_ex_gst
    ),
    default_glass_cost_ex_gst: toNumber(
      defaults.default_glass_cost_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.default_glass_cost_ex_gst
    ),
    default_removal_cost_ex_gst: toNumber(
      defaults.default_removal_cost_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.default_removal_cost_ex_gst
    ),
  };
}

// The quote-level costs a new quote starts with, ready to spread onto an insert.
export function quoteCostDefaults(defaults = {}) {
  const normalized = normalizeBusinessDefaults(defaults);
  const costs = {};
  for (const [field, key] of Object.entries(QUOTE_COST_DEFAULT_BY_FIELD)) {
    costs[field] = toNumber(normalized[key]);
  }
  return costs;
}

// Fill in only the costs the caller has not decided for itself.
//
// A 0 the caller sent is a real answer and is kept: someone who clears the
// delivery box on a quote means nothing for delivery, and a default must never
// put it back. Only an absent field inherits.
export function applyQuoteCostDefaults(payload = {}, defaults = {}) {
  const costs = quoteCostDefaults(defaults);
  const filled = { ...payload };
  for (const field of Object.keys(QUOTE_COST_DEFAULT_BY_FIELD)) {
    const sent = payload[field];
    if (sent === undefined || sent === null || sent === "") filled[field] = costs[field];
  }
  return filled;
}

// ── Board we cut and edge ourselves ──────────────────────────────────────────
//
// Two numbers on a quote come off the same question: which lines are decorative
// board that our own workshop makes. The in-house processing time is charged per
// piece of it, and the ABS edging is charged per lineal metre of its edges.
// Both read this, so a line can never count for one and not the other.
//
// Hardware carries no board at all, and a benchtop is priced from the benchtop
// material list rather than the board library, so neither counts however their
// material column reads. Everything else is decided by the material itself:
// decorative board in any thickness counts, thermolaminate and compact laminate
// do not.
const NON_BOARD_PRODUCT_TYPES = new Set(["hardware", "benchtop"]);
const BASE_CABINET_PRODUCT_TYPE = "base_cabinet";

function productTypeKey(line = {}) {
  return String(line.product_type ?? line.productType ?? "").trim().toLowerCase();
}

export function isDecorativeBoardLine(line = {}) {
  if (NON_BOARD_PRODUCT_TYPES.has(productTypeKey(line))) return false;
  return normaliseMaterialKey(line.material) === "decorative_board";
}

// Lineal metres of edge tape one line needs: all four edges of every piece.
//
// Four edges is deliberate and it is the same rule for every line, a cabinet
// included. A carcass is edged across its front — two sides plus the top and
// the bottom — which is exactly the perimeter of the face the line already
// carries. A panel with a hidden edge is over-counted a little; that is the
// price of not asking someone to describe every edge of every piece.
export function edgingLinealMetres(line = {}) {
  if (!isDecorativeBoardLine(line)) return 0;
  const width = toNumber(line.width_mm ?? line.widthMm);
  const height = toNumber(line.height_mm ?? line.heightMm);
  const qty = Math.max(0, toNumber(line.qty, 1));
  if (!(width > 0) || !(height > 0) || !(qty > 0)) return 0;
  return roundMoney(((2 * (width + height)) / 1000) * qty);
}

// The edging figure for a whole quote: the metres, the rate, what that comes to,
// and what is actually charged once any override is taken into account.
//
// The rate on the settings screen is our cost plus our uplift, ex GST, so this
// is charged as it stands and is never marked up again — the same as delivery
// or consumables.
export function edgingTotals(lines = [], defaults = {}, costs = {}) {
  const normalized = normalizeBusinessDefaults(defaults);
  const metres = roundMoney(
    (Array.isArray(lines) ? lines : []).reduce(
      (sum, line) => sum + toNumber(line.edging_lineal_metres ?? edgingLinealMetres(line)),
      0
    )
  );
  const ratePerLm = toNumber(normalized.abs_edging_cost_per_lineal_metre_ex_gst);
  const calculated = roundMoney(metres * ratePerLm);
  // Null, undefined and "" all mean "not overridden". A typed 0 is an override:
  // it says this job carries no edging cost, and a recalculation must not put
  // the calculated figure back.
  const rawOverride = costs.edging_cost_override_ex_gst ?? costs.edgingCostOverrideExGst;
  const overridden = rawOverride !== undefined && rawOverride !== null && rawOverride !== "";
  return {
    edging_lineal_metres: metres,
    edging_rate_per_lm_ex_gst: ratePerLm,
    edging_calculated_cost_ex_gst: calculated,
    edging_cost_override_ex_gst: overridden ? roundMoney(toNumber(rawOverride)) : null,
    edging_cost_ex_gst: overridden ? roundMoney(toNumber(rawOverride)) : calculated,
  };
}

function hingeCount(value) {
  const match = String(value || "").match(/\d+/);
  return match ? toNumber(match[0]) : 0;
}

export function calculateQuoteLine(line = {}, defaults = {}) {
  const calculationDefaults = normalizeBusinessDefaults(defaults);
  const qty = Math.max(0, toNumber(line.qty, 1));
  const productUnitCostExGst = toNumber(line.product_unit_cost_ex_gst ?? line.productUnitCostExGst);
  // Blank means "whatever the business default is", the same rule the labour
  // hours and the edging cost follow. A typed 0 is a real answer and stays 0.
  // `??` alone would not do it: an empty string is not null, and Number("") is
  // 0, so a line waiting for its default would have quietly been a 0% markup.
  const markupGiven = line.markup_percent ?? line.markupPercent;
  const markupPercent =
    markupGiven === "" || markupGiven === null || markupGiven === undefined
      ? toNumber(calculationDefaults.markup_percent)
      : toNumber(markupGiven, calculationDefaults.markup_percent);
  const hingeQty = hingeCount(line.hinge_qty ?? line.hingeQty);
  const hingeDrillingUnitCost = toNumber(
    line.hinge_drilling_unit_cost_ex_gst ?? line.hingeDrillingUnitCostExGst,
    calculationDefaults.hinge_drilling_unit_cost_ex_gst
  );
  const hingeDrillingCostExGst = line.hinge_holes || line.hingeHoles ? roundMoney(hingeQty * hingeDrillingUnitCost * qty) : 0;
  const hingeSupplyCostExGst = 0;
  const hingeDrillingQty = line.hinge_holes || line.hingeHoles ? hingeQty * qty : 0;
  const hingeSupplyQty = 0;
  // Cabinet labour (audit p2-6): every base-cabinet line carries the per-cabinet
  // business-default hours × its qty, recomputed here each calc so it always
  // reflects the current default. This feeds the DERIVED quote labour total,
  // never the manual base — see calculateQuoteTotals.
  const isCabinetLine = productTypeKey(line) === BASE_CABINET_PRODUCT_TYPE;
  // In-house processing time: the hours our workshop spends making one door,
  // drawer front or panel out of decorative board, × how many of them.
  //
  // A cabinet is excluded on purpose. Its per-cabinet hours above are already
  // the time to make the cabinet, so charging processing on top would bill the
  // same work twice. The doors and panels that go on it are their own lines and
  // are counted here, which is what makes the two add up rather than overlap.
  const processingLabourHours = !isCabinetLine && isDecorativeBoardLine(line)
    ? roundMoney(toNumber(calculationDefaults.inhouse_processing_hours_per_piece) * qty)
    : 0;
  // THIS HAS TO SURVIVE BEING RUN TWICE ON THE SAME LINE, and it did not.
  //
  // It used to return `line.labour_hours + processingLabourHours`, and the
  // result is written back to the same column it was read from. So every save
  // added the processing time again. Worse, calculateQuoteTotals calls this on
  // every line, so a line that had already been calculated once, as it has in
  // the Stage Quote preview and on every import, was counted twice before it
  // was ever saved. Two panels at half an hour each came out at two hours in
  // the preview and grew by another hour every time the quote was touched.
  //
  // The line now returns what is ON it, and the processing time stays reported
  // separately in processing_labour_hours. calculateQuoteTotals adds the two
  // together once. Running this ten times gives the same answer as running it
  // once, which is the only property that makes a derived figure trustworthy.
  const labourHours = isCabinetLine
    ? roundMoney(toNumber(calculationDefaults.labour_hours_per_cabinet) * qty)
    : roundMoney(toNumber(line.labour_hours ?? line.labourHours));
  const productCostExGst = roundMoney(productUnitCostExGst * qty);
  const markupAmountExGst = roundMoney(productCostExGst * (markupPercent / 100));
  const lineTotalExGst = roundMoney(productCostExGst + markupAmountExGst + hingeDrillingCostExGst + hingeSupplyCostExGst);

  return {
    product_type: line.product_type ?? line.productType ?? "",
    product_name: line.product_name ?? line.productName ?? "",
    description: line.description ?? "",
    material: line.material ?? "",
    supplier_name: line.supplier_name ?? line.supplierName ?? "",
    thickness: line.thickness ?? "",
    width_mm: line.width_mm ?? line.widthMm ?? null,
    height_mm: line.height_mm ?? line.heightMm ?? null,
    finish: line.finish ?? "",
    colour: line.colour ?? "",
    profile_type: line.profile_type ?? line.profileType ?? "",
    profile: line.profile ?? "",
    edge_mould: line.edge_mould ?? line.edgeMould ?? "",
    qty,
    hinge_holes: Boolean(line.hinge_holes ?? line.hingeHoles ?? false),
    hinge_supply: false,
    hinge_qty: line.hinge_qty ?? line.hingeQty ?? "",
    product_unit_cost_ex_gst: productUnitCostExGst,
    unit_cost_mode: line.unit_cost_mode ?? line.unitCostMode ?? "manual",
    unit_cost_source_id: line.unit_cost_source_id ?? line.unitCostSourceId ?? null,
    unit_cost_source_label: line.unit_cost_source_label ?? line.unitCostSourceLabel ?? "",
    unit_cost_per_sqm_ex_gst: toNumber(line.unit_cost_per_sqm_ex_gst ?? line.unitCostPerSqmExGst),
    calculated_unit_cost_ex_gst: toNumber(line.calculated_unit_cost_ex_gst ?? line.calculatedUnitCostExGst),
    product_cost_ex_gst: productCostExGst,
    material_cost_ex_gst: lineTotalExGst,
    hinge_drilling_cost_ex_gst: hingeDrillingCostExGst,
    hinge_supply_cost_ex_gst: hingeSupplyCostExGst,
    hinge_drilling_qty: hingeDrillingQty,
    hinge_supply_qty: hingeSupplyQty,
    labour_hours: labourHours,
    // Reported so the totals can say where the hours and the metres came from.
    // Neither is a column on a quote line; both are worked out from the line
    // every time, so they can never drift from the sizes and quantity on it.
    processing_labour_hours: processingLabourHours,
    edging_lineal_metres: edgingLinealMetres(line),
    worker_hourly_rate: 0,
    labour_cost_ex_gst: 0,
    travel_cost_ex_gst: 0,
    delivery_cost_ex_gst: 0,
    installation_cost_ex_gst: 0,
    painting_cost_ex_gst: 0,
    glass_cost_ex_gst: 0,
    removal_cost_ex_gst: 0,
    other_cost_ex_gst: 0,
    markup_percent: markupPercent,
    markup_amount_ex_gst: markupAmountExGst,
    unit_price_ex_gst: roundMoney(productUnitCostExGst + (productUnitCostExGst * (markupPercent / 100))),
    line_total_ex_gst: lineTotalExGst,
    client_note: line.client_note ?? line.clientNote ?? "",
    notes: line.notes ?? "",
  };
}

export function calculateQuoteTotals(lines = [], gstRate = GST_RATE, costs = {}) {
  const calculationDefaults = normalizeBusinessDefaults(costs.business_defaults ?? costs.businessDefaults ?? costs);
  const normalizedLines = lines.map((line) => calculateQuoteLine(line, calculationDefaults));
  const productLinesCostExGst = roundMoney(
    normalizedLines.reduce((sum, line) => sum + toNumber(line.product_cost_ex_gst), 0)
  );
  const materialCostExGst = roundMoney(
    normalizedLines.reduce((sum, line) => sum + toNumber(line.material_cost_ex_gst), 0)
  );
  const hingeDrillingCostExGst = roundMoney(
    normalizedLines.reduce((sum, line) => sum + toNumber(line.hinge_drilling_cost_ex_gst), 0)
  );
  const hingeSupplyCostExGst = roundMoney(
    normalizedLines.reduce((sum, line) => sum + toNumber(line.hinge_supply_cost_ex_gst), 0)
  );
  const hingeDrillingQty = normalizedLines.reduce((sum, line) => sum + toNumber(line.hinge_drilling_qty), 0);
  const hingeSupplyQty = normalizedLines.reduce((sum, line) => sum + toNumber(line.hinge_supply_qty), 0);
  // LABOUR HOURS WORK LIKE THE EDGING COST: worked out from the lines, and
  // overridden by typing a number in.
  //
  // They used to be additive. The box on the quote held a "manual" figure that
  // was added to the automatic hours, so the number on screen was one nobody
  // could edit: clearing the box to zero still left the automatic hours behind,
  // with nothing to say where they came from or how to be rid of them.
  //
  // Now the box holds the whole figure. Blank means follow the lines; a typed
  // number, including zero, pins it. manual_labour_hours is that override, and
  // it is null when nothing has been typed.
  const lineLabourHours = normalizedLines.reduce((sum, line) => sum + toNumber(line.labour_hours), 0);
  // The same line hours, split by where they came from, purely so the editor can
  // say "x from cabinets, y from fronts and panels" instead of one lump nobody
  // can check.
  const cabinetLabourHours = roundMoney(
    normalizedLines.reduce(
      (sum, line) => sum + (productTypeKey(line) === BASE_CABINET_PRODUCT_TYPE ? toNumber(line.labour_hours) : 0),
      0
    )
  );
  const processingLabourHours = roundMoney(
    normalizedLines.reduce((sum, line) => sum + toNumber(line.processing_labour_hours), 0)
  );
  // What the lines say the job takes, before anybody overrides it.
  const calculatedLabourHours = roundMoney(lineLabourHours + processingLabourHours);
  // Null, undefined and "" all mean "not overridden". A typed 0 IS an override:
  // it says this job carries no labour, and a recalculation must not put the
  // calculated hours back. Same rule as the edging override, deliberately.
  const rawLabourOverride = costs.manual_labour_hours ?? costs.manualLabourHours;
  const labourOverridden = rawLabourOverride !== undefined && rawLabourOverride !== null && rawLabourOverride !== "";
  const manualLabourHours = labourOverridden ? roundMoney(toNumber(rawLabourOverride)) : null;
  const labourHours = labourOverridden ? manualLabourHours : calculatedLabourHours;
  const edging = edgingTotals(normalizedLines, calculationDefaults, costs);
  // A stored 0 here is the column default on a quote that never captured a
  // rate, not a decision to pay nothing — inherit the configured rate so the
  // labour total is not silently zeroed. See inheritWhenZero.
  const workerHourlyRate = inheritWhenZero(
    costs.worker_hourly_rate ?? costs.workerHourlyRate,
    calculationDefaults.worker_hourly_rate
  );
  const labourCostExGst = roundMoney(labourHours * workerHourlyRate);
  const travelCostExGst = toNumber(costs.travel_cost_ex_gst ?? costs.travelCostExGst);
  const deliveryCostExGst = toNumber(costs.delivery_cost_ex_gst ?? costs.deliveryCostExGst);
  const installationCostExGst = toNumber(costs.installation_cost_ex_gst ?? costs.installationCostExGst);
  const paintingCostExGst = toNumber(costs.painting_cost_ex_gst ?? costs.paintingCostExGst);
  const glassCostExGst = toNumber(costs.glass_cost_ex_gst ?? costs.glassCostExGst);
  const removalCostExGst = toNumber(costs.removal_cost_ex_gst ?? costs.removalCostExGst);
  const otherCostExGst = 0;
  const costBeforeMarkup = roundMoney(
    materialCostExGst +
      labourCostExGst +
      travelCostExGst +
      deliveryCostExGst +
      installationCostExGst +
      paintingCostExGst +
      glassCostExGst +
      removalCostExGst +
      edging.edging_cost_ex_gst +
      otherCostExGst
  );
  const markupAmountExGst = roundMoney(
    normalizedLines.reduce((sum, line) => sum + toNumber(line.markup_amount_ex_gst), 0)
  );
  const subtotalExGst = costBeforeMarkup;
  const gstAmount = roundMoney(subtotalExGst * gstRate);
  const totalIncGst = roundMoney(subtotalExGst + gstAmount);

  return {
    lines: normalizedLines,
    subtotal_ex_gst: subtotalExGst,
    gst_amount: gstAmount,
    total_inc_gst: totalIncGst,
    product_lines_cost_ex_gst: productLinesCostExGst,
    material_cost_ex_gst: materialCostExGst,
    manual_labour_hours: manualLabourHours,
    // What the lines add up to, so the editor can put it in the box as a real
    // editable number rather than showing it as a figure nobody can touch.
    calculated_labour_hours: calculatedLabourHours,
    labour_hours_overridden: labourOverridden,
    line_labour_hours: roundMoney(lineLabourHours),
    cabinet_labour_hours: cabinetLabourHours,
    processing_labour_hours: processingLabourHours,
    labour_hours: labourHours,
    worker_hourly_rate: workerHourlyRate,
    labour_cost_ex_gst: labourCostExGst,
    travel_cost_ex_gst: travelCostExGst,
    delivery_cost_ex_gst: deliveryCostExGst,
    installation_cost_ex_gst: installationCostExGst,
    painting_cost_ex_gst: paintingCostExGst,
    glass_cost_ex_gst: glassCostExGst,
    removal_cost_ex_gst: removalCostExGst,
    ...edging,
    other_cost_ex_gst: otherCostExGst,
    hinge_drilling_cost_ex_gst: hingeDrillingCostExGst,
    hinge_supply_cost_ex_gst: hingeSupplyCostExGst,
    hinge_drilling_qty: hingeDrillingQty,
    hinge_supply_qty: hingeSupplyQty,
    markup_percent: 0,
    markup_amount_ex_gst: markupAmountExGst,
  };
}

/**
 * One line summary of what an item physically is: size, then the finish
 * details. Order items, project items and variation lines all carry the same
 * spec columns, so they all read the same way wherever they are listed.
 * Pass includeQty when the reader needs to compare two versions of an item
 * (a variation) and a qty change would otherwise be invisible.
 */
export function formatItemSpecs(item, { includeQty = false } = {}) {
  if (!item) return "";
  const size = item.width_mm || item.height_mm
    ? `${item.height_mm || "-"} x ${item.width_mm || "-"}mm`
    : "";
  const finish = [
    item.material,
    item.thickness,
    item.finish,
    item.colour,
    item.profile_type,
    item.profile,
    item.edge_mould,
  ].filter(Boolean).join(" - ");
  const qty = includeQty && toNumber(item.qty) > 0 ? `Qty ${toNumber(item.qty)}` : "";
  return [size, finish, qty].filter(Boolean).join(" | ");
}

export function formatMoney(value, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}
