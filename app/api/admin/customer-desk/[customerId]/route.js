import { requireAdminApiContext } from "@/lib/admin-api";
import { loadCustomerDesk } from "@/lib/pcd-desk-data";
import { normalizeCustomerPayload } from "@/lib/pcd-customer-utils";

export const dynamic = "force-dynamic";

async function customerIdFrom(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.customerId;
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const desk = await loadCustomerDesk(context.supabase, await customerIdFrom(params));
    if (!desk) return Response.json({ ok: false, error: "No such customer." }, { status: 404 });
    return Response.json({ ok: true, ...desk });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load this customer." }, { status: 500 });
  }
}

/** Editing the customer's own details from the desk header. */
export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const id = await customerIdFrom(params);
  const body = await request.json().catch(() => ({}));
  const fields = normalizeCustomerPayload(body);

  // The email is the anchor every message and every form match is filed
  // against. Changing it here would orphan the history, so it is not editable
  // from this screen. Everything else is.
  delete fields.email;
  const patch = {};
  for (const [key, value] of Object.entries(fields)) {
    if (body[key] !== undefined) patch[key] = value;
  }
  if (!Object.keys(patch).length) return Response.json({ ok: false, error: "Nothing to save." }, { status: 422 });
  patch.updated_at = new Date().toISOString();

  try {
    const { data, error } = await context.supabase
      .from("pcd_customers")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return Response.json({ ok: true, customer: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not save the customer." }, { status: 500 });
  }
}
