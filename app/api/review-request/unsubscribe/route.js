import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { rateLimit, tooManyAttempts } from "../../../../lib/pcd-rate-limit";

// STOP REVIEW REQUESTS.
//
// Two ways in, both POST:
//
//   the button on /reviews/unsubscribe   sends { code } as JSON
//   Gmail and Outlook's own unsubscribe  POST here with the code in the query
//                                        and "List-Unsubscribe=One-Click" as
//                                        the body (RFC 8058)
//
// Never GET. Mail scanners open every link in an email, and a link that
// unsubscribed on arrival would unsubscribe everybody we ever wrote to.
//
// Kept by address, in pcd_review_opt_outs. It stops review requests only.
// Quotes, invoices and order emails are not marketing and keep coming.

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function codeFrom(request) {
  const fromQuery = new URL(request.url).searchParams.get("code");
  if (fromQuery) return fromQuery;
  try {
    const body = await request.json();
    return String(body?.code || "");
  } catch {
    return "";
  }
}

export async function POST(request) {
  // Guessing at a code has to cost something. See lib/pcd-rate-limit.js. The
  // lookup bucket rather than respond, because Gmail's one click unsubscribe
  // arrives from Google's own addresses, shared by every customer on Gmail.
  const limited = await rateLimit(request, "lookup");
  if (!limited.allowed) return tooManyAttempts(limited.retryAfterSeconds);

  const code = (await codeFrom(request)).trim();
  if (!UUID.test(code)) {
    return Response.json({ ok: false, error: "This link is not complete. Please use the link in your email." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: order, error } = await supabase
      .from("pcd_orders")
      .select("id, customer_id, customer_email")
      .eq("review_token", code)
      .maybeSingle();
    if (error) throw error;
    if (!order) {
      return Response.json({ ok: false, error: "We could not find that email. The link may be out of date." }, { status: 404 });
    }

    const email = String(order.customer_email || "").trim().toLowerCase();
    if (email) {
      const { error: saveError } = await supabase
        .from("pcd_review_opt_outs")
        .upsert({ email, order_id: order.id }, { onConflict: "email", ignoreDuplicates: true });
      if (saveError) throw saveError;
    }

    await logOrderActivity(supabase, {
      order_id: order.id,
      customer_id: order.customer_id || null,
      actor_type: "customer",
      action_type: "review_requests_unsubscribed",
      title: "Unsubscribed from review requests",
      description: `${email || "The customer"} asked not to be sent Google review requests. Other emails are not affected.`,
      event_key: `order:${order.id}:review-unsubscribed`,
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error(`[review-request/unsubscribe] ${error?.message || error}`);
    return Response.json(
      { ok: false, error: "Something went wrong on our side. Please try again, or reply to the email and we will do it for you." },
      { status: 500 }
    );
  }
}
