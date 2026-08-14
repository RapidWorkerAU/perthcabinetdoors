export const GST_RATE = 0.1;

export const DEFAULT_BUSINESS_DEFAULTS = {
  currency: "AUD",
  gst_rate: GST_RATE,
  markup_percent: 40,
  hinge_drilling_unit_cost_ex_gst: 10,
  hinge_supply_unit_cost_ex_gst: 0,
  quote_terms:
    "Prices are valid for 14 days. Final measurements and site conditions may affect the final invoice.",
  // Drawer runner supply cost per drawer (a pair), by runner type (audit p2-3).
  // TODO: surface these in the business-defaults admin UI so they're editable
  // like the hinge fees (add the DB columns + normalizeBusinessDefaults mapping).
  runner_unit_cost_standard_ex_gst: 8,
  runner_unit_cost_soft_close_undermount_ex_gst: 25,
  runner_unit_cost_soft_close_side_ex_gst: 15,
  worker_hourly_rate: 85,
  // Workshop labour hours allowed PER CABINET (audit p2-6). Each base-cabinet
  // line contributes labour_hours_per_cabinet × qty to the quote's labour total.
  // A starting estimate — adjust in Business Defaults.
  labour_hours_per_cabinet: 1.5,
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

export const ORDER_STATUSES = ["active", "on_hold", "complete", "cancelled"];

export const ORDER_LINE_STATUSES = [
  "Not Ordered",
  "Ordered",
  "Received",
  "Checked",
  "Installed",
  "Complete",
  "Issue Follow-Up",
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
  "Issue Follow-Up",
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

export function normalizeBusinessDefaults(defaults = {}) {
  return {
    currency: String(defaults.currency ?? defaults.currency_code ?? DEFAULT_BUSINESS_DEFAULTS.currency).toUpperCase(),
    gst_rate: toNumber(defaults.gst_rate ?? defaults.gstRate, DEFAULT_BUSINESS_DEFAULTS.gst_rate),
    markup_percent: toNumber(defaults.markup_percent ?? defaults.markupPercent, DEFAULT_BUSINESS_DEFAULTS.markup_percent),
    hinge_drilling_unit_cost_ex_gst: toNumber(
      defaults.hinge_drilling_unit_cost_ex_gst ?? defaults.hingeDrillingUnitCostExGst,
      DEFAULT_BUSINESS_DEFAULTS.hinge_drilling_unit_cost_ex_gst
    ),
    hinge_supply_unit_cost_ex_gst: 0,
    quote_terms: String(defaults.quote_terms ?? defaults.quoteTerms ?? DEFAULT_BUSINESS_DEFAULTS.quote_terms),
    worker_hourly_rate: toNumber(
      defaults.worker_hourly_rate ?? defaults.workerHourlyRate,
      DEFAULT_BUSINESS_DEFAULTS.worker_hourly_rate
    ),
    labour_hours_per_cabinet: toNumber(
      defaults.labour_hours_per_cabinet ?? defaults.labourHoursPerCabinet,
      DEFAULT_BUSINESS_DEFAULTS.labour_hours_per_cabinet
    ),
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
  const markupPercent = toNumber(line.markup_percent ?? line.markupPercent, calculationDefaults.markup_percent);
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
  // reflects the current default. Non-cabinet lines keep their own labour_hours
  // (0 for most). This feeds the DERIVED quote labour total, never the manual
  // base — see calculateQuoteTotals.
  const isCabinetLine = (line.product_type ?? line.productType) === "base_cabinet";
  const labourHours = isCabinetLine
    ? roundMoney(toNumber(calculationDefaults.labour_hours_per_cabinet) * qty)
    : toNumber(line.labour_hours ?? line.labourHours);
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
  // The MANUAL labour base comes from manual_labour_hours — NEVER from
  // labour_hours, which is the DERIVED total we return below. Reading the total
  // back as the base is what caused runaway inflation (every recalc re-added the
  // line labour). The `?? labour_hours` fallback is only for a transitional row
  // that predates the manual_labour_hours column; safe because such a row can't
  // carry line labour yet, so its labour_hours still equals the manual base.
  const manualLabourHours = toNumber(
    costs.manual_labour_hours ?? costs.manualLabourHours ?? costs.labour_hours ?? costs.labourHours
  );
  const lineLabourHours = normalizedLines.reduce((sum, line) => sum + toNumber(line.labour_hours), 0);
  const labourHours = roundMoney(manualLabourHours + lineLabourHours);
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
    line_labour_hours: roundMoney(lineLabourHours),
    labour_hours: labourHours,
    worker_hourly_rate: workerHourlyRate,
    labour_cost_ex_gst: labourCostExGst,
    travel_cost_ex_gst: travelCostExGst,
    delivery_cost_ex_gst: deliveryCostExGst,
    installation_cost_ex_gst: installationCostExGst,
    painting_cost_ex_gst: paintingCostExGst,
    glass_cost_ex_gst: glassCostExGst,
    removal_cost_ex_gst: removalCostExGst,
    other_cost_ex_gst: otherCostExGst,
    hinge_drilling_cost_ex_gst: hingeDrillingCostExGst,
    hinge_supply_cost_ex_gst: hingeSupplyCostExGst,
    hinge_drilling_qty: hingeDrillingQty,
    hinge_supply_qty: hingeSupplyQty,
    markup_percent: 0,
    markup_amount_ex_gst: markupAmountExGst,
  };
}

export function formatMoney(value, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}
