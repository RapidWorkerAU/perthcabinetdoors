import { randomBytes } from "node:crypto";
import { logOrderActivity } from "./pcd-activity-log";
import {
  isMissingOrderCostColumnError,
  orderCostColumnsFromQuote,
  withoutOrderCostColumns,
} from "./pcd-order-costs";
import { unconfiguredCabinets } from "./pcd-quote-lock";

function makeOrderNumber() {
  return `PCD-O-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function isThermolaminatedLine(line) {
  return [
    line?.material,
    line?.product_name,
    line?.product_type,
    line?.description,
    line?.profile_type,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes("thermolaminate"));
}

export async function createOrderFromQuote(supabase, quote, { actorType = "customer", markAcceptedAt = true } = {}) {
  const { data: existingOrder } = await supabase
    .from("pcd_orders")
    .select("id")
    .eq("quote_id", quote.id)
    .maybeSingle();

  if (existingOrder?.id) return existingOrder.id;

  const now = new Date().toISOString();
  const orderRow = {
      quote_id: quote.id,
      customer_id: quote.customer_id,
      order_number: makeOrderNumber(),
      name: quote.project_name || quote.title || quote.quote_number,
      customer_name: quote.customer_name,
      customer_email: quote.customer_email,
      customer_phone: quote.customer_phone,
      site_address: quote.site_address,
      // The parts as well as the one-liner. Planning a delivery run means
      // "everything in these suburbs this week", which a free text address
      // cannot answer. Captured at acceptance, so from here they are always set.
      site_street: quote.site_street ?? null,
      site_suburb: quote.site_suburb ?? null,
      site_postcode: quote.site_postcode ?? null,
      status: "active",
      accepted_at: markAcceptedAt ? now : null,
      admin_viewed_at: null,
      deposit_required: false,
      subtotal_ex_gst: quote.subtotal_ex_gst,
      gst_amount: quote.gst_amount,
      total_inc_gst: quote.total_inc_gst,
      // The job costs, not just the three roll-ups. An order used to keep only
      // the totals, so labour, travel, delivery, consumables, painting, glass
      // and removal were baked into a number and then unreachable. A variation
      // that revises one of them has to be able to say what it is now, and this
      // is where "now" comes from. Kept current by applyAcceptedVariation.
      ...orderCostColumnsFromQuote(quote),
  };

  // An order must still be created on a database that has not had the job cost
  // migration run yet — a customer accepting a quote cannot be made to wait on
  // a migration. Without the columns the order simply has no breakdown, and a
  // variation on it starts its costs from zero.
  let { data: order, error: orderError } = await supabase.from("pcd_orders").insert(orderRow).select("*").single();
  if (orderError && isMissingOrderCostColumnError(orderError)) {
    ({ data: order, error: orderError } = await supabase
      .from("pcd_orders")
      .insert(withoutOrderCostColumns(orderRow))
      .select("*")
      .single());
  }

  if (orderError) throw orderError;

  const { data: quoteRequest } = await supabase
    .from("pcd_quote_requests")
    .select("id")
    .eq("converted_quote_id", quote.id)
    .maybeSingle();

  const { data: lines, error: linesError } = await supabase
    .from("pcd_quote_line_items")
    .select("*")
    .eq("quote_id", quote.id)
    .order("sort_order", { ascending: true });
  if (linesError) throw linesError;

  // The cabinet panel list is snapshotted onto the order, not read back from
  // the quote later. The config belongs to the quote, and a quote edit could
  // otherwise change or delete the panels on an order already in the workshop.
  const cabinetLineIds = (lines || [])
    .filter((line) => line.product_type === "base_cabinet")
    .map((line) => line.id);
  const configsByLineId = new Map();
  if (cabinetLineIds.length) {
    const { data: configs, error: configsError } = await supabase
      .from("pcd_cabinet_configs")
      .select("*")
      .in("line_item_id", cabinetLineIds);
    if (configsError) throw configsError;
    (configs || []).forEach((config) => configsByLineId.set(config.line_item_id, config));
  }

  // Last chance to catch a cabinet nobody configured. After this the quote is
  // locked, so the only way to add its panels would be a variation, and the
  // workshop would meanwhile get a sheet with no panels to cut.
  const unconfigured = unconfiguredCabinets(lines || [], configsByLineId);
  if (unconfigured.length) {
    throw new Error(
      `This quote has ${unconfigured.length} cabinet${unconfigured.length === 1 ? "" : "s"} with no cut list, so the workshop would get no panels to cut: ${unconfigured.join(", ")}. Open each one in the quote's cabinet form and save it, then accept the quote.`
    );
  }

  if (lines?.length) {
    const orderLines = lines.map((line, index) => ({
      order_id: order.id,
      quote_line_item_id: line.id,
      sort_order: index,
      title: line.product_name || "Cabinetry item",
      description: line.description,
      product_type: line.product_type,
      material: line.material,
      thickness: line.thickness,
      profile_type: line.profile_type,
      finish: line.finish,
      colour: line.colour,
      profile: line.profile,
      edge_mould: line.edge_mould,
      width_mm: line.width_mm,
      height_mm: line.height_mm,
      qty: line.qty,
      line_total_ex_gst: line.line_total_ex_gst,
      fulfilment_method: isThermolaminatedLine(line) ? "supplier_ready_made" : "in_house",
      status: "Not Ordered",
      notes: line.notes,
      cabinet_config_snapshot: configsByLineId.get(line.id) || null,
    }));
    const { error: insertLinesError } = await supabase.from("pcd_order_line_items").insert(orderLines);
    if (insertLinesError) throw insertLinesError;
  }

  await supabase.from("pcd_quotes").update({ order_id: order.id }).eq("id", quote.id);

  await logOrderActivity(supabase, {
    order_id: order.id,
    quote_id: quote.id,
    quote_request_id: quoteRequest?.id || null,
    actor_type: actorType,
    action_type: markAcceptedAt ? "quote_approved_order_created" : "quote_payment_pending_order_created",
    title: markAcceptedAt ? "Quote accepted and order created" : "Order created pending payment",
    description: [order.order_number, quote.quote_number, quote.customer_name].filter(Boolean).join(" - "),
    metadata: {
      order_number: order.order_number,
      quote_number: quote.quote_number,
      total_inc_gst: order.total_inc_gst,
    },
    event_key: `order:${order.id}:created`,
    created_at: order.accepted_at || order.created_at,
  });

  return order.id;
}
