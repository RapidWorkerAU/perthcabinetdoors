// EVERY DOLLAR A CUSTOMER HAS PAID US, WHEREVER IT CAME IN BY.
//
// ── THE GAP THIS FILLS ───────────────────────────────────────────────────────
//
// pcd_order_payments is the payments table, and its order_id is NOT NULL. That
// is right for a deposit and a balance, and it means a payment taken before
// there is an order has nowhere to live.
//
// A site measure fee is exactly that: a hundred dollars, paid on the website,
// months before there is a quote let alone an order. It was recorded on the
// booking row and nowhere else, so the customer's own page showed no sign of
// it. Somebody asking "has this customer paid us anything" got the wrong answer
// from the only screen built to tell them.
//
// ── WHY A READ AND NOT A TABLE ───────────────────────────────────────────────
//
// Both halves are already stored, correctly, in the place that owns them. A
// third table holding copies would be a third opinion about the same money and
// would be wrong within a month. This reads the two and puts them in one list,
// which is a question, not a record.
//
// ── WHAT IS A PAYMENT AND WHAT IS NOT ────────────────────────────────────────
//
// Money that actually reached us. Not a payment we have asked for and not
// received, and not a credit: a credit is money we are HOLDING for them, which
// is the opposite direction and has its own card. An unpaid request belongs on
// the order it is chasing.

// Rounded the one way money is rounded here. See lib/pcd-money.js.
import { roundMoney } from "./pcd-money";

const money = roundMoney;

/** The day part of whatever shape the column holds. */
function dayOf(value) {
  const text = String(value || "");
  return text.length >= 10 ? text.slice(0, 10) : "";
}

/**
 * Everything this customer has paid, newest first.
 *
 * @param customerIds every record that reads as this person. The desk groups
 *                    contacts, so a payment made under a second email address
 *                    still belongs to the person looking at the page.
 */
export async function loadCustomerPayments(supabase, customerIds = []) {
  const ids = (customerIds || []).filter(Boolean);
  if (!ids.length) return [];

  const rows = [];

  // ── money against an order ────────────────────────────────────────────────
  const { data: orders } = await supabase
    .from("pcd_orders")
    .select("id, order_number, name")
    .in("customer_id", ids);

  const orderIds = (orders || []).map((order) => order.id);
  const orderById = new Map((orders || []).map((order) => [order.id, order]));

  if (orderIds.length) {
    const { data: payments } = await supabase
      .from("pcd_order_payments")
      .select("id, order_id, payment_type, amount, is_paid, paid_at, notes, created_at")
      .in("order_id", orderIds)
      .eq("is_paid", true);

    for (const payment of payments || []) {
      const order = orderById.get(payment.order_id);
      rows.push({
        id: `payment:${payment.id}`,
        kind: payment.payment_type || "payment",
        // The note wins where there is one, because a credit landing as a
        // deposit says "Site measure fee paid 24 Sep" and that is more use than
        // the word "deposit" three times down a list.
        label: payment.notes || `${payment.payment_type || "Payment"} on ${order?.order_number || "an order"}`,
        amount: money(payment.amount),
        paidOn: dayOf(payment.paid_at || payment.created_at),
        reference: order?.order_number || "",
        against: order?.name || "",
        href: order ? `/admin/orders/${order.id}` : null,
      });
    }
  }

  // ── money with no order behind it ─────────────────────────────────────────
  //
  // Read whether or not the tables exist yet: a customer page must not break
  // because a migration has not been run, and an empty list is the honest
  // answer on a database without the feature.
  const { data: bookings, error: bookingError } = await supabase
    .from("pcd_site_measure_bookings")
    .select("id, booking_date, fee_amount, fee_paid_at, status, cancellation_outcome, calendar_event_id")
    .in("customer_id", ids)
    .not("fee_paid_at", "is", null);

  if (!bookingError) {
    for (const booking of bookings || []) {
      if (money(booking.fee_amount) <= 0) continue;
      rows.push({
        id: `measure:${booking.id}`,
        kind: "site_measure",
        label: "Site measure booking fee",
        amount: money(booking.fee_amount),
        paidOn: dayOf(booking.fee_paid_at),
        reference: booking.booking_date,
        // A cancelled booking still shows the payment, because the money did
        // arrive. What happened to it afterwards is said here rather than by
        // the row quietly disappearing.
        against:
          booking.status === "cancelled"
            ? booking.cancellation_outcome === "refunded"
              ? "Cancelled, refunded"
              : "Cancelled, held as credit"
            : "Site measure",
        href: "/admin/calendar",
      });
    }
  }

  return rows.sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)));
}

/** What the list comes to. Refunds are not netted off here; they are their own row. */
export function paymentsTotal(rows = []) {
  return money((rows || []).reduce((sum, row) => sum + money(row.amount), 0));
}
