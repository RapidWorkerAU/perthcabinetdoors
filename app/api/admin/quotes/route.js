import { randomBytes } from "node:crypto";
import { requireAdminApiContext } from "../../../../lib/admin-api";
import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { resolveQuoteCustomer } from "../../../../lib/pcd-customer-utils";
import { calculateQuoteTotals, GST_RATE } from "../../../../lib/pcd-quote-utils";
import { isEdgeProfileSelectionAvailable } from "../../../request-quote/quote-form-data";

function makeQuoteNumber() {
  return `PCD-Q-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function makeAccessCode() {
  return randomBytes(4).toString("hex").toUpperCase();
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

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { data, error } = await context.supabase
      .from("pcd_quotes")
      .select("*, pcd_quote_line_items(*), pcd_quote_attachments(*)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Response.json({ ok: true, quotes: data || [] });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        quotes: [],
        setupRequired: true,
        error: error?.message || "Could not load quotes.",
      },
      { status: 200 }
    );
  }
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json();
    const normalized = await normalizeQuotePayload(context.supabase, payload);

    const { data: quote, error: quoteError } = await context.supabase
      .from("pcd_quotes")
      .insert({
        ...normalized.quote,
        quote_number: makeQuoteNumber(),
        access_code: makeAccessCode(),
      })
      .select("*")
      .single();

    if (quoteError) throw quoteError;

    await logOrderActivity(context.supabase, {
      quote_id: quote.id,
      actor_type: "admin",
      action_type: "quote_created",
      title: "Quote created in admin",
      description: [quote.quote_number, quote.customer_name].filter(Boolean).join(" - "),
      metadata: {
        quote_number: quote.quote_number,
        status: quote.status,
        total_inc_gst: quote.total_inc_gst,
      },
      event_key: `quote:${quote.id}:created`,
      created_at: quote.created_at,
    });

    if (normalized.lines.length) {
      const rows = normalized.lines.map((line, index) => ({
        ...line,
        edge_mould: isEdgeProfileSelectionAvailable(line.edge_mould, line.material) ? line.edge_mould || null : null,
        quote_id: quote.id,
        sort_order: index,
      }));
      const { error: lineError } = await context.supabase.from("pcd_quote_line_items").insert(rows);
      if (lineError) throw lineError;
    }

    const { data: savedQuote } = await context.supabase
      .from("pcd_quotes")
      .select("*, pcd_quote_line_items(*), pcd_quote_attachments(*)")
      .eq("id", quote.id)
      .single();

    return Response.json({ ok: true, quote: savedQuote || quote });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not save quote." },
      { status: 500 }
    );
  }
}
