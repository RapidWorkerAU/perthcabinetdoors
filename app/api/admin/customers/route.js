import { requireAdminApiContext } from "../../../../lib/admin-api";
import { findCustomerByEmail, normalizeCustomerPayload } from "../../../../lib/pcd-customer-utils";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { data, error } = await context.supabase
      .from("pcd_customers")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return Response.json({ ok: true, customers: data || [] });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        customers: [],
        setupRequired: true,
        error: error?.message || "Could not load customers.",
      },
      { status: 200 }
    );
  }
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json();
    const customer = normalizeCustomerPayload(payload);

    if (!customer.name) {
      return Response.json({ ok: false, error: "Customer name is required." }, { status: 400 });
    }

    const existingCustomer = await findCustomerByEmail(context.supabase, customer.email);
    if (existingCustomer?.id) {
      return Response.json({ ok: false, error: "A customer with this email already exists." }, { status: 409 });
    }

    const { data, error } = await context.supabase.from("pcd_customers").insert(customer).select("*").single();

    if (error) throw error;
    return Response.json({ ok: true, customer: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not save customer." }, { status: 500 });
  }
}
