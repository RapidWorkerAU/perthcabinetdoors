import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { describeChanges, logOrderActivity } from "../../../../../lib/pcd-activity-log";
import { getBusinessDefaults } from "../../../../../lib/pcd-business-defaults";
import { resolveQuoteCustomer } from "../../../../../lib/pcd-customer-utils";
import { calculateQuoteTotals, GST_RATE } from "../../../../../lib/pcd-quote-utils";
import { cabinetConfigRow, dbNumber, quoteLineRow } from "./_quote-line-save";

async function quoteIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

async function loadQuoteWithRelations(supabase, id) {
  const { data: quote, error } = await supabase
    .from("pcd_quotes")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;

  const [
    { data: lines, error: linesError },
    { data: attachments, error: attachmentsError },
    { data: cabinetConfigs, error: cabinetConfigsError },
  ] = await Promise.all([
    supabase.from("pcd_quote_line_items").select("*").eq("quote_id", id).order("sort_order", { ascending: true }),
    supabase.from("pcd_quote_attachments").select("*").eq("quote_id", id),
    supabase.from("pcd_cabinet_configs").select("*").eq("quote_id", id),
  ]);

  if (linesError) throw linesError;
  if (attachmentsError) throw attachmentsError;
  if (cabinetConfigsError) throw cabinetConfigsError;

  const configsByLineId = new Map((cabinetConfigs || []).map((config) => [config.line_item_id, config]));

  return {
    ...quote,
    pcd_quote_line_items: (lines || []).map((line) => ({
      ...line,
      pcd_cabinet_configs: configsByLineId.has(line.id) ? [configsByLineId.get(line.id)] : [],
    })),
    pcd_quote_attachments: attachments || [],
  };
}

async function normalizeQuotePayload(supabase, payload = {}) {
  const sourceLines = payload.lines || [];
  const businessDefaults = await getBusinessDefaults(supabase);
  const totals = calculateQuoteTotals(payload.lines || [], payload.gst_rate ?? GST_RATE, {
    ...payload,
    business_defaults: businessDefaults,
  });
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
      deposit_required: Boolean(payload.deposit_required),
      deposit_percent: Math.max(0, Math.min(100, dbNumber(payload.deposit_percent))),
      notes: payload.notes || null,
      client_notes: payload.client_notes || null,
      assumptions: payload.assumptions || null,
      exclusions: payload.exclusions || null,
      terms: payload.terms || null,
    },
    lines: totals.lines.map((line, index) => ({
      ...line,
      id: sourceLines[index]?.id || null,
      cabinet_config: sourceLines[index]?.cabinet_config || null,
    })),
  };
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await quoteIdFromParams(params);
    const quote = await loadQuoteWithRelations(context.supabase, id);
    return Response.json({ ok: true, quote });
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

    const { data: existingLines, error: existingLinesError } = await context.supabase
      .from("pcd_quote_line_items")
      .select("id")
      .eq("quote_id", id);
    if (existingLinesError) throw existingLinesError;

    const existingLineIds = new Set((existingLines || []).map((line) => line.id));
    const lineRows = normalized.lines.map((line, index) => {
      const row = quoteLineRow(line, id, index);
      if (line.id && existingLineIds.has(line.id)) row.id = line.id;
      return row;
    });
    const { data: savedLines, error: savedLinesError } = lineRows.length
      ? await context.supabase
          .from("pcd_quote_line_items")
          .upsert(lineRows, { onConflict: "id" })
          .select("*")
      : { data: [], error: null };
    if (savedLinesError) throw savedLinesError;

    const savedLinesBySortOrder = new Map((savedLines || []).map((line) => [line.sort_order, line]));
    const savedLineIds = (savedLines || []).map((line) => line.id);
    const configRows = [];
    const configLineIdsToDelete = [];

    normalized.lines.forEach((line, index) => {
      const savedLine = savedLinesBySortOrder.get(index);
      if (!savedLine) return;
      if (line.product_type === "base_cabinet" && line.cabinet_config) {
        configRows.push(cabinetConfigRow(line.cabinet_config, id, savedLine.id));
      } else if (savedLine.id) {
        configLineIdsToDelete.push(savedLine.id);
      }
    });

    const configWrites = [];
    if (configRows.length) {
      configWrites.push(context.supabase.from("pcd_cabinet_configs").upsert(configRows, { onConflict: "line_item_id" }));
    }
    if (configLineIdsToDelete.length) {
      configWrites.push(context.supabase.from("pcd_cabinet_configs").delete().in("line_item_id", configLineIdsToDelete));
    }
    const configResults = await Promise.all(configWrites);
    const configError = configResults.find((result) => result.error)?.error;
    if (configError) throw configError;

    const removedLineIds = [...existingLineIds].filter((lineId) => !savedLineIds.includes(lineId));
    if (removedLineIds.length) {
      await context.supabase.from("pcd_cabinet_configs").delete().in("line_item_id", removedLineIds);
      const { error: deleteError } = await context.supabase
        .from("pcd_quote_line_items")
        .delete()
        .in("id", removedLineIds);
      if (deleteError) throw deleteError;
    }

    const savedQuote = await loadQuoteWithRelations(context.supabase, id);

    return Response.json({ ok: true, quote: savedQuote });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update quote." }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await quoteIdFromParams(params);
    const payload = await request.json();

    const [
      { data: beforeQuote, error: quoteLoadError },
      { data: existingLines, error: linesLoadError },
    ] = await Promise.all([
      context.supabase.from("pcd_quotes").select("*").eq("id", id).maybeSingle(),
      context.supabase.from("pcd_quote_line_items").select("*").eq("quote_id", id).order("sort_order", { ascending: true }),
    ]);

    if (quoteLoadError) throw quoteLoadError;
    if (linesLoadError) throw linesLoadError;
    if (!beforeQuote) return Response.json({ ok: false, error: "Quote not found." }, { status: 404 });

    const normalized = await normalizeQuotePayload(context.supabase, {
      ...beforeQuote,
      ...payload,
      lines: existingLines || [],
    });

    const { data: quote, error: quoteError } = await context.supabase
      .from("pcd_quotes")
      .update(normalized.quote)
      .eq("id", id)
      .select("*")
      .single();
    if (quoteError) throw quoteError;

    const quoteChanges = describeChanges(beforeQuote || {}, normalized.quote, {
      customer_name: "Customer",
      customer_email: "Email",
      customer_phone: "Phone",
      site_address: "Site address",
      project_name: "Project",
      total_inc_gst: "Total inc GST",
    });

    if (quoteChanges.length) {
      await logOrderActivity(context.supabase, {
        order_id: beforeQuote?.order_id || null,
        quote_id: id,
        actor_type: "admin",
        action_type: "quote_updated",
        title: "Quote updated",
        description: quoteChanges.slice(0, 8).join("; "),
        metadata: {
          changes: quoteChanges,
          line_items: (existingLines || []).length,
        },
      });
    }

    return Response.json({ ok: true, quote });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update quote." }, { status: 500 });
  }
}
