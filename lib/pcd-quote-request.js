// Shared quote-request creation — the insert (+ line items + activity log) and
// the business/customer confirmation emails. Used by BOTH the website quote
// form (/api/quote-requests) and the public design planner's "Send my design to
// PCD" (/api/public/design/[code]/submit), so a lead lands and notifies
// identically whichever way it came in.
//
// It is also where a request is CHECKED for having enough on it to be quoted.
// That used to be the caller's job and only one of the two callers did it, which
// is how requests with no colour on any line got in. Checking a caller cannot
// skip is the whole point of it living here.
//
// Whether a colour is one we hold a PRICE for is a separate question and not one
// asked here: plenty of the library has no cost against it yet and those are
// costed by hand when the request becomes a quote. A missing price is work, not
// a broken request.

import { Resend } from "resend";
import { attemptSend } from "./pcd-notify";
import {
  SALES_EMAIL,
  businessQuoteRequestHtml,
  customerQuoteRequestHtml,
  quoteLineItemsText,
  sourceLabel,
  uniqueRecipients,
} from "./pcd-email-templates";
import { logOrderActivity } from "./pcd-activity-log";
import { upsertCustomerByEmail } from "./pcd-customer-utils";
import { isEdgeProfileSelectionAvailable } from "./quote-form-data";
import { describeGaps, unreadyLines } from "./pcd-quote-ready";
import { normaliseHingeSide, readMiddles } from "./pcd-hinges";

// A measurement, or null. Blank is not zero: a drilled door with no bottom
// measurement is one we set the positions on, and a 0 would put a cup on the
// bottom edge.
function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

// PostgREST reports an unknown column as PGRST204 naming the column. Same
// pattern as the quote line saver's supplier_name guard.
function isMissingColourSourceSchemaError(error) {
  const message = String(error?.message || "");
  return error?.code === "PGRST204" && (message.includes("colour_library_id") || message.includes("supplier_name"));
}

function withoutColourSourceColumns(row) {
  const { colour_library_id: _id, supplier_name: _supplier, ...rest } = row;
  return rest;
}

/**
 * A request that arrived without enough on it to be quoted.
 *
 * Thrown rather than returned, because insertQuoteRequest writes several tables
 * and the point of it is that NOTHING is written. Carries the lines and what
 * each one is short of, so the route can tell the customer which row to fix.
 */
export class IncompleteQuoteRequestError extends Error {
  constructor(incompleteLines) {
    const first = incompleteLines[0];
    super(`${first.label} is missing ${describeGaps(first.gaps)}.`);
    this.name = "IncompleteQuoteRequestError";
    this.incompleteLines = incompleteLines.map((entry) => ({
      index: entry.index,
      label: entry.label,
      missing: entry.gaps.map((gap) => gap.field),
    }));
  }
}

/**
 * One submitted line to the row that gets stored.
 *
 * Exported so the flows that feed it (the website form, the design planner)
 * can be walked end to end in a test without a database. See
 * test/quote-request-flow.test.mjs and test/design-to-quote-flow.test.mjs.
 */
export function quoteRequestLineRow(line, index, { quoteRequestId = null, productName = null } = {}) {
  return {
    quote_request_id: quoteRequestId,
    sort_order: index,
    product_type: line.productType || null,
    // For a Hardware line this is the catalogue item they picked, brand and
    // all. The form makes them choose a real one rather than typing, so this
    // names something we stock instead of the word "Hardware", which is what
    // it used to say and what somebody then had to email and ask about.
    //
    // The id behind it is deliberately not stored: the quote editor resolves a
    // hardware pick into the line the same way, by name and description, so a
    // request line matches a quote line rather than carrying a reference only
    // one of them understands.
    product_name: line.productName || productName || null,
    material: line.material || null,
    thickness: line.thickness || null,
    width_mm: line.width || null,
    height_mm: line.height || null,
    finish: line.finish || null,
    colour: line.colour || null,
    // The exact colour library row the customer picked, plus its brand. These
    // are what let the conversion price the line without anyone re-picking the
    // colour by hand; a colour name on its own is not unique across suppliers.
    // Null when the request came from somewhere that never had a library row to
    // point at.
    colour_library_id: line.colourLibraryId || null,
    supplier_name: line.supplierName || null,
    profile_type: line.profileType || null,
    profile: line.profile || null,
    edge_mould: isEdgeProfileSelectionAvailable(line.edgeMould, line.material) ? line.edgeMould || null : null,
    qty: line.qty || 1,
    hinge_holes: !!line.hingeHoles,
    hinge_supply: !!line.hingeSupply,
    hinge_qty: line.hingeQty || null,
    // Whose cabinet this front is going on. Per line, because a kitchen is
    // routinely Metod fronts with a custom panel closing the end of a run.
    cabinet_brand: line.cabinetBrand || null,
    // WHERE THE HINGES GO. Null throughout means we set the positions, which
    // is almost every door; it is not a gap. Only kept when the line is
    // actually drilled, so an untick cannot leave a measurement behind that
    // nothing on screen still shows.
    hinge_side: line.hingeHoles ? normaliseHingeSide(line.hingeSide) || null : null,
    hinge_from_bottom_mm: line.hingeHoles ? numberOrNull(line.hingeFromBottomMm) : null,
    hinge_from_top_mm: line.hingeHoles ? numberOrNull(line.hingeFromTopMm) : null,
    hinge_middles_mm: line.hingeHoles ? readMiddles(line.hingeMiddlesMm) : [],
    notes: line.notes || null,
  };
}

/**
 * THE ONE PLACE A QUOTE REQUEST IS WRITTEN, so it is the one place that decides
 * whether there is enough on it to quote.
 *
 * This check used to live in the route instead, and only in ONE of the two
 * routes that call this. That is how a ten-line request arrived reading
 * "Thermolaminate / 18mm / Natura" with no colour on any line: the website's own
 * check passed it (its only test was that a colour that IS there is real), and
 * nothing downstream looked again. It converted to a quote nobody could price.
 *
 * Putting it here rather than in the routes means a new way of submitting a
 * request cannot forget it. Every caller gets the same rule, in the same words,
 * without opting in. See lib/pcd-quote-ready.js for the rule itself.
 */
export async function insertQuoteRequest(supabase, payload) {
  const lineList = Array.isArray(payload.lines) ? payload.lines : [];
  // Sizes are not checked here. This runs for the design planners too, where
  // every size is worked out from what the customer drew and one that is not
  // known yet is already said in words on the line. The website form, where a
  // person types the sizes, checks them itself and in its own API.
  const notReady = unreadyLines(
    lineList,
    (line, index) => line.productName || line.productType || `Line ${index + 1}`,
    { requireSize: false }
  );
  if (notReady.length) throw new IncompleteQuoteRequestError(notReady);

  // A form is a lead, so it makes a customer. The address decides who: somebody
  // who emailed in March and fills this in today lands on the one record rather
  // than a second, and a detail that disagrees with what is on file is parked
  // for a person rather than overwriting it. See upsertCustomerByEmail.
  //
  // Failure is quiet on purpose. A customer record that cannot be written must
  // never cost us the lead itself.
  let customerId = null;
  try {
    const customer = await upsertCustomerByEmail(
      supabase,
      {
        email: payload.customerEmail,
        name: payload.customerName,
        phone: payload.customerPhone,
        site_suburb: payload.deliverySuburb,
      },
      { source: "quote_request", label: "Quote request from the website" }
    );
    customerId = customer?.id || null;
  } catch {
    customerId = null;
  }

  const { data: requestRow, error } = await supabase
    .from("pcd_quote_requests")
    .insert({
      customer_id: customerId,
      source: payload.source || "request_quote",
      product_id: payload.productId || null,
      product_name: payload.productName || null,
      customer_name: payload.customerName || null,
      customer_email: payload.customerEmail || null,
      customer_phone: payload.customerPhone || null,
      delivery_suburb: payload.deliverySuburb || null,
      cabinet_brand: payload.cabinetBrand || null,
      notes: payload.notes || null,
      design_project_id: payload.designProjectId || null,
    })
    .select("*")
    .single();
  if (error) throw error;

  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  // Set when the two colour-source columns turn out not to exist and the lines
  // are saved without them. The lead is still saved, which is the right call,
  // but the link to the exact board is gone and the conversion will fall back
  // to matching on a colour name that two suppliers can share. That is a thing
  // to know about rather than a thing to find out from a wrong price, so it is
  // recorded on the request's activity below.
  let colourSourceDropped = false;
  if (lines.length) {
    const rows = lines.map((line, index) =>
      quoteRequestLineRow(line, index, { quoteRequestId: requestRow.id, productName: payload.productName })
    );
    const { error: linesError } = await supabase.from("pcd_quote_request_line_items").insert(rows);
    // A live site must not start rejecting quote requests because a migration
    // has not been run yet. If the two colour-source columns are not there, drop
    // them and save the lead: the spec still lands, the conversion just falls
    // back to matching the colour by name.
    if (linesError) {
      if (!isMissingColourSourceSchemaError(linesError)) throw linesError;
      const { error: retryError } = await supabase
        .from("pcd_quote_request_line_items")
        .insert(rows.map(withoutColourSourceColumns));
      if (retryError) throw retryError;
      colourSourceDropped = true;
      // Said out loud as well as recorded on the activity row. This branch means
      // every line saved tonight can only be matched back to a board by colour
      // NAME, and a name is not unique across suppliers, so the conversion can
      // pick the wrong brand's board at the wrong price. It is worth noticing
      // the first time it happens rather than the tenth.
      console.error(
        "[quote-request] colour_library_id / supplier_name are missing from pcd_quote_request_line_items. " +
          "Saved without them. Run supabase/202608171400_pcd_quote_request_colour_source.sql: until then these " +
          "lines can only be priced by matching the colour name, which is not unique across suppliers."
      );
    }
  }

  await logOrderActivity(supabase, {
    quote_request_id: requestRow.id,
    actor_type: "customer",
    action_type: "quote_request_submitted",
    title: "Quote request submitted",
    description: [payload.customerName, payload.deliverySuburb, payload.source].filter(Boolean).join(" - "),
    metadata: {
      source: payload.source,
      product_name: payload.productName || null,
      line_items: lines.length,
      ...(colourSourceDropped
        ? { colour_source_columns_missing: true, note: "Saved without the colour library link. Run the colour source migration; these lines can only be matched by colour name." }
        : {}),
    },
    event_key: `quote_request:${requestRow.id}:submitted`,
    created_at: requestRow.created_at,
  });

  return requestRow;
}

/**
 * Send the two emails and say which of them did not go.
 *
 * Returns rather than throws. The request row is already saved by the time
 * this runs, so a failure here is ours to chase, not a reason to tell the
 * customer their request was lost. See lib/pcd-notify.js.
 */
export async function sendQuoteRequestEmails(payload) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return [];
  const resend = new Resend(process.env.RESEND_API_KEY);
  const businessRecipients = uniqueRecipients(SALES_EMAIL, process.env.QUOTE_TO_EMAIL);
  const lines = Array.isArray(payload.lines) ? payload.lines : [];

  const results = [];

  results.push(await attemptSend("business", () => resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: businessRecipients,
    replyTo: payload.customerEmail || undefined,
    subject: `Quote request - ${payload.customerName || payload.productName || "PCD customer"}`,
    html: businessQuoteRequestHtml(payload),
    text: [
      "Perth Cabinet Doors - Quote Request",
      "",
      `Source: ${sourceLabel(payload.source)}`,
      `Product: ${payload.productName || ""}`,
      `Name: ${payload.customerName || ""}`,
      `Email: ${payload.customerEmail || ""}`,
      `Phone: ${payload.customerPhone || ""}`,
      `Suburb: ${payload.deliverySuburb || ""}`,
      `Cabinet brand: ${payload.cabinetBrand || ""}`,
      "",
      `Line items: ${lines.length}`,
      ...quoteLineItemsText(lines),
      "",
      payload.notes || "",
    ].join("\n"),
  })));

  if (payload.customerEmail) {
    results.push(await attemptSend("customer", () => resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: [payload.customerEmail],
      replyTo: SALES_EMAIL,
      subject: "We received your Perth Cabinet Doors quote request",
      html: customerQuoteRequestHtml(payload),
      text: [
        `Hi ${payload.customerName || "there"},`,
        "",
        "Thanks for sending your quote request to Perth Cabinet Doors. We have received it and you should expect a response within 1-3 business days.",
        "",
        ...quoteLineItemsText(lines),
        "",
        `Perth Cabinet Doors`,
        SALES_EMAIL,
      ].join("\n"),
    })));
  }

  return results;
}
