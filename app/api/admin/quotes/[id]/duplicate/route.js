import { randomBytes } from "node:crypto";
import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../lib/pcd-activity-log";
import { getBusinessDefaults } from "../../../../../../lib/pcd-business-defaults";
import { calculateQuoteTotals } from "../../../../../../lib/pcd-quote-utils";
import { defaultQuoteTermsFor } from "../../../../../../lib/pcd-quote-terms";
import { isMissingSupplierNameSchemaError, quoteLineRow, withoutSupplierName } from "../_quote-line-save";

const LINE_COPY_FIELDS = [
  "product_type",
  "product_name",
  "description",
  "material",
  "supplier_name",
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
  // Which design, and which item in it, the line came from. These were missing,
  // so a duplicated quote forgot it had been imported from a design: importing
  // that design again added a second copy of every line instead of replacing
  // the ones already there, because the sweep that replaces them is scoped by
  // design_project_id.
  "design_item_id",
  "design_project_id",
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
  "client_note",
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
    const termsDefaults = await defaultQuoteTermsFor(context.supabase);
    const copiedLines = (sourceLines || []).map(copyLineForCalculation);
    const totals = calculateQuoteTotals(copiedLines, businessDefaults.gst_rate, {
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
        currency: businessDefaults.currency,
        gst_rate: businessDefaults.gst_rate,
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
        painting_cost_ex_gst: 0,
        glass_cost_ex_gst: 0,
        removal_cost_ex_gst: 0,
        other_cost_ex_gst: 0,
        markup_percent: totals.markup_percent,
        markup_amount_ex_gst: totals.markup_amount_ex_gst,
        deposit_required: false,
        deposit_percent: 0,
        notes: null,
        client_notes: null,
        assumptions: null,
        exclusions: null,
        // A duplicate starts fresh on terms, the way it does on notes: the
        // Always terms as they stand today, not whatever the original carried.
        terms: termsDefaults.terms || null,
        terms_term_ids: termsDefaults.terms_term_ids,
      })
      .select("*")
      .single();
    if (insertQuoteError) throw insertQuoteError;

    if (totals.lines.length) {
      const rows = totals.lines.map((line, index) => quoteLineRow(line, newQuote.id, index));
      let { error: insertLineError } = await context.supabase.from("pcd_quote_line_items").insert(rows);
      if (isMissingSupplierNameSchemaError(insertLineError)) {
        const retry = await context.supabase.from("pcd_quote_line_items").insert(rows.map(withoutSupplierName));
        insertLineError = retry.error;
      }
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

