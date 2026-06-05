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

const paymentTypes = [
  { value: "deposit", label: "Deposit" },
  { value: "progress", label: "Progress Payment" },
  { value: "final", label: "Final Payment" },
  { value: "other", label: "Other" },
];

function sortedItems(order) {
  return [...(order?.pcd_order_line_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

function sortedPayments(order) {
  return [...(order?.pcd_order_payments || [])].sort(
    (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.created_at || "").localeCompare(String(b.created_at || ""))
  );
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
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function itemMeta(item) {
  const size = item.width_mm || item.height_mm ? `${item.width_mm || "-"} x ${item.height_mm || "-"}mm` : "";
  const finish = [item.material, item.thickness, item.finish, item.colour, item.profile_type, item.profile, item.edge_mould]
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
  const [savingPaymentId, setSavingPaymentId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [colourSupplierMap, setColourSupplierMap] = useState({});
  const [paymentModal, setPaymentModal] = useState(null);

  const items = useMemo(() => sortedItems(order), [order]);
  const payments = useMemo(() => sortedPayments(order), [order]);
  const depositPayment = payments.find((payment) => payment.payment_type === "deposit");
  const paymentTotals = useMemo(() => {
    const orderTotal = Number(order?.total_inc_gst || 0);
    const pending = payments.reduce((total, payment) => total + (!payment.is_paid ? Number(payment.amount || 0) : 0), 0);
    const confirmed = payments.reduce((total, payment) => total + (payment.is_paid ? Number(payment.amount || 0) : 0), 0);
    return {
      orderTotal,
      pending,
      confirmed,
      remaining: Math.max(orderTotal - confirmed, 0),
    };
  }, [order?.total_inc_gst, payments]);

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

  useEffect(() => {
    if (!items.length) {
      setColourSupplierMap({});
      return;
    }

    let cancelled = false;

    async function loadColourSuppliers() {
      try {
        const response = await fetch("/api/colour-library?suppliers=1", { cache: "no-store" });
        const payload = await response.json();
        const nextMap = {};

        (payload.suppliers || []).forEach((colour) => {
          if (!colour.supplier) return;
          [colour.name, colour.label, [colour.finish, colour.name].filter(Boolean).join(" - ")]
            .filter(Boolean)
            .forEach((value) => {
              nextMap[supplierLookupKey(value)] = colour.supplier;
            });
        });

        if (!cancelled) {
          setColourSupplierMap(nextMap);
        }
      } catch {
        if (!cancelled) {
          setColourSupplierMap({});
        }
      }
    }

    loadColourSuppliers();

    return () => {
      cancelled = true;
    };
  }, [items.length]);

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

  function updatePaymentLocal(paymentId, changes) {
    setOrder((current) => {
      if (!current) return current;
      return {
        ...current,
        pcd_order_payments: (current.pcd_order_payments || []).map((payment) =>
          payment.id === paymentId ? { ...payment, ...changes } : payment
        ),
      };
    });
  }

  function withSyncedDepositFields(nextOrder, nextPayments) {
    const deposits = nextPayments.filter((payment) => payment.payment_type === "deposit");
    const depositRequired = deposits.length > 0;
    const depositAmount = deposits.reduce((total, payment) => total + Number(payment.amount || 0), 0);
    const depositPaid = deposits.length > 0 && deposits.every((payment) => payment.is_paid);
    const depositPaidAt = depositPaid ? deposits.find((payment) => payment.paid_at)?.paid_at || new Date().toISOString() : null;

    return {
      ...nextOrder,
      pcd_order_payments: nextPayments,
      deposit_required: depositRequired,
      deposit_amount: depositAmount,
      deposit_paid: depositPaid,
      deposit_paid_at: depositPaidAt,
    };
  }

  async function addPayment(payment) {
    if (!order) return;
    setSavingPaymentId("new");
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payment),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not add payment.");
        return;
      }
      setOrder((current) => {
        if (!current) return current;
        const nextPayments = [...(current.pcd_order_payments || []), payload.payment];
        return withSyncedDepositFields(current, nextPayments);
      });
      setPaymentModal(null);
      setFeedback("Payment line added.");
    } catch (error) {
      setFeedback(error?.message || "Could not add payment.");
    } finally {
      setSavingPaymentId("");
    }
  }

  async function updatePayment(payment, changes) {
    if (!order) return;
    const previousOrder = order;
    setSavingPaymentId(payment.id);
    setFeedback("");
    updatePaymentLocal(payment.id, changes);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setOrder(previousOrder);
        setFeedback(payload.error || "Could not update payment.");
        return;
      }
      setOrder((current) => {
        if (!current) return current;
        const nextPayments = (current.pcd_order_payments || []).map((item) =>
          item.id === payment.id ? payload.payment : item
        );
        return withSyncedDepositFields(current, nextPayments);
      });
      setFeedback("Payment line updated.");
    } catch (error) {
      setOrder(previousOrder);
      setFeedback(error?.message || "Could not update payment.");
    } finally {
      setSavingPaymentId("");
    }
  }

  async function deletePayment(payment) {
    if (!order) return;
    const previousOrder = order;
    setSavingPaymentId(payment.id);
    setFeedback("");
    setOrder((current) =>
      current
        ? { ...current, pcd_order_payments: (current.pcd_order_payments || []).filter((item) => item.id !== payment.id) }
        : current
    );
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/payments/${payment.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setOrder(previousOrder);
        setFeedback(payload.error || "Could not delete payment.");
        return;
      }
      setOrder((current) => {
        if (!current) return current;
        return withSyncedDepositFields(current, current.pcd_order_payments || []);
      });
      setFeedback("Payment line deleted.");
    } catch (error) {
      setOrder(previousOrder);
      setFeedback(error?.message || "Could not delete payment.");
    } finally {
      setSavingPaymentId("");
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

  function supplierLookupKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function defaultSupplierForItem(item) {
    if (item.supplier_name) return item.supplier_name;

    const lookupValues = [
      item.colour,
      item.finish,
      item.thickness,
      item.material,
      [item.finish, item.colour].filter(Boolean).join(" - "),
      [item.material, item.thickness].filter(Boolean).join(" - "),
      [item.material, item.finish].filter(Boolean).join(" - "),
      [item.material, item.colour].filter(Boolean).join(" - "),
      [item.material, item.thickness, item.finish].filter(Boolean).join(" - "),
      [item.material, item.thickness, item.colour].filter(Boolean).join(" - "),
      [item.material, item.finish, item.colour].filter(Boolean).join(" - "),
      [item.material, item.thickness, item.finish, item.colour].filter(Boolean).join(" - "),
    ].filter(Boolean);

    for (const value of lookupValues) {
      const supplier = colourSupplierMap[supplierLookupKey(value)];
      if (supplier) return supplier;
    }

    const normalisedValues = lookupValues.map(supplierLookupKey).filter(Boolean);
    const supplierEntries = Object.entries(colourSupplierMap).filter(([key]) => key.length > 2);
    for (const value of normalisedValues) {
      const match = supplierEntries.find(([key]) => value.includes(key) || key.includes(value));
      if (match?.[1]) return match[1];
    }

    return "";
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
                    {ORDER_LINE_STATUSES.map((status) => <option key={status} value={status}>{titleCaseStatus(status)}</option>)}
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
                <td><input className={styles.fieldInput} value={defaultSupplierForItem(item)} disabled={savingItemId === item.id} onChange={(event) => setOrder((current) => current ? setOrderItem(current, item.id, { supplier_name: event.target.value }) : current)} onBlur={(event) => updateItem(item, { supplier_name: event.target.value })} /></td>
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
      <div className={styles.paymentLedger}>
        <div className={styles.paymentSummaryGrid}>
          <div className={styles.paymentSummaryCard}>
            <span>Order Total</span>
            <strong>{formatMoney(paymentTotals.orderTotal, "AUD")}</strong>
          </div>
          <div className={styles.paymentSummaryCard}>
            <span>Pending Payment</span>
            <strong>{formatMoney(paymentTotals.pending, "AUD")}</strong>
          </div>
          <div className={styles.paymentSummaryCard}>
            <span>Confirmed Paid</span>
            <strong>{formatMoney(paymentTotals.confirmed, "AUD")}</strong>
          </div>
          <div className={styles.paymentSummaryCard}>
            <span>Left To Pay</span>
            <strong>{formatMoney(paymentTotals.remaining, "AUD")}</strong>
          </div>
        </div>

        <div className={styles.paymentToolbar}>
          <div className={styles.depositToggleGroup} aria-label="Deposit required">
            <span>Deposit Required</span>
            <label className={styles.radioPill}>
              <input
                type="radio"
                name="depositRequired"
                checked={!!depositPayment}
                disabled={!!depositPayment}
                onChange={() =>
                  setPaymentModal({
                    payment_type: "deposit",
                    amount: order.deposit_amount || "",
                    is_paid: false,
                    paid_at: "",
                    notes: "",
                  })
                }
              />
              Yes
            </label>
            <label className={styles.radioPill}>
              <input
                type="radio"
                name="depositRequired"
                checked={!depositPayment}
                disabled={!!depositPayment}
                onChange={() => saveOrder({ deposit_required: false, deposit_amount: 0, deposit_paid: false, deposit_paid_at: null })}
              />
              No
            </label>
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() =>
              setPaymentModal({
                payment_type: "progress",
                amount: "",
                is_paid: false,
                paid_at: "",
                notes: "",
              })
            }
          >
            Add payment line
          </button>
        </div>

        <div className={styles.productsTableWrap}>
          <table className={`${styles.productsTable} ${styles.paymentTable}`}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date paid</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>
                    <select
                      className={styles.fieldInput}
                      value={payment.payment_type || "progress"}
                      disabled={savingPaymentId === payment.id}
                      onChange={(event) => updatePayment(payment, { payment_type: event.target.value })}
                    >
                      {paymentTypes.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className={styles.fieldInput}
                      type="number"
                      min="0"
                      step="0.01"
                      value={payment.amount ?? ""}
                      disabled={savingPaymentId === payment.id}
                      onChange={(event) => updatePaymentLocal(payment.id, { amount: event.target.value })}
                      onBlur={(event) => updatePayment(payment, { amount: event.target.value || 0 })}
                    />
                  </td>
                  <td>
                    <select
                      className={styles.fieldInput}
                      value={payment.is_paid ? "paid" : "pending"}
                      disabled={savingPaymentId === payment.id}
                      onChange={(event) => updatePayment(payment, { is_paid: event.target.value === "paid" })}
                    >
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                    </select>
                  </td>
                  <td>
                    <input
                      className={styles.fieldInput}
                      type="date"
                      value={payment.paid_at || ""}
                      disabled={savingPaymentId === payment.id || !payment.is_paid}
                      onChange={(event) => updatePaymentLocal(payment.id, { paid_at: event.target.value })}
                      onBlur={(event) => updatePayment(payment, { paid_at: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.fieldInput}
                      value={payment.notes || ""}
                      disabled={savingPaymentId === payment.id}
                      onChange={(event) => updatePaymentLocal(payment.id, { notes: event.target.value })}
                      onBlur={(event) => updatePayment(payment, { notes: event.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`${styles.rowIconButton} ${styles.rowDeleteIconButton}`}
                      aria-label="Delete payment line"
                      title="Delete payment line"
                      disabled={savingPaymentId === payment.id}
                      onClick={() => deletePayment(payment)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!payments.length ? (
                <tr>
                  <td className={styles.emptyCell} colSpan="6">No payment lines yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderPaymentModal() {
    if (!paymentModal) return null;

    const isDeposit = paymentModal.payment_type === "deposit";

    return (
      <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label={isDeposit ? "Add deposit line" : "Add payment line"}>
        <div className={`${styles.customerModal} ${styles.paymentModal}`}>
          <header className={styles.customerModalHeader}>
            <div className={styles.customerModalIcon}>{isDeposit ? "DEP" : "PAY"}</div>
            <div>
              <p className={styles.tableMeta}>{isDeposit ? "Deposit required" : "Payment line"}</p>
              <h2>{isDeposit ? "Add Deposit Line" : "Add Payment Line"}</h2>
            </div>
          </header>
          <div className={styles.customerModalBody}>
            <div className={styles.customerModalGrid}>
              <label className={styles.fieldLabel}>
                Payment type
                <select
                  className={styles.fieldInput}
                  value={paymentModal.payment_type}
                  disabled={isDeposit}
                  onChange={(event) => setPaymentModal((current) => ({ ...current, payment_type: event.target.value }))}
                >
                  {paymentTypes.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.fieldLabel}>
                Amount
                <input
                  className={styles.fieldInput}
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentModal.amount}
                  onChange={(event) => setPaymentModal((current) => ({ ...current, amount: event.target.value }))}
                />
              </label>
              <label className={styles.fieldLabel}>
                Payment status
                <select
                  className={styles.fieldInput}
                  value={paymentModal.is_paid ? "paid" : "pending"}
                  onChange={(event) => setPaymentModal((current) => ({ ...current, is_paid: event.target.value === "paid" }))}
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
              <label className={styles.fieldLabel}>
                Date paid
                <input
                  className={styles.fieldInput}
                  type="date"
                  value={paymentModal.paid_at}
                  disabled={!paymentModal.is_paid}
                  onChange={(event) => setPaymentModal((current) => ({ ...current, paid_at: event.target.value }))}
                />
              </label>
              <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
                Notes
                <textarea
                  className={styles.textareaInput}
                  rows={3}
                  value={paymentModal.notes}
                  onChange={(event) => setPaymentModal((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>
            </div>
          </div>
          <footer className={styles.customerModalFooter}>
            <button type="button" className={styles.secondaryButton} onClick={() => setPaymentModal(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={savingPaymentId === "new"}
              onClick={() => addPayment(paymentModal)}
            >
              Add line
            </button>
          </footer>
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
      {renderPaymentModal()}
    </div>
  );
}
