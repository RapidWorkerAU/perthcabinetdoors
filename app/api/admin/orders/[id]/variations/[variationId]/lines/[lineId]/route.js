import { requireAdminApiContext } from "../../../../../../../../../lib/admin-api";
import { isVariationFinal, recalcVariation, variationLineDelta, VARIATION_LINE_ACTIONS } from "../../../../../../../../../lib/pcd-order-variations";
import { toNumber } from "../../../../../../../../../lib/pcd-quote-utils";

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

function updatesFromPayload(payload, before) {
  const updates = {};
  if (Object.prototype.hasOwnProperty.call(payload, "action")) {
    if (!VARIATION_LINE_ACTIONS.includes(payload.action)) throw new Error("Invalid variation line action.");
    updates.action = payload.action;
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
    "notes",
  ].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) updates[field] = payload[field] === "" ? null : cleanText(payload[field]);
  });
  ["width_mm", "height_mm"].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) updates[field] = nullableNumber(payload[field]);
  });
  ["qty", "original_line_total_ex_gst", "proposed_line_total_ex_gst"].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) updates[field] = toNumber(payload[field]);
  });
  const next = { ...before, ...updates };
  updates.line_total_ex_gst = variationLineDelta(next);
  return updates;
}

function isMissingSupplierNameColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST204" && message.includes("supplier_name") && message.includes("pcd_order_variation_lines");
}

function withoutSupplierName(row) {
  const { supplier_name: _supplierName, ...rest } = row;
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

    const updates = updatesFromPayload(payload, before);
    let { data: line, error } = await context.supabase
      .from("pcd_order_variation_lines")
      .update(updates)
      .eq("id", lineId)
      .eq("variation_id", variationId)
      .select("*")
      .single();
    if (isMissingSupplierNameColumn(error)) {
      const retry = await context.supabase
        .from("pcd_order_variation_lines")
        .update(withoutSupplierName(updates))
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
