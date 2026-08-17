import { requireAdminApiContext } from "../../../../../../../../../lib/admin-api";
import { isVariationFinal, recalcVariation, variationLineDelta, VARIATION_LINE_ACTIONS } from "../../../../../../../../../lib/pcd-order-variations";
import {
  JOB_COST_ACTION,
  jobCostChangeLabel,
  jobCostType,
  orderJobCostAmount,
  orderLabourParts,
} from "../../../../../../../../../lib/pcd-order-costs";
import { calculateQuoteLine, DEFAULT_BUSINESS_DEFAULTS, roundMoney, toNumber } from "../../../../../../../../../lib/pcd-quote-utils";
import { getBusinessDefaults } from "../../../../../../../../../lib/pcd-business-defaults";

async function idsFromParams(params) {
  const resolved = await Promise.resolve(params);
  return { orderId: resolved?.id, variationId: resolved?.variationId, lineId: resolved?.lineId };
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function nullableNumber(value) {
  if (value === "" || value === null || typeof value === "undefined") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasValue(value) {
  return String(value ?? "").trim() !== "";
}

function isBoardPricedLine(row) {
  return !["Hardware", "base_cabinet"].includes(row.product_type) && hasValue(row.material);
}

function changedBoardFields(row, sourceLine = null) {
  if (!sourceLine) return true;
  return ["title", "product_type", "material", "supplier_name", "thickness", "width_mm", "height_mm", "finish", "colour", "profile_type", "profile", "edge_mould", "qty"].some((field) => {
    const next = String(row[field] ?? "").trim();
    const before = String(sourceLine[field] ?? "").trim();
    return next !== before;
  });
}

function lineAreaSqm(row) {
  const width = Number(row?.width_mm || 0);
  const height = Number(row?.height_mm || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
  return (width * height) / 1000000;
}

function calculatedUnitCost(row) {
  const rate = toNumber(row.unit_cost_per_sqm_ex_gst);
  const area = lineAreaSqm(row);
  if (rate <= 0 || area <= 0) return 0;
  return roundMoney(rate * area);
}

async function boardPricingSource(supabase, sourceId) {
  if (!sourceId) return null;
  const { data, error } = await supabase
    .from("pcd_colour_library")
    .select("id,name,finish_type,supplier_name,thickness,cost_per_board_ex_gst,cost_per_sqm_ex_gst,preferred_board_width_mm,preferred_board_height_mm")
    .eq("id", sourceId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function effectiveBoardRate(payload = {}, pricingSource = null) {
  const directRate = toNumber(pricingSource?.cost_per_sqm_ex_gst ?? payload.unit_cost_per_sqm_ex_gst);
  if (directRate > 0) return directRate;
  const boardCost = toNumber(pricingSource?.cost_per_board_ex_gst ?? payload.cost_per_board_ex_gst);
  const boardWidth = toNumber(pricingSource?.preferred_board_width_mm ?? payload.preferred_board_width_mm);
  const boardHeight = toNumber(pricingSource?.preferred_board_height_mm ?? payload.preferred_board_height_mm);
  const boardArea = boardWidth > 0 && boardHeight > 0 ? (boardWidth * boardHeight) / 1000000 : 0;
  if (boardCost > 0 && boardArea > 0) return roundMoney(boardCost / boardArea);
  return 0;
}

function originalItemSnapshot(sourceLine) {
  if (!sourceLine) return null;
  return {
    id: sourceLine.id || null,
    title: sourceLine.title || null,
    description: sourceLine.description || null,
    product_type: sourceLine.product_type || null,
    material: sourceLine.material || null,
    supplier_name: sourceLine.supplier_name || null,
    thickness: sourceLine.thickness || null,
    width_mm: sourceLine.width_mm ?? null,
    height_mm: sourceLine.height_mm ?? null,
    finish: sourceLine.finish || null,
    colour: sourceLine.colour || null,
    profile_type: sourceLine.profile_type || null,
    profile: sourceLine.profile || null,
    edge_mould: sourceLine.edge_mould || null,
    qty: sourceLine.qty ?? 1,
    line_total_ex_gst: sourceLine.line_total_ex_gst ?? 0,
  };
}

async function loadOrder(supabase, orderId) {
  const { data, error } = await supabase.from("pcd_orders").select("*").eq("id", orderId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Order not found.");
  return data;
}

async function existingOrderLine(supabase, orderId, itemId) {
  if (!itemId) return null;
  const { data, error } = await supabase
    .from("pcd_order_line_items")
    .select("*")
    .eq("id", itemId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function assertEditable(supabase, orderId, variationId) {
  const { data, error } = await supabase
    .from("pcd_order_variations")
    .select("id,status")
    .eq("id", variationId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (error || !data) throw error || new Error("Variation not found.");
  if (isVariationFinal(data.status)) throw new Error("Finalised variations cannot be edited.");
}

// A job cost line is rebuilt from scratch on every edit rather than patched
// field by field. It has only three inputs (which cost, the revised figure, and
// the rate for labour), and the original figure has to be re-read from the order
// each time anyway, so merging a partial patch would only create ways for the
// "currently" figure and the proposed one to come from different moments.
function jobCostUpdates(payload, before, order) {
  const key = payload.cost_type || before.cost_type;
  const type = jobCostType(key);
  if (!type) throw new Error("Choose which job cost this line changes.");

  const current = orderJobCostAmount(order, type.key);
  const updates = {
    action: JOB_COST_ACTION,
    cost_type: type.key,
    order_line_item_id: null,
    original_line_total_ex_gst: current,
    markup_percent: 0,
    notes: Object.prototype.hasOwnProperty.call(payload, "notes")
      ? cleanText(payload.notes)
      : before.notes ?? null,
  };

  if (type.hours) {
    const { rate } = orderLabourParts(order);
    const hours = Math.max(0, toNumber(
      Object.prototype.hasOwnProperty.call(payload, "qty") ? payload.qty : before.qty
    ));
    const hourlyRate = toNumber(
      Object.prototype.hasOwnProperty.call(payload, "product_unit_cost_ex_gst")
        ? payload.product_unit_cost_ex_gst
        : before.product_unit_cost_ex_gst
    ) || rate;
    if (hourlyRate <= 0) {
      throw new Error("This order has no hourly rate on it, so labour cannot be priced. Enter an hourly rate for this line.");
    }
    updates.qty = hours;
    updates.product_unit_cost_ex_gst = hourlyRate;
    updates.proposed_line_total_ex_gst = roundMoney(hours * hourlyRate);
  } else {
    updates.qty = 1;
    updates.product_unit_cost_ex_gst = 0;
    updates.proposed_line_total_ex_gst = roundMoney(toNumber(
      Object.prototype.hasOwnProperty.call(payload, "proposed_line_total_ex_gst")
        ? payload.proposed_line_total_ex_gst
        : before.proposed_line_total_ex_gst
    ));
  }

  updates.title = cleanText(payload.title) || jobCostChangeLabel(type.key, updates.proposed_line_total_ex_gst - current);
  updates.description = cleanText(payload.description) || type.label;
  updates.line_total_ex_gst = variationLineDelta({ ...before, ...updates });
  return updates;
}

function updatesFromPayload(payload, before, sourceLine = null, businessDefaults = DEFAULT_BUSINESS_DEFAULTS, pricingSource = null, order = null) {
  const nextAction = payload.action || before.action;
  if (nextAction === JOB_COST_ACTION) return jobCostUpdates(payload, before, order);

  const updates = {};
  if (Object.prototype.hasOwnProperty.call(payload, "action")) {
    if (!VARIATION_LINE_ACTIONS.includes(payload.action)) throw new Error("Invalid variation line action.");
    updates.action = payload.action;
    // Moving a line off a job cost has to clear the cost type, or the database
    // constraint that keeps the two in step rejects the update.
    if (before.action === JOB_COST_ACTION) updates.cost_type = null;
  }
  [
    "order_line_item_id",
    "title",
    "description",
    "product_type",
    "material",
    "supplier_name",
    "thickness",
    "finish",
    "colour",
    "profile_type",
    "profile",
    "edge_mould",
    "unit_cost_source_id",
    "unit_cost_source_label",
    "notes",
  ].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) updates[field] = payload[field] === "" ? null : cleanText(payload[field]);
  });
  ["width_mm", "height_mm"].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) updates[field] = nullableNumber(payload[field]);
  });
  ["qty", "original_line_total_ex_gst", "proposed_line_total_ex_gst", "unit_cost_per_sqm_ex_gst", "calculated_unit_cost_ex_gst", "product_unit_cost_ex_gst", "markup_percent"].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) updates[field] = toNumber(payload[field]);
  });
  if (pricingSource) {
    updates.unit_cost_source_id = pricingSource.id;
    updates.unit_cost_source_label = [pricingSource.supplier_name || "Polytec", pricingSource.finish_type, pricingSource.name, pricingSource.thickness].filter(Boolean).join(" - ");
    updates.unit_cost_per_sqm_ex_gst = effectiveBoardRate(payload, pricingSource);
  } else if (Object.prototype.hasOwnProperty.call(payload, "unit_cost_source_id")) {
    updates.unit_cost_per_sqm_ex_gst = effectiveBoardRate(payload, null);
  }
  if (!Object.prototype.hasOwnProperty.call(updates, "markup_percent")) {
    updates.markup_percent = toNumber(before.markup_percent, businessDefaults.markup_percent);
  }
  const next = { ...before, ...updates };
  if (next.action === "change" || next.action === "remove") {
    if (sourceLine) updates.original_item_snapshot = originalItemSnapshot(sourceLine);
  } else if (Object.prototype.hasOwnProperty.call(payload, "action")) {
    updates.original_item_snapshot = null;
  }
  if (next.action === "remove") {
    updates.proposed_line_total_ex_gst = 0;
    next.proposed_line_total_ex_gst = 0;
  } else if (isBoardPricedLine(next)) {
    // A hand-typed unit cost wins over the board rate, same as a quote line.
    const manualUnitCost = payload.unit_cost_mode === "manual" ? toNumber(payload.product_unit_cost_ex_gst) : 0;
    if (manualUnitCost <= 0 && changedBoardFields(next, sourceLine) && toNumber(next.unit_cost_per_sqm_ex_gst) <= 0) {
      throw new Error("The selected board does not have an uploaded price. Add the board cost before saving this variation line.");
    }
    if (manualUnitCost > 0 || toNumber(next.unit_cost_per_sqm_ex_gst) > 0) {
      const calculatedCost = calculatedUnitCost(next);
      if (manualUnitCost <= 0 && calculatedCost <= 0) {
        throw new Error("Enter width and height before saving this priced board variation line.");
      }
      const unitCost = manualUnitCost > 0 ? manualUnitCost : calculatedCost;
      const calculated = calculateQuoteLine({
        ...next,
        calculated_unit_cost_ex_gst: calculatedCost,
        product_unit_cost_ex_gst: unitCost,
        markup_percent: toNumber(next.markup_percent, businessDefaults.markup_percent),
      }, businessDefaults);
      updates.calculated_unit_cost_ex_gst = calculatedCost;
      updates.product_unit_cost_ex_gst = calculated.product_unit_cost_ex_gst;
      updates.proposed_line_total_ex_gst = calculated.line_total_ex_gst;
      next.proposed_line_total_ex_gst = calculated.line_total_ex_gst;
    }
  }
  updates.line_total_ex_gst = variationLineDelta(next);
  return updates;
}

function isMissingSupplierNameColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST204" && message.includes("supplier_name") && message.includes("pcd_order_variation_lines");
}

function isMissingOriginalSnapshotColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST204" && message.includes("original_item_snapshot") && message.includes("pcd_order_variation_lines");
}

function isMissingPricingColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST204" && (
    message.includes("unit_cost_source_id") ||
    message.includes("unit_cost_source_label") ||
    message.includes("unit_cost_per_sqm_ex_gst") ||
    message.includes("calculated_unit_cost_ex_gst") ||
    message.includes("product_unit_cost_ex_gst") ||
    message.includes("markup_percent")
  ) && message.includes("pcd_order_variation_lines");
}

function withoutFallbackColumns(row, error) {
  const rest = { ...row };
  if (isMissingSupplierNameColumn(error)) delete rest.supplier_name;
  if (isMissingOriginalSnapshotColumn(error)) delete rest.original_item_snapshot;
  if (isMissingPricingColumn(error)) {
    delete rest.unit_cost_source_id;
    delete rest.unit_cost_source_label;
    delete rest.unit_cost_per_sqm_ex_gst;
    delete rest.calculated_unit_cost_ex_gst;
    delete rest.product_unit_cost_ex_gst;
    delete rest.markup_percent;
  }
  return rest;
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { orderId, variationId, lineId } = await idsFromParams(params);
    await assertEditable(context.supabase, orderId, variationId);
    const payload = await request.json();
    const { data: before } = await context.supabase
      .from("pcd_order_variation_lines")
      .select("*")
      .eq("id", lineId)
      .eq("variation_id", variationId)
      .maybeSingle();
    if (!before) return Response.json({ ok: false, error: "Variation line not found." }, { status: 404 });

    const nextAction = payload.action || before.action;
    const nextOrderLineItemId = Object.prototype.hasOwnProperty.call(payload, "order_line_item_id")
      ? payload.order_line_item_id
      : before.order_line_item_id;
    const sourceLine = ["change", "remove"].includes(nextAction)
      ? await existingOrderLine(context.supabase, orderId, nextOrderLineItemId)
      : null;
    if (["change", "remove"].includes(nextAction) && !sourceLine) {
      return Response.json({ ok: false, error: "Choose an order line for this variation action." }, { status: 400 });
    }
    const businessDefaults = await getBusinessDefaults(context.supabase);
    const pricingSource = await boardPricingSource(context.supabase, payload.unit_cost_source_id);
    const order = nextAction === JOB_COST_ACTION ? await loadOrder(context.supabase, orderId) : null;

    const updates = updatesFromPayload(payload, before, sourceLine, businessDefaults, pricingSource, order);
    let { data: line, error } = await context.supabase
      .from("pcd_order_variation_lines")
      .update(updates)
      .eq("id", lineId)
      .eq("variation_id", variationId)
      .select("*")
      .single();
    if (isMissingSupplierNameColumn(error) || isMissingOriginalSnapshotColumn(error) || isMissingPricingColumn(error)) {
      const retry = await context.supabase
        .from("pcd_order_variation_lines")
        .update(withoutFallbackColumns(updates, error))
        .eq("id", lineId)
        .eq("variation_id", variationId)
        .select("*")
        .single();
      line = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    const variation = await recalcVariation(context.supabase, variationId);
    return Response.json({ ok: true, line, variation });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update variation line." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { orderId, variationId, lineId } = await idsFromParams(params);
    await assertEditable(context.supabase, orderId, variationId);
    const { error } = await context.supabase
      .from("pcd_order_variation_lines")
      .delete()
      .eq("id", lineId)
      .eq("variation_id", variationId);
    if (error) throw error;
    const variation = await recalcVariation(context.supabase, variationId);
    return Response.json({ ok: true, variation });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not delete variation line." }, { status: 500 });
  }
}
