import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../lib/pcd-activity-log";
import { siteUrl } from "../../../../../../lib/pcd-stripe";
import {
  readReviewSettings,
  reviewRequestForOrder,
  sendReviewRequest,
} from "../../../../../../lib/pcd-review-request-run";

// THE THREE BUTTONS UNDER AN ORDER'S STATUS.
//
//   skip     "Don't send for this order". For the genuine exceptions: a
//            complaint still open, a remake, a friend's job. Never for picking
//            out the customers we expect to be happy, which Google does not
//            allow. Recorded with who pressed it.
//   unskip   "Line it up again". Only undoes a skip a person made. One the job
//            made (unsubscribed, asked recently) stands.
//   send     "Send now". Skips the wait and nothing else: the order must still
//            be Complete, paid, have an address and not be opted out.

export const dynamic = "force-dynamic";

const SENDABLE = new Set(["waiting", "due"]);

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const { id } = await params;
  const { action } = await request.json().catch(() => ({}));
  const supabase = context.supabase;
  const who = context.user?.email || "staff";

  try {
    const { data: order, error } = await supabase.from("pcd_orders").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!order) return Response.json({ ok: false, error: "Order not found." }, { status: 404 });

    if (action === "skip") {
      if (order.review_request_sent_at) return bad("The review request has already been sent.");
      const { error: saveError } = await supabase
        .from("pcd_orders")
        .update({
          review_request_skipped_at: new Date().toISOString(),
          review_request_skipped_reason: "staff",
          review_request_skipped_by: who,
        })
        .eq("id", id)
        .is("review_request_sent_at", null);
      if (saveError) throw saveError;
      await log(supabase, order, "review_request_skipped", "Google review request skipped", `Skipped for this order by ${who}.`);
    } else if (action === "unskip") {
      if (order.review_request_skipped_reason !== "staff") {
        return bad("Only a skip somebody chose can be undone here.");
      }
      const { error: saveError } = await supabase
        .from("pcd_orders")
        .update({ review_request_skipped_at: null, review_request_skipped_reason: null, review_request_skipped_by: null })
        .eq("id", id);
      if (saveError) throw saveError;
      await log(supabase, order, "review_request_lined_up", "Google review request lined up again", `Lined up again by ${who}.`);
    } else if (action === "send") {
      const state = await reviewRequestForOrder(supabase, order);
      if (!SENDABLE.has(state?.key)) return bad(state?.label || "This order cannot be sent a review request.");
      const { settings } = await readReviewSettings(supabase);
      const sent = await sendReviewRequest(supabase, order, { settings, baseUrl: siteUrl(request.url), actor: who });
      if (!sent.ok) return bad(`The review request did not go: ${sent.error}`);
    } else {
      return bad("Unknown action.");
    }

    // The order page reloads the whole order afterwards, so the panel and the
    // timeline both show what just happened.
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update the review request." }, { status: 500 });
  }
}

function bad(message) {
  return Response.json({ ok: false, error: message }, { status: 400 });
}

function log(supabase, order, action_type, title, description) {
  return logOrderActivity(supabase, {
    order_id: order.id,
    customer_id: order.customer_id || null,
    actor_type: "admin",
    action_type,
    title,
    description,
  });
}
