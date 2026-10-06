// THE JOBS A CUSTOMER ACTUALLY HAS, for a booking to go against.
//
// Moved here from app/api/admin/calendar/jobs/route.js, unchanged, so the
// booking form's job dropdown and Alfred offer exactly the same jobs: every
// open order and every live quote for that customer, each in the link it
// belongs to. See that route for why both orders and quotes are listed.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** [{ kind: "order" | "quote", id, reference, name, status, siteAddress, becameOrder? }] */
export async function customerJobs(supabase, customerId) {
  // No customer means no jobs, not every job.
  if (!UUID.test(String(customerId || ""))) return [];
  const [orders, quotes] = await Promise.all([
    supabase
      .from("pcd_orders")
      .select("id, order_number, name, status, site_address, created_at")
      .eq("customer_id", customerId)
      .neq("status", "cancelled")
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("pcd_quotes")
      .select("id, quote_number, title, status, site_address, created_at, order_id")
      .eq("customer_id", customerId)
      // web_checkout is a web order still waiting on its payment: a cart,
      // not a job anybody could book a visit against.
      .not("status", "in", '("rejected","archived","web_checkout")')
      .order("created_at", { ascending: false }),
  ]);
  if (orders.error) throw orders.error;
  if (quotes.error) throw quotes.error;

  const jobs = [
    ...(orders.data || []).map((order) => ({
      kind: "order",
      id: order.id,
      reference: order.order_number,
      name: order.name || "",
      status: order.status,
      siteAddress: order.site_address || "",
    })),
    // EVERY QUOTE TOO, including one that has already become an order. A
    // measure is booked against a quote and an install against an order, so
    // both have to be offerable. A quote that became an order says so on its
    // own row rather than being hidden, because hiding it makes a job the
    // person is looking straight at simply not appear.
    ...(quotes.data || []).map((quote) => ({
      kind: "quote",
      id: quote.id,
      reference: quote.quote_number,
      name: quote.title || "",
      status: quote.status,
      becameOrder: Boolean(quote.order_id),
      siteAddress: quote.site_address || "",
    })),
  ];

  return jobs;
}
