import { randomBytes } from "node:crypto";
import { requireAdminApiContext } from "../../../../lib/admin-api";
import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { getBusinessDefaults } from "../../../../lib/pcd-business-defaults";
import { addressColumns } from "../../../../lib/pcd-contact-details";
import { resolveQuoteCustomer } from "../../../../lib/pcd-customer-utils";
import { boardCostLinePatch, createBoardCostResolver, lineAreaSqm } from "../../../../lib/pcd-board-cost";
import { calculateQuoteLine } from "../../../../lib/pcd-quote-utils";
import {
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

// Hardware has no board behind it, and a benchtop is priced from the benchtop
// material list rather than the colour library, so neither has a colour to
// resolve.
//
// A cabinet DOES resolve its carcass board rate here, and safely: it carries no
// width or height (see lib/pcd-design-request-lines.js), so the area is zero and
// nothing costs a carcass as though it were one flat sheet. The rate is there so
// whoever configures the cabinet starts from the real board price instead of
// looking it up again.
const NON_BOARD_PRODUCT_TYPES = new Set(["Hardware", "Benchtop"]);

/**
 * Turn one quote-request line into a fully costed quote line.
 *
 * This is the step that used to be missing. The conversion copied the spec
 * across and stopped, so every converted line landed at $0 in manual mode and
 * the only way to price it was to re-pick the colour by hand on every row. Now
 * each line is matched back to its colour library row (by the id the customer's
 * pick carried, falling back to the name) and stamped with the same fields the
 * quote editor's own colour picker stamps, so a converted line and a hand-added
 * line are indistinguishable.
 *
 * A line that cannot be matched is left manual at zero and reported back, rather
 * than being given a guessed rate.
 */
function convertedQuoteLine(line, { resolveBoard, quoteRequest, businessDefaults }) {
  const base = {
    product_type: line.product_type,
    product_name: line.product_name || line.product_type || quoteRequest.product_name,
    description: line.notes,
    material: line.material,
    supplier_name: line.supplier_name || "",
    thickness: line.thickness,
    width_mm: line.width_mm,
    height_mm: line.height_mm,
    finish: line.finish,
    colour: line.colour,
    profile_type: line.profile_type,
    profile: line.profile,
    // profile_type / profile / edge_mould are all re-validated against the
    // material and thickness inside quoteLineRow, the same as every other write
    // path. The conversion used to check only the edge mould and let an invalid
    // profile through.
    edge_mould: line.edge_mould,
    qty: line.qty || 1,
    hinge_holes: line.hinge_holes,
    hinge_supply: line.hinge_supply,
    hinge_qty: line.hinge_qty,
    markup_percent: businessDefaults.markup_percent,
    notes: line.notes,
    // Tags the line to the design it came from, so re-importing that design
    // REPLACES these lines instead of adding a second copy of everything. The
    // importer's sweep is scoped by exactly this column.
    design_project_id: quoteRequest.design_project_id || null,
  };

  if (NON_BOARD_PRODUCT_TYPES.has(line.product_type)) {
    return { line: base, match: null, skipped: true };
  }

  const match = resolveBoard({
    colourLibraryId: line.colour_library_id || null,
    material: line.material,
    thickness: line.thickness,
    finish: line.finish,
    colour: line.colour,
    supplier: line.supplier_name,
  });

  return {
    line: { ...base, ...boardCostLinePatch(match, { areaSqm: lineAreaSqm(base) }) },
    match,
    skipped: false,
  };
}

// Which lines could not be priced, and why, in words a person can act on.
function unpricedSummary(entries) {
  return entries
    .filter((entry) => !entry.skipped && !entry.match?.ok)
    .map((entry) => ({
      product_name: entry.line.product_name || entry.line.product_type || "Line",
      colour: entry.line.colour || "",
      reason: entry.match?.reason || "not_found",
      message: entry.match?.message || "Could not resolve a board cost.",
    }));
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
        notes: quoteRequest.notes,
        // The configured terms, not a sentence written into this file. This
        // used to be hardcoded with the old "valid for 14 days" wording while
        // businessDefaults sat unused three lines above, so every quote made
        // from a website enquiry carried terms nobody had chosen and the
        // settings screen appeared to do nothing.
        terms: businessDefaults.quote_terms || null,
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
    if (requestLines.length) {
      // One read of the colour library for the whole conversion, not one per
      // line.
      const resolveBoard = await createBoardCostResolver(context.supabase);
      const entries = requestLines.map((line) =>
        convertedQuoteLine(line, { resolveBoard, quoteRequest, businessDefaults })
      );
      unpriced = unpricedSummary(entries);

      // calculateQuoteLine + quoteLineRow are the same pair every other write
      // path uses. Going straight to insert() was why a converted quote opened
      // with zero-dollar lines: nothing computed the markup, the hinge drilling,
      // the cabinet labour hours or the line totals.
      const quoteLines = entries.map((entry, index) =>
        quoteLineRow(
          { ...calculateQuoteLine(entry.line, businessDefaults), design_project_id: entry.line.design_project_id },
          quote.id,
          index
        )
      );

      const { error: lineError } = await context.supabase.from("pcd_quote_line_items").insert(quoteLines);
      if (lineError) {
        if (!isMissingSupplierNameSchemaError(lineError)) throw lineError;
        const { error: retryError } = await context.supabase
          .from("pcd_quote_line_items")
          .insert(quoteLines.map(withoutSupplierName));
        if (retryError) throw retryError;
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
        priced_lines: requestLines.length - unpriced.length,
        unpriced_lines: unpriced,
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
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not convert quote request." }, { status: 500 });
  }
}

