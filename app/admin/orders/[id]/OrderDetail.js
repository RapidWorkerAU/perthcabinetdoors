"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  formatMoney,
  ORDER_LINE_STATUSES,
  ORDER_PRODUCTION_STAGES,
  ORDER_STATUSES,
} from "../../../../lib/pcd-quote-utils";
import styles from "../../admin-shell.module.css";

const sections = [
  { key: "overview", label: "Overview" },
  { key: "items", label: "Items & Workflow" },
  { key: "purchasing", label: "Purchasing & Board" },
  { key: "payments", label: "Payments" },
  { key: "comms", label: "Customer Comms" },
  { key: "notes", label: "Notes" },
];

function sortedItems(order) {
  return [...(order?.pcd_order_line_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function titleCaseStatus(status) {
  return String(status || "active")
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function itemMeta(item) {
  const size = item.width_mm || item.height_mm ? `${item.width_mm || "-"} x ${item.height_mm || "-"}mm` : "";
  const finish = [item.material, item.finish, item.colour, item.profile_type, item.profile, item.edge_mould]
    .filter(Boolean)
    .join(" - ");
  return [size, finish].filter(Boolean).join(" | ");
}

function setOrderItem(order, itemId, nextItem) {
  return {
    ...order,
    pcd_order_line_items: (order.pcd_order_line_items || []).map((item) =>
      item.id === itemId ? { ...item, ...nextItem } : item
    ),
  };
}

function statusClass(status) {
  if (status === "complete" || status === "Complete") return styles.statusPillActive;
  if (status === "cancelled" || status === "on_hold" || status === "Issue Follow-Up") return styles.statusPillIssue;
  return styles.statusPillDraft;
}

export default function OrderDetail({ orderId }) {
  const [order, setOrder] = useState(null);
  const [activeSection, setActiveSection] = useState("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [savingItemId, setSavingItemId] = useState("");
  const [feedback, setFeedback] = useState("");

  const items = useMemo(() => sortedItems(order), [order]);

  async function loadOrder() {
    setIsLoading(true);
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not load order.");
        return;
      }
      setOrder(payload.order);
    } catch (error) {
      setFeedback(error?.message || "Could not load order.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  function updateOrderField(field, value) {
    setOrder((current) => (current ? { ...current, [field]: value } : current));
  }

  async function saveOrder(fields) {
    if (!order) return;
    setIsSavingOrder(true);
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not update order.");
        return;
      }
      setOrder(payload.order);
      setFeedback("Order updated.");
    } catch (error) {
      setFeedback(error?.message || "Could not update order.");
    } finally {
      setIsSavingOrder(false);
    }
  }

  async function updateItem(item, changes) {
    if (!order) return;
    const nextItem = { ...item, ...changes };
    const previousOrder = order;
    setSavingItemId(item.id);
    setFeedback("");
    setOrder((current) => (current ? setOrderItem(current, item.id, nextItem) : current));
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setOrder(previousOrder);
        setFeedback(payload.error || "Could not update order item.");
        return;
      }
      setOrder((current) => (current ? setOrderItem(current, item.id, payload.item) : current));
      setFeedback("Order item updated.");
    } catch (error) {
      setOrder(previousOrder);
      setFeedback(error?.message || "Could not update order item.");
    } finally {
      setSavingItemId("");
    }
  }

  if (isLoading) return <section className={styles.emptyState}><p>Loading order...</p></section>;
  if (!order) return <section className={styles.emptyState}><p>{feedback || "Order not found."}</p></section>;

  function renderOverview() {
    return (
      <div className={styles.quoteBuilderGrid}>
        <label className={styles.fieldLabel}>
          Job name
          <input className={styles.fieldInput} value={order.name || ""} onChange={(event) => updateOrderField("name", event.target.value)} onBlur={(event) => saveOrder({ name: event.target.value })} />
        </label>
        <label className={styles.fieldLabel}>
          Order status
          <select className={styles.fieldInput} value={order.status || "active"} onChange={(event) => saveOrder({ status: event.target.value })} disabled={isSavingOrder}>
            {ORDER_STATUSES.map((status) => <option key={status} value={status}>{titleCaseStatus(status)}</option>)}
          </select>
        </label>
        <label className={styles.fieldLabel}>
          Customer
          <input className={styles.fieldInput} value={order.customer_name || ""} onChange={(event) => updateOrderField("customer_name", event.target.value)} onBlur={(event) => saveOrder({ customer_name: event.target.value })} />
        </label>
        <label className={styles.fieldLabel}>
          Email
          <input className={styles.fieldInput} value={order.customer_email || ""} onChange={(event) => updateOrderField("customer_email", event.target.value)} onBlur={(event) => saveOrder({ customer_email: event.target.value })} />
        </label>
        <label className={styles.fieldLabel}>
          Phone
          <input className={styles.fieldInput} value={order.customer_phone || ""} onChange={(event) => updateOrderField("customer_phone", event.target.value)} onBlur={(event) => saveOrder({ customer_phone: event.target.value })} />
        </label>
        <label className={styles.fieldLabel}>
          Target completion
          <input className={styles.fieldInput} type="date" value={order.target_completion_date || ""} onChange={(event) => updateOrderField("target_completion_date", event.target.value)} onBlur={(event) => saveOrder({ target_completion_date: event.target.value })} />
        </label>
        <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
          Site / delivery address
          <input className={styles.fieldInput} value={order.site_address || ""} onChange={(event) => updateOrderField("site_address", event.target.value)} onBlur={(event) => saveOrder({ site_address: event.target.value })} />
        </label>
      </div>
    );
  }

  function renderItems() {
    return (
      <div className={styles.productsTableWrap}>
        <table className={`${styles.productsTable} ${styles.orderWorkflowTable}`}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Status</th>
              <th>Qty</th>
              <th>Fulfilment</th>
              <th>Production stage</th>
              <th>Order status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className={styles.orderItemIdentity}>
                    <strong>{item.title || item.product_type || "Cabinetry item"}</strong>
                    <span>{itemMeta(item) || "No item details recorded"}</span>
                  </div>
                </td>
                <td>
                  <span className={`${styles.statusPill} ${statusClass(item.status)}`}>{item.status || "Not Ordered"}</span>
                </td>
                <td>{item.qty || 0}</td>
                <td>
                  <select className={styles.fieldInput} value={item.fulfilment_method || "in_house"} disabled={savingItemId === item.id} onChange={(event) => updateItem(item, { fulfilment_method: event.target.value })}>
                    <option value="in_house">Made in house</option>
                    <option value="supplier_ready_made">Supplier ready made</option>
                  </select>
                </td>
                <td>
                  <select className={styles.fieldInput} value={item.production_stage || "Not Started"} disabled={savingItemId === item.id || item.fulfilment_method === "supplier_ready_made"} onChange={(event) => updateItem(item, { production_stage: event.target.value })}>
                    {ORDER_PRODUCTION_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                  </select>
                </td>
                <td>
                  <select className={styles.fieldInput} value={item.status || "Not Ordered"} disabled={savingItemId === item.id} onChange={(event) => updateItem(item, { status: event.target.value })}>
                    {ORDER_LINE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </td>
                <td>
                  <textarea className={`${styles.textareaInput} ${styles.projectLineNotes}`} rows={2} value={item.production_notes || ""} disabled={savingItemId === item.id} onChange={(event) => setOrder((current) => current ? setOrderItem(current, item.id, { production_notes: event.target.value }) : current)} onBlur={(event) => updateItem(item, { production_notes: event.target.value })} />
                </td>
              </tr>
            ))}
            {!items.length ? <tr><td className={styles.emptyCell} colSpan="7">No order items yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    );
  }

  function renderPurchasing() {
    return (
      <div className={styles.productsTableWrap}>
        <table className={`${styles.productsTable} ${styles.orderPurchasingTable}`}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Supplier</th>
              <th>Supplier ref</th>
              <th>Ordered</th>
              <th>ETA</th>
              <th>Board required</th>
              <th>Board ordered</th>
              <th>Board available</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className={styles.orderItemIdentity}>
                    <strong>{item.title || item.product_type || "Cabinetry item"}</strong>
                    <span>{itemMeta(item) || "No item details recorded"}</span>
                  </div>
                </td>
                <td><input className={styles.fieldInput} value={item.supplier_name || ""} disabled={savingItemId === item.id} onChange={(event) => setOrder((current) => current ? setOrderItem(current, item.id, { supplier_name: event.target.value }) : current)} onBlur={(event) => updateItem(item, { supplier_name: event.target.value })} /></td>
                <td><input className={styles.fieldInput} value={item.supplier_order_ref || ""} disabled={savingItemId === item.id} onChange={(event) => setOrder((current) => current ? setOrderItem(current, item.id, { supplier_order_ref: event.target.value }) : current)} onBlur={(event) => updateItem(item, { supplier_order_ref: event.target.value })} /></td>
                <td><input className={styles.fieldInput} type="date" value={item.supplier_ordered_at || ""} disabled={savingItemId === item.id} onChange={(event) => setOrder((current) => current ? setOrderItem(current, item.id, { supplier_ordered_at: event.target.value }) : current)} onBlur={(event) => updateItem(item, { supplier_ordered_at: event.target.value })} /></td>
                <td><input className={styles.fieldInput} type="date" value={item.supplier_eta || ""} disabled={savingItemId === item.id} onChange={(event) => setOrder((current) => current ? setOrderItem(current, item.id, { supplier_eta: event.target.value }) : current)} onBlur={(event) => updateItem(item, { supplier_eta: event.target.value })} /></td>
                {["board_required", "board_ordered", "board_available"].map((field) => (
                  <td key={field}>
                    <label className={styles.quoteItemCheck}>
                      <input type="checkbox" checked={!!item[field]} disabled={savingItemId === item.id} onChange={(event) => updateItem(item, { [field]: event.target.checked })} />
                      Yes
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderPayments() {
    return (
      <div className={styles.quoteBuilderGrid}>
        <label className={styles.fieldLabel}>
          Deposit required
          <select className={styles.fieldInput} value={order.deposit_required ? "yes" : "no"} onChange={(event) => saveOrder({ deposit_required: event.target.value === "yes" })}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className={styles.fieldLabel}>
          Deposit amount
          <input className={styles.fieldInput} type="number" step="0.01" value={order.deposit_amount || ""} onChange={(event) => updateOrderField("deposit_amount", event.target.value)} onBlur={(event) => saveOrder({ deposit_amount: event.target.value || 0 })} />
        </label>
        <label className={styles.fieldLabel}>
          Deposit paid
          <select className={styles.fieldInput} value={order.deposit_paid ? "yes" : "no"} onChange={(event) => saveOrder({ deposit_paid: event.target.value === "yes", deposit_paid_at: event.target.value === "yes" ? new Date().toISOString() : null })}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
        <div className={styles.projectSummaryCard}>
          <span>Order total</span>
          <strong>{formatMoney(order.total_inc_gst, "AUD")}</strong>
          <small>Deposit paid {order.deposit_paid ? formatDate(order.deposit_paid_at) : "not recorded"}</small>
        </div>
      </div>
    );
  }

  function renderComms() {
    return (
      <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
        Customer communications
        <textarea className={styles.textareaInput} rows={10} value={order.customer_comms || ""} onChange={(event) => updateOrderField("customer_comms", event.target.value)} onBlur={(event) => saveOrder({ customer_comms: event.target.value })} placeholder="Record calls, SMS/email updates, installation timing, deposit reminders, or customer decisions." />
      </label>
    );
  }

  function renderNotes() {
    return (
      <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
        Internal notes
        <textarea className={styles.textareaInput} rows={10} value={order.internal_notes || ""} onChange={(event) => updateOrderField("internal_notes", event.target.value)} onBlur={(event) => saveOrder({ internal_notes: event.target.value })} placeholder="Internal production, purchasing, install, or risk notes." />
      </label>
    );
  }

  function renderSection() {
    if (activeSection === "items") return renderItems();
    if (activeSection === "purchasing") return renderPurchasing();
    if (activeSection === "payments") return renderPayments();
    if (activeSection === "comms") return renderComms();
    if (activeSection === "notes") return renderNotes();
    return renderOverview();
  }

  const activeLabel = sections.find((section) => section.key === activeSection)?.label || "Overview";

  return (
    <div className={styles.quoteBuilderFrame}>
      <section className={styles.quoteBuilderPanel}>
        <header className={styles.quoteBuilderPanelHeader}>
          <div className={styles.quoteBuilderHeaderTop}>
            <div>
              <p className={styles.tableMeta}>Order section</p>
              <h1>{activeLabel}</h1>
              <p className={styles.helperText}>
                <Link href="/admin/orders">Orders</Link> / {order.order_number}
              </p>
            </div>
          </div>

          <nav className={styles.quoteBuilderTabs} aria-label="Order sections">
            {sections.map((section) => (
              <button
                key={section.key}
                type="button"
                className={`${styles.quoteBuilderTab} ${activeSection === section.key ? styles.quoteBuilderTabActive : ""}`}
                onClick={() => setActiveSection(section.key)}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </header>

        <div className={styles.quoteBuilderPanelBody}>
          {renderSection()}
          {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
        </div>
      </section>
    </div>
  );
}
