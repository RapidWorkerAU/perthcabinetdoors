import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";
import { isVariationFinal, recalcVariation, variationLineDelta, VARIATION_LINE_ACTIONS } from "../../../../../../../../lib/pcd-order-variations";
import { toNumber } from "../../../../../../../../lib/pcd-quote-utils";

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
  if (isVariationFinal(data.status)) throw new Error("Finalised variations cannot be edited.");
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

function linePayload(payload, sourceLine = null) {
  const action = VARIATION_LINE_ACTIONS.includes(payload.action) ? payload.action : "add";
  const original = action === "add" || action === "price_adjustment"
    ? 0
    : toNumber(payload.original_line_total_ex_gst ?? sourceLine?.line_total_ex_gst);
  const proposed = action === "remove"
    ? 0
    : toNumber(payload.proposed_line_total_ex_gst ?? payload.line_total_ex_gst ?? sourceLine?.line_total_ex_gst);
  const row = {
    order_line_item_id: action === "add" || action === "price_adjustment" ? null : payload.order_line_item_id || null,
    action,
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
    original_line_total_ex_gst: original,
    proposed_line_total_ex_gst: proposed,
    original_item_snapshot: action === "change" || action === "remove" ? originalItemSnapshot(sourceLine) : null,
    notes: cleanText(payload.notes),
  };
  row.line_total_ex_gst = variationLineDelta(row);
  return row;
}

function isMissingSupplierNameColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST204" && message.includes("supplier_name") && message.includes("pcd_order_variation_lines");
}

function isMissingOriginalSnapshotColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST204" && message.includes("original_item_snapshot") && message.includes("pcd_order_variation_lines");
}

function withoutFallbackColumns(row, error) {
  const rest = { ...row };
  if (isMissingSupplierNameColumn(error)) delete rest.supplier_name;
  if (isMissingOriginalSnapshotColumn(error)) delete rest.original_item_snapshot;
  return rest;
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

    const { count } = await context.supabase
      .from("pcd_order_variation_lines")
      .select("id", { count: "exact", head: true })
      .eq("variation_id", variationId);

    const row = {
      variation_id: variationId,
      sort_order: count || 0,
      ...linePayload(payload, sourceLine),
    };

    let { data: line, error } = await context.supabase
      .from("pcd_order_variation_lines")
      .insert(row)
      .select("*")
      .single();
    if (isMissingSupplierNameColumn(error) || isMissingOriginalSnapshotColumn(error)) {
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
