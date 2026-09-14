// MONEY IN, ORDER MADE, PEOPLE TOLD. ONE STEP, WHOEVER GETS THERE FIRST.
//
// A paid deposit, or a paid web order, becomes an order in one of three places:
// the Stripe webhook, the page the customer is sent back to, or the twice daily
// sweep. lib/pcd-deposit-gate.js makes sure exactly one of them does the work.
//
// The emails used to be sent by the webhook alone, and only when the webhook
// was the one that did the work. So on the days the customer's page won the
// race, which is exactly when the webhook is slow, the order was made and
// nobody was told: not sales@, not the customer who had just paid. The emails
// now go with the work, from whichever caller did it.
//
// Never throws on an email. The money is in and the order exists before any of
// this sends; a refused email is a missing email, never a lost payment.

import { finaliseDepositAcceptance, WEB_ORDER_FLOW } from "./pcd-deposit-gate";
import { sendPaymentReceivedSalesEmail } from "./pcd-payment-notifications";
import { sendPaymentReceivedToCustomer, sendWebOrderToCustomer } from "./pcd-customer-confirmations";

/**
 * Finalise a paid deposit gate or web order session, and tell sales@ and the
 * customer if this call is the one that made the order.
 *
 * Returns whatever finaliseDepositAcceptance returned.
 */
export async function completeGateSession(supabase, session, { baseUrl = "", request = null } = {}) {
  const result = await finaliseDepositAcceptance(supabase, session, { request });
  if (!result.ok || result.alreadyDone) return result;

  try {
    const { data: order } = await supabase.from("pcd_orders").select("*").eq("id", result.orderId).maybeSingle();
    await sendPaymentReceivedSalesEmail({
      payment: result.payment,
      order,
      quote: result.quote,
      flow: result.webOrder ? WEB_ORDER_FLOW : "quote_deposit_gate",
      adminOrderUrl: baseUrl && result.orderId ? `${baseUrl}/admin/orders/${result.orderId}` : "",
    });

    if (result.webOrder) {
      // What the workshop will make, from the order's own lines, so the email
      // cannot describe a cart that differs from the order.
      const { data: lines } = await supabase
        .from("pcd_order_line_items")
        .select("*")
        .eq("order_id", result.orderId)
        .order("sort_order", { ascending: true });
      await sendWebOrderToCustomer({ payment: result.payment, order, quote: result.quote, lines: lines || [] });
    } else {
      await sendPaymentReceivedToCustomer({ payment: result.payment, order, quote: result.quote });
    }
  } catch (emailError) {
    console.error(`[gate] order ${result.orderId} was made but an email could not be sent: ${emailError?.message || emailError}`);
  }
  return result;
}
