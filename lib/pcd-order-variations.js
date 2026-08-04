import { randomBytes } from "node:crypto";
import { formatMoney, GST_RATE, roundMoney, toNumber } from "./pcd-quote-utils";
import { logOrderActivity } from "./pcd-activity-log";

export const VARIATION_STATUSES = ["draft", "sent", "viewed", "approved", "approved_pending_payment", "applied", "rejected", "cancelled"];
export const VARIATION_LINE_ACTIONS = ["add", "change", "remove", "price_adjustment"];

export function makeVariationNumber() {
  return `PCD-V-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function makeVariationAccessCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export function variationLineDelta(line = {}) {
  const action = String(line.action || "add");
  const original = toNumber(line.original_line_total_ex_gst);
  const proposed = toNumber(line.proposed_line_total_ex_gst);
  if (action === "remove") return roundMoney(-Math.abs(original));
  if (action === "change") return roundMoney(proposed - original);
  return roundMoney(proposed);
}

export function calculateVariationTotals(lines = [], gstRate = GST_RATE) {
  const subtotal = roundMoney((lines || []).reduce((total, line) => total + variationLineDelta(line), 0));
  const gst = roundMoney(subtotal * toNumber(gstRate, GST_RATE));
  return {
    subtotal_ex_gst: subtotal,
    gst_amount: gst,
    total_inc_gst: roundMoney(subtotal + gst),
  };
}

export function isVariationFinal(status) {
  return ["approved", "approved_pending_payment", "applied", "rejected", "cancelled"].includes(status);
}

export async function paidDepositTotal(supabase, orderId) {
  const { data, error } = await supabase
    .from("pcd_order_payments")
    .select("amount,payment_type,is_paid")
    .eq("order_id", orderId)
    .eq("payment_type", "deposit")
    .eq("is_paid", true);
  if (error) throw error;
  return roundMoney((data || []).reduce((sum, payment) => sum + toNumber(payment.amount), 0));
}

export async function calculateVariationDepositTopup(supabase, order, variation) {
  const depositPercent = toNumber(variation.deposit_percent);
  if (!variation.deposit_required || depositPercent <= 0) return 0;
  const revisedTotal = toNumber(variation.revised_order_total_inc_gst);
  if (revisedTotal <= 0) return 0;
  const requiredDeposit = roundMoney((revisedTotal * depositPercent) / 100);
  const paidDeposit = await paidDepositTotal(supabase, order.id);
  return Math.max(0, roundMoney(requiredDeposit - paidDeposit));
}

export async function recalcVariation(supabase, variationId) {
  const { data: variation, error: variationError } = await supabase
    .from("pcd_order_variations")
    .select("*, pcd_orders(*)")
    .eq("id", variationId)
    .maybeSingle();
  if (variationError || !variation) throw variationError || new Error("Variation not found.");

  const { data: lines, error: linesError } = await supabase
    .from("pcd_order_variation_lines")
    .select("*")
    .eq("variation_id", variationId);
  if (linesError) throw linesError;

  const totals = calculateVariationTotals(lines || [], toNumber(variation.gst_rate, GST_RATE));
  const revisedTotal = roundMoney(toNumber(variation.pcd_orders?.total_inc_gst) + totals.total_inc_gst);
  const topup = await calculateVariationDepositTopup(supabase, variation.pcd_orders, {
    ...variation,
    ...totals,
    revised_order_total_inc_gst: revisedTotal,
  });

  const { data, error } = await supabase
    .from("pcd_order_variations")
    .update({
      subtotal_ex_gst: totals.subtotal_ex_gst,
      gst_amount: totals.gst_amount,
      total_inc_gst: totals.total_inc_gst,
      revised_order_total_inc_gst: revisedTotal,
      deposit_topup_required: topup,
    })
    .eq("id", variationId)
    .select("*, pcd_order_variation_lines(*)")
    .single();
  if (error) throw error;
  return data;
}

export function orderLineFromVariationLine(line, orderId, variationId, sortOrder) {
  return {
    order_id: orderId,
    quote_line_item_id: null,
    variation_id: variationId,
    sort_order: sortOrder,
    title: line.title || line.product_type || "Variation item",
    description: line.description || null,
    product_type: line.product_type || null,
    material: line.material || null,
    supplier_name: line.supplier_name || null,
    thickness: line.thickness || null,
    profile_type: line.profile_type || null,
    finish: line.finish || null,
    colour: line.colour || null,
    profile: line.profile || null,
    edge_mould: line.edge_mould || null,
    width_mm: line.width_mm || null,
    height_mm: line.height_mm || null,
    qty: line.qty || 1,
    unit_cost_source_id: line.unit_cost_source_id || null,
    unit_cost_source_label: line.unit_cost_source_label || null,
    unit_cost_per_sqm_ex_gst: toNumber(line.unit_cost_per_sqm_ex_gst),
    calculated_unit_cost_ex_gst: toNumber(line.calculated_unit_cost_ex_gst),
    product_unit_cost_ex_gst: toNumber(line.product_unit_cost_ex_gst),
    markup_percent: toNumber(line.markup_percent),
    line_total_ex_gst: toNumber(line.proposed_line_total_ex_gst),
    fulfilment_method: "in_house",
    status: "Not Ordered",
    variation_status: "added",
    notes: line.notes || null,
  };
}

export async function applyAcceptedVariation(supabase, variationId, { actorType = "system" } = {}) {
  const { data: variation, error: variationError } = await supabase
    .from("pcd_order_variations")
    .select("*, pcd_orders(*)")
    .eq("id", variationId)
    .maybeSingle();
  if (variationError || !variation) throw variationError || new Error("Variation not found.");
  if (variation.status === "applied") return variation;
  if (!["approved", "approved_pending_payment"].includes(variation.status)) {
    throw new Error("Only approved variations can be applied.");
  }

  const order = variation.pcd_orders;
  const { data: lines, error: linesError } = await supabase
    .from("pcd_order_variation_lines")
    .select("*")
    .eq("variation_id", variationId)
    .order("sort_order", { ascending: true });
  if (linesError) throw linesError;

  const { data: currentItems } = await supabase
    .from("pcd_order_line_items")
    .select("sort_order")
    .eq("order_id", order.id)
    .order("sort_order", { ascending: false })
    .limit(1);
  let nextSortOrder = Number(currentItems?.[0]?.sort_order || 0) + 1;

  for (const line of lines || []) {
    if (line.action === "add" || line.action === "price_adjustment") {
      const { error } = await supabase
        .from("pcd_order_line_items")
        .insert(orderLineFromVariationLine(line, order.id, variation.id, nextSortOrder));
      if (error) throw error;
      nextSortOrder += 1;
    }

    if (line.action === "change" && line.order_line_item_id) {
      const { error } = await supabase
        .from("pcd_order_line_items")
        .update({
          variation_id: variation.id,
          variation_status: "changed",
          title: line.title || line.product_type || "Variation item",
          description: line.description || null,
          product_type: line.product_type || null,
          material: line.material || null,
          supplier_name: line.supplier_name || null,
          thickness: line.thickness || null,
          profile_type: line.profile_type || null,
          finish: line.finish || null,
          colour: line.colour || null,
          profile: line.profile || null,
          edge_mould: line.edge_mould || null,
          width_mm: line.width_mm || null,
          height_mm: line.height_mm || null,
          qty: line.qty || 1,
          unit_cost_source_id: line.unit_cost_source_id || null,
          unit_cost_source_label: line.unit_cost_source_label || null,
          unit_cost_per_sqm_ex_gst: toNumber(line.unit_cost_per_sqm_ex_gst),
          calculated_unit_cost_ex_gst: toNumber(line.calculated_unit_cost_ex_gst),
          product_unit_cost_ex_gst: toNumber(line.product_unit_cost_ex_gst),
          markup_percent: toNumber(line.markup_percent),
          line_total_ex_gst: toNumber(line.proposed_line_total_ex_gst),
          notes: line.notes || null,
        })
        .eq("id", line.order_line_item_id)
        .eq("order_id", order.id);
      if (error) throw error;
    }

    if (line.action === "remove" && line.order_line_item_id) {
      const { error } = await supabase
        .from("pcd_order_line_items")
        .update({
          removed_by_variation_id: variation.id,
          variation_status: "removed",
          status: "Complete",
          line_total_ex_gst: 0,
          notes: [line.notes, "Removed by accepted variation"].filter(Boolean).join(" - "),
        })
        .eq("id", line.order_line_item_id)
        .eq("order_id", order.id);
      if (error) throw error;
    }
  }

  const subtotal = roundMoney(toNumber(order.subtotal_ex_gst) + toNumber(variation.subtotal_ex_gst));
  const gst = roundMoney(toNumber(order.gst_amount) + toNumber(variation.gst_amount));
  const total = roundMoney(toNumber(order.total_inc_gst) + toNumber(variation.total_inc_gst));
  const now = new Date().toISOString();

  const { error: orderError } = await supabase
    .from("pcd_orders")
    .update({
      subtotal_ex_gst: subtotal,
      gst_amount: gst,
      total_inc_gst: total,
    })
    .eq("id", order.id);
  if (orderError) throw orderError;

  const { data: appliedVariation, error: updateError } = await supabase
    .from("pcd_order_variations")
    .update({ status: "applied", applied_at: now })
    .eq("id", variation.id)
    .select("*")
    .single();
  if (updateError) throw updateError;

  await logOrderActivity(supabase, {
    order_id: order.id,
    quote_id: order.quote_id || null,
    variation_id: variation.id,
    actor_type: actorType,
    action_type: "variation_applied",
    title: "Variation applied to order",
    description: `${variation.variation_number} - ${formatMoney(variation.total_inc_gst, variation.currency || "AUD")}`,
    metadata: {
      variation_number: variation.variation_number,
      variation_total_inc_gst: variation.total_inc_gst,
      revised_order_total_inc_gst: total,
    },
    event_key: `variation:${variation.id}:applied`,
  });

  return appliedVariation;
}
