import { randomBytes } from "node:crypto";
import { requireAdminApiContext } from "../../../../lib/admin-api";
import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { getBusinessDefaults } from "../../../../lib/pcd-business-defaults";
import { addressColumns } from "../../../../lib/pcd-contact-details";
import { resolveQuoteCustomer } from "../../../../lib/pcd-customer-utils";
import { createBoardCostResolver } from "../../../../lib/pcd-board-cost";
import { convertedQuoteLine, madeToOrderSummary, unpricedSummary } from "../../../../lib/pcd-quote-request-convert";
import { calculateQuoteLine, quoteCostDefaults } from "../../../../lib/pcd-quote-utils";
import { defaultQuoteTermsFor } from "../../../../lib/pcd-quote-terms";
import {
  cabinetConfigRow,
  isMissingSupplierNameSchemaError,
  quoteLineRow,
  recalculateQuoteTotals,
  withoutSupplierName,
} from "../quotes/[id]/_quote-line-save";

function makeQuoteNumber() {
  return `PCD-Q-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function makeAccessCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { data, error } = await context.supabase
      .from("pcd_quote_requests")
      .select("*, pcd_quote_request_line_items(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ ok: true, quoteRequests: data || [] });
  } catch (error) {
    return Response.json({ ok: false, quoteRequests: [], setupRequired: true, error: error?.message || "Could not load quote requests." });
  }
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json();
    if (payload.action !== "convert_to_quote" || !payload.id) {
      return Response.json({ ok: false, error: "Invalid quote request action." }, { status: 400 });
    }

    const { data: quoteRequest, error } = await context.supabase
      .from("pcd_quote_requests")
      .select("*, pcd_quote_request_line_items(*)")
      .eq("id", payload.id)
      .single();
    if (error) throw error;

    if (quoteRequest.converted_quote_id) {
      return Response.json({ ok: true, quoteId: quoteRequest.converted_quote_id });
    }

    const customerPayload = {
      customer_name: quoteRequest.customer_name,
      customer_email: quoteRequest.customer_email,
      customer_phone: quoteRequest.customer_phone,
      ...addressColumns({ suburb: quoteRequest.delivery_suburb }),
    };
    const customerId = await resolveQuoteCustomer(context.supabase, customerPayload);
    const businessDefaults = await getBusinessDefaults(context.supabase);
    const termsDefaults = await defaultQuoteTermsFor(context.supabase);

    const { data: quote, error: quoteError } = await context.supabase
      .from("pcd_quotes")
      .insert({
        quote_number: makeQuoteNumber(),
        access_code: makeAccessCode(),
        title: quoteRequest.product_name ? `${quoteRequest.product_name} Quote` : "Cabinetry Quote",
        status: "draft",
        customer_id: customerId,
        customer_name: quoteRequest.customer_name,
        customer_email: quoteRequest.customer_email,
        customer_phone: quoteRequest.customer_phone,
        // The request form asks for a delivery suburb and nothing else, which
        // is the right question at that stage. It lands in the suburb column,
        // not the address one: "Subiaco" on its own used to read as the whole
        // street address, and the street and postcode are then asked for once
        // in the quote editor rather than guessed at here.
        ...addressColumns({ suburb: quoteRequest.delivery_suburb }),
        project_name: quoteRequest.cabinet_brand,
        currency: businessDefaults.currency,
        gst_rate: businessDefaults.gst_rate,
        worker_hourly_rate: businessDefaults.worker_hourly_rate,
        // Delivery, consumables, door removal and the rest, from the same
        // defaults the quotes screen uses. An enquiry has no costs of its own
        // to override them, and they stay editable on the quote.
        ...quoteCostDefaults(businessDefaults),
        notes: quoteRequest.notes,
        // The configured terms, not a sentence written into this file. This
        // used to be hardcoded with the old "valid for 14 days" wording while
        // businessDefaults sat unused three lines above, so every quote made
        // from a website enquiry carried terms nobody had chosen and the
        // settings screen appeared to do nothing. It now reads the same Always
        // terms the quotes screen uses, from the one library.
        terms: termsDefaults.terms || null,
        terms_term_ids: termsDefaults.terms_term_ids,
      })
      .select("*")
      .single();
    if (quoteError) throw quoteError;

    await logOrderActivity(context.supabase, {
      quote_id: quote.id,
      actor_type: "admin",
      action_type: "quote_created",
      title: "Quote created from quote request",
      description: [quote.quote_number, quoteRequest.customer_name].filter(Boolean).join(" - "),
      metadata: {
        quote_number: quote.quote_number,
        source: "quote_request",
      },
      event_key: `quote:${quote.id}:created`,
      created_at: quote.created_at,
    });

    const requestLines = [...(quoteRequest.pcd_quote_request_line_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    let unpriced = [];
    let madeToOrder = [];
    if (requestLines.length) {
      // One read of the colour library for the whole conversion, not one per
      // line.
      const resolveBoard = await createBoardCostResolver(context.supabase);
      const entries = requestLines.map((line) =>
        convertedQuoteLine(line, { resolveBoard, quoteRequest, businessDefaults })
      );
      unpriced = unpricedSummary(entries);
      madeToOrder = madeToOrderSummary(entries);

      // calculateQuoteLine + quoteLineRow are the same pair every other write
      // path uses. Going straight to insert() was why a converted quote opened
      // with zero-dollar lines: nothing computed the markup, the hinge drilling,
      // the cabinet labour hours or the line totals.
      const quoteLines = entries.map((entry, index) =>
        quoteLineRow(
          {
            ...calculateQuoteLine(entry.line, businessDefaults),
            // Which design, and which item in it. The project tag is what scopes
            // a re-import's sweep; the item tag is what ties a quote line back to
            // the piece the customer drew.
            design_project_id: entry.line.design_project_id,
            design_item_id: entry.line.design_item_id,
          },
          quote.id,
          index
        )
      );

      // The ids come back so the cabinets can be attached below. A cabinet's
      // box lives in its own table keyed to the line, not on the line itself.
      let { data: insertedLines, error: lineError } = await context.supabase
        .from("pcd_quote_line_items")
        .insert(quoteLines)
        .select("id, sort_order");
      if (lineError) {
        if (!isMissingSupplierNameSchemaError(lineError)) throw lineError;
        ({ data: insertedLines, error: lineError } = await context.supabase
          .from("pcd_quote_line_items")
          .insert(quoteLines.map(withoutSupplierName))
          .select("id, sort_order"));
        if (lineError) throw lineError;
      }

      // THE CABINETS THE CUSTOMER DREW, built rather than described.
      //
      // Every other field on a quote line is a column on the line. A cabinet's
      // box is not: it is a row in pcd_cabinet_configs pointing back at the
      // line, which is why the bulk insert above cannot carry it and why
      // nothing here used to. So a converted cabinet arrived with no size and
      // no shelves, and somebody re-typed it off the description.
      const lineIdBySortOrder = new Map((insertedLines || []).map((row) => [row.sort_order, row.id]));
      const cabinetConfigs = entries
        .map((entry, index) => ({ config: entry.line.cabinet_config, lineId: lineIdBySortOrder.get(index) }))
        .filter((entry) => entry.config && entry.lineId)
        .map((entry) => cabinetConfigRow(entry.config, quote.id, entry.lineId));
      if (cabinetConfigs.length) {
        const { error: configError } = await context.supabase
          .from("pcd_cabinet_configs")
          .insert(cabinetConfigs);
        if (configError) throw configError;
      }

      // The quote row was inserted before its lines and was never patched
      // afterwards, so the subtotal, the GST and the total all read zero until
      // somebody re-saved a line by hand. Totals are now right on open.
      await recalculateQuoteTotals(context.supabase, quote.id, businessDefaults);
    }

    await context.supabase
      .from("pcd_quote_requests")
      .update({ status: "converted_to_quote", converted_quote_id: quote.id })
      .eq("id", quoteRequest.id);

    if (quoteRequest.design_project_id) {
      await context.supabase
        .from("pcd_design_projects")
        .update({ status: "converted_to_quote" })
        .eq("id", quoteRequest.design_project_id);
    }

    await logOrderActivity(context.supabase, {
      quote_id: quote.id,
      quote_request_id: quoteRequest.id,
      actor_type: "admin",
      action_type: "quote_request_converted",
      title: "Quote request converted to quote",
      description: [quote.quote_number, quoteRequest.customer_name].filter(Boolean).join(" - "),
      metadata: {
        quote_number: quote.quote_number,
        line_items: requestLines.length,
        priced_lines: requestLines.length - unpriced.length - madeToOrder.length,
        unpriced_lines: unpriced,
        // Not a gap: these are quoted from the supplier's price for the job.
        made_to_order_lines: madeToOrder,
      },
      event_key: `quote_request:${quoteRequest.id}:converted`,
    });

    // The caller shows this so nothing sits silently at $0. Everything that
    // could be priced already has been; this names only what still needs a look.
    return Response.json({
      ok: true,
      quoteId: quote.id,
      lineCount: requestLines.length,
      unpricedCount: unpriced.length,
      unpriced,
      madeToOrderCount: madeToOrder.length,
      madeToOrder,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not convert quote request." }, { status: 500 });
  }
}

