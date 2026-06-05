import { randomBytes } from "node:crypto";
import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

const allowedActions = new Set(["approved", "rejected"]);

function makeOrderNumber() {
  return `PCD-O-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

async function createOrderFromQuote(supabase, quote) {
  const { data: existingOrder } = await supabase
    .from("pcd_orders")
    .select("id")
    .eq("quote_id", quote.id)
    .maybeSingle();

  if (existingOrder?.id) {
    return existingOrder.id;
  }

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
      accepted_at: new Date().toISOString(),
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
    actor_type: "customer",
    action_type: "quote_approved_order_created",
    title: "Quote accepted and order created",
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

export async function POST(request) {
  try {
    const payload = await request.json();
    const accessCode = String(payload.code || "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();
    const action = payload.action;

    if (!accessCode || !allowedActions.has(action)) {
      return Response.json({ ok: false, error: "Invalid quote response." }, { status: 400 });
    }

    if (!String(payload.client_name || "").trim()) {
      return Response.json({ ok: false, error: "Please enter your name first." }, { status: 400 });
    }

    if (action === "rejected" && !String(payload.note || "").trim()) {
      return Response.json({ ok: false, error: "Please include a rejection note." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: quote, error } = await supabase
      .from("pcd_quotes")
      .select("*")
      .eq("access_code", accessCode)
      .maybeSingle();

    if (error || !quote) {
      return Response.json({ ok: false, error: "We could not load this quote." }, { status: 404 });
    }

    if (quote.status === "approved" || quote.status === "rejected") {
      return Response.json({ ok: false, error: "This quote has already been responded to." }, { status: 409 });
    }

    const now = new Date().toISOString();
    let orderId = null;
    if (action === "approved") {
      orderId = await createOrderFromQuote(supabase, quote);
    }

    const updatePayload =
      action === "approved"
        ? { status: "approved", approved_at: now, order_id: orderId }
        : { status: "rejected", rejected_at: now };

    const { error: updateError } = await supabase.from("pcd_quotes").update(updatePayload).eq("id", quote.id);
    if (updateError) throw updateError;

    await supabase.from("pcd_quote_actions").insert({
      quote_id: quote.id,
      action,
      client_name: String(payload.client_name || "").trim(),
      note: payload.note || null,
    });

    if (action === "rejected") {
      await logOrderActivity(supabase, {
        quote_id: quote.id,
        actor_type: "customer",
        action_type: "quote_rejected",
        title: "Quote rejected by customer",
        description: payload.note || null,
        metadata: {
          client_name: String(payload.client_name || "").trim(),
        },
      });
    }

    return Response.json({ ok: true, orderId });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not record quote response." }, { status: 500 });
  }
}
