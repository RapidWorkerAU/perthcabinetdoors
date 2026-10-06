// TURNING A QUOTE REQUEST INTO A DRAFT QUOTE.
//
// Moved here from app/api/admin/quote-requests/route.js, unchanged, so that the
// Convert to quote button and Alfred make exactly the same quote: the same
// pricing from the colour, hardware and thermolaminate libraries, the same line
// gate (a board the library does not have is taken off its line and kept in its
// note), the same completeness check and the same activity record. The only
// difference is who the record says did it.
//
// The quote is a DRAFT. Nothing is sent to anybody from here.

import { randomBytes } from "node:crypto";
import { logOrderActivity } from "./pcd-activity-log";
import { getBusinessDefaults } from "./pcd-business-defaults";
import { addressColumns } from "./pcd-contact-details";
import { resolveQuoteCustomer } from "./pcd-customer-utils";
import { createBoardCostResolver } from "./pcd-board-cost";
import { withThermoRateCard } from "./pcd-thermo-pricing";
import { getThermoRateCard } from "./pcd-thermo-pricing-store";
import { convertedQuoteLine, madeToOrderSummary, projectNameFromRequest, unpricedSummary } from "./pcd-quote-request-convert";
import { createLineGate, settleImportedCabinet, settleImportedLine } from "./pcd-line-gate";
import { describeGaps, unreadyLines } from "./pcd-quote-ready";
import { createHardwareResolver } from "./pcd-hardware-line";
import { calculateQuoteLine, quoteCostDefaults } from "./pcd-quote-utils";
import { defaultQuoteTermsFor } from "./pcd-quote-terms";
import {
  cabinetConfigRow,
  isMissingSupplierNameSchemaError,
  quoteLineRow,
  recalculateQuoteTotals,
  withoutSupplierName,
} from "../app/api/admin/quotes/[id]/_quote-line-save";

function makeQuoteNumber() {
  return `PCD-Q-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function makeAccessCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

/**
 * Convert one quote request into a draft quote.
 *
 * @param actorType  "admin" for the button, "alfred" for Alfred
 * @returns { quoteId, alreadyConverted, lineCount, unpriced, madeToOrder,
 *            notInLibrary, incomplete, lineNotes: [{ lineId, note }] }
 */
export async function convertQuoteRequest(supabase, requestId, { actorType = "admin" } = {}) {
    const { data: quoteRequest, error } = await supabase
      .from("pcd_quote_requests")
      .select("*, pcd_quote_request_line_items(*)")
      .eq("id", requestId)
      .single();
    if (error) throw error;

    if (quoteRequest.converted_quote_id) {
      return { quoteId: quoteRequest.converted_quote_id, alreadyConverted: true };
    }

    // CLAIMED BEFORE ANYTHING IS MADE. The button, Alfred's hourly pass and his
    // Check now button can all reach the same request at once. Only the one
    // that moves it to converted_to_quote goes on; the others stop here, so one
    // request never becomes two quotes. Released again if the conversion fails.
    const { data: claimed } = await supabase
      .from("pcd_quote_requests")
      .update({ status: "converted_to_quote" })
      .eq("id", quoteRequest.id)
      .eq("status", quoteRequest.status)
      .is("converted_quote_id", null)
      .select("id");
    if (!claimed?.length) {
      return { quoteId: null, alreadyConverted: true, busy: true };
    }

    try {

    const customerPayload = {
      customer_name: quoteRequest.customer_name,
      customer_email: quoteRequest.customer_email,
      customer_phone: quoteRequest.customer_phone,
      ...addressColumns({ suburb: quoteRequest.delivery_suburb }),
    };
    const customerId = await resolveQuoteCustomer(supabase, customerPayload);
    const businessDefaults = await getBusinessDefaults(supabase);
    const termsDefaults = await defaultQuoteTermsFor(supabase);

    const { data: quote, error: quoteError } = await supabase
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
        // Who and where, e.g. "Jane Smith, Subiaco", which is how a job is
        // looked for in the orders list. The order takes its name from this.
        // It used to be the cabinet brand, so orders from the website were
        // called "IKEA Metod"; the brand still travels on every line.
        project_name: projectNameFromRequest(quoteRequest),
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

    await logOrderActivity(supabase, {
      quote_id: quote.id,
      actor_type: actorType,
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
    const notesBySortOrder = new Map();
    let lineIdBySortOrderAll = new Map();
    let madeToOrder = [];
    // Boards the library does not have, taken off their line and kept in its
    // note, and lines that are not complete enough to quote. Both reported on
    // screen and in the activity log, beside the unpriced list.
    const settled = [];
    const unready = unreadyLines(requestLines, (line, index) => `Line ${index + 1}`, { requireSize: false })
      .map((entry) => `${entry.label} needs ${describeGaps(entry.gaps)}`);
    if (requestLines.length) {
      // One read of the colour library for the whole conversion, not one per
      // line.
      const resolveBoard = await createBoardCostResolver(supabase);
      // The hardware catalogue, once, so a hinge the customer picked arrives
      // priced the same way as picking it in the quote editor. A catalogue that
      // cannot be read leaves those lines unpriced and says so, rather than
      // stopping the conversion.
      const { data: hardwareRows } = await supabase.from("pcd_hardware").select("*");
      const resolveHardware = createHardwareResolver(hardwareRows || []);
      // Thermolaminate is made to order, so the colour library has no rate for
      // it. The rate card prices it instead, with our thermolaminate margin as
      // the markup. One it cannot price stays on the made-to-order list, now
      // saying why.
      const { card: thermoCard } = await getThermoRateCard(supabase);
      const entries = requestLines
        .map((line) => convertedQuoteLine(line, { resolveBoard, resolveHardware, quoteRequest, businessDefaults }))
        .map((entry) => withThermoRateCard(entry, thermoCard));
      unpriced = unpricedSummary(entries);
      madeToOrder = madeToOrderSummary(entries);

      // calculateQuoteLine + quoteLineRow are the same pair every other write
      // path uses. Going straight to insert() was why a converted quote opened
      // with zero-dollar lines: nothing computed the markup, the hinge drilling,
      // the cabinet labour hours or the line totals.
      // EVERY BOARD THROUGH THE LINE GATE, the same check a person's save goes
      // through. See lib/pcd-line-gate.js.
      const gate = await createLineGate(supabase);
      // The cabinet's own boards, carcass and shelves, settled the same way the
      // order form and design imports settle them, and saved as settled.
      const settledCabinets = new Map();
      const quoteLines = entries.map((entry, index) => {
        const result = settleImportedLine(gate, entry.line);
        result.notes.forEach((note) => settled.push(`Line ${index + 1}: ${note}`));
        if (result.line.cabinet_config) {
          const cabinet = settleImportedCabinet(gate, result.line.cabinet_config);
          cabinet.notes.forEach((note) => {
            settled.push(`Line ${index + 1}: ${note}`);
            result.notes.push(note);
          });
          settledCabinets.set(index, cabinet.config);
        }
        // What a person should know about this line, kept against it.
        const lineNote = [
          ...result.notes,
          entry.match?.reason === "made_to_order"
            ? "Made to order. Price it from the supplier's quote for the job."
            : !entry.skipped && entry.match && !entry.match.ok
              ? `Not priced: ${entry.match.message || "no cost in the library"}`
              : "",
        ].filter(Boolean).join(" ");
        if (lineNote) notesBySortOrder.set(index, lineNote);
        return quoteLineRow(
          {
            ...calculateQuoteLine(result.line, businessDefaults),
            // Which design, and which item in it. The project tag is what scopes
            // a re-import's sweep; the item tag is what ties a quote line back to
            // the piece the customer drew.
            design_project_id: entry.line.design_project_id,
            design_item_id: entry.line.design_item_id,
          },
          quote.id,
          index
        );
      });

      // The ids come back so the cabinets can be attached below. A cabinet's
      // box lives in its own table keyed to the line, not on the line itself.
      let { data: insertedLines, error: lineError } = await supabase
        .from("pcd_quote_line_items")
        .insert(quoteLines)
        .select("id, sort_order");
      if (lineError) {
        if (!isMissingSupplierNameSchemaError(lineError)) throw lineError;
        ({ data: insertedLines, error: lineError } = await supabase
          .from("pcd_quote_line_items")
          .insert(quoteLines.map((row) => withoutSupplierName(row, lineError)))
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
      lineIdBySortOrderAll = lineIdBySortOrder;
      const cabinetConfigs = entries
        .map((entry, index) => ({ config: settledCabinets.has(index) ? settledCabinets.get(index) : entry.line.cabinet_config, lineId: lineIdBySortOrder.get(index) }))
        .filter((entry) => entry.config && entry.lineId)
        .map((entry) => cabinetConfigRow(entry.config, quote.id, entry.lineId));
      if (cabinetConfigs.length) {
        const { error: configError } = await supabase
          .from("pcd_cabinet_configs")
          .insert(cabinetConfigs);
        if (configError) throw configError;
      }

      // The quote row was inserted before its lines and was never patched
      // afterwards, so the subtotal, the GST and the total all read zero until
      // somebody re-saved a line by hand. Totals are now right on open.
      await recalculateQuoteTotals(supabase, quote.id, businessDefaults);
    }

    await supabase
      .from("pcd_quote_requests")
      .update({ status: "converted_to_quote", converted_quote_id: quote.id })
      .eq("id", quoteRequest.id);

    if (quoteRequest.design_project_id) {
      await supabase
        .from("pcd_design_projects")
        .update({ status: "converted_to_quote" })
        .eq("id", quoteRequest.design_project_id);
    }

    await logOrderActivity(supabase, {
      quote_id: quote.id,
      quote_request_id: quoteRequest.id,
      actor_type: actorType,
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
        not_in_library: settled,
        incomplete_lines: unready,
      },
      event_key: `quote_request:${quoteRequest.id}:converted`,
    });


    return {
      quoteId: quote.id,
      alreadyConverted: false,
      quoteNumber: quote.quote_number,
      lineCount: requestLines.length,
      unpriced,
      madeToOrder,
      notInLibrary: settled,
      incomplete: unready,
      lineNotes: [...notesBySortOrder].map(([index, note]) => ({ lineId: lineIdBySortOrderAll.get(index) || null, index, note })),
    };
    } catch (error) {
      await supabase
        .from("pcd_quote_requests")
        .update({ status: quoteRequest.status })
        .eq("id", quoteRequest.id)
        .is("converted_quote_id", null);
      throw error;
    }
}
