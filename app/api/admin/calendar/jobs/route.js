import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { customerJobs } from "../../../../../lib/pcd-calendar-jobs";

// THE JOBS A CUSTOMER ACTUALLY HAS, for the booking modal's job dropdown.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// The modal used to list the `orders` the calendar page already had loaded,
// unfiltered. So choosing Rebecca Casey offered Ian Brennan's raw profiled
// doors: every order on the board, for everyone, under a customer who had none.
// Picking one would have filed a site measure against a stranger's job.
//
// Filtering that list client side would fix the wrong names but not the missing
// ones. The calendar loads orders inside a date window, for drawing production
// bars, so a customer's older order is not in it at all. This asks the question
// properly instead.
//
// ── QUOTES AS WELL AS ORDERS ─────────────────────────────────────────────────
//
// A site measure is usually booked BEFORE there is an order, which is the whole
// reason bookings live in their own table. Offering orders only meant the most
// common booking in the business had nothing to attach to.

export const dynamic = "force-dynamic";

export async function GET(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const customerId = new URL(request.url).searchParams.get("customerId") || "";
    const jobs = await customerJobs(context.supabase, customerId);
    return Response.json({ ok: true, jobs });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not load that customer's jobs." },
      { status: 500 }
    );
  }
}
