// ARCHIVE OR RESTORE A QUOTE.
//
// Its own route rather than the ordinary status update, because archiving is
// two writes that have to happen together: the status becomes 'archived' AND
// the status it held is recorded, so restoring puts it back exactly rather than
// dropping everything to draft. Somebody choosing "archived" from a status
// dropdown could not do the second half, which is why it is not in that list.
//
// Both directions are logged, because "where did that quote go" is a question
// somebody will ask and the answer belongs in the record.

import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../lib/pcd-activity-log";
import { archivePatch, isArchived, restorePatch, QUOTE_RESTORE_FALLBACK } from "../../../../../../lib/pcd-archive";

async function quoteIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await quoteIdFromParams(params);
    const payload = await request.json().catch(() => ({}));
    // Explicit, not a toggle. A toggle sent twice by a double click undoes
    // itself and nobody can tell which way it landed.
    const archiving = payload?.archived !== false;

    const { data: quote, error } = await context.supabase
      .from("pcd_quotes")
      .select("id, quote_number, status, order_id, customer_id, archived_from_status")
      .eq("id", id)
      .single();
    if (error) throw error;

    // A quote that became an order is not somebody's to tidy away: the order
    // and everything hanging off it still refers to it, and the financials read
    // the cost split off the quote behind each order.
    if (archiving && quote.order_id) {
      return Response.json(
        {
          ok: false,
          error: "This quote has become an order, so it cannot be archived. Archive the order instead.",
        },
        { status: 409 }
      );
    }

    if (archiving === isArchived(quote)) {
      return Response.json({ ok: true, quote, unchanged: true });
    }

    const patch = archiving ? archivePatch(quote) : restorePatch(quote, QUOTE_RESTORE_FALLBACK);
    const { data: saved, error: saveError } = await context.supabase
      .from("pcd_quotes")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (saveError) throw saveError;

    await logOrderActivity(context.supabase, {
      quote_id: quote.id,
      customer_id: quote.customer_id || null,
      actor_type: "admin",
      action_type: archiving ? "quote_archived" : "quote_restored",
      title: archiving ? "Quote archived" : "Quote restored",
      description: archiving
        ? `${quote.quote_number} archived from ${quote.status}. It stops counting anywhere until it is restored.`
        : `${quote.quote_number} restored to ${saved.status}.`,
    });

    return Response.json({ ok: true, quote: saved });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not archive that quote." },
      { status: error?.status || 500 }
    );
  }
}
