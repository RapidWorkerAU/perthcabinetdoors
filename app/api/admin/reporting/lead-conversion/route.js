import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { leadConversion } from "../../../../../lib/pcd-lead-conversion";
import { quoteValidDays } from "../../../../../lib/pcd-business-defaults";
import { ARCHIVED_EXPIRED } from "../../../../../lib/pcd-archive";

// Lead conversion: what happens to a quote once it goes out.
//
// Read only. The rule that decides a lapsed quote lives in
// lib/pcd-quote-clock.js, and how many days it allows is quote_valid_days in
// Business Defaults rather than a number anybody typed here.
//
// ── WHY ARCHIVED IS NO LONGER SIMPLY EXCLUDED ────────────────────────────────
//
// It used to be, and that was right while archived only ever meant "somebody
// filed this away". Quotes now archive themselves the day after their validity
// runs out, and excluding those would have emptied the lapsed column and walked
// the conversion rate back toward the 100% this report was built to correct.
//
// So the query takes quotes archived BECAUSE THEY EXPIRED as well as the live
// ones, and leaves the hand filed ones out exactly as before. archived_reason is
// what separates them; see lib/pcd-archive.js.
//
// A database that has not had the expiry migration run yet has no
// archived_reason column, and the whole report would fail on it rather than
// simply being one column short. So the filter is tried, and a complaint about
// that column falls back to the query this route has always run.

export const dynamic = "force-dynamic";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Has the expiry migration not been run here yet? */
function isMissingExpiryColumns(error) {
  if (!error) return false;
  const message = String(error.message || "");
  return /expiry_warned_at|archived_reason/.test(message);
}

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

    const FIELDS =
      "id, quote_number, customer_name, status, total_inc_gst, sent_at, approved_at, rejected_at, created_at, " +
      "expiry_warned_at, archived_reason";

    // Aged on when it was SENT, so the window is about quotes that went out in
    // it rather than quotes that happened to be answered in it.
    const windowed = (query) => {
      let next = query;
      if (from) next = next.gte("created_at", `${from}T00:00:00.000Z`);
      if (to) next = next.lte("created_at", `${to}T23:59:59.999Z`);
      return next;
    };

    const withExpired = () =>
      windowed(
        context.supabase
          .from("pcd_quotes")
          .select(FIELDS)
          // Everything live, plus the ones that closed themselves.
          .or(`status.neq.archived,archived_reason.eq.${ARCHIVED_EXPIRED}`)
      );

    const liveOnly = () =>
      windowed(
        context.supabase
          .from("pcd_quotes")
          .select("id, quote_number, customer_name, status, total_inc_gst, sent_at, approved_at, rejected_at, created_at")
          .neq("status", "archived")
      );

    const [validDays, quoteResult, { data: requests, error: requestsError }] = await Promise.all([
      quoteValidDays(context.supabase),
      withExpired().then((result) => (isMissingExpiryColumns(result.error) ? liveOnly() : result)),
      context.supabase.from("pcd_quote_requests").select("id, source, status, created_at"),
    ]);
    if (quoteResult.error) throw quoteResult.error;
    if (requestsError) throw requestsError;

    const report = leadConversion({ quotes: quoteResult.data || [], requests: requests || [] }, { validDays });
    return Response.json({ ok: true, ...report, from, to, validDays });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not build the conversion report." },
      { status: 500 }
    );
  }
}
