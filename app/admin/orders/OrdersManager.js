"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "../../../lib/pcd-quote-utils";
import styles from "../admin-shell.module.css";

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function sortedItems(order) {
  return [...(order?.pcd_order_line_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

export default function OrdersManager() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);

  const summary = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        const items = sortedItems(order);
        return {
          active: acc.active + (order.status === "active" ? 1 : 0),
          lineItems: acc.lineItems + items.length,
          complete: acc.complete + items.filter((item) => item.status === "Complete").length,
        };
      },
      { active: 0, lineItems: 0, complete: 0 }
    );
  }, [orders]);

  async function loadOrders() {
    setIsLoading(true);
    setFeedback("");
    try {
      const response = await fetch("/api/admin/orders", { cache: "no-store" });
      const payload = await response.json();
      setSetupRequired(!!payload.setupRequired);
      setOrders(payload.orders || []);
      if (payload.error) setFeedback(payload.error);
    } catch (error) {
      setFeedback(error?.message || "Could not load orders.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  return (
    <section className={styles.productsSection}>
      <div className={styles.productsHeaderBar}>
        <p className={styles.tableMeta}>{isLoading ? "Loading orders" : `${orders.length} orders`}</p>
        <div className={styles.rowActions}>
          <span className={styles.projectListMetric}>{summary.active} active</span>
          <span className={styles.projectListMetric}>{summary.complete}/{summary.lineItems} items complete</span>
          <button type="button" className={styles.secondaryButton} onClick={loadOrders} disabled={isLoading}>Refresh</button>
        </div>
      </div>
      {setupRequired ? <div className={styles.inlineNotice}>Run `supabase/pcd_enquiries_quote_requests_orders_setup.sql` before orders can be listed.</div> : null}
      {feedback ? <div className={styles.inlineNotice}>{feedback}</div> : null}
      <div className={styles.productsTableWrap}>
        <table className={styles.productsTable}>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Job</th>
              <th>Items</th>
              <th>Status</th>
              <th>Total</th>
              <th>Accepted</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const items = sortedItems(order);
              return (
                <tr key={order.id} className={styles.rowClickable} onClick={() => router.push(`/admin/orders/${order.id}`)}>
                  <td className={styles.productNameCell}>{order.order_number}</td>
                  <td>{order.customer_name || "-"}</td>
                  <td>{order.name || "-"}</td>
                  <td>{items.length}</td>
                  <td><span className={styles.statusPill}>{(order.status || "active").replace(/_/g, " ")}</span></td>
                  <td>{formatMoney(order.total_inc_gst, "AUD")}</td>
                  <td>{formatDate(order.accepted_at || order.created_at)}</td>
                </tr>
              );
            })}
            {!orders.length && !isLoading ? <tr><td colSpan="7" className={styles.emptyCell}>No orders yet. Approved quotes will create orders automatically.</td></tr> : null}
            {isLoading ? <tr><td colSpan="7" className={styles.emptyCell}>Loading orders...</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
