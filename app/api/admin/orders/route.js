import { requireAdminApiContext } from "../../../../lib/admin-api";

// THE ORDERS LIST, PLUS THE TWO THINGS THAT SAY WHERE EACH ONE IS UP TO.
//
// The orders and their lines already carried everything needed to work out
// whether a job is being planned, waiting on materials or sitting in the
// workshop. Two stages could not be derived from them: whether a problem has
// been raised against the job, and whether a finished job has been paid for.
// Both live in their own tables, so both are read here.
//
// THEY ARE READ AS COUNTS AND ROWS, NOT AS A STAGE. The stage itself is worked
// out in lib/pcd-order-stage.js, which the work board's rules also agree with.
// This route's job is to put the facts on the page, not to decide what they
// mean.
//
// A FAILED EXTRA QUERY DOES NOT FAIL THE LIST. If the issues or payments read
// breaks, the orders still come back and the stage falls through to what the
// order itself can prove. A missing issue is a stage that is less specific; a
// missing orders list is a screen that does not work.
export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { data, error } = await context.supabase
      .from("pcd_orders")
      .select("*, pcd_order_line_items(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const orders = data || [];
    const orderIds = orders.map((order) => order.id).filter(Boolean);

    const [issues, payments, installs] = orderIds.length
      ? await Promise.all([
          context.supabase
            .from("pcd_order_issues")
            .select("id, order_id")
            .is("resolved_at", null)
            .in("order_id", orderIds),
          context.supabase
            .from("pcd_order_payments")
            .select("id, order_id, payment_type, amount, is_paid")
            .in("order_id", orderIds),
          // Nothing on an order says whether we install it. An install on the
          // calendar does, and it is what turns "Ready to deliver" into "Ready
          // to install".
          context.supabase
            .from("pcd_calendar_events")
            .select("order_id")
            .eq("kind", "install")
            .neq("status", "cancelled")
            .in("order_id", orderIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

    const installBooked = {};
    (installs?.data || []).forEach((event) => {
      if (event.order_id) installBooked[event.order_id] = true;
    });

    // Counted per order here rather than on the client, so the page receives a
    // number instead of a list it has to group itself.
    const openIssues = {};
    (issues?.data || []).forEach((issue) => {
      const key = issue.order_id;
      if (!key) return;
      openIssues[key] = (openIssues[key] || 0) + 1;
    });

    // Grouped, not summed. What is owed on a job depends on refunds netting off
    // both sides of the sum, which is lib/pcd-board-money.js's job and not
    // something to reimplement here. See the note in that file.
    const paymentsByOrder = {};
    (payments?.data || []).forEach((payment) => {
      const key = payment.order_id;
      if (!key) return;
      (paymentsByOrder[key] = paymentsByOrder[key] || []).push(payment);
    });

    return Response.json({
      ok: true,
      orders,
      openIssues,
      paymentsByOrder,
      installBooked,
      // Which of the extra reads actually worked. The page shows the stages
      // that depend on a source only when that source loaded, rather than
      // reporting "finished and paid for" because the payments query errored
      // and every job looked square.
      loaded: {
        issues: !issues?.error,
        payments: !payments?.error,
        installs: !installs?.error,
      },
    });
  } catch (error) {
    return Response.json({
      ok: false,
      orders: [],
      openIssues: {},
      paymentsByOrder: {},
      installBooked: {},
      loaded: { issues: false, payments: false, installs: false },
      setupRequired: true,
      error: error?.message || "Could not load orders.",
    });
  }
}
