import { randomBytes } from "node:crypto";
import { formatMoney, GST_RATE, roundMoney, toNumber } from "./pcd-quote-utils";
import { logOrderActivity } from "./pcd-activity-log";
import {
  JOB_COST_ACTION,
  isMissingOrderCostColumnError,
  orderPatchForJobCostLine,
  withoutOrderCostColumns,
} from "./pcd-order-costs";
import { calculateCabinetTotals, normalizeCabinetConfig } from "./pcd-cabinet-utils";
import {
  isMissingCarriedSpecColumn,
  isNotNullViolation,
  withoutCarriedSpecColumns,
  withoutColumns,
} from "./pcd-order-from-quote";

export const VARIATION_STATUSES = ["draft", "sent", "viewed", "approved", "approved_pending_payment", "applied", "rejected", "cancelled"];
// job_cost revises one of the order's job costs (labour, travel, delivery,
// consumables, painting, glass, removal) rather than an item. See
// lib/pcd-order-costs.js for what each one is and where it lives on the order.
export const VARIATION_LINE_ACTIONS = ["add", "change", "remove", "price_adjustment", "job_cost"];

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
  // A job cost states what the cost is now and what it becomes, so what the
  // customer is charged is the difference — exactly like changing an item.
  if (action === "change" || action === JOB_COST_ACTION) return roundMoney(proposed - original);
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

// isVariationFinal used to live here and is deliberately gone.
//
// It answered "can this be edited" with a list that included "rejected" but not
// "sent" or "viewed", which is backwards on both counts: a rejected variation
// SHOULD be editable, because the customer said no and the next version is a new
// proposal, and a sent one should NOT be, because they are holding a link to it.
//
// The rule now lives in lib/pcd-document-lock.js, where the quote and the
// variation answer it the same way. Nothing here should reintroduce a local
// copy: two answers to one question is how the original fault got in.

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

/**
 * A cabinet's stored panel list, rebuilt at the size the variation just set.
 *
 * The production sheet cuts a cabinet from the panel list snapshotted when the
 * order was raised, not from the line's width and height. A variation that
 * changed a cabinet updated the line and left the panel list alone, so the
 * workshop kept cutting to the old size with nothing on the sheet to say so.
 *
 * Returns null when there is nothing to rebuild, which the caller reads as
 * "leave the snapshot exactly as it is". That matters: a variation that changes
 * only a colour must not be an excuse to recalculate panels nobody asked about.
 */
export function resnapshotCabinet(snapshot, line) {
  if (!snapshot || typeof snapshot !== "object") return null;

  const height = toNumber(line?.height_mm);
  const width = toNumber(line?.width_mm);
  if (!height && !width) return null;

  const before = normalizeCabinetConfig(snapshot);
  const after = normalizeCabinetConfig({
    ...snapshot,
    ...(height ? { height_mm: height } : {}),
    ...(width ? { width_mm: width } : {}),
  });
  if (before.height_mm === after.height_mm && before.width_mm === after.width_mm) return null;

  const totals = calculateCabinetTotals(after);
  // A rebuild that produces no panels is not a rebuild, it is the loss of the
  // cut list. Better to keep the old panels, which are at least wrong in a way
  // somebody can see, than to print a cabinet with nothing to cut.
  if (!totals.cut_list?.length) return null;

  return {
    ...snapshot,
    ...after,
    calculated_cut_list: totals.cut_list,
    calculated_material_cost_ex_gst: totals.calculated_material_cost_ex_gst,
    labour_hours: totals.labour_hours,
  };
}

/** Thermolaminate can only ever be supplier made, so it is never undecided. */
function isThermolaminatedVariationLine(line) {
  return [line?.material, line?.title, line?.product_type, line?.description, line?.profile_type]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes("thermolaminate"));
}

export function orderLineFromVariationLine(line, orderId, variationId, sortOrder) {
  return {
    order_id: orderId,
    quote_line_item_id: null,
    variation_id: variationId,
    // Which line of it, not just which variation. This is what lets a retry
    // skip what it has already written instead of writing it twice.
    variation_line_id: line.id || null,
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
    // Which cabinet it belongs to, so a variation-added door groups with that
    // cabinet on the production sheet instead of printing loose.
    design_item_id: line.design_item_id || null,
    // Left unset, exactly as accepting a quote does. Defaulting to in house made
    // a variation's work count as planned the moment it applied, so "panels
    // nobody has decided about" silently under-reported every time a variation
    // landed. Thermolaminate is the one thing that can only be supplier made.
    fulfilment_method: isThermolaminatedVariationLine(line) ? "supplier_ready_made" : null,
    status: "Not Ordered",
    variation_status: "added",
    notes: line.notes || null,
  };
}

/**
 * Variations the customer has agreed to that never reached the order.
 *
 * Approving is two steps: record the answer, then write the lines onto the
 * order and move its totals. The second can fail on its own, and when it does
 * the variation sits at "approved" while the order still shows the old money.
 * Nothing about the order looks wrong, which is what makes it dangerous: the
 * balance owing is short by the exact amount the customer just agreed to.
 *
 * Anything still "approved" is by definition one of these, because a variation
 * that applied cleanly is "applied".
 */
export async function unappliedVariations(supabase, { orderId = null } = {}) {
  let query = supabase
    .from("pcd_order_variations")
    .select("id, order_id, variation_number, status, approved_at, total_inc_gst, apply_error")
    .eq("status", "approved");
  if (orderId) query = query.eq("order_id", orderId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
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

  // WHAT THIS VARIATION HAS ALREADY PUT ON THE ORDER.
  //
  // The status is only marked at the very end, so anything that fails part way
  // leaves lines behind and a variation still saying "approved". Applying it
  // again used to insert the lot a second time, and the order carried
  // duplicates nobody typed and no total expected.
  //
  // Read once, up front. A line already written is skipped rather than
  // rewritten: it may have been cut, ordered or delivered since, and this is a
  // repair, not a reset.
  const { data: alreadyWritten } = await supabase
    .from("pcd_order_line_items")
    .select("variation_line_id")
    .eq("order_id", order.id)
    .eq("variation_id", variation.id);
  const writtenLineIds = new Set(
    (alreadyWritten || []).map((row) => row.variation_line_id).filter(Boolean)
  );
  // Lines written before variation_line_id existed carry the variation but not
  // the line. There is no way to tell which of them is which, so the safe read
  // is that this variation's adds are all done: better to leave a repair for a
  // person than to double an order.
  const wroteBeforeLineIdsExisted = (alreadyWritten || []).length > 0 && writtenLineIds.size === 0;

  // A job cost revises a figure on the order, it does not add a product to it.
  // Collected here and written with the totals below, so a variation touching
  // labour twice lands once and the last word wins.
  //
  // THIS IS THE STEP THAT KEEPS THE NEXT VARIATION HONEST. The editor shows a
  // staff member what each cost is "currently" by reading these columns. If an
  // applied variation did not write back, that figure would drift further from
  // the truth with every variation while still looking authoritative.
  const orderCostPatch = {};

  for (const line of lines || []) {
    if (line.action === JOB_COST_ACTION) {
      Object.assign(orderCostPatch, orderPatchForJobCostLine(line) || {});
      continue;
    }

    if (line.action === "add" || line.action === "price_adjustment") {
      // Already on the order from an earlier attempt at this same variation.
      if (writtenLineIds.has(line.id) || wroteBeforeLineIdsExisted) continue;
      // THE SAME GUARD ACCEPTING A QUOTE HAS. Six columns on this table were
      // added by later migrations, and a database missing one answers PGRST204
      // naming it. Accepting a quote drops those columns and raises the order
      // anyway; applying a variation threw instead, which is how a variation
      // the customer had agreed to ended up never reaching the order while
      // every screen looked fine.
      // EACH RETRY BUILDS ON THE LAST ONE.
      //
      // Two different migrations can be outstanding at once, and they fail one
      // at a time: the first attempt is refused for a column that does not
      // exist, the second for a column that will not take a null. Retrying from
      // the ORIGINAL row each time would put the missing column straight back
      // and the third attempt would fail on the first problem again. So each
      // attempt is the previous one, less whatever it was just refused for.
      let attempt = orderLineFromVariationLine(line, order.id, variation.id, nextSortOrder);
      let { error } = await supabase.from("pcd_order_line_items").insert(attempt);

      if (error && isMissingCarriedSpecColumn(error)) {
        // Said out loud rather than swallowed: those lines then need the
        // backfill running over them.
        console.error("[variation] a column is missing on pcd_order_line_items, so the line lost part of its spec:", error.message);
        attempt = withoutCarriedSpecColumns(attempt);
        ({ error } = await supabase.from("pcd_order_line_items").insert(attempt));
      }

      if (error && isNotNullViolation(error, "fulfilment_method")) {
        // 202608241800 has not been run over this database yet. The line lands
        // as in house rather than the whole variation not landing.
        console.error("[variation] fulfilment_method will not take a null, so this line lands as in_house and needs planning by hand:", error.message);
        attempt = withoutColumns(attempt, ["fulfilment_method"]);
        ({ error } = await supabase.from("pcd_order_line_items").insert(attempt));
      }

      if (error) throw error;
      nextSortOrder += 1;
    }

    if (line.action === "change" && line.order_line_item_id) {
      // A cabinet prints from its stored panel list, not from the line's size.
      // Changing the size without rebuilding that list left the workshop
      // cutting to the size the variation had just superseded.
      const { data: existingLine } = await supabase
        .from("pcd_order_line_items")
        .select("cabinet_config_snapshot")
        .eq("id", line.order_line_item_id)
        .eq("order_id", order.id)
        .maybeSingle();
      const rebuiltCabinet = resnapshotCabinet(existingLine?.cabinet_config_snapshot, line);

      const changePatch = {
          variation_id: variation.id,
          variation_status: "changed",
          // Omitted entirely when there is nothing to rebuild, so a variation
          // that changes only a colour leaves the panel list untouched.
          ...(rebuiltCabinet ? { cabinet_config_snapshot: rebuiltCabinet } : {}),
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
      };

      // The same guard as the insert above: a database missing one of the six
      // later columns must cost this line part of its spec rather than costing
      // the customer's agreed variation its place on the order.
      let { error } = await supabase
        .from("pcd_order_line_items")
        .update(changePatch)
        .eq("id", line.order_line_item_id)
        .eq("order_id", order.id);
      if (error && isMissingCarriedSpecColumn(error)) {
        console.error("[variation] a column is missing on pcd_order_line_items, so the change lost part of its spec:", error.message);
        ({ error } = await supabase
          .from("pcd_order_line_items")
          .update(withoutCarriedSpecColumns(changePatch))
          .eq("id", line.order_line_item_id)
          .eq("order_id", order.id));
      }
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

  const orderPatch = {
    subtotal_ex_gst: subtotal,
    gst_amount: gst,
    total_inc_gst: total,
    ...orderCostPatch,
  };

  let { error: orderError } = await supabase.from("pcd_orders").update(orderPatch).eq("id", order.id);
  // The totals must land even on a database that has not had the job cost
  // migration run. The costs are then lost rather than the whole apply failing,
  // which would leave an approved variation the customer has paid for stuck.
  if (orderError && isMissingOrderCostColumnError(orderError)) {
    ({ error: orderError } = await supabase
      .from("pcd_orders")
      .update(withoutOrderCostColumns(orderPatch))
      .eq("id", order.id));
  }
  if (orderError) throw orderError;

  // apply_error is cleared here rather than left behind: a variation that has
  // just been written onto the order is not one that failed to be.
  let { data: appliedVariation, error: updateError } = await supabase
    .from("pcd_order_variations")
    .update({ status: "applied", applied_at: now, apply_error: null })
    .eq("id", variation.id)
    .select("*")
    .single();
  // A database that has not had the apply_error migration run must not lose the
  // apply over a column that is only there to explain a failure.
  if (updateError && String(updateError.message || "").includes("apply_error")) {
    ({ data: appliedVariation, error: updateError } = await supabase
      .from("pcd_order_variations")
      .update({ status: "applied", applied_at: now })
      .eq("id", variation.id)
      .select("*")
      .single());
  }
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
