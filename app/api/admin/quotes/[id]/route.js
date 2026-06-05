import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { describeChanges, logOrderActivity } from "../../../../../lib/pcd-activity-log";
import { resolveQuoteCustomer } from "../../../../../lib/pcd-customer-utils";
import { calculateQuoteTotals, GST_RATE } from "../../../../../lib/pcd-quote-utils";

async function quoteIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

async function normalizeQuotePayload(supabase, payload = {}) {
  const totals = calculateQuoteTotals(payload.lines || [], payload.gst_rate ?? GST_RATE, payload);
  const customerId = await resolveQuoteCustomer(supabase, payload);
  return {
    quote: {
      title: payload.title || "Cabinetry Quote",
      status: payload.status || "draft",
      customer_id: customerId,
      customer_name: payload.customer_name || null,
      customer_email: payload.customer_email || null,
      customer_phone: payload.customer_phone || null,
      site_address: payload.site_address || null,
      project_name: payload.project_name || null,
      currency: payload.currency || "AUD",
      gst_rate: payload.gst_rate ?? GST_RATE,
      subtotal_ex_gst: totals.subtotal_ex_gst,
      gst_amount: totals.gst_amount,
      total_inc_gst: totals.total_inc_gst,
      material_cost_ex_gst: totals.material_cost_ex_gst,
      labour_hours: totals.labour_hours,
      worker_hourly_rate: totals.worker_hourly_rate,
      labour_cost_ex_gst: totals.labour_cost_ex_gst,
      travel_cost_ex_gst: totals.travel_cost_ex_gst,
      delivery_cost_ex_gst: totals.delivery_cost_ex_gst,
      installation_cost_ex_gst: totals.installation_cost_ex_gst,
      other_cost_ex_gst: totals.other_cost_ex_gst,
      markup_percent: totals.markup_percent,
      markup_amount_ex_gst: totals.markup_amount_ex_gst,
      notes: payload.notes || null,
      client_notes: payload.client_notes || null,
      assumptions: payload.assumptions || null,
      exclusions: payload.exclusions || null,
      terms: payload.terms || null,
    },
    lines: totals.lines,
  };
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await quoteIdFromParams(params);
    const { data, error } = await context.supabase
      .from("pcd_quotes")
      .select("*, pcd_quote_line_items(*), pcd_quote_attachments(*)")
      .eq("id", id)
      .single();
    if (error) throw error;
    return Response.json({ ok: true, quote: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load quote." }, { status: 404 });
  }
}

export async function PUT(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await quoteIdFromParams(params);
    const payload = await request.json();
    const normalized = await normalizeQuotePayload(context.supabase, payload);

    const { data: beforeQuote } = await context.supabase
      .from("pcd_quotes")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    const { error: quoteError } = await context.supabase
      .from("pcd_quotes")
      .update(normalized.quote)
      .eq("id", id);
    if (quoteError) throw quoteError;

    const quoteChanges = describeChanges(beforeQuote || {}, normalized.quote, {
      customer_name: "Customer",
      customer_email: "Email",
      customer_phone: "Phone",
      site_address: "Site address",
      project_name: "Project",
      total_inc_gst: "Total inc GST",
    });
    await logOrderActivity(context.supabase, {
      order_id: beforeQuote?.order_id || null,
      quote_id: id,
      actor_type: "admin",
      action_type: "quote_updated",
      title: "Quote updated",
      description: quoteChanges.length ? quoteChanges.slice(0, 8).join("; ") : "Quote line items or pricing updated",
      metadata: {
        changes: quoteChanges,
        line_items: normalized.lines.length,
      },
    });

    const { error: deleteError } = await context.supabase
      .from("pcd_quote_line_items")
      .delete()
      .eq("quote_id", id);
    if (deleteError) throw deleteError;

    if (normalized.lines.length) {
      const rows = normalized.lines.map((line, index) => ({
        ...line,
        quote_id: id,
        sort_order: index,
      }));
      const { error: lineError } = await context.supabase.from("pcd_quote_line_items").insert(rows);
      if (lineError) throw lineError;
    }

    const { data: savedQuote } = await context.supabase
      .from("pcd_quotes")
      .select("*, pcd_quote_line_items(*), pcd_quote_attachments(*)")
      .eq("id", id)
      .single();

    return Response.json({ ok: true, quote: savedQuote });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update quote." }, { status: 500 });
  }
}
