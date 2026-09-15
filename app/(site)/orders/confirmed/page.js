import { PRIVATE_PAGE_METADATA } from "@/lib/pcd-seo";
import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import { BUSINESS_PHONE, SALES_EMAIL } from "@/lib/pcd-business-identity";
import { WEB_ORDER_FLOW } from "@/lib/pcd-deposit-gate";
import { completeGateSession } from "@/lib/pcd-gate-complete";
import { hingeCustomerLines } from "@/lib/pcd-hinges";
import { bandedEdgesText } from "@/lib/pcd-line-details";
import { money } from "@/lib/pcd-shop";
import { retrieveCheckoutSession, siteUrl } from "@/lib/pcd-stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import PublicSiteNav from "../../PublicSiteNav";
import styles from "../../contact/contact.module.css";
import ClearCart from "./ClearCart";

export const dynamic = "force-dynamic";
export const metadata = {
  // NOT FOR A SEARCH RESULT: a receipt for one order.
  // See NEVER_INDEX in lib/pcd-seo.js. robots.txt asks a crawler not to
  // fetch this; that line is what stops it being listed anyway.
  ...PRIVATE_PAGE_METADATA,
  title: "Order confirmed | Perth Cabinet Doors",
};

// PAID, AND IT IS AN ORDER.
//
// Where Stripe sends somebody back to after paying for a cart. The second of
// the three ways a paid web order becomes an order: the webhook usually got
// there first, and if it has not, this page does it, so the order exists before
// they have finished reading. See lib/pcd-deposit-gate.js.
//
// The reference is real and so is the list: both are read off the order that
// was made, not off the cart that made it.

function lineTitle(line) {
  if (line.product_type === "Hardware") return line.product_name || "Hardware";
  return (line.product_type === "Panel" && line.panel_use) || line.product_type || "Item";
}

function lineDetails(line) {
  if (line.product_type === "Hardware") return [];
  const out = [];
  const board = [line.colour, line.finish, line.thickness].filter(Boolean).join(", ");
  if (board) out.push(board);
  if (line.height_mm && line.width_mm) out.push(`${line.height_mm} (H) x ${line.width_mm} (W) mm`);
  const edges = bandedEdgesText(line.banded_edges);
  if (edges) out.push(edges);
  if (line.product_type === "Door") out.push(hingeCustomerLines(line).join(", "));
  return out;
}

async function loadOrder(sessionId) {
  const session = await retrieveCheckoutSession(sessionId);
  if (session?.metadata?.flow !== WEB_ORDER_FLOW) return { session, notWeb: true };

  const supabase = createSupabaseAdminClient();
  if (session.payment_status === "paid") {
    try {
      await completeGateSession(supabase, session, { baseUrl: siteUrl() });
    } catch (error) {
      // The payment is safe in Stripe and the twice daily sweep will make the
      // order. This page still has to say it went through.
      console.error(`[orders/confirmed] could not finalise ${sessionId}: ${error?.message || error}`);
    }
  }

  const { data: order } = await supabase
    .from("pcd_orders")
    .select("id, order_number, customer_email, site_address, site_suburb, total_inc_gst, status")
    .eq("quote_id", session.metadata.quote_id)
    .neq("status", "cancelled")
    .maybeSingle();
  const { data: lines } = order
    ? await supabase.from("pcd_order_line_items").select("*").eq("order_id", order.id).order("sort_order", { ascending: true })
    : { data: [] };
  return { session, order, lines: lines || [] };
}

export default async function OrderConfirmedPage({ searchParams }) {
  const params = await searchParams;
  const sessionId = params?.session_id || "";
  let result = null;
  let problem = "";
  try {
    result = sessionId ? await loadOrder(sessionId) : null;
  } catch {
    problem = "We could not look up your payment just now.";
  }

  const paid = result?.session?.payment_status === "paid";
  const order = result?.order || null;
  const amount = result?.session?.amount_total ? result.session.amount_total / 100 : Number(order?.total_inc_gst) || 0;

  return (
    <>
      <PublicSiteNav active="shop" variant="solid" />
      <main className={styles.page}>
        <section className={styles.pageHeader}>
          <div className={styles.pageHeaderInner}>
            <div className={styles.breadcrumb}>
              <Link href="/">Home</Link> &rsaquo; <Link href="/products">Shop</Link> &rsaquo; Order
            </div>
            <h1>{paid ? <>Thanks, that is <em>on its way</em></> : "Your order"}</h1>
          </div>
        </section>

        <section className={styles.sentPage}>
          {paid ? <ClearCart /> : null}
          {!sessionId || problem || !result || result.notWeb || !paid ? (
            <div className={styles.doneCard}>
              <div className={styles.doneBody}>
                <p className={styles.sentNotice}>
                  {problem ||
                    (paid
                      ? "Your payment went through."
                      : "We have not seen a payment for this yet. If you have just paid, give it a minute and refresh this page. Nothing is made until the payment arrives.")}
                </p>
                <p className={styles.sendNote}>
                  Questions? Email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a> or call {BUSINESS_PHONE}.
                </p>
                <Link className={styles.sendBackLink} href="/cart">
                  Back to my cart
                </Link>
              </div>
            </div>
          ) : (
            <div className={styles.doneCard}>
              <div className={styles.doneHead}>
                <span className={styles.sectionLabel}>Paid</span>
                <strong>{order?.order_number || "Your order is being set up"}</strong>
                <p>{money(amount)} inc GST</p>
              </div>
              <div className={styles.doneBody}>
                <ol className={styles.doneSteps}>
                  <li>
                    <span>1</span>
                    <div>
                      <strong>We have your payment and your order</strong>
                      <p>A receipt is on its way to {order?.customer_email || "your email"}.</p>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>It goes on the bench</strong>
                      <p>About ten working days. We will email you if anything about it needs a word first.</p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>It comes to you</strong>
                      <p>Two to three days after it is made{order?.site_suburb ? `, to ${order.site_suburb}` : ""}.</p>
                    </div>
                  </li>
                </ol>

                {result.lines.length ? (
                  <div className={styles.doneLines}>
                    <span className={styles.sectionLabel}>What we are making</span>
                    {result.lines.map((line) => (
                      <div className={styles.doneLine} key={line.id}>
                        <strong>
                          {Number(line.qty) || 1} x {lineTitle(line)}
                        </strong>
                        {lineDetails(line).map((detail) => (
                          <p key={detail}>{detail}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}

                <p className={styles.sendNote}>
                  Something not right? Email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a> or call {BUSINESS_PHONE}
                  {order?.order_number ? ` and quote ${order.order_number}` : ""}. We can change anything up until it goes on
                  the bench.
                </p>
                <Link className={styles.cartEmptyBtn} href="/products">
                  Order something else
                </Link>
              </div>
            </div>
          )}
        </section>
        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
