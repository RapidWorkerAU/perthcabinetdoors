import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { getBusinessDefaults } from "../../../../lib/pcd-business-defaults";
import { rateLimit } from "../../../../lib/pcd-rate-limit";
import { siteUrl } from "../../../../lib/pcd-stripe";

// THE "LEAVE A GOOGLE REVIEW" BUTTON.
//
// Passes through here so the order can show the button was pressed, then sends
// the customer on to Google. It ALWAYS sends them on: a customer who pressed
// the button wants to leave a review, and nothing on our side failing is a
// reason to stop them.
//
// Pressed is not reviewed. Google does not tell us who left one, so the order
// says "clicked the review link" and no more.
//
// Mail scanners open links too, so the odd click is a scanner and not a person.

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request) {
  const code = new URL(request.url).searchParams.get("code") || "";
  let destination = "";

  try {
    const supabase = createSupabaseAdminClient();
    const settings = await getBusinessDefaults(supabase);
    destination = settings.google_review_url || "";

    // Counted, so guessing at codes costs something. Over the limit still goes
    // to Google, it just records nothing.
    const limited = await rateLimit(request, "lookup");
    if (limited.allowed && UUID.test(code)) {
      const { data: order } = await supabase
        .from("pcd_orders")
        .select("id, customer_id, review_link_clicked_at")
        .eq("review_token", code)
        .maybeSingle();

      if (order && !order.review_link_clicked_at) {
        await supabase
          .from("pcd_orders")
          .update({ review_link_clicked_at: new Date().toISOString() })
          .eq("id", order.id)
          .is("review_link_clicked_at", null);
        await logOrderActivity(supabase, {
          order_id: order.id,
          customer_id: order.customer_id || null,
          actor_type: "customer",
          action_type: "review_link_clicked",
          title: "Clicked the Google review link",
          description: "The customer pressed Leave a Google review in their thank you email.",
          event_key: `order:${order.id}:review-clicked`,
        });
      }
    }
  } catch (error) {
    console.error(`[review-request/go] ${error?.message || error}`);
  }

  return Response.redirect(destination || siteUrl(request.url), 302);
}
