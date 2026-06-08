import { randomBytes } from "node:crypto";
import { logOrderActivity } from "./pcd-activity-log";

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
  const { data: order, error: orderError } = await supabase
    .from("pcd_orders")
    .insert({
      quote_id: quote.id,
      customer_id: quote.customer_id,
      order_number: makeOrderNumber(),
      name: quote.project_name || quote.title || quote.quote_number,
      customer_name: quote.customer_name,
      customer_email: quote.customer_email,
      customer_phone: quote.customer_phone,
      site_address: quote.site_address,
      status: "active",
      accepted_at: markAcceptedAt ? now : null,
      admin_viewed_at: null,
      deposit_required: false,
      subtotal_ex_gst: quote.subtotal_ex_gst,
      gst_amount: quote.gst_amount,
      total_inc_gst: quote.total_inc_gst,
    })
    .select("*")
    .single();

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
