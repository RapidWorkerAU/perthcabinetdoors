import { getBusinessDefaults } from "../../../../../lib/pcd-business-defaults";
import { calculateQuoteLine, calculateQuoteTotals, DEFAULT_BUSINESS_DEFAULTS, GST_RATE, roundMoney } from "../../../../../lib/pcd-quote-utils";
import { isEdgeProfileSelectionAvailable } from "../../../../../lib/quote-form-data";

export async function quoteIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

export async function lineIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.lineId;
}

function dbText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function dbNumber(value, fallback = 0) {
  if (value === "" || value === null || typeof value === "undefined") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dbNullableNumber(value) {
  if (value === "" || value === null || typeof value === "undefined") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function quoteLineRow(line, quoteId, sortOrder) {
  return {
    quote_id: quoteId,
    sort_order: sortOrder,
    design_item_id: line.design_item_id || null,
    product_type: dbText(line.product_type),
    product_name: dbText(line.product_name),
    description: dbText(line.description),
    material: dbText(line.material),
    thickness: dbText(line.thickness),
    width_mm: dbNullableNumber(line.width_mm),
    height_mm: dbNullableNumber(line.height_mm),
    finish: dbText(line.finish),
    colour: dbText(line.colour),
    profile_type: dbText(line.profile_type),
    profile: dbText(line.profile),
    edge_mould: isEdgeProfileSelectionAvailable(line.edge_mould, line.material) ? dbText(line.edge_mould) : null,
    qty: dbNumber(line.qty, 1),
    hinge_holes: Boolean(line.hinge_holes),
    hinge_supply: Boolean(line.hinge_supply),
    hinge_qty: dbText(line.hinge_qty),
    product_unit_cost_ex_gst: dbNumber(line.product_unit_cost_ex_gst),
    unit_cost_mode: line.unit_cost_mode === "auto" ? "auto" : "manual",
    unit_cost_source_id: line.unit_cost_source_id || null,
    unit_cost_source_label: dbText(line.unit_cost_source_label),
    unit_cost_per_sqm_ex_gst: dbNumber(line.unit_cost_per_sqm_ex_gst),
    calculated_unit_cost_ex_gst: dbNumber(line.calculated_unit_cost_ex_gst),
    material_cost_ex_gst: dbNumber(line.material_cost_ex_gst),
    hinge_drilling_cost_ex_gst: dbNumber(line.hinge_drilling_cost_ex_gst),
    hinge_supply_cost_ex_gst: dbNumber(line.hinge_supply_cost_ex_gst),
    hinge_drilling_qty: dbNumber(line.hinge_drilling_qty),
    hinge_supply_qty: dbNumber(line.hinge_supply_qty),
    labour_hours: dbNumber(line.labour_hours),
    worker_hourly_rate: dbNumber(line.worker_hourly_rate),
    labour_cost_ex_gst: dbNumber(line.labour_cost_ex_gst),
    travel_cost_ex_gst: dbNumber(line.travel_cost_ex_gst),
    delivery_cost_ex_gst: dbNumber(line.delivery_cost_ex_gst),
    installation_cost_ex_gst: dbNumber(line.installation_cost_ex_gst),
    other_cost_ex_gst: dbNumber(line.other_cost_ex_gst),
    markup_percent: dbNumber(line.markup_percent),
    markup_amount_ex_gst: dbNumber(line.markup_amount_ex_gst),
    unit_price_ex_gst: dbNumber(line.unit_price_ex_gst),
    line_total_ex_gst: dbNumber(line.line_total_ex_gst),
    client_note: dbText(line.client_note),
    notes: dbText(line.notes),
  };
}

export function cabinetConfigRow(config, quoteId, lineItemId) {
  return {
    id: config.id || undefined,
    line_item_id: lineItemId,
    quote_id: quoteId,
    label: dbText(config.label),
    height_mm: dbNumber(config.height_mm),
    width_mm: dbNumber(config.width_mm),
    depth_mm: dbNumber(config.depth_mm),
    is_corner: Boolean(config.is_corner),
    secondary_width_mm: dbNumber(config.secondary_width_mm),
    carcass_material: dbText(config.carcass_material),
    carcass_finish: dbText(config.carcass_finish),
    carcass_colour: dbText(config.carcass_colour),
    carcass_thickness_mm: dbNumber(config.carcass_thickness_mm, 16),
    back_panel_included: config.back_panel_included ?? true,
    back_panel_material: dbText(config.back_panel_material),
    back_panel_thickness_mm: dbNumber(config.back_panel_thickness_mm, 16),
    shelf_qty: dbNumber(config.shelf_qty),
    shelf_material: dbText(config.shelf_material),
    shelf_finish: dbText(config.shelf_finish),
    shelf_colour: dbText(config.shelf_colour),
    shelf_thickness_mm: dbNumber(config.shelf_thickness_mm, 16),
    shelf_heights_mm: Array.isArray(config.shelf_heights_mm) ? config.shelf_heights_mm : [],
    has_rangehood: Boolean(config.has_rangehood),
    rangehood_housing_height_mm: dbNumber(config.rangehood_housing_height_mm),
    rangehood_channel_width_mm: dbNumber(config.rangehood_channel_width_mm),
    mount_height_mm: dbNullableNumber(config.mount_height_mm),
    cost_per_sqm_carcass: dbNumber(config.cost_per_sqm_carcass),
    cost_per_sqm_shelf: dbNumber(config.cost_per_sqm_shelf),
    labour_cost: dbNumber(config.labour_cost),
    calculated_cut_list: config.calculated_cut_list || config.cut_list || [],
    calculated_material_cost_ex_gst: dbNumber(config.calculated_material_cost_ex_gst),
    notes: dbText(config.notes),
  };
}

function quoteTotalsPatch(totals) {
  return {
    subtotal_ex_gst: totals.subtotal_ex_gst,
    gst_amount: totals.gst_amount,
    total_inc_gst: totals.total_inc_gst,
    material_cost_ex_gst: totals.material_cost_ex_gst,
    labour_hours: totals.labour_hours,
    worker_hourly_rate: totals.worker_hourly_rate,
    labour_cost_ex_gst: totals.labour_cost_ex_gst,
    travel_cost_ex_gst: totals.travel_cost_ex_gst,
    delivery_cost_ex_gst: totals.delivery_cost_ex_gst,
    installation_cost_ex_gst: totals.installation_cost_ex_gst,
    other_cost_ex_gst: totals.other_cost_ex_gst,
    markup_percent: totals.markup_percent,
    markup_amount_ex_gst: totals.markup_amount_ex_gst,
  };
}

function quoteTotalsPatchWithNewLine(quote, line) {
  const gstRate = dbNumber(quote.gst_rate, GST_RATE);
  const materialCostExGst = roundMoney(dbNumber(quote.material_cost_ex_gst) + dbNumber(line.material_cost_ex_gst));
  const labourHours = roundMoney(dbNumber(quote.labour_hours) + dbNumber(line.labour_hours));
  const workerHourlyRate = dbNumber(quote.worker_hourly_rate, DEFAULT_BUSINESS_DEFAULTS.worker_hourly_rate);
  const labourCostExGst = roundMoney(labourHours * workerHourlyRate);
  const travelCostExGst = dbNumber(quote.travel_cost_ex_gst);
  const deliveryCostExGst = dbNumber(quote.delivery_cost_ex_gst);
  const installationCostExGst = dbNumber(quote.installation_cost_ex_gst);
  const otherCostExGst = 0;
  const subtotalExGst = roundMoney(
    materialCostExGst + labourCostExGst + travelCostExGst + deliveryCostExGst + installationCostExGst + otherCostExGst
  );
  const gstAmount = roundMoney(subtotalExGst * gstRate);

  return {
    subtotal_ex_gst: subtotalExGst,
    gst_amount: gstAmount,
    total_inc_gst: roundMoney(subtotalExGst + gstAmount),
    material_cost_ex_gst: materialCostExGst,
    labour_hours: labourHours,
    worker_hourly_rate: workerHourlyRate,
    labour_cost_ex_gst: labourCostExGst,
    travel_cost_ex_gst: travelCostExGst,
    delivery_cost_ex_gst: deliveryCostExGst,
    installation_cost_ex_gst: installationCostExGst,
    other_cost_ex_gst: otherCostExGst,
    markup_percent: 0,
    markup_amount_ex_gst: roundMoney(dbNumber(quote.markup_amount_ex_gst) + dbNumber(line.markup_amount_ex_gst)),
  };
}

async function loadQuote(supabase, quoteId) {
  const { data: quote, error } = await supabase.from("pcd_quotes").select("*").eq("id", quoteId).maybeSingle();
  if (error) throw error;
  if (!quote) {
    const error = new Error("Quote not found.");
    error.status = 404;
    throw error;
  }
  return quote;
}

async function addLineToQuoteTotals(supabase, quoteId, line) {
  const quote = await loadQuote(supabase, quoteId);
  const totalsPatch = quoteTotalsPatchWithNewLine(quote, line);
  const { data: savedQuote, error } = await supabase
    .from("pcd_quotes")
    .update(totalsPatch)
    .eq("id", quoteId)
    .select("*")
    .single();
  if (error) throw error;
  return savedQuote;
}

async function recalculateQuoteTotals(supabase, quoteId, businessDefaults) {
  const [quote, businessDefaultsResult, linesResult] = await Promise.all([
    loadQuote(supabase, quoteId),
    businessDefaults ? Promise.resolve(businessDefaults) : getBusinessDefaults(supabase),
    supabase.from("pcd_quote_line_items").select("*").eq("quote_id", quoteId).order("sort_order", { ascending: true }),
  ]);

  if (linesResult.error) throw linesResult.error;

  const totals = calculateQuoteTotals(linesResult.data || [], quote.gst_rate ?? GST_RATE, {
    ...quote,
    business_defaults: businessDefaultsResult,
  });

  const { data: savedQuote, error } = await supabase
    .from("pcd_quotes")
    .update(quoteTotalsPatch(totals))
    .eq("id", quoteId)
    .select("*")
    .single();
  if (error) throw error;

  return savedQuote;
}

async function lineWithConfig(supabase, line) {
  if (!line?.id) return line;
  if (line.product_type !== "base_cabinet") {
    return {
      ...line,
      pcd_cabinet_configs: [],
    };
  }
  const { data: configs, error } = await supabase.from("pcd_cabinet_configs").select("*").eq("line_item_id", line.id);
  if (error) throw error;
  return {
    ...line,
    pcd_cabinet_configs: configs || [],
  };
}

export async function saveQuoteLine(supabase, quoteId, line, { lineId = line?.id, sortOrder = 0 } = {}) {
  const businessDefaults = await getBusinessDefaults(supabase);
  await loadQuote(supabase, quoteId);
  const calculatedLine = {
    ...calculateQuoteLine(line, businessDefaults),
    id: lineId || null,
    design_item_id: line?.design_item_id ?? null,
    cabinet_config: line?.cabinet_config || null,
  };
  const row = quoteLineRow(calculatedLine, quoteId, sortOrder);

  const result = lineId
    ? await supabase.from("pcd_quote_line_items").update(row).eq("id", lineId).eq("quote_id", quoteId).select("*").single()
    : await supabase.from("pcd_quote_line_items").insert(row).select("*").single();

  if (result.error) throw result.error;

  if (calculatedLine.product_type === "base_cabinet" && calculatedLine.cabinet_config) {
    const { error } = await supabase
      .from("pcd_cabinet_configs")
      .upsert(cabinetConfigRow(calculatedLine.cabinet_config, quoteId, result.data.id), { onConflict: "line_item_id" });
    if (error) throw error;
  } else if (lineId) {
    const { error } = await supabase.from("pcd_cabinet_configs").delete().eq("line_item_id", lineId);
    if (error) throw error;
  }

  const quote = lineId
    ? await recalculateQuoteTotals(supabase, quoteId, businessDefaults)
    : await addLineToQuoteTotals(supabase, quoteId, calculatedLine);
  const savedLine = await lineWithConfig(supabase, result.data);

  return { quote, line: savedLine };
}

export async function deleteQuoteLine(supabase, quoteId, lineId) {
  const { error: configError } = await supabase.from("pcd_cabinet_configs").delete().eq("line_item_id", lineId);
  if (configError) throw configError;

  const { error } = await supabase.from("pcd_quote_line_items").delete().eq("id", lineId).eq("quote_id", quoteId);
  if (error) throw error;

  const quote = await recalculateQuoteTotals(supabase, quoteId);
  return { quote };
}

