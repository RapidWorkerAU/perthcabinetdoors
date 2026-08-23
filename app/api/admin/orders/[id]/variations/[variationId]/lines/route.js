import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";
import { recalcVariation, variationLineDelta, VARIATION_LINE_ACTIONS } from "../../../../../../../../lib/pcd-order-variations";
import { assertOpenForEditing } from "../../../../../../../../lib/pcd-document-lock";
import {
  JOB_COST_ACTION,
  jobCostChangeLabel,
  jobCostType,
  orderJobCostAmount,
  orderLabourParts,
} from "../../../../../../../../lib/pcd-order-costs";
import { calculateQuoteLine, DEFAULT_BUSINESS_DEFAULTS, roundMoney, toNumber } from "../../../../../../../../lib/pcd-quote-utils";
import { getBusinessDefaults } from "../../../../../../../../lib/pcd-business-defaults";
import { createSupplierGuard } from "../../../../../../../../lib/pcd-supplier-guard";

async function idsFromParams(params) {
  const resolved = await Promise.resolve(params);
  return { orderId: resolved?.id, variationId: resolved?.variationId };
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

async function loadEditableVariation(supabase, orderId, variationId) {
  const { data, error } = await supabase
    .from("pcd_order_variations")
    .select("*")
    .eq("id", variationId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (error || !data) throw error || new Error("Variation not found.");
  // Sealed once it is with the customer, permanent once they have answered.
  // See lib/pcd-document-lock.js for why "sent" counts.
  assertOpenForEditing("variation", data.status);
  return data;
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

/**
 * A job cost line: what the cost is on the order right now, and what it becomes.
 *
 * Nothing about a board applies here, so this returns early rather than falling
 * through the board pricing below and being asked for a width and a height.
 *
 * Labour is hours times a rate, so the hours go in `qty` and the rate in
 * `product_unit_cost_ex_gst` and the money falls out of the multiplication the
 * rest of the system already does. Markup is deliberately 0: these costs are
 * added to a quote's subtotal as they stand, and marking them up here would
 * charge for them differently than the quote did.
 */
function jobCostLinePayload(payload, order) {
  const type = jobCostType(payload.cost_type);
  if (!type) throw new Error("Choose which job cost this line changes.");

  const current = orderJobCostAmount(order, type.key);
  const row = {
    order_line_item_id: null,
    action: JOB_COST_ACTION,
    cost_type: type.key,
    product_type: null,
    material: null,
    original_line_total_ex_gst: current,
    markup_percent: 0,
    unit_cost_source_id: null,
    unit_cost_source_label: null,
    unit_cost_per_sqm_ex_gst: 0,
    calculated_unit_cost_ex_gst: 0,
    original_item_snapshot: null,
    notes: cleanText(payload.notes),
  };

  if (type.hours) {
    const { rate } = orderLabourParts(order);
    const hours = Math.max(0, toNumber(payload.qty));
    // A quote whose rate was never captured would value the revised hours at
    // nothing, so the caller has to supply one rather than have it silently be 0.
    const hourlyRate = toNumber(payload.product_unit_cost_ex_gst) || rate;
    if (hourlyRate <= 0) {
      throw new Error("This order has no hourly rate on it, so labour cannot be priced. Enter an hourly rate for this line.");
    }
    row.qty = hours;
    row.product_unit_cost_ex_gst = hourlyRate;
    row.proposed_line_total_ex_gst = roundMoney(hours * hourlyRate);
  } else {
    row.qty = 1;
    row.product_unit_cost_ex_gst = 0;
    row.proposed_line_total_ex_gst = roundMoney(toNumber(payload.proposed_line_total_ex_gst));
  }

  row.title = cleanText(payload.title) || jobCostChangeLabel(type.key, row.proposed_line_total_ex_gst - current);
  row.description = cleanText(payload.description) || type.label;
  row.line_total_ex_gst = variationLineDelta(row);
  return row;
}

function linePayload(payload, sourceLine = null, businessDefaults = DEFAULT_BUSINESS_DEFAULTS, pricingSource = null, order = null) {
  const action = VARIATION_LINE_ACTIONS.includes(payload.action) ? payload.action : "add";
  if (action === JOB_COST_ACTION) return jobCostLinePayload(payload, order);

  const row = {
    order_line_item_id: action === "add" || action === "price_adjustment" ? null : payload.order_line_item_id || null,
    cost_type: null,
    action,
    // Which cabinet this piece belongs to, so the production sheet groups it
    // with that cabinet instead of printing it loose.
    //
    // A change or a removal inherits it from the line it acts on, which is
    // always right: the replacement door goes on the same cabinet the old one
    // came off. An addition has nothing to inherit from, so it is only set when
    // the caller says which cabinet, and prints loose otherwise, which is
    // honest rather than guessed.
    design_item_id: payload.design_item_id ?? sourceLine?.design_item_id ?? null,
    title: cleanText(payload.title ?? sourceLine?.title ?? (action === "price_adjustment" ? "Price adjustment" : "")),
    description: cleanText(payload.description ?? sourceLine?.description),
    product_type: cleanText(payload.product_type ?? sourceLine?.product_type),
    material: cleanText(payload.material ?? sourceLine?.material),
    supplier_name: cleanText(payload.supplier_name ?? sourceLine?.supplier_name),
    thickness: cleanText(payload.thickness ?? sourceLine?.thickness),
    width_mm: nullableNumber(payload.width_mm ?? sourceLine?.width_mm),
    height_mm: nullableNumber(payload.height_mm ?? sourceLine?.height_mm),
    finish: cleanText(payload.finish ?? sourceLine?.finish),
    colour: cleanText(payload.colour ?? sourceLine?.colour),
    profile_type: cleanText(payload.profile_type ?? sourceLine?.profile_type),
    profile: cleanText(payload.profile ?? sourceLine?.profile),
    edge_mould: cleanText(payload.edge_mould ?? sourceLine?.edge_mould),
    qty: Math.max(0, toNumber(payload.qty ?? sourceLine?.qty, 1)),
    unit_cost_source_id: pricingSource?.id || payload.unit_cost_source_id || null,
    unit_cost_source_label: cleanText(
      pricingSource
        ? [pricingSource.supplier_name || "Polytec", pricingSource.finish_type, pricingSource.name, pricingSource.thickness].filter(Boolean).join(" - ")
        : payload.unit_cost_source_label
    ),
    unit_cost_per_sqm_ex_gst: effectiveBoardRate(payload, pricingSource),
    calculated_unit_cost_ex_gst: toNumber(payload.calculated_unit_cost_ex_gst),
    product_unit_cost_ex_gst: toNumber(payload.product_unit_cost_ex_gst),
    markup_percent: toNumber(payload.markup_percent, businessDefaults.markup_percent),
    original_line_total_ex_gst: action === "add" || action === "price_adjustment"
      ? 0
      : toNumber(payload.original_line_total_ex_gst ?? sourceLine?.line_total_ex_gst),
    proposed_line_total_ex_gst: 0,
    original_item_snapshot: action === "change" || action === "remove" ? originalItemSnapshot(sourceLine) : null,
    notes: cleanText(payload.notes),
  };

  // A hand-typed unit cost wins over the board rate, same as a quote line.
  const manualUnitCost = payload.unit_cost_mode === "manual" ? toNumber(payload.product_unit_cost_ex_gst) : 0;

  if (action === "remove") {
    row.proposed_line_total_ex_gst = 0;
  } else if (isBoardPricedLine(row)) {
    // A board with no cost against it, or a line with no size yet, used to
    // throw here and refuse to save the line at all. Much of the colour library
    // has no cost recorded and those lines are costed by hand at quote time, so
    // that turned an ordinary way of working into a wall: the line could not
    // even be written down, and the typed detail was lost with the error.
    //
    // The cost is still worked out wherever it can be. What has changed is what
    // happens when it cannot: the line saves with the price whoever is doing
    // the work put on it, and the send step names anything with no cost so it
    // can be decided on once, with all the lines in view.
    if (manualUnitCost > 0 || toNumber(row.unit_cost_per_sqm_ex_gst) > 0) {
      row.calculated_unit_cost_ex_gst = calculatedUnitCost(row);
      row.product_unit_cost_ex_gst =
        manualUnitCost > 0 ? manualUnitCost : Math.max(0, row.calculated_unit_cost_ex_gst);
      const calculated = calculateQuoteLine(row, businessDefaults);
      row.product_unit_cost_ex_gst = calculated.product_unit_cost_ex_gst;
      row.proposed_line_total_ex_gst = calculated.line_total_ex_gst;
    } else {
      row.proposed_line_total_ex_gst = toNumber(payload.proposed_line_total_ex_gst ?? payload.line_total_ex_gst ?? sourceLine?.line_total_ex_gst);
    }
  } else {
    row.proposed_line_total_ex_gst = toNumber(payload.proposed_line_total_ex_gst ?? payload.line_total_ex_gst ?? sourceLine?.line_total_ex_gst);
  }

  row.line_total_ex_gst = variationLineDelta(row);
  return row;
}

function isMissingSupplierNameColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST204" && message.includes("supplier_name") && message.includes("pcd_order_variation_lines");
}

function isMissingDesignItemColumn(error) {
  const message = String(error?.message || "");
  return error?.code === "PGRST204" && message.includes("design_item_id");
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
  if (isMissingDesignItemColumn(error)) delete rest.design_item_id;
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

/**
 * ONE BRAND PER LINE, checked on what will actually be written.
 *
 * A change action inherits any field the caller left out from the order line
 * it acts on, so checking the payload would miss a mix made half of new input
 * and half of old. The row is the combination that lands in the order.
 *
 * A price adjustment or a job cost carries no board fields at all, and
 * supplierConflicts is silent about what is not filled in, so they pass
 * without a special case.
 */
async function refuseMixedBrands(supabase, row) {
  const problems = (await createSupplierGuard(supabase))(row);
  if (!problems.length) return null;
  return Response.json({ ok: false, error: problems[0] }, { status: 400 });
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { orderId, variationId } = await idsFromParams(params);
    await loadEditableVariation(context.supabase, orderId, variationId);
    const payload = await request.json();
    const sourceLine = await existingOrderLine(context.supabase, orderId, payload.order_line_item_id);
    if (["change", "remove"].includes(payload.action) && !sourceLine) {
      return Response.json({ ok: false, error: "Choose an order line for this variation action." }, { status: 400 });
    }
    const businessDefaults = await getBusinessDefaults(context.supabase);
    const pricingSource = await boardPricingSource(context.supabase, payload.unit_cost_source_id);
    // A job cost line records what the cost is on the order right now, so the
    // order is what it is measured against. Read here rather than trusted from
    // the browser: the "currently" figure is the thing the customer is shown.
    const order = payload.action === JOB_COST_ACTION ? await loadOrder(context.supabase, orderId) : null;

    const { count } = await context.supabase
      .from("pcd_order_variation_lines")
      .select("id", { count: "exact", head: true })
      .eq("variation_id", variationId);

    const row = {
      variation_id: variationId,
      sort_order: count || 0,
      ...linePayload(payload, sourceLine, businessDefaults, pricingSource, order),
    };

    const mixed = await refuseMixedBrands(context.supabase, row);
    if (mixed) return mixed;

    let { data: line, error } = await context.supabase
      .from("pcd_order_variation_lines")
      .insert(row)
      .select("*")
      .single();
    if (isMissingSupplierNameColumn(error) || isMissingOriginalSnapshotColumn(error) || isMissingPricingColumn(error)) {
      const retry = await context.supabase
        .from("pcd_order_variation_lines")
        .insert(withoutFallbackColumns(row, error))
        .select("*")
        .single();
      line = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    const variation = await recalcVariation(context.supabase, variationId);
    return Response.json({ ok: true, line, variation });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not add variation line." }, { status: 500 });
  }
}
