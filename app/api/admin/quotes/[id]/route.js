import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { describeChanges, logOrderActivity } from "../../../../../lib/pcd-activity-log";
import { resolveQuoteCustomer } from "../../../../../lib/pcd-customer-utils";
import { calculateQuoteTotals, GST_RATE } from "../../../../../lib/pcd-quote-utils";
import { isEdgeProfileSelectionAvailable } from "../../../../request-quote/quote-form-data";

async function quoteIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

function dbText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function dbNumber(value, fallback = 0) {
  if (value === "" || value === null || typeof value === "undefined") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dbNullableNumber(value) {
  if (value === "" || value === null || typeof value === "undefined") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
    lines: totals.lines.map((line, index) => ({
      ...line,
      id: sourceLines[index]?.id || null,
      cabinet_config: sourceLines[index]?.cabinet_config || null,
    })),
  };
}

function quoteLineRow(line, quoteId, sortOrder) {
  return {
    quote_id: quoteId,
    sort_order: sortOrder,
    product_type: dbText(line.product_type),
    product_name: dbText(line.product_name),
    description: dbText(line.description),
    material: dbText(line.material),
    thickness: dbText(line.thickness),
    width_mm: dbNullableNumber(line.width_mm),
    height_mm: dbNullableNumber(line.height_mm),
    finish: dbText(line.finish),
    colour: dbText(line.colour),
    profile_type: dbText(line.profile_type),
    profile: dbText(line.profile),
    edge_mould: isEdgeProfileSelectionAvailable(line.edge_mould, line.material) ? dbText(line.edge_mould) : null,
    qty: dbNumber(line.qty, 1),
    hinge_holes: Boolean(line.hinge_holes),
    hinge_supply: Boolean(line.hinge_supply),
    hinge_qty: dbText(line.hinge_qty),
    product_unit_cost_ex_gst: dbNumber(line.product_unit_cost_ex_gst),
    material_cost_ex_gst: dbNumber(line.material_cost_ex_gst),
    hinge_drilling_cost_ex_gst: dbNumber(line.hinge_drilling_cost_ex_gst),
    hinge_supply_cost_ex_gst: dbNumber(line.hinge_supply_cost_ex_gst),
    hinge_drilling_qty: dbNumber(line.hinge_drilling_qty),
    hinge_supply_qty: dbNumber(line.hinge_supply_qty),
    labour_hours: dbNumber(line.labour_hours),
    worker_hourly_rate: dbNumber(line.worker_hourly_rate),
    labour_cost_ex_gst: dbNumber(line.labour_cost_ex_gst),
    travel_cost_ex_gst: dbNumber(line.travel_cost_ex_gst),
    delivery_cost_ex_gst: dbNumber(line.delivery_cost_ex_gst),
    installation_cost_ex_gst: dbNumber(line.installation_cost_ex_gst),
    other_cost_ex_gst: dbNumber(line.other_cost_ex_gst),
    markup_percent: dbNumber(line.markup_percent),
    markup_amount_ex_gst: dbNumber(line.markup_amount_ex_gst),
    unit_price_ex_gst: dbNumber(line.unit_price_ex_gst),
    line_total_ex_gst: dbNumber(line.line_total_ex_gst),
    notes: dbText(line.notes),
  };
}

function cabinetConfigRow(config, quoteId, lineItemId) {
  return {
    id: config.id || undefined,
    line_item_id: lineItemId,
    quote_id: quoteId,
    label: dbText(config.label),
    height_mm: dbNumber(config.height_mm),
    width_mm: dbNumber(config.width_mm),
    depth_mm: dbNumber(config.depth_mm),
    carcass_material: dbText(config.carcass_material),
    carcass_finish: dbText(config.carcass_finish),
    carcass_colour: dbText(config.carcass_colour),
    carcass_thickness_mm: dbNumber(config.carcass_thickness_mm, 16),
    back_panel_included: config.back_panel_included ?? true,
    back_panel_material: dbText(config.back_panel_material),
    back_panel_thickness_mm: dbNumber(config.back_panel_thickness_mm, 16),
    shelf_qty: dbNumber(config.shelf_qty),
    shelf_material: dbText(config.shelf_material),
    shelf_finish: dbText(config.shelf_finish),
    shelf_colour: dbText(config.shelf_colour),
    shelf_thickness_mm: dbNumber(config.shelf_thickness_mm, 16),
    shelf_heights_mm: Array.isArray(config.shelf_heights_mm) ? config.shelf_heights_mm : [],
    cost_per_sqm_carcass: dbNumber(config.cost_per_sqm_carcass),
    cost_per_sqm_shelf: dbNumber(config.cost_per_sqm_shelf),
    labour_cost: dbNumber(config.labour_cost),
    calculated_cut_list: config.calculated_cut_list || config.cut_list || [],
    calculated_material_cost_ex_gst: dbNumber(config.calculated_material_cost_ex_gst),
    notes: dbText(config.notes),
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
    const savedLineIds = [];

    for (const [index, line] of normalized.lines.entries()) {
      let savedLine;
      const row = quoteLineRow(line, id, index);

      if (line.id && existingLineIds.has(line.id)) {
        const { data, error } = await context.supabase
          .from("pcd_quote_line_items")
          .update(row)
          .eq("id", line.id)
          .eq("quote_id", id)
          .select("*")
          .single();
        if (error) throw error;
        savedLine = data;
      } else {
        const { data, error } = await context.supabase
          .from("pcd_quote_line_items")
          .insert(row)
          .select("*")
          .single();
        if (error) throw error;
        savedLine = data;
      }

      savedLineIds.push(savedLine.id);

      if (line.product_type === "base_cabinet" && line.cabinet_config) {
        const configRow = cabinetConfigRow(line.cabinet_config, id, savedLine.id);
        const { error: configError } = await context.supabase
          .from("pcd_cabinet_configs")
          .upsert(configRow, { onConflict: "line_item_id" });
        if (configError) throw configError;
      } else if (line.id && existingLineIds.has(line.id)) {
        const { error: configDeleteError } = await context.supabase
          .from("pcd_cabinet_configs")
          .delete()
          .eq("line_item_id", line.id);
        if (configDeleteError) throw configDeleteError;
      }
    }

    const removedLineIds = [...existingLineIds].filter((lineId) => !savedLineIds.includes(lineId));
    if (removedLineIds.length) {
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
