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

function updatesFromPayload(payload, before, sourceLine = null) {
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
  if (next.action === "change" || next.action === "remove") {
    if (sourceLine) updates.original_item_snapshot = originalItemSnapshot(sourceLine);
  } else if (Object.prototype.hasOwnProperty.call(payload, "action")) {
    updates.original_item_snapshot = null;
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

function withoutFallbackColumns(row, error) {
  const rest = { ...row };
  if (isMissingSupplierNameColumn(error)) delete rest.supplier_name;
  if (isMissingOriginalSnapshotColumn(error)) delete rest.original_item_snapshot;
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

    const updates = updatesFromPayload(payload, before, sourceLine);
    let { data: line, error } = await context.supabase
      .from("pcd_order_variation_lines")
      .update(updates)
      .eq("id", lineId)
      .eq("variation_id", variationId)
      .select("*")
      .single();
    if (isMissingSupplierNameColumn(error) || isMissingOriginalSnapshotColumn(error)) {
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
