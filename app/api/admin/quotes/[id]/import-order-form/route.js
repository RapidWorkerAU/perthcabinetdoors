import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { assertQuoteEditable } from "../../../../../../lib/pcd-quote-lock";
import { readOrderForm, quotePatchFromDetails } from "../../../../../../lib/pcd-order-form-import";
import { calculateQuoteLine } from "../../../../../../lib/pcd-quote-utils";
import { getBusinessDefaults } from "../../../../../../lib/pcd-business-defaults";
// The same pair every other write path uses. Going straight to insert is how a
// converted quote once opened with zero dollar lines: nothing had computed the
// markup, the hinge drilling or the totals.
import {
  isMissingSupplierNameSchemaError,
  quoteLineRow,
  recalculateQuoteTotals,
  withoutSupplierName,
} from "../_quote-line-save";

// READING A COMPLETED ORDER FORM ONTO A QUOTE.
//
// Two steps, on purpose, and they are two different requests.
//
//   preview  reads the file and says what it found. Writes nothing.
//   apply    writes it, using the mapping the person confirmed.
//
// Split because a quote that already has priced lines on it is the normal case
// rather than the exception. A wrong file has to be something you back out of,
// not something you undo, so nothing is written until somebody has looked at
// what is about to happen.
//
// The reading itself is lib/pcd-order-form-import.js, which is also what the
// tests exercise. This route is the door, the lock and the write.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A spreadsheet of a hundred lines is well under this. The cap is here so a
// mistaken upload of something enormous is refused before it is parsed rather
// than after.
const MAX_BYTES = 8 * 1024 * 1024;

function badRequest(error) {
  return Response.json({ ok: false, error }, { status: 400 });
}

async function fileFromRequest(request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") return { error: "No file was uploaded." };
  if (file.size > MAX_BYTES) return { error: "That file is too big to be an order form." };

  const mode = String(form.get("mode") || "add");
  const withCustomer = String(form.get("withCustomer") || "") === "true";
  let mapping = {};
  try {
    mapping = JSON.parse(String(form.get("mapping") || "{}")) || {};
  } catch {
    return { error: "The column mapping could not be read." };
  }

  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    mode: mode === "replace" ? "replace" : "add",
    withCustomer,
    mapping,
  };
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { id: quoteId } = await Promise.resolve(params);
    const url = new URL(request.url);
    const apply = url.searchParams.get("apply") === "1";

    const { data: quote, error: quoteError } = await context.supabase
      .from("pcd_quotes")
      .select("id, status, order_id, customer_id, customer_name, customer_email")
      .eq("id", quoteId)
      .maybeSingle();
    if (quoteError) throw quoteError;
    if (!quote) return badRequest("That quote could not be found.");

    // THE SAME LOCK EVERY OTHER WRITE TO A QUOTE GOES THROUGH. A quote that has
    // been accepted and become an order is not somewhere to drop four new lines:
    // the order and the financials behind it still read from it.
    //
    // It throws with a 409 on it, so the refusal reaches the screen as a rule
    // rather than as a crash.
    await assertQuoteEditable(context.supabase, quoteId, { status: quote.status });

    const read = await fileFromRequest(request);
    if (read.error) return badRequest(read.error);

    const parsed = await readOrderForm(read.buffer, { mapping: read.mapping });
    if (!parsed.ok) return badRequest(parsed.error);
    if (!parsed.lines.length) {
      return badRequest("That form has no item rows filled in, so there is nothing to bring across.");
    }

    const { patch, company, homeless } = quotePatchFromDetails(parsed.details);

    // What the customer block would change, said out loud rather than applied
    // quietly. The request form follows the same rule: a detail that disagrees
    // with what is on file is parked for a person.
    const conflicts = [];
    if (read.withCustomer) {
      if (patch.customer_name && quote.customer_name && patch.customer_name !== quote.customer_name) {
        conflicts.push(`The quote is for ${quote.customer_name}; the form says ${patch.customer_name}.`);
      }
      if (patch.customer_email && quote.customer_email && patch.customer_email !== quote.customer_email) {
        conflicts.push(`The quote emails ${quote.customer_email}; the form says ${patch.customer_email}.`);
      }
    }

    const { count: existingCount } = await context.supabase
      .from("pcd_quote_line_items")
      .select("id", { count: "exact", head: true })
      .eq("quote_id", quoteId);

    if (!apply) {
      return Response.json({
        ok: true,
        preview: true,
        lines: parsed.lines,
        details: parsed.details,
        patch,
        company,
        homeless,
        conflicts,
        warnings: parsed.warnings,
        matched: parsed.matched,
        unmatched: parsed.unmatched,
        availableHeadings: parsed.availableHeadings,
        existingLines: existingCount || 0,
      });
    }

    // ── from here on it writes ────────────────────────────────────────────
    const businessDefaults = await getBusinessDefaults(context.supabase);

    if (read.mode === "replace") {
      const { error } = await context.supabase.from("pcd_quote_line_items").delete().eq("quote_id", quoteId);
      if (error) throw error;
    }

    // After whatever is already there, so an added set lands underneath rather
    // than interleaved with lines somebody has already priced.
    const startAt = read.mode === "replace" ? 0 : existingCount || 0;
    const rows = parsed.lines.map((line, index) =>
      quoteLineRow(
        calculateQuoteLine({ ...line, markup_percent: businessDefaults.markup_percent }, businessDefaults),
        quoteId,
        startAt + index
      )
    );

    const { error: insertError } = await context.supabase.from("pcd_quote_line_items").insert(rows);
    if (insertError) {
      // A database missing one of the later columns drops it and keeps the
      // lines, rather than losing an import over a field it has not got yet.
      if (!isMissingSupplierNameSchemaError(insertError)) throw insertError;
      const { error: retryError } = await context.supabase
        .from("pcd_quote_line_items")
        .insert(rows.map(withoutSupplierName));
      if (retryError) throw retryError;
    }

    // The quote total has to move with its lines. Without this the subtotal,
    // the GST and the total all read whatever they were before the import.
    await recalculateQuoteTotals(context.supabase, quoteId, businessDefaults);

    if (read.withCustomer && Object.keys(patch).length) {
      const { error } = await context.supabase.from("pcd_quotes").update(patch).eq("id", quoteId);
      // NOT fatal. The lines are in, which is the part that was going to be
      // retyped; failing the whole request now would have somebody upload the
      // same file again and get the lines twice.
      if (error) console.error("[import-order-form] lines written, customer not updated:", error.message);
    }

    return Response.json({
      ok: true,
      applied: true,
      added: rows.length,
      replaced: read.mode === "replace",
      warnings: parsed.warnings,
    });
  } catch (error) {
    // The lock throws with a 409 on it. Flattening every error to a 500 would
    // report a rule as a crash, and somebody reading that screen has no way to
    // tell the two apart.
    return Response.json(
      { ok: false, error: error?.message || "That order form could not be read." },
      { status: error?.status || 500 }
    );
  }
}
