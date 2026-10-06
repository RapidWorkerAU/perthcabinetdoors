import { requireAdminApiContext } from "../../../../lib/admin-api";
import { convertQuoteRequest } from "../../../../lib/pcd-quote-request-conversion";
import { alfredWaitingBy } from "../../../../lib/pcd-alfred-dots";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { data, error } = await context.supabase
      .from("pcd_quote_requests")
      .select("*, pcd_quote_request_line_items(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ ok: true, quoteRequests: data || [], alfredWaiting: await alfredWaitingBy(context.supabase, "quote_request_id") });
  } catch (error) {
    return Response.json({ ok: false, quoteRequests: [], setupRequired: true, error: error?.message || "Could not load quote requests." });
  }
}

// The Convert to quote button. The work is in
// lib/pcd-quote-request-conversion.js, shared with Alfred, so a quote made from
// a request is made the same way whoever made it.
export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json();
    if (payload.action !== "convert_to_quote" || !payload.id) {
      return Response.json({ ok: false, error: "Invalid quote request action." }, { status: 400 });
    }
    const result = await convertQuoteRequest(context.supabase, payload.id, { actorType: "admin" });
    if (result.busy) {
      return Response.json({ ok: false, error: "This request is being turned into a quote right now. Refresh in a moment to open it." }, { status: 409 });
    }
    if (result.alreadyConverted) return Response.json({ ok: true, quoteId: result.quoteId });

    // The caller shows this so nothing sits silently at $0. Everything that
    // could be priced already has been; this names only what still needs a look.
    return Response.json({
      ok: true,
      quoteId: result.quoteId,
      lineCount: result.lineCount,
      unpricedCount: result.unpriced.length,
      unpriced: result.unpriced,
      madeToOrderCount: result.madeToOrder.length,
      madeToOrder: result.madeToOrder,
      notInLibrary: result.notInLibrary,
      incomplete: result.incomplete,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not convert quote request." }, { status: 500 });
  }
}
