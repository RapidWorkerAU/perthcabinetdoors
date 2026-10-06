import { requireAdminApiContext } from "../../../../../../lib/admin-api";

// THE "NEVER ASK FOR REVIEWS" TICK ON A CUSTOMER, and whether they unsubscribed.
//
// Its own route rather than a field on the customer save, because that save
// expects the whole customer and this is one tick. See lib/pcd-review-requests.js.

export const dynamic = "force-dynamic";

async function load(supabase, id) {
  const { data: customer, error } = await supabase
    .from("pcd_customers")
    .select("id, email, review_requests_never")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!customer) return null;

  const email = String(customer.email || "").trim().toLowerCase();
  let optedOutAt = null;
  if (email) {
    const { data } = await supabase
      .from("pcd_review_opt_outs")
      .select("opted_out_at")
      .eq("email", email)
      .maybeSingle();
    optedOutAt = data?.opted_out_at || null;
  }
  return { never: Boolean(customer.review_requests_never), optedOutAt };
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  try {
    const { id } = await params;
    const state = await load(context.supabase, id);
    if (!state) return Response.json({ ok: false, error: "No such customer." }, { status: 404 });
    return Response.json({ ok: true, ...state });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load review settings." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { error } = await context.supabase
      .from("pcd_customers")
      .update({ review_requests_never: body.never === true })
      .eq("id", id);
    if (error) throw error;
    return Response.json({ ok: true, ...(await load(context.supabase, id)) });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not save." }, { status: 500 });
  }
}
