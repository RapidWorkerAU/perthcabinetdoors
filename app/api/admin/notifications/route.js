import { requireAdminApiContext } from "../../../../lib/admin-api";

async function countRows(supabase, table, filters = {}) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });

  Object.entries(filters).forEach(([field, value]) => {
    query = query.eq(field, value);
  });

  const { count, error } = await query;
  if (error) return 0;
  return count || 0;
}

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const [newEnquiries, newQuoteRequests] = await Promise.all([
      countRows(context.supabase, "pcd_enquiries", { status: "new" }),
      countRows(context.supabase, "pcd_quote_requests", { status: "new" }),
    ]);

    return Response.json({
      ok: true,
      notifications: {
        "/admin/enquiries": newEnquiries,
        "/admin/quote-requests": newQuoteRequests,
      },
    });
  } catch (error) {
    return Response.json({
      ok: false,
      notifications: {},
      error: error?.message || "Could not load notifications.",
    });
  }
}
