import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { QUOTE_VALID_DAYS, leadConversion } from "../../../../../lib/pcd-lead-conversion";

// Lead conversion: what happens to a quote once it goes out.
//
// Read only. The 30 day rule that decides a lapsed quote lives in
// lib/pcd-lead-conversion.js, along with why it is 30 and not a number somebody
// picked.

export const dynamic = "force-dynamic";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const url = new URL(request.url);
    let from = url.searchParams.get("from") || "";
    let to = url.searchParams.get("to") || "";
    if ((from && !ISO_DAY.test(from)) || (to && !ISO_DAY.test(to))) {
      return Response.json({ ok: false, error: "Give the dates as YYYY-MM-DD." }, { status: 400 });
    }
    if (from && to && from > to) [from, to] = [to, from];

    // Aged on when it was SENT, so the window is about quotes that went out in
    // it rather than quotes that happened to be answered in it.
    let quoteQuery = context.supabase
      .from("pcd_quotes")
      .select("id, quote_number, customer_name, status, total_inc_gst, sent_at, approved_at, rejected_at, created_at")
      .neq("status", "archived");
    if (from) quoteQuery = quoteQuery.gte("created_at", `${from}T00:00:00.000Z`);
    if (to) quoteQuery = quoteQuery.lte("created_at", `${to}T23:59:59.999Z`);

    const [{ data: quotes, error: quotesError }, { data: requests, error: requestsError }] = await Promise.all([
      quoteQuery,
      context.supabase.from("pcd_quote_requests").select("id, source, status, created_at"),
    ]);
    if (quotesError) throw quotesError;
    if (requestsError) throw requestsError;

    const report = leadConversion({ quotes: quotes || [], requests: requests || [] });
    return Response.json({ ok: true, ...report, from, to, validDays: QUOTE_VALID_DAYS });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not build the conversion report." },
      { status: 500 }
    );
  }
}
