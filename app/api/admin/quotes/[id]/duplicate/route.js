import { randomBytes } from "node:crypto";
import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../lib/pcd-activity-log";
import { getBusinessDefaults } from "../../../../../../lib/pcd-business-defaults";
import { calculateQuoteTotals, GST_RATE } from "../../../../../../lib/pcd-quote-utils";
import { isEdgeProfileSelectionAvailable } from "../../../../../request-quote/quote-form-data";

const LINE_COPY_FIELDS = [
  "product_type",
  "product_name",
  "description",
  "material",
  "thickness",
  "width_mm",
  "height_mm",
  "finish",
  "colour",
  "profile_type",
  "profile",
  "edge_mould",
  "qty",
  "hinge_holes",
  "hinge_supply",
  "hinge_qty",
  "product_unit_cost_ex_gst",
  "unit_cost_mode",
  "unit_cost_source_id",
  "unit_cost_source_label",
  "unit_cost_per_sqm_ex_gst",
  "calculated_unit_cost_ex_gst",
  "labour_hours",
  "worker_hourly_rate",
  "travel_cost_ex_gst",
  "delivery_cost_ex_gst",
  "installation_cost_ex_gst",
  "other_cost_ex_gst",
  "markup_percent",
  "notes",
];

async function quoteIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

function makeQuoteNumber() {
  return `PCD-Q-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function makeAccessCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

function copyLineForCalculation(line) {
  return LINE_COPY_FIELDS.reduce((copy, field) => {
    copy[field] = line[field];
    return copy;
  }, {});
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function numberValue(value, fallback = 0) {
  if (value === "" || value === null || typeof value === "undefined") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableNumber(value) {
  if (value === "" || value === null || typeof value === "undefined") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function quoteLineRow(line, quoteId, sortOrder) {
  return {
    quote_id: quoteId,
    sort_order: sortOrder,
    product_type: cleanText(line.product_type),
    product_name: cleanText(line.product_name),
    description: cleanText(line.description),
    material: cleanText(line.material),
    thickness: cleanText(line.thickness),
    width_mm: nullableNumber(line.width_mm),
    height_mm: nullableNumber(line.height_mm),
    finish: cleanText(line.finish),
    colour: cleanText(line.colour),
    profile_type: cleanText(line.profile_type),
    profile: cleanText(line.profile),
    edge_mould: isEdgeProfileSelectionAvailable(line.edge_mould, line.material) ? cleanText(line.edge_mould) : null,
    qty: numberValue(line.qty, 1),
    hinge_holes: Boolean(line.hinge_holes),
    hinge_supply: Boolean(line.hinge_supply),
    hinge_qty: cleanText(line.hinge_qty),
    product_unit_cost_ex_gst: numberValue(line.product_unit_cost_ex_gst),
    unit_cost_mode: line.unit_cost_mode === "auto" ? "auto" : "manual",
    unit_cost_source_id: line.unit_cost_source_id || null,
    unit_cost_source_label: cleanText(line.unit_cost_source_label),
    unit_cost_per_sqm_ex_gst: numberValue(line.unit_cost_per_sqm_ex_gst),
    calculated_unit_cost_ex_gst: numberValue(line.calculated_unit_cost_ex_gst),
    material_cost_ex_gst: numberValue(line.material_cost_ex_gst),
    hinge_drilling_cost_ex_gst: numberValue(line.hinge_drilling_cost_ex_gst),
    hinge_supply_cost_ex_gst: numberValue(line.hinge_supply_cost_ex_gst),
    hinge_drilling_qty: numberValue(line.hinge_drilling_qty),
    hinge_supply_qty: numberValue(line.hinge_supply_qty),
    labour_hours: numberValue(line.labour_hours),
    worker_hourly_rate: numberValue(line.worker_hourly_rate),
    labour_cost_ex_gst: numberValue(line.labour_cost_ex_gst),
    travel_cost_ex_gst: numberValue(line.travel_cost_ex_gst),
    delivery_cost_ex_gst: numberValue(line.delivery_cost_ex_gst),
    installation_cost_ex_gst: numberValue(line.installation_cost_ex_gst),
    other_cost_ex_gst: numberValue(line.other_cost_ex_gst),
    markup_percent: numberValue(line.markup_percent),
    markup_amount_ex_gst: numberValue(line.markup_amount_ex_gst),
    unit_price_ex_gst: numberValue(line.unit_price_ex_gst),
    line_total_ex_gst: numberValue(line.line_total_ex_gst),
    notes: cleanText(line.notes),
  };
}

export async function POST(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const sourceQuoteId = await quoteIdFromParams(params);
    const { data: sourceQuote, error: quoteError } = await context.supabase
      .from("pcd_quotes")
      .select("id, currency, gst_rate")
      .eq("id", sourceQuoteId)
      .single();
    if (quoteError) throw quoteError;

    const { data: sourceLines, error: lineError } = await context.supabase
      .from("pcd_quote_line_items")
      .select("*")
      .eq("quote_id", sourceQuote.id)
      .order("sort_order", { ascending: true });
    if (lineError) throw lineError;

    const businessDefaults = await getBusinessDefaults(context.supabase);
    const copiedLines = (sourceLines || []).map(copyLineForCalculation);
    const totals = calculateQuoteTotals(copiedLines, sourceQuote.gst_rate ?? GST_RATE, {
      business_defaults: businessDefaults,
    });

    const { data: newQuote, error: insertQuoteError } = await context.supabase
      .from("pcd_quotes")
      .insert({
        quote_number: makeQuoteNumber(),
        access_code: makeAccessCode(),
        title: "Cabinetry Quote",
        status: "draft",
        customer_id: null,
        customer_name: null,
        customer_email: null,
        customer_phone: null,
        site_address: null,
        project_name: null,
        currency: sourceQuote.currency || "AUD",
        gst_rate: sourceQuote.gst_rate ?? GST_RATE,
        subtotal_ex_gst: totals.subtotal_ex_gst,
        gst_amount: totals.gst_amount,
        total_inc_gst: totals.total_inc_gst,
        material_cost_ex_gst: totals.material_cost_ex_gst,
        labour_hours: 0,
        worker_hourly_rate: businessDefaults.worker_hourly_rate,
        labour_cost_ex_gst: 0,
        travel_cost_ex_gst: 0,
        delivery_cost_ex_gst: 0,
        installation_cost_ex_gst: 0,
        other_cost_ex_gst: 0,
        markup_percent: totals.markup_percent,
        markup_amount_ex_gst: totals.markup_amount_ex_gst,
        deposit_required: false,
        deposit_percent: 0,
        notes: null,
        client_notes: null,
        assumptions: null,
        exclusions: null,
        terms: null,
      })
      .select("*")
      .single();
    if (insertQuoteError) throw insertQuoteError;

    if (totals.lines.length) {
      const rows = totals.lines.map((line, index) => quoteLineRow(line, newQuote.id, index));
      const { error: insertLineError } = await context.supabase.from("pcd_quote_line_items").insert(rows);
      if (insertLineError) throw insertLineError;
    }

    await logOrderActivity(context.supabase, {
      quote_id: newQuote.id,
      actor_type: "admin",
      action_type: "quote_duplicated",
      title: "Quote duplicated",
      description: `${newQuote.quote_number} created from quote line items only`,
      metadata: {
        source_quote_id: sourceQuote.id,
        line_items: totals.lines.length,
      },
      event_key: `quote:${newQuote.id}:duplicated`,
      created_at: newQuote.created_at,
    });

    const { data: savedQuote } = await context.supabase
      .from("pcd_quotes")
      .select("*, pcd_quote_line_items(*), pcd_quote_attachments(*), pcd_customers(site_address)")
      .eq("id", newQuote.id)
      .single();

    return Response.json({ ok: true, quote: savedQuote || newQuote });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not duplicate quote." }, { status: 500 });
  }
}
