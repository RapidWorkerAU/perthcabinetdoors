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
import { ADMIN_TABLE_PAGE_SIZE, AdminTablePagination, useAdminTablePagination } from "../../_components/AdminTablePagination";

const sections = [
  { key: "overview", label: "Overview" },
  { key: "quoteSummary", label: "Quote Summary" },
  { key: "items", label: "Item Planning" },
  { key: "supplierMade", label: "Supplier Made" },
  { key: "madeInHouse", label: "Made In House" },
  { key: "cutList", label: "Cut List" },
  { key: "payments", label: "Payments" },
  { key: "activity", label: "Activity Log" },
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

function sortedQuoteLines(order) {
  return [...(order?.pcd_quote?.pcd_quote_line_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

function sortedPayments(order) {
  return [...(order?.pcd_order_payments || [])].sort(
    (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.created_at || "").localeCompare(String(b.created_at || ""))
  );
}

function sortedActivity(order) {
  return [...(order?.pcd_order_activity || [])].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
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

function activityActorLabel(actor) {
  if (actor === "customer") return "Customer";
  if (actor === "admin") return "Admin";
  return "System";
}

function itemMeta(item) {
  const size = item.width_mm || item.height_mm ? `${item.width_mm || "-"} x ${item.height_mm || "-"}mm` : "";
  const finish = [item.material, item.thickness, item.finish, item.colour, item.profile_type, item.profile, item.edge_mould]
    .filter(Boolean)
    .join(" - ");
  return [size, finish].filter(Boolean).join(" | ");
}

function itemDisplayTitle(item) {
  const title = item?.title || item?.product_type || "Cabinetry item";
  if (String(title).toLowerCase() === "base_cabinet" || item?.product_type === "base_cabinet") return "Base Cabinet";
  return title;
}

function isThermolaminatedItem(item) {
  return [
    item?.material,
    item?.title,
    item?.product_type,
    item?.description,
    item?.profile_type,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes("thermolaminate"));
}

function isMadeInHouseItem(item) {
  if (isThermolaminatedItem(item)) return false;
  return item?.fulfilment_method === "in_house" || item?.make_in_house === true || !item?.fulfilment_method;
}

function panelPlanning(item) {
  if (!item?.panel_planning || typeof item.panel_planning !== "object" || Array.isArray(item.panel_planning)) return {};
  return item.panel_planning;
}

function panelPlanFor(item, panelKey) {
  const plan = panelPlanning(item)[panelKey] || {};
  const thermolaminated = isThermolaminatedItem(item);
  return {
    fulfilment_method: thermolaminated ? "supplier_ready_made" : plan.fulfilment_method || item.fulfilment_method || "in_house",
    status: plan.status || item.status || "Not Ordered",
    supplier_name: plan.supplier_name ?? item.supplier_name ?? "",
    supplier_order_ref: plan.supplier_order_ref ?? item.supplier_order_ref ?? "",
    supplier_ordered_at: plan.supplier_ordered_at ?? item.supplier_ordered_at ?? "",
    supplier_eta: plan.supplier_eta ?? item.supplier_eta ?? "",
    board_required: typeof plan.board_required === "boolean" ? plan.board_required : !!item.board_required,
    production_stage: plan.production_stage || item.production_stage || "Not Started",
    notes: plan.notes ?? item.production_notes ?? item.notes ?? "",
  };
}

function isPanelMadeInHouse(row) {
  return row.plan.fulfilment_method === "in_house";
}

function formatCutDimension(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${number}mm` : "-";
}

function formatCutSize(widthMm, heightMm) {
  return `${formatCutDimension(widthMm)} x ${formatCutDimension(heightMm)}`;
}

function cabinetDimensions(config) {
  const width = Number(config?.width_mm || 0);
  const height = Number(config?.height_mm || 0);
  const depth = Number(config?.depth_mm || 0);
  return width && height && depth ? `${width}W x ${height}H x ${depth}D mm` : "";
}

function cabinetCutLabel(item, itemIndex, copyIndex, totalCopies) {
  const config = item?.cabinet_config || {};
  const baseLabel = config.label || item.description || itemDisplayTitle(item);
  const orderNumber = Number.isFinite(Number(item?.sort_order)) ? Number(item.sort_order) + 1 : itemIndex + 1;
  const copyLabel = totalCopies > 1 ? ` - cabinet ${copyIndex + 1} of ${totalCopies}` : "";
  return `${orderNumber}. ${baseLabel}${copyLabel}`;
}

function panelKeyFor(...parts) {
  return parts.map((part) => String(part ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item").join(":");
}

function cutMaterialDisplay(item, piece) {
  return piece?.material || [item?.material, item?.finish, item?.colour].filter(Boolean).join(" - ") || "-";
}

function cutEdgingDisplay(item, piece) {
  const label = String(piece?.label || item?.title || "").toLowerCase();
  if (label.includes("back panel")) return "No edging unless specified";
  if (label.includes("side panel")) return "Front long edge";
  if (label.includes("top panel") || label.includes("bottom panel") || label.includes("shelf")) return "Front long edge";
  if (item?.edge_mould) return item.edge_mould;
  return "As specified";
}

function buildOrderPlanningRows(items) {
  return (items || []).flatMap((item, itemIndex) => {
    const cabinetConfig = item.cabinet_config;
    const cabinetPieces = Array.isArray(cabinetConfig?.calculated_cut_list) ? cabinetConfig.calculated_cut_list : [];
    const isBaseCabinet = item.product_type === "base_cabinet" || !!cabinetConfig;

    if (isBaseCabinet && cabinetPieces.length) {
      const lineQty = Math.max(1, Math.floor(Number(item.qty || 1)));
      const rows = [];
      for (let copyIndex = 0; copyIndex < lineQty; copyIndex += 1) {
        cabinetPieces.forEach((piece) => {
          const pieceQty = Math.max(1, Math.floor(Number(piece.qty || 1)));
          for (let pieceIndex = 0; pieceIndex < pieceQty; pieceIndex += 1) {
            const panelKey = panelKeyFor("cabinet", copyIndex, piece.label, pieceIndex);
            rows.push({
              key: `${item.id}-${copyIndex}-${piece.label}-${pieceIndex}`,
              panelKey,
              item,
              plan: panelPlanFor(item, panelKey),
              source: cabinetCutLabel(item, itemIndex, copyIndex, lineQty),
              cabinet: cabinetDimensions(cabinetConfig),
              piece: pieceQty > 1 ? `${piece.label} ${pieceIndex + 1}` : piece.label,
              qty: 1,
              width_mm: piece.width_mm,
              height_mm: piece.height_mm,
              size: formatCutSize(piece.width_mm, piece.height_mm),
              thickness: piece.thickness_mm ? `${piece.thickness_mm}mm` : item.thickness || "-",
              material: cutMaterialDisplay(item, piece),
              edging: cutEdgingDisplay(item, piece),
              notes: panelPlanFor(item, panelKey).notes,
            });
          }
        });
      }
      return rows;
    }

    const panelKey = panelKeyFor("line", item.id);
    return [{
      key: item.id,
      panelKey,
      item,
      plan: panelPlanFor(item, panelKey),
      source: itemDisplayTitle(item),
      cabinet: "",
      piece: item.description || itemDisplayTitle(item),
      qty: item.qty || 1,
      width_mm: item.width_mm,
      height_mm: item.height_mm,
      size: item.width_mm || item.height_mm ? formatCutSize(item.width_mm, item.height_mm) : "-",
      thickness: item.thickness || "-",
      material: cutMaterialDisplay(item),
      edging: cutEdgingDisplay(item),
      notes: panelPlanFor(item, panelKey).notes,
    }];
  });
}

function buildOrderCutListRows(items) {
  return buildOrderPlanningRows(items).filter(isPanelMadeInHouse);
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

function quoteLineTitle(line) {
  if (line?.product_type === "base_cabinet" || line?.product_name === "base_cabinet") return "Base Cabinet";
  return line?.product_name || line?.product_type || "Quote item";
}

function quoteLineSize(line) {
  const width = line?.width_mm || "-";
  const height = line?.height_mm || "-";
  const depth = line?.cabinet_config?.depth_mm || line?.depth_mm;
  return depth ? `${width} x ${height} x ${depth}mm` : `${width} x ${height}mm`;
}

function lineValue(value, fallback = "-") {
  return value === null || value === undefined || value === "" ? fallback : value;
}

export default function OrderDetail({ orderId }) {
  const [order, setOrder] = useState(null);
  const [activeSection, setActiveSection] = useState("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [savingItemId, setSavingItemId] = useState("");
  const [savingPaymentId, setSavingPaymentId] = useState("");
  const [isGeneratingCutListPdf, setIsGeneratingCutListPdf] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [colourSupplierMap, setColourSupplierMap] = useState({});
  const [paymentModal, setPaymentModal] = useState(null);
  const [panelNotesModal, setPanelNotesModal] = useState(null);

  const items = useMemo(() => sortedItems(order), [order]);
  const planningRows = useMemo(() => buildOrderPlanningRows(items), [items]);
  const supplierMadeRows = useMemo(() => planningRows.filter((row) => !isPanelMadeInHouse(row)), [planningRows]);
  const madeInHouseRows = useMemo(() => planningRows.filter(isPanelMadeInHouse), [planningRows]);
  const cutListRows = useMemo(() => planningRows.filter(isPanelMadeInHouse), [planningRows]);
  const quoteLines = useMemo(() => sortedQuoteLines(order), [order]);
  const payments = useMemo(() => sortedPayments(order), [order]);
  const activity = useMemo(() => sortedActivity(order), [order]);
  const planningPagination = useAdminTablePagination(planningRows);
  const supplierMadePagination = useAdminTablePagination(supplierMadeRows);
  const madeInHousePagination = useAdminTablePagination(madeInHouseRows);
  const cutListPagination = useAdminTablePagination(cutListRows);
  const paymentPagination = useAdminTablePagination(payments);
  const activityPagination = useAdminTablePagination(activity);
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

  async function requestPayment(payment) {
    if (!order || !payment?.id) return;
    setSavingPaymentId(payment.id);
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/payments/${payment.id}/request`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not request payment.");
        return;
      }
      setOrder((current) => {
        if (!current) return current;
        return {
          ...current,
          pcd_order_payments: (current.pcd_order_payments || []).map((item) =>
            item.id === payment.id ? payload.payment : item
          ),
        };
      });
      setFeedback(payload.emailSent ? "Payment request sent to customer." : `Payment request created. Email is not configured, use this link: ${payload.checkoutUrl}`);
    } catch (error) {
      setFeedback(error?.message || "Could not request payment.");
    } finally {
      setSavingPaymentId("");
    }
  }

  async function generateCutListPdf() {
    setIsGeneratingCutListPdf(true);
    setFeedback("");
    const previewWindow = window.open("", "_blank");
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/cut-list-pdf`, { cache: "no-store" });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        let message = "Could not generate cut list PDF.";
        if (contentType.includes("application/json")) {
          const payload = await response.json();
          message = payload.error || message;
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const fileName = `cut-list-${order?.order_number || "order"}.pdf`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (previewWindow) {
        previewWindow.location.href = url;
      } else {
        window.open(url, "_blank");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      if (previewWindow) previewWindow.close();
      setFeedback(error?.message || "Could not generate cut list PDF.");
    } finally {
      setIsGeneratingCutListPdf(false);
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

  async function updatePanelPlan(row, changes) {
    const item = row.item;
    const currentPlanning = panelPlanning(item);
    const currentPanel = currentPlanning[row.panelKey] || {};
    const nextPanel = {
      ...currentPanel,
      ...changes,
    };
    if (isThermolaminatedItem(item)) {
      nextPanel.fulfilment_method = "supplier_ready_made";
    }
    const nextPlanning = {
      ...currentPlanning,
      [row.panelKey]: nextPanel,
    };
    await updateItem(item, { panel_planning: nextPlanning });
  }

  function updatePanelPlanLocal(row, changes) {
    const item = row.item;
    setOrder((current) => {
      if (!current) return current;
      const currentPlanning = panelPlanning(item);
      const nextPlanning = {
        ...currentPlanning,
        [row.panelKey]: {
          ...(currentPlanning[row.panelKey] || {}),
          ...changes,
        },
      };
      return setOrderItem(current, item.id, { panel_planning: nextPlanning });
    });
  }

  function openPanelNotes(row) {
    setPanelNotesModal({
      row,
      notes: row.plan.notes || "",
    });
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

  function renderQuoteSummary() {
    const quote = order.pcd_quote || order;
    return (
      <div className={styles.quoteBuilderStack}>
        <div className={`${styles.quoteItemsAdminWrap} ${styles.orderQuoteSummaryItems}`}>
          <div className={styles.quoteItemsScroller}>
            <div className={`${styles.quoteItemGrid} ${styles.quoteItemHead}`}>
              <div>#</div>
              <div>Type</div>
              <div>Material</div>
              <div>Thickness</div>
              <div>W x H (mm)</div>
              <div>Colour</div>
              <div>Qty</div>
              <div>Edge profile</div>
              <div>Profile type</div>
              <div>Profile name</div>
              <div>Drill holes?</div>
              <div>Hinge supply?</div>
              <div>Hinge qty</div>
              <div>Unit cost</div>
              <div>Markup %</div>
              <div>Unit + markup</div>
              <div>Total ex GST</div>
            </div>
            {quoteLines.map((line, index) => {
              const showProfiles = line.material === "Thermolaminate";
              const hingesApplicable = line.product_type === "Door";
              return (
                <div className={styles.quoteItemBlock} key={line.id || index}>
                  <div className={`${styles.quoteItemGrid} ${styles.quoteItemRow} ${styles.quoteItemRowLocked}`}>
                    <div><span className={styles.quoteItemRowNum}>{index + 1}</span></div>
                    <div className={styles.quoteReadCell}>{lineValue(quoteLineTitle(line))}</div>
                    <div className={styles.quoteReadCell}>{lineValue(line.material)}</div>
                    <div className={styles.quoteReadCell}>{lineValue(line.thickness)}</div>
                    <div className={styles.quoteReadCell}>{lineValue(quoteLineSize(line))}</div>
                    <div className={styles.quoteReadCell}>{lineValue(line.colour)}</div>
                    <div className={styles.quoteReadCell}>{line.qty || "1"}</div>
                    <div className={styles.quoteReadCell}>{lineValue(line.edge_mould)}</div>
                    <div className={styles.quoteReadCell}>{showProfiles ? lineValue(line.profile_type) : "N/A"}</div>
                    <div className={styles.quoteReadCell}>{showProfiles ? lineValue(line.profile) : "N/A"}</div>
                    <div className={styles.quoteReadCell}>{hingesApplicable ? line.hinge_holes ? "Yes" : "No" : "N/A"}</div>
                    <div className={styles.quoteReadCell}>{hingesApplicable ? line.hinge_supply ? "Yes" : "No" : "N/A"}</div>
                    <div className={styles.quoteReadCell}>{hingesApplicable && (line.hinge_supply || line.hinge_holes) ? lineValue(line.hinge_qty) : "N/A"}</div>
                    <div className={styles.quoteReadCell}>{formatMoney(line.product_unit_cost_ex_gst || 0, quote.currency || "AUD")}</div>
                    <div className={styles.quoteReadCell}>{line.markup_percent ?? 40}%</div>
                    <div className={styles.quoteItemTotal}>{formatMoney(line.unit_price_ex_gst || 0, quote.currency || "AUD")}</div>
                    <div className={styles.quoteItemTotal}>{formatMoney(line.line_total_ex_gst || 0, quote.currency || "AUD")}</div>
                  </div>
                </div>
              );
            })}
            {!quoteLines.length ? <div className={styles.emptyState}><p>No quote line items found for this order.</p></div> : null}
          </div>
          <div className={`${styles.quoteTotalsLayout} ${styles.orderQuoteSummaryTotals}`}>
            <section className={styles.quoteTotalGroup}>
              <header>Quote totals</header>
              <div className={styles.quoteTotalGroupBody}>
                <div><span>Subtotal ex GST</span><strong>{formatMoney(quote.subtotal_ex_gst, quote.currency || "AUD")}</strong></div>
                <div><span>GST</span><strong>{formatMoney(quote.gst_amount, quote.currency || "AUD")}</strong></div>
                <div><span>Total inc GST</span><strong>{formatMoney(quote.total_inc_gst, quote.currency || "AUD")}</strong></div>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  function renderItems() {
    return (
      <div className={`${styles.quoteItemsAdminWrap} ${styles.orderPlanningItems}`}>
        <div className={styles.quoteItemsScroller}>
          <div className={`${styles.quoteItemGrid} ${styles.quoteItemHead}`}>
            <div>Item</div>
            <div>Cabinet</div>
            <div>Panel / item</div>
            <div>Qty</div>
            <div>Size</div>
            <div>Material / colour</div>
            <div>Fulfilment</div>
          </div>
            {planningPagination.pageItems.map((row) => {
              const item = row.item;
              const thermolaminated = isThermolaminatedItem(item);
              const fulfilmentValue = row.plan.fulfilment_method;
              return (
              <div className={styles.quoteItemBlock} key={row.key}>
                <div className={`${styles.quoteItemGrid} ${styles.quoteItemRow} ${styles.quoteItemRowLocked}`}>
                  <div className={styles.orderItemIdentity}>
                    <strong>{row.source}</strong>
                    <span>{itemMeta(item) || "No item details recorded"}</span>
                  </div>
                  <div className={styles.quoteReadCell}>{row.cabinet || "-"}</div>
                  <div className={styles.quoteReadCell}>{row.piece}</div>
                  <div className={styles.quoteReadCell}>{row.qty}</div>
                  <div className={styles.quoteReadCell}>{row.size}</div>
                  <div className={styles.quoteReadCell}>{row.material}</div>
                  <div className={styles.quoteItemField}>
                    <select value={fulfilmentValue} disabled={savingItemId === item.id || thermolaminated} onChange={(event) => updatePanelPlan(row, { fulfilment_method: event.target.value })}>
                      <option value="in_house">Made in house</option>
                      <option value="supplier_ready_made">Supplier ready made</option>
                    </select>
                  </div>
                </div>
              </div>
              );
            })}
            {!planningRows.length ? (
              <div className={styles.emptyState}><p>No order items yet.</p></div>
            ) : null}
        </div>
        <AdminTablePagination
          label="planning rows"
          page={planningPagination.page}
          pageCount={planningPagination.pageCount}
          totalItems={planningPagination.totalItems}
          onPageChange={planningPagination.setPage}
        />
      </div>
    );
  }

  function renderSupplierMade() {
    return (
      <div className={`${styles.quoteItemsAdminWrap} ${styles.orderSupplierItems}`}>
        <div className={styles.quoteItemsScroller}>
          <div className={`${styles.quoteItemGrid} ${styles.quoteItemHead}`}>
            <div>Item</div>
            <div>Order status</div>
            <div>Supplier</div>
            <div>Supplier ref</div>
            <div>Ordered</div>
            <div>ETA</div>
            <div>Notes</div>
          </div>
            {supplierMadePagination.pageItems.map((row) => (
              <div className={styles.quoteItemBlock} key={row.key}>
                <div className={`${styles.quoteItemGrid} ${styles.quoteItemRow} ${styles.quoteItemRowLocked}`}>
                  <div className={styles.orderItemIdentity}>
                    <strong>{row.source}</strong>
                    <span>{row.piece} | {row.size} | {row.material}</span>
                  </div>
                  <div className={styles.quoteItemField}>
                    <select value={row.plan.status} disabled={savingItemId === row.item.id} onChange={(event) => updatePanelPlan(row, { status: event.target.value })}>
                      {ORDER_LINE_STATUSES.map((status) => <option key={status} value={status}>{titleCaseStatus(status)}</option>)}
                    </select>
                  </div>
                  <div className={styles.quoteItemField}><input value={row.plan.supplier_name || defaultSupplierForItem(row.item)} disabled={savingItemId === row.item.id} onChange={(event) => updatePanelPlanLocal(row, { supplier_name: event.target.value })} onBlur={(event) => updatePanelPlan(row, { supplier_name: event.target.value })} /></div>
                  <div className={styles.quoteItemField}><input value={row.plan.supplier_order_ref || ""} disabled={savingItemId === row.item.id} onChange={(event) => updatePanelPlanLocal(row, { supplier_order_ref: event.target.value })} onBlur={(event) => updatePanelPlan(row, { supplier_order_ref: event.target.value })} /></div>
                  <div className={styles.quoteItemField}><input type="date" value={row.plan.supplier_ordered_at || ""} disabled={savingItemId === row.item.id} onChange={(event) => updatePanelPlanLocal(row, { supplier_ordered_at: event.target.value })} onBlur={(event) => updatePanelPlan(row, { supplier_ordered_at: event.target.value })} /></div>
                  <div className={styles.quoteItemField}><input type="date" value={row.plan.supplier_eta || ""} disabled={savingItemId === row.item.id} onChange={(event) => updatePanelPlanLocal(row, { supplier_eta: event.target.value })} onBlur={(event) => updatePanelPlan(row, { supplier_eta: event.target.value })} /></div>
                  <div className={styles.quoteItemActions}><button type="button" className={styles.rowEditButton} onClick={() => openPanelNotes(row)}>{row.plan.notes ? "Edit notes" : "Add notes"}</button></div>
                </div>
              </div>
            ))}
            {!supplierMadeRows.length ? (
              <div className={styles.emptyState}><p>No supplier-made items yet.</p></div>
            ) : null}
        </div>
        <AdminTablePagination
          label="supplier-made items"
          page={supplierMadePagination.page}
          pageCount={supplierMadePagination.pageCount}
          totalItems={supplierMadePagination.totalItems}
          onPageChange={supplierMadePagination.setPage}
        />
      </div>
    );
  }

  function renderMadeInHouse() {
    return (
      <div className={`${styles.quoteItemsAdminWrap} ${styles.orderInHouseItems}`}>
        <div className={styles.quoteItemsScroller}>
          <div className={`${styles.quoteItemGrid} ${styles.quoteItemHead}`}>
            <div>Item</div>
            <div>Board required</div>
            <div>Supplier</div>
            <div>Supplier ref</div>
            <div>Ordered</div>
            <div>ETA</div>
            <div>Production stage</div>
            <div>Notes</div>
          </div>
            {madeInHousePagination.pageItems.map((row) => {
              const boardRequired = !!row.plan.board_required;
              return (
                <div className={styles.quoteItemBlock} key={row.key}>
                  <div className={`${styles.quoteItemGrid} ${styles.quoteItemRow} ${styles.quoteItemRowLocked}`}>
                    <div className={styles.orderItemIdentity}>
                      <strong>{row.source}</strong>
                      <span>{row.piece} | {row.size} | {row.material}</span>
                    </div>
                    <div className={styles.quoteItemField}>
                      <select value={boardRequired ? "yes" : "no"} disabled={savingItemId === row.item.id} onChange={(event) => updatePanelPlan(row, { board_required: event.target.value === "yes" })}>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                    <div className={styles.quoteItemField}><input value={boardRequired ? row.plan.supplier_name || defaultSupplierForItem(row.item) : ""} disabled={savingItemId === row.item.id || !boardRequired} onChange={(event) => updatePanelPlanLocal(row, { supplier_name: event.target.value })} onBlur={(event) => updatePanelPlan(row, { supplier_name: event.target.value })} /></div>
                    <div className={styles.quoteItemField}><input value={boardRequired ? row.plan.supplier_order_ref || "" : ""} disabled={savingItemId === row.item.id || !boardRequired} onChange={(event) => updatePanelPlanLocal(row, { supplier_order_ref: event.target.value })} onBlur={(event) => updatePanelPlan(row, { supplier_order_ref: event.target.value })} /></div>
                    <div className={styles.quoteItemField}><input type="date" value={boardRequired ? row.plan.supplier_ordered_at || "" : ""} disabled={savingItemId === row.item.id || !boardRequired} onChange={(event) => updatePanelPlanLocal(row, { supplier_ordered_at: event.target.value })} onBlur={(event) => updatePanelPlan(row, { supplier_ordered_at: event.target.value })} /></div>
                    <div className={styles.quoteItemField}><input type="date" value={boardRequired ? row.plan.supplier_eta || "" : ""} disabled={savingItemId === row.item.id || !boardRequired} onChange={(event) => updatePanelPlanLocal(row, { supplier_eta: event.target.value })} onBlur={(event) => updatePanelPlan(row, { supplier_eta: event.target.value })} /></div>
                    <div className={styles.quoteItemField}>
                      <select value={row.plan.production_stage} disabled={savingItemId === row.item.id} onChange={(event) => updatePanelPlan(row, { production_stage: event.target.value })}>
                        {ORDER_PRODUCTION_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                      </select>
                    </div>
                    <div className={styles.quoteItemActions}><button type="button" className={styles.rowEditButton} onClick={() => openPanelNotes(row)}>{row.plan.notes ? "Edit notes" : "Add notes"}</button></div>
                  </div>
                </div>
              );
            })}
            {!madeInHouseRows.length ? (
              <div className={styles.emptyState}><p>No made-in-house items yet.</p></div>
            ) : null}
        </div>
        <AdminTablePagination
          label="made-in-house items"
          page={madeInHousePagination.page}
          pageCount={madeInHousePagination.pageCount}
          totalItems={madeInHousePagination.totalItems}
          onPageChange={madeInHousePagination.setPage}
        />
      </div>
    );
  }

  function renderCutList() {
    const totalPieces = cutListRows.reduce((total, row) => total + Number(row.qty || 0), 0);

    return (
      <div className={`${styles.quoteItemsAdminWrap} ${styles.orderCutListItems}`}>
        <div className={styles.quoteBuilderSummaryLine}>
          <div className={styles.cutListSummaryText}>
            <span><strong>{cutListRows.length}</strong> cut list rows</span>
            <span><strong>{totalPieces}</strong> total pieces</span>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={isGeneratingCutListPdf || !cutListRows.length}
            onClick={generateCutListPdf}
          >
            {isGeneratingCutListPdf ? "Generating PDF..." : "Generate cut list PDF"}
          </button>
        </div>
        <div className={styles.quoteItemsScroller}>
          <div className={`${styles.quoteItemGrid} ${styles.quoteItemHead}`}>
            <div>#</div>
            <div>Source item</div>
            <div>Cabinet size</div>
            <div>Cut piece</div>
            <div>Qty</div>
            <div>Cut size</div>
            <div>Thickness</div>
            <div>Material / colour</div>
            <div>Edging</div>
            <div>Notes</div>
          </div>
            {cutListPagination.pageItems.map((row, index) => (
              <div className={styles.quoteItemBlock} key={row.key}>
                <div className={`${styles.quoteItemGrid} ${styles.quoteItemRow} ${styles.quoteItemRowLocked}`}>
                  <div><span className={styles.quoteItemRowNum}>{(cutListPagination.page - 1) * ADMIN_TABLE_PAGE_SIZE + index + 1}</span></div>
                  <div className={styles.quoteReadCell}>{row.source}</div>
                  <div className={styles.quoteReadCell}>{row.cabinet || "-"}</div>
                  <div className={styles.quoteReadCell}>{row.piece}</div>
                  <div className={styles.quoteReadCell}>{row.qty}</div>
                  <div className={styles.quoteReadCell}>{formatCutSize(row.width_mm, row.height_mm)}</div>
                  <div className={styles.quoteReadCell}>{row.thickness}</div>
                  <div className={styles.quoteReadCell}>{row.material}</div>
                  <div className={styles.quoteReadCell}>{row.edging}</div>
                  <div className={styles.quoteReadCell}>{row.notes || "-"}</div>
                </div>
              </div>
            ))}
            {!cutListRows.length ? (
              <div className={styles.emptyState}><p>No made-in-house items are ready for the cut list yet. Set items to Made in house on Item Planning.</p></div>
            ) : null}
        </div>
        <AdminTablePagination
          label="cut list rows"
          page={cutListPagination.page}
          pageCount={cutListPagination.pageCount}
          totalItems={cutListPagination.totalItems}
          onPageChange={cutListPagination.setPage}
        />
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

        <div className={`${styles.quoteItemsAdminWrap} ${styles.orderPaymentItems}`}>
          <div className={styles.quoteItemsScroller}>
            <div className={`${styles.quoteItemGrid} ${styles.quoteItemHead}`}>
              <div>Type</div>
              <div>Amount</div>
              <div>Status</div>
              <div>Date paid</div>
              <div>Notes</div>
              <div>Actions</div>
            </div>
              {paymentPagination.pageItems.map((payment) => (
                <div className={styles.quoteItemBlock} key={payment.id}>
                  <div className={`${styles.quoteItemGrid} ${styles.quoteItemRow} ${styles.quoteItemRowLocked}`}>
                  <div className={styles.quoteItemField}>
                    <select
                      value={payment.payment_type || "progress"}
                      disabled={savingPaymentId === payment.id}
                      onChange={(event) => updatePayment(payment, { payment_type: event.target.value })}
                    >
                      {paymentTypes.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.quoteItemField}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={payment.amount ?? ""}
                      disabled={savingPaymentId === payment.id}
                      onChange={(event) => updatePaymentLocal(payment.id, { amount: event.target.value })}
                      onBlur={(event) => updatePayment(payment, { amount: event.target.value || 0 })}
                    />
                  </div>
                  <div className={styles.quoteItemField}>
                    <select
                      value={payment.is_paid ? "paid" : "pending"}
                      disabled={savingPaymentId === payment.id}
                      onChange={(event) => updatePayment(payment, { is_paid: event.target.value === "paid" })}
                    >
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                  <div className={styles.quoteItemField}>
                    <input
                      type="date"
                      value={payment.paid_at || ""}
                      disabled={savingPaymentId === payment.id || !payment.is_paid}
                      onChange={(event) => updatePaymentLocal(payment.id, { paid_at: event.target.value })}
                      onBlur={(event) => updatePayment(payment, { paid_at: event.target.value })}
                    />
                  </div>
                  <div className={styles.quoteItemField}>
                    <input
                      value={payment.notes || ""}
                      disabled={savingPaymentId === payment.id}
                      onChange={(event) => updatePaymentLocal(payment.id, { notes: event.target.value })}
                      onBlur={(event) => updatePayment(payment, { notes: event.target.value })}
                    />
                  </div>
                  <div className={styles.quoteItemActions}>
                    <button
                      type="button"
                      className={styles.rowEditButton}
                      disabled={savingPaymentId === payment.id || payment.is_paid || Number(payment.amount || 0) <= 0}
                      onClick={() => requestPayment(payment)}
                    >
                      Request
                    </button>
                    <button
                      type="button"
                      className={`${styles.rowDeleteButton} ${styles.rowIconButton} ${styles.rowDeleteIconButton}`}
                      aria-label="Delete payment line"
                      title="Delete payment line"
                      disabled={savingPaymentId === payment.id}
                      onClick={() => deletePayment(payment)}
                    >
                      Delete
                    </button>
                  </div>
                  </div>
                </div>
              ))}
              {!payments.length ? (
                <div className={styles.emptyState}><p>No payment lines yet.</p></div>
              ) : null}
          </div>
          <AdminTablePagination
            label="payments"
            page={paymentPagination.page}
            pageCount={paymentPagination.pageCount}
            totalItems={paymentPagination.totalItems}
            onPageChange={paymentPagination.setPage}
          />
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

  function renderPanelNotesModal() {
    if (!panelNotesModal) return null;
    const row = panelNotesModal.row;

    return (
      <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Panel notes">
        <div className={`${styles.customerModal} ${styles.paymentModal}`}>
          <header className={styles.customerModalHeader}>
            <div className={styles.customerModalIcon}>NOTE</div>
            <div>
              <p className={styles.tableMeta}>{row.source}</p>
              <h2>{row.piece}</h2>
            </div>
          </header>
          <div className={styles.customerModalBody}>
            <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
              Notes
              <textarea
                className={styles.textareaInput}
                rows={6}
                value={panelNotesModal.notes}
                onChange={(event) => setPanelNotesModal((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
          </div>
          <footer className={styles.customerModalFooter}>
            <button type="button" className={styles.secondaryButton} onClick={() => setPanelNotesModal(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={savingItemId === row.item.id}
              onClick={async () => {
                await updatePanelPlan(row, { notes: panelNotesModal.notes });
                setPanelNotesModal(null);
              }}
            >
              Save notes
            </button>
          </footer>
        </div>
      </div>
    );
  }

  function renderActivity() {
    return (
      <section className={styles.activityLogShell}>
        <div className={styles.activityLogHeader}>
          <div>
            <p className={styles.tableMeta}>Order history</p>
            <h2>Activity log</h2>
          </div>
          <span className={styles.projectListMetric}>{activity.length} entries</span>
        </div>

        <div className={styles.activityLogList}>
          <div className={styles.activityLogTableHead}>
            <span>Event</span>
            <span>Details</span>
            <span>Source</span>
            <span>Activity</span>
            <span>Date</span>
          </div>
          {activityPagination.pageItems.map((entry) => (
            <article className={styles.activityLogItem} key={entry.id}>
              <div className={styles.activityLogEvent}>
                <span className={styles.activityLogMarker} aria-hidden="true" />
                <strong>{entry.title}</strong>
              </div>
              <p className={styles.activityLogDescription}>{entry.description || "-"}</p>
              <span className={styles.activityLogPill}>{activityActorLabel(entry.actor_type)}</span>
              <span className={styles.activityLogPill}>{titleCaseStatus(entry.action_type)}</span>
              <time className={styles.activityLogDate} dateTime={entry.created_at || undefined}>
                {formatDateTime(entry.created_at)}
              </time>
            </article>
          ))}
          {!activity.length ? (
            <div className={styles.emptyState}>
              <p>No activity has been recorded for this order yet.</p>
            </div>
          ) : null}
        </div>
        <AdminTablePagination
          label="activity entries"
          page={activityPagination.page}
          pageCount={activityPagination.pageCount}
          totalItems={activityPagination.totalItems}
          onPageChange={activityPagination.setPage}
        />
      </section>
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
    if (activeSection === "quoteSummary") return renderQuoteSummary();
    if (activeSection === "items") return renderItems();
    if (activeSection === "supplierMade") return renderSupplierMade();
    if (activeSection === "madeInHouse") return renderMadeInHouse();
    if (activeSection === "cutList") return renderCutList();
    if (activeSection === "payments") return renderPayments();
    if (activeSection === "activity") return renderActivity();
    if (activeSection === "notes") return renderNotes();
    return renderOverview();
  }

  const activeLabel = sections.find((section) => section.key === activeSection)?.label || "Overview";

  return (
    <div className={styles.orderDetailPage}>
      <div className={`${styles.quoteBuilderFrame} ${styles.orderDetailFrame}`}>
        <section className={`${styles.quoteBuilderPanel} ${styles.orderDetailPanel}`}>
          <header className={`${styles.quoteBuilderPanelHeader} ${styles.orderDetailPanelHeader}`}>
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

          <div className={`${styles.quoteBuilderPanelBody} ${styles.orderDetailPanelBody}`}>
            {renderSection()}
            {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
          </div>
        </section>
        {renderPaymentModal()}
        {renderPanelNotesModal()}
      </div>
      <div className={styles.orderDetailBottomSpacer} aria-hidden="true" />
    </div>
  );
}
