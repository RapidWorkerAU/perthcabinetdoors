import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { bookingWhen, kindLabel, missingFor } from "../../../../lib/pcd-booking-confirmations";

// WHAT THE CONFIRMATION PAGE IS ALLOWED TO SEE.
//
// The service role is used because pcd_calendar_events is signed in only, and
// the visitor is not signed in to anything. So EVERY query here is scoped by
// the token and nothing else, exactly the way the public design planner and the
// quote link already work. See lib/pcd-public-design.js.
//
// WHAT IS RETURNED IS A DESCRIPTION, NOT THE ROW. A calendar row carries the
// order id, the quote id, our internal notes and whatever somebody typed about
// the job. None of that is the customer's business and none of it is needed to
// answer the question, so this hands back only what the page prints.

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = String(searchParams.get("code") || "").trim();
    if (!code) return Response.json({ ok: false, error: "Missing link code." }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const { data: row, error } = await supabase
      .from("pcd_calendar_events")
      .select("*")
      .eq("confirm_token", code)
      .maybeSingle();

    if (error) throw error;
    if (!row) {
      return Response.json(
        { ok: false, error: "We could not find that appointment. The link may be out of date." },
        { status: 404 }
      );
    }

    const when = bookingWhen(row);
    const missing = missingFor(row);
    const linked = Boolean(row.customer_id);

    // A visit that has been and gone, or one taken off the calendar. Both get
    // the details and no buttons, because a confirm button on a cancelled
    // booking is worse than no page at all.
    const started = new Date(row.starts_at).getTime() <= Date.now();
    const closed =
      row.status === "cancelled" ? "cancelled" : started ? "passed" : "";

    return Response.json({
      ok: true,
      booking: {
        kindLabel: kindLabel(row),
        title: row.title,
        customerName: row.customer_name || "",
        contactName: row.contact_name || row.customer_name || "",
        contactMobile: row.contact_mobile || "",
        siteAddress: row.site_address || "",
        dayLong: when.dayLong,
        dayShort: when.dayShort,
        timeRange: when.timeRange,
        startTime: when.startTime,
        allDay: when.allDay,
        // WHAT WAS MISSING WHEN THEY ARRIVED, which is what the page insists
        // on. Worked out server side so the browser cannot decide it holds
        // something it does not.
        needMobile: linked && missing.mobile,
        needAddress: linked && missing.address,
        linked,
        answer: ["confirmed", "declined"].includes(row.confirm_state) ? row.confirm_state : "",
        answeredBy: row.confirm_answered_by || "",
        notes: row.confirm_notes || "",
        closed,
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "We could not load this appointment." },
      { status: 500 }
    );
  }
}
