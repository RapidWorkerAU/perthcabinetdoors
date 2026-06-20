import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { normalizeCustomerPayload } from "../../../../../lib/pcd-customer-utils";

async function customerIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await customerIdFromParams(params);
    const payload = await request.json();
    const customer = normalizeCustomerPayload(payload);

    if (!customer.name) {
      return Response.json({ ok: false, error: "Customer name is required." }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from("pcd_customers")
      .update(customer)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, customer: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update customer." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await customerIdFromParams(params);
    const { error } = await context.supabase.from("pcd_customers").delete().eq("id", id);

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not delete customer." }, { status: 500 });
  }
}
