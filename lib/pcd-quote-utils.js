export const GST_RATE = 0.1;

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
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function hingeCount(value) {
  const match = String(value || "").match(/\d+/);
  return match ? toNumber(match[0]) : 0;
}

export function calculateQuoteLine(line = {}) {
  const qty = Math.max(0, toNumber(line.qty, 1));
  const productUnitCostExGst = toNumber(line.product_unit_cost_ex_gst ?? line.productUnitCostExGst);
  const markupPercent = toNumber(line.markup_percent ?? line.markupPercent, 40);
  const hingeQty = hingeCount(line.hinge_qty ?? line.hingeQty);
  const hingeDrillingCostExGst = line.hinge_holes || line.hingeHoles ? roundMoney(hingeQty * 10 * qty) : 0;
  const hingeSupplyCostExGst = line.hinge_supply || line.hingeSupply ? roundMoney(hingeQty * 15 * qty) : 0;
  const hingeDrillingQty = line.hinge_holes || line.hingeHoles ? hingeQty * qty : 0;
  const hingeSupplyQty = line.hinge_supply || line.hingeSupply ? hingeQty * qty : 0;
  const productCostExGst = roundMoney(productUnitCostExGst * qty);
  const markupAmountExGst = roundMoney(productCostExGst * (markupPercent / 100));
  const lineTotalExGst = roundMoney(productCostExGst + markupAmountExGst + hingeDrillingCostExGst + hingeSupplyCostExGst);

  return {
    product_type: line.product_type ?? line.productType ?? "",
    product_name: line.product_name ?? line.productName ?? "",
    description: line.description ?? "",
    material: line.material ?? "",
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
    hinge_supply: Boolean(line.hinge_supply ?? line.hingeSupply ?? false),
    hinge_qty: line.hinge_qty ?? line.hingeQty ?? "",
    product_unit_cost_ex_gst: productUnitCostExGst,
    material_cost_ex_gst: lineTotalExGst,
    hinge_drilling_cost_ex_gst: hingeDrillingCostExGst,
    hinge_supply_cost_ex_gst: hingeSupplyCostExGst,
    hinge_drilling_qty: hingeDrillingQty,
    hinge_supply_qty: hingeSupplyQty,
    labour_hours: 0,
    worker_hourly_rate: 0,
    labour_cost_ex_gst: 0,
    travel_cost_ex_gst: 0,
    delivery_cost_ex_gst: 0,
    installation_cost_ex_gst: 0,
    other_cost_ex_gst: 0,
    markup_percent: markupPercent,
    markup_amount_ex_gst: markupAmountExGst,
    unit_price_ex_gst: roundMoney(productUnitCostExGst + (productUnitCostExGst * (markupPercent / 100))),
    line_total_ex_gst: lineTotalExGst,
    notes: line.notes ?? "",
  };
}

export function calculateQuoteTotals(lines = [], gstRate = GST_RATE, costs = {}) {
  const normalizedLines = lines.map(calculateQuoteLine);
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
  const labourHours = toNumber(costs.labour_hours ?? costs.labourHours);
  const workerHourlyRate = toNumber(costs.worker_hourly_rate ?? costs.workerHourlyRate);
  const labourCostExGst = roundMoney(labourHours * workerHourlyRate);
  const travelCostExGst = toNumber(costs.travel_cost_ex_gst ?? costs.travelCostExGst);
  const deliveryCostExGst = toNumber(costs.delivery_cost_ex_gst ?? costs.deliveryCostExGst);
  const installationCostExGst = toNumber(costs.installation_cost_ex_gst ?? costs.installationCostExGst);
  const otherCostExGst = 0;
  const costBeforeMarkup = roundMoney(
    materialCostExGst +
      labourCostExGst +
      travelCostExGst +
      deliveryCostExGst +
      installationCostExGst +
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
    material_cost_ex_gst: materialCostExGst,
    labour_hours: labourHours,
    worker_hourly_rate: workerHourlyRate,
    labour_cost_ex_gst: labourCostExGst,
    travel_cost_ex_gst: travelCostExGst,
    delivery_cost_ex_gst: deliveryCostExGst,
    installation_cost_ex_gst: installationCostExGst,
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
