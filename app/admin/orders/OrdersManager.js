"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "../../../lib/pcd-quote-utils";
import styles from "../admin-content.module.css";
import { formatAdminLabel } from "../_utils/formatAdminLabel";
import { AdminTablePagination, useAdminTablePagination } from "../_components/AdminTablePagination";

const STATUSES = ["active", "on_hold", "complete", "cancelled"];
const FILTERS = ["all", ...STATUSES];

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function sortedItems(order) {
  return [...(order?.pcd_order_line_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

function getOrderStatusClass(status) {
  if (status === "active") return styles.statusPillActive;
  if (status === "complete") return styles.statusPillActive;
  if (status === "cancelled" || status === "on_hold") return styles.statusPillIssue;
  return styles.statusPillDraft;
}

function isNewOrder(order) {
  return Object.prototype.hasOwnProperty.call(order || {}, "admin_viewed_at") && !order.admin_viewed_at;
}

export default function OrdersManager() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const [statusFilter, setStatusFilter] = useState("active");

  const statusCounts = useMemo(() => {
    return orders.reduce(
      (counts, order) => {
        const status = order.status || "active";
        counts.all += 1;
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      },
      { all: 0 }
    );
  }, [orders]);

  const visibleOrders = useMemo(() => {
    if (statusFilter === "all") return orders;
    return orders.filter((order) => (order.status || "active") === statusFilter);
  }, [orders, statusFilter]);

  const orderPagination = useAdminTablePagination(visibleOrders, statusFilter);

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
      <div className={`${styles.productsHeaderBar} ${styles.tableToolbar}`}>
        <div className={styles.tableToolbarFilters} />
        <div className={styles.statusFilterBar} aria-label="Filter orders by status">
          {FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              className={`${styles.statusFilterButton} ${statusFilter === status ? styles.statusFilterButtonActive : ""}`}
              onClick={() => setStatusFilter(status)}
            >
              <span>{status === "all" ? "All" : formatAdminLabel(status)}</span>
              <small>{statusCounts[status] || 0}</small>
            </button>
          ))}
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
            {orderPagination.pageItems.map((order) => {
              const items = sortedItems(order);
              return (
                <tr key={order.id} className={styles.rowClickable} onClick={() => router.push(`/admin/orders/${order.id}`)}>
                  <td className={styles.productNameCell}>
                    <span className={styles.orderNameWithUnread}>
                      {isNewOrder(order) ? <span className={styles.orderUnreadDot} title="New order" aria-label="New order" /> : null}
                      <span>{order.order_number}</span>
                    </span>
                  </td>
                  <td>{order.customer_name || "-"}</td>
                  <td>{order.name || "-"}</td>
                  <td>{items.length}</td>
                  <td>
                    <span className={`${styles.statusPill} ${getOrderStatusClass(order.status || "active")}`}>
                      {formatAdminLabel(order.status || "active")}
                    </span>
                  </td>
                  <td>{formatMoney(order.total_inc_gst, "AUD")}</td>
                  <td>{formatDate(order.accepted_at || order.created_at)}</td>
                </tr>
              );
            })}
            {!visibleOrders.length && !isLoading ? <tr><td colSpan="7" className={styles.emptyCell}>No orders match this filter.</td></tr> : null}
            {isLoading ? <tr><td colSpan="7" className={styles.emptyCell}>Loading orders...</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className={styles.mobileRecordList} aria-label="Orders">
        {orderPagination.pageItems.map((order) => {
          const items = sortedItems(order);
          return (
            <article className={styles.mobileRecordCard} key={order.id}>
              <button type="button" className={styles.mobileRecordMain} onClick={() => router.push(`/admin/orders/${order.id}`)}>
                <span className={styles.mobileRecordEyebrow}>Order</span>
                <strong>
                  {isNewOrder(order) ? <span className={styles.orderUnreadDot} title="New order" aria-label="New order" /> : null}
                  {order.order_number}
                </strong>
                <span>{order.customer_name || "No customer"}</span>
              </button>
              <dl className={styles.mobileRecordDetails}>
                <div><dt>Job</dt><dd>{order.name || "-"}</dd></div>
                <div><dt>Items</dt><dd>{items.length}</dd></div>
                <div><dt>Status</dt><dd><span className={`${styles.statusPill} ${getOrderStatusClass(order.status || "active")}`}>{formatAdminLabel(order.status || "active")}</span></dd></div>
                <div><dt>Total</dt><dd>{formatMoney(order.total_inc_gst, "AUD")}</dd></div>
                <div><dt>Accepted</dt><dd>{formatDate(order.accepted_at || order.created_at)}</dd></div>
              </dl>
              <div className={styles.mobileRecordActions}>
                <button type="button" className={styles.primaryButton} onClick={() => router.push(`/admin/orders/${order.id}`)}>Open order</button>
              </div>
            </article>
          );
        })}
        {!visibleOrders.length && !isLoading ? <div className={styles.mobileEmptyState}>No orders match this filter.</div> : null}
        {isLoading ? <div className={styles.mobileEmptyState}>Loading orders...</div> : null}
      </div>
      <AdminTablePagination
        label="orders"
        page={orderPagination.page}
        pageCount={orderPagination.pageCount}
        totalItems={orderPagination.totalItems}
        onPageChange={orderPagination.setPage}
      />
    </section>
  );
}

