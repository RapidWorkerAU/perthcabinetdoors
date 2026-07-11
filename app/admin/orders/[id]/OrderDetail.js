"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_BUSINESS_DEFAULTS,
  formatMoney,
  ORDER_LINE_STATUSES,
  ORDER_PRODUCTION_STAGES,
  ORDER_STATUSES,
} from "../../../../lib/pcd-quote-utils";
import { Modal } from '@/components/ui/Modal';
import { useToast } from "@/components/ui/Toast";
import styles from "../../admin-content.module.css";
import { AdminPagination, useAdminPagination } from "../../_components/AdminPagination";

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

function activityDescriptionLabel(label) {
  return String(label || "")
    .replace(/\bEx Gst\b/g, "ex GST")
    .replace(/\bInc Gst\b/g, "inc GST")
    .replace(/\bGst\b/g, "GST");
}

function activityDescriptionValue(label, value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "blank") return "blank";
  if (/(amount|cost|total|subtotal|gst|rate|price|payment|deposit|markup)/i.test(label) && Number.isFinite(Number(trimmed))) {
    if (/percent/i.test(label)) return `${Number(trimmed).toFixed(2).replace(/\.00$/, "")}%`;
    return formatMoney(Number(trimmed), "AUD");
  }
  return trimmed;
}

function formatActivityDescription(description) {
  if (!description) return "-";
  const parts = String(description)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const readableParts = parts.map((part) => {
    const match = part.match(/^([^:]+):\s*(.*?)\s*->\s*(.*)$/);
    if (!match) return part;
    const label = activityDescriptionLabel(match[1]);
    const before = activityDescriptionValue(label, match[2]);
    const after = activityDescriptionValue(label, match[3]);
    return `${label} changed from ${before} to ${after}`;
  });

  return readableParts.join("; ");
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
  const { toast } = useToast();
  const [colourSupplierMap, setColourSupplierMap] = useState({});
  const [paymentModal, setPaymentModal] = useState(null);
  const [paymentRequestModal, setPaymentRequestModal] = useState(null);
  const [panelNotesModal, setPanelNotesModal] = useState(null);

  // On mobile, open the section menu first rather than dropping straight into
  // the Overview (customer detail). Runs once on mount, before the loading gate
  // clears, so there's no flash of the Overview.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setActiveSection("");
    }
  }, []);

  const items = useMemo(() => sortedItems(order), [order]);
  const planningRows = useMemo(() => buildOrderPlanningRows(items), [items]);
  const supplierMadeRows = useMemo(() => planningRows.filter((row) => !isPanelMadeInHouse(row)), [planningRows]);
  const madeInHouseRows = useMemo(() => planningRows.filter(isPanelMadeInHouse), [planningRows]);
  const cutListRows = useMemo(() => planningRows.filter(isPanelMadeInHouse), [planningRows]);
  const quoteLines = useMemo(() => sortedQuoteLines(order), [order]);
  const payments = useMemo(() => sortedPayments(order), [order]);
  const activity = useMemo(() => sortedActivity(order), [order]);
  const planningPagination = useAdminPagination(planningRows);
  const supplierMadePagination = useAdminPagination(supplierMadeRows);
  const madeInHousePagination = useAdminPagination(madeInHouseRows);
  const cutListPagination = useAdminPagination(cutListRows);
  const paymentPagination = useAdminPagination(payments);
  const activityPagination = useAdminPagination(activity);
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

  const tw = {
    card: "bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden mb-3",
    cardHeader: "px-4 py-3 border-b border-[#edf4eb] flex items-center justify-between",
    cardTitle: "text-[13px] font-semibold text-[#1a1a18]",
    cardBody: "px-4 py-4",
    grid2: "grid grid-cols-2 gap-3",
    fieldLabel: "flex flex-col gap-1 text-[11px] font-medium text-[#5a5a52]",
    fieldInput: "h-[34px] w-full border border-[#dbd8cc] rounded-[6px] px-3 text-[13px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61]",
    primaryBtn: "h-[34px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors",
    secondaryBtn: "h-[34px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors",
    smBtn: "h-[26px] px-3 text-[11px] font-medium rounded-[6px] border border-[#dbd8cc] bg-white text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors",
    dangerBtn: "h-[26px] px-3 text-[11px] font-medium rounded-[6px] border border-[#fca5a5] bg-white text-[#991b1b] hover:bg-[#fef2f2] disabled:opacity-50 transition-colors",
    muted: "text-[11px] text-[#8b8a81]",
    mono: "font-mono",
    pill: "inline-flex items-center px-2 py-[2px] rounded-full text-[10px] font-medium border",
    tableWrap: "overflow-x-auto",
    table: "w-full text-[13px] border-collapse",
    th: "text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52] px-4 py-[9px] border-b border-[#dbd8cc] bg-[#f5f8f4] whitespace-nowrap",
    td: "px-4 py-[11px] border-b border-[#edf4eb] text-[#1a1a18] align-middle",
    tdLast: "px-4 py-[11px] text-[#1a1a18] align-middle",
    inlineInput: "h-[28px] w-full border border-[#dbd8cc] rounded-[4px] px-2 text-[12px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] disabled:bg-[#f5f8f4] disabled:text-[#8b8a81]",
    inlineSelect: "h-[28px] w-full border border-[#dbd8cc] rounded-[4px] px-2 text-[12px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] disabled:bg-[#f5f8f4] disabled:text-[#8b8a81]",
    totalRow: "flex justify-between items-center py-[5px] border-b border-[#edf4eb] text-[12px] last:border-0",
    saveBar: "flex justify-end pt-3 border-t border-[#edf4eb] mt-3",
  }

  async function loadOrder() {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not load order.", variant: "error" });
        return;
      }
      setOrder(payload.order);
    } catch (error) {
      toast({ title: error?.message || "Could not load order.", variant: "error" });
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
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not update order.", variant: "error" });
        return;
      }
      setOrder(payload.order);
      toast({ title: "Order updated.", variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not update order.", variant: "error" });
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
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payment),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not add payment.", variant: "error" });
        return;
      }
      setOrder((current) => {
        if (!current) return current;
        const nextPayments = [...(current.pcd_order_payments || []), payload.payment];
        return withSyncedDepositFields(current, nextPayments);
      });
      setPaymentModal(null);
      toast({ title: "Payment line added.", variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not add payment.", variant: "error" });
    } finally {
      setSavingPaymentId("");
    }
  }

  async function updatePayment(payment, changes) {
    if (!order) return;
    const previousOrder = order;
    setSavingPaymentId(payment.id);
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
        toast({ title: payload.error || "Could not update payment.", variant: "error" });
        return;
      }
      setOrder((current) => {
        if (!current) return current;
        const nextPayments = (current.pcd_order_payments || []).map((item) =>
          item.id === payment.id ? payload.payment : item
        );
        return withSyncedDepositFields(current, nextPayments);
      });
      toast({ title: "Payment line updated.", variant: "success" });
    } catch (error) {
      setOrder(previousOrder);
      toast({ title: error?.message || "Could not update payment.", variant: "error" });
    } finally {
      setSavingPaymentId("");
    }
  }

  async function deletePayment(payment) {
    if (!order) return;
    const previousOrder = order;
    setSavingPaymentId(payment.id);
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
        toast({ title: payload.error || "Could not delete payment.", variant: "error" });
        return;
      }
      setOrder((current) => {
        if (!current) return current;
        return withSyncedDepositFields(current, current.pcd_order_payments || []);
      });
      toast({ title: "Payment line deleted.", variant: "success" });
    } catch (error) {
      setOrder(previousOrder);
      toast({ title: error?.message || "Could not delete payment.", variant: "error" });
    } finally {
      setSavingPaymentId("");
    }
  }


  async function requestPayment(payment, emailData) {
    if (!order || !payment?.id) return;
    const { message, subject } = emailData || {};
    setSavingPaymentId(payment.id);
    try {
      const hasData = message || subject;
      const body = hasData ? JSON.stringify({ message, subject }) : undefined;
      const response = await fetch(`/api/admin/orders/${orderId}/payments/${payment.id}/request`, {
        method: "POST",
        ...(body ? { headers: { "Content-Type": "application/json" }, body } : {}),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not request payment.", variant: "error" });
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
      toast({ title: payload.emailSent ? "Payment request sent to customer." : `Payment request created. Email is not configured, use this link: ${payload.checkoutUrl}`, variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not request payment.", variant: "error" });
    } finally {
      setSavingPaymentId("");
    }
  }

  async function generateCutListPdf() {
    setIsGeneratingCutListPdf(true);
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
      toast({ title: error?.message || "Could not generate cut list PDF.", variant: "error" });
    } finally {
      setIsGeneratingCutListPdf(false);
    }
  }

  async function updateItem(item, changes) {
    if (!order) return;
    const nextItem = { ...item, ...changes };
    const previousOrder = order;
    setSavingItemId(item.id);
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
        toast({ title: payload.error || "Could not update order item.", variant: "error" });
        return;
      }
      setOrder((current) => (current ? setOrderItem(current, item.id, payload.item) : current));
      toast({ title: "Order item updated.", variant: "success" });
    } catch (error) {
      setOrder(previousOrder);
      toast({ title: error?.message || "Could not update order item.", variant: "error" });
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
  if (!order) return <section className={styles.emptyState}><p>Order not found.</p></section>;

  function renderOverview() {
    return (
      <div>
        <div className={tw.card}>
          <div className={tw.cardHeader}>
            <span className={tw.cardTitle}>Order details</span>
            {order.status && (
              <span className={`${tw.pill} ${
                order.status === 'active' || order.status === 'complete'
                  ? 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]'
                  : order.status === 'on_hold'
                  ? 'bg-[#fff8df] text-[#5c4200] border-[#f0d060]'
                  : 'bg-[#fef2f2] text-[#991b1b] border-[#fca5a5]'
              }`}>
                {titleCaseStatus(order.status)}
              </span>
            )}
          </div>
          <div className={tw.cardBody}>
            <div className={tw.grid2}>
              <label className={tw.fieldLabel}>
                Job name
                <input
                  className={tw.fieldInput}
                  value={order.name || ""}
                  onChange={e => updateOrderField("name", e.target.value)}
                  onBlur={e => saveOrder({ name: e.target.value })}
                />
              </label>
              <label className={tw.fieldLabel}>
                Order status
                <select
                  className={tw.fieldInput}
                  value={order.status || "active"}
                  onChange={e => saveOrder({ status: e.target.value })}
                  disabled={isSavingOrder}
                >
                  {ORDER_STATUSES.map(s => <option key={s} value={s}>{titleCaseStatus(s)}</option>)}
                </select>
              </label>
              <label className={tw.fieldLabel}>
                Target completion
                <input
                  className={tw.fieldInput}
                  type="date"
                  value={order.target_completion_date || ""}
                  onChange={e => updateOrderField("target_completion_date", e.target.value)}
                  onBlur={e => saveOrder({ target_completion_date: e.target.value })}
                />
              </label>
            </div>
          </div>
        </div>

        <div className={tw.card}>
          <div className={tw.cardHeader}><span className={tw.cardTitle}>Customer contact</span></div>
          <div className={tw.cardBody}>
            <div className={tw.grid2}>
              <label className={tw.fieldLabel}>
                Customer name
                <input className={tw.fieldInput} value={order.customer_name || ""} onChange={e => updateOrderField("customer_name", e.target.value)} onBlur={e => saveOrder({ customer_name: e.target.value })} />
              </label>
              <label className={tw.fieldLabel}>
                Email
                <input className={tw.fieldInput} type="email" value={order.customer_email || ""} onChange={e => updateOrderField("customer_email", e.target.value)} onBlur={e => saveOrder({ customer_email: e.target.value })} />
              </label>
              <label className={tw.fieldLabel}>
                Phone
                <input className={tw.fieldInput} value={order.customer_phone || ""} onChange={e => updateOrderField("customer_phone", e.target.value)} onBlur={e => saveOrder({ customer_phone: e.target.value })} />
              </label>
              <label className={tw.fieldLabel}>
                Site / delivery address
                <input className={tw.fieldInput} value={order.site_address || ""} onChange={e => updateOrderField("site_address", e.target.value)} onBlur={e => saveOrder({ site_address: e.target.value })} />
              </label>
            </div>
            <p className={tw.muted + " mt-3"}>Fields save automatically when you leave them.</p>
          </div>
        </div>
      </div>
    );
  }

  function renderQuoteSummary() {
    const quote = order.pcd_quote || order;
    const quoteCurrency = quote.currency || "AUD";
    return (
      <div>
        <div className="mb-3 px-3 py-2 bg-[#edf4eb] border border-[#a8c5a0] rounded-[6px] text-[12px] text-[#2d5e28]">
          Read only — edit line items in the original quote.
        </div>

        <div className={tw.card}>
          <div className={tw.cardHeader}>
            <span className={tw.cardTitle}>Line items</span>
            <span className={tw.muted}>{quoteLines.length} {quoteLines.length === 1 ? "line" : "lines"}</span>
          </div>
          <div className={tw.tableWrap}>
            <table className={tw.table}>
              <thead>
                <tr>
                  {["#","Type","Material / colour","Size","Qty","Edge","Drill?","Supply?","Hinge qty","Unit cost","Markup","Unit price","Total ex GST"].map(h => (
                    <th key={h} className={tw.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quoteLines.map((line, index) => {
                  const showProfiles = line.material === "Thermolaminate";
                  const hingesApplicable = line.product_type === "Door";
                  return (
                    <tr key={line.id || index}>
                      <td className={tw.td}>{index + 1}</td>
                      <td className={tw.td}>{lineValue(quoteLineTitle(line))}</td>
                      <td className={tw.td}>{[lineValue(line.material), lineValue(line.colour)].filter(v => v !== "-").join(" — ") || "—"}</td>
                      <td className={tw.td + " whitespace-nowrap"}>{lineValue(quoteLineSize(line))}</td>
                      <td className={tw.td}>{line.qty || 1}</td>
                      <td className={tw.td}>{lineValue(line.edge_mould)}</td>
                      <td className={tw.td}>{hingesApplicable ? (line.hinge_holes ? "Yes" : "No") : "N/A"}</td>
                      <td className={tw.td}>{hingesApplicable ? (line.hinge_supply ? "Yes" : "No") : "N/A"}</td>
                      <td className={tw.td}>{hingesApplicable && (line.hinge_supply || line.hinge_holes) ? lineValue(line.hinge_qty) : "N/A"}</td>
                      <td className={tw.td + " " + tw.mono}>{formatMoney(line.product_unit_cost_ex_gst || 0, quoteCurrency)}</td>
                      <td className={tw.td + " " + tw.mono}>{line.markup_percent ?? DEFAULT_BUSINESS_DEFAULTS.markup_percent}%</td>
                      <td className={tw.td + " " + tw.mono}>{formatMoney(line.unit_price_ex_gst || 0, quoteCurrency)}</td>
                      <td className={tw.tdLast + " " + tw.mono + " font-semibold"}>{formatMoney(line.line_total_ex_gst || 0, quoteCurrency)}</td>
                    </tr>
                  );
                })}
                {!quoteLines.length && (
                  <tr><td colSpan={13} className="py-8 text-center text-[12px] text-[#8b8a81]">No quote line items found for this order.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#edf4eb] border border-[#a8c5a0] rounded-[8px] p-4 max-w-xs ml-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6b9e61] mb-2">Quote totals</p>
          <div className={tw.totalRow}><span className="text-[#5a5a52]">Subtotal ex GST</span><strong className={tw.mono}>{formatMoney(quote.subtotal_ex_gst, quoteCurrency)}</strong></div>
          <div className={tw.totalRow}><span className="text-[#5a5a52]">GST</span><strong className={tw.mono}>{formatMoney(quote.gst_amount, quoteCurrency)}</strong></div>
          <div className="flex justify-between items-center pt-2 mt-1">
            <span className="text-[14px] font-semibold text-[#2d5e28]">Total inc GST</span>
            <strong className="text-[18px] font-semibold text-[#1a1a18] font-mono">{formatMoney(quote.total_inc_gst, quoteCurrency)}</strong>
          </div>
        </div>
      </div>
    );
  }

  function renderItems() {
    return (
      <div className={tw.card}>
        <div className="hidden md:block">
          <div className={tw.tableWrap}>
            <table className={tw.table}>
              <thead>
                <tr>
                  {["Item","Cabinet","Panel / piece","Qty","Size","Material","Fulfilment"].map(h => (
                    <th key={h} className={tw.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planningPagination.pageItems.map(row => {
                  const item = row.item;
                  const thermolaminated = isThermolaminatedItem(item);
                  return (
                    <tr key={row.key}>
                      <td className={tw.td}>
                        <p className="text-[12px] font-semibold text-[#1a1a18]">{row.source}</p>
                        <p className={tw.muted}>{itemMeta(item) || "No item details recorded"}</p>
                      </td>
                      <td className={tw.td + " whitespace-nowrap"}>{row.cabinet || "—"}</td>
                      <td className={tw.td}>{row.piece}</td>
                      <td className={tw.td}>{row.qty}</td>
                      <td className={tw.td + " whitespace-nowrap"}>{row.size}</td>
                      <td className={tw.td}>{row.material}</td>
                      <td className={tw.tdLast}>
                        <select
                          className={tw.inlineSelect}
                          style={{minWidth: "160px"}}
                          value={row.plan.fulfilment_method}
                          disabled={savingItemId === item.id || thermolaminated}
                          onChange={e => updatePanelPlan(row, { fulfilment_method: e.target.value })}
                        >
                          <option value="in_house">Made in house</option>
                          <option value="supplier_ready_made">Supplier ready made</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {!planningRows.length && (
                  <tr><td colSpan={7} className="py-8 text-center text-[12px] text-[#8b8a81]">No order items yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <AdminPagination
            label="planning rows"
            page={planningPagination.page}
            pageCount={planningPagination.pageCount}
            totalItems={planningPagination.totalItems}
            onPageChange={planningPagination.setPage}
          />
        </div>
        <div className="md:hidden flex flex-col gap-3 p-3">
          {planningPagination.pageItems.map(row => {
            const item = row.item;
            const thermolaminated = isThermolaminatedItem(item);
            return (
              <article key={row.key} className="bg-white border border-[#dbd8cc] rounded-[8px] p-4">
                <div className="mb-2">
                  <p className="text-[13px] font-semibold text-[#1a1a18]">{row.source}</p>
                  <p className="text-[11px] text-[#8b8a81]">{itemMeta(item) || "No item details recorded"}</p>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                  <div><dt className="text-[#8b8a81]">Cabinet</dt><dd className="text-[#1a1a18]">{row.cabinet || "—"}</dd></div>
                  <div><dt className="text-[#8b8a81]">Panel / piece</dt><dd className="text-[#1a1a18]">{row.piece}</dd></div>
                  <div><dt className="text-[#8b8a81]">Qty</dt><dd className="text-[#1a1a18]">{row.qty}</dd></div>
                  <div><dt className="text-[#8b8a81]">Size</dt><dd className="text-[#1a1a18]">{row.size}</dd></div>
                  <div className="col-span-2"><dt className="text-[#8b8a81]">Material</dt><dd className="text-[#1a1a18]">{row.material}</dd></div>
                </dl>
                <div className="pt-3 mt-3 border-t border-[#edf4eb]">
                  <select
                    className={tw.inlineSelect}
                    value={row.plan.fulfilment_method}
                    disabled={savingItemId === item.id || thermolaminated}
                    onChange={e => updatePanelPlan(row, { fulfilment_method: e.target.value })}
                  >
                    <option value="in_house">Made in house</option>
                    <option value="supplier_ready_made">Supplier ready made</option>
                  </select>
                </div>
              </article>
            );
          })}
          {!planningRows.length && (
            <p className="py-8 text-center text-[12px] text-[#8b8a81]">No order items yet.</p>
          )}
          <AdminPagination label="planning rows" page={planningPagination.page} pageCount={planningPagination.pageCount} totalItems={planningPagination.totalItems} onPageChange={planningPagination.setPage} />
        </div>
      </div>
    );
  }

  function renderSupplierMade() {
    return (
      <div className={tw.card}>
        <div className="hidden md:block">
          <div className={tw.tableWrap}>
            <table className={tw.table}>
              <thead>
                <tr>
                  {["Item","Order status","Supplier","Ref","Ordered","ETA","Notes"].map(h => (
                    <th key={h} className={tw.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supplierMadePagination.pageItems.map(row => (
                  <tr key={row.key}>
                    <td className={tw.td}>
                      <p className="text-[12px] font-semibold text-[#1a1a18]">{row.source}</p>
                      <p className={tw.muted}>{row.piece} · {row.size} · {row.material}</p>
                    </td>
                    <td className={tw.td}>
                      <select
                        className={tw.inlineSelect}
                        style={{minWidth: "120px"}}
                        value={row.plan.status}
                        disabled={savingItemId === row.item.id}
                        onChange={e => updatePanelPlan(row, { status: e.target.value })}
                      >
                        {ORDER_LINE_STATUSES.map(s => <option key={s} value={s}>{titleCaseStatus(s)}</option>)}
                      </select>
                    </td>
                    <td className={tw.td}>
                      <input
                        className={tw.inlineInput}
                        style={{minWidth: "100px"}}
                        value={row.plan.supplier_name || defaultSupplierForItem(row.item)}
                        disabled={savingItemId === row.item.id}
                        onChange={e => updatePanelPlanLocal(row, { supplier_name: e.target.value })}
                        onBlur={e => updatePanelPlan(row, { supplier_name: e.target.value })}
                      />
                    </td>
                    <td className={tw.td}>
                      <input
                        className={tw.inlineInput}
                        style={{minWidth: "100px"}}
                        value={row.plan.supplier_order_ref || ""}
                        disabled={savingItemId === row.item.id}
                        onChange={e => updatePanelPlanLocal(row, { supplier_order_ref: e.target.value })}
                        onBlur={e => updatePanelPlan(row, { supplier_order_ref: e.target.value })}
                      />
                    </td>
                    <td className={tw.td}>
                      <input
                        className={tw.inlineInput}
                        type="date"
                        style={{minWidth: "130px"}}
                        value={row.plan.supplier_ordered_at || ""}
                        disabled={savingItemId === row.item.id}
                        onChange={e => updatePanelPlanLocal(row, { supplier_ordered_at: e.target.value })}
                        onBlur={e => updatePanelPlan(row, { supplier_ordered_at: e.target.value })}
                      />
                    </td>
                    <td className={tw.td}>
                      <input
                        className={tw.inlineInput}
                        type="date"
                        style={{minWidth: "130px"}}
                        value={row.plan.supplier_eta || ""}
                        disabled={savingItemId === row.item.id}
                        onChange={e => updatePanelPlanLocal(row, { supplier_eta: e.target.value })}
                        onBlur={e => updatePanelPlan(row, { supplier_eta: e.target.value })}
                      />
                    </td>
                    <td className={tw.tdLast}>
                      <button
                        type="button"
                        className={tw.smBtn}
                        onClick={() => openPanelNotes(row)}
                      >
                        {row.plan.notes ? "Edit notes" : "Add notes"}
                      </button>
                    </td>
                  </tr>
                ))}
                {!supplierMadeRows.length && (
                  <tr><td colSpan={7} className="py-8 text-center text-[12px] text-[#8b8a81]">No supplier-made items yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <AdminPagination
            label="supplier-made items"
            page={supplierMadePagination.page}
            pageCount={supplierMadePagination.pageCount}
            totalItems={supplierMadePagination.totalItems}
            onPageChange={supplierMadePagination.setPage}
          />
        </div>
        <div className="md:hidden flex flex-col gap-3 p-3">
          {supplierMadePagination.pageItems.map(row => (
            <article key={row.key} className="bg-white border border-[#dbd8cc] rounded-[8px] p-4">
              <div className="mb-3">
                <p className="text-[13px] font-semibold text-[#1a1a18]">{row.source}</p>
                <p className="text-[11px] text-[#8b8a81]">{row.piece} · {row.size} · {row.material}</p>
              </div>
              <div className="flex flex-col gap-2">
                <label className={tw.fieldLabel}>
                  Order status
                  <select className={tw.inlineSelect} value={row.plan.status} disabled={savingItemId === row.item.id} onChange={e => updatePanelPlan(row, { status: e.target.value })}>
                    {ORDER_LINE_STATUSES.map(s => <option key={s} value={s}>{titleCaseStatus(s)}</option>)}
                  </select>
                </label>
                <label className={tw.fieldLabel}>
                  Supplier
                  <input className={tw.inlineInput} value={row.plan.supplier_name || defaultSupplierForItem(row.item)} disabled={savingItemId === row.item.id} onChange={e => updatePanelPlanLocal(row, { supplier_name: e.target.value })} onBlur={e => updatePanelPlan(row, { supplier_name: e.target.value })} />
                </label>
                <label className={tw.fieldLabel}>
                  Ref
                  <input className={tw.inlineInput} value={row.plan.supplier_order_ref || ""} disabled={savingItemId === row.item.id} onChange={e => updatePanelPlanLocal(row, { supplier_order_ref: e.target.value })} onBlur={e => updatePanelPlan(row, { supplier_order_ref: e.target.value })} />
                </label>
                <label className={tw.fieldLabel}>
                  Ordered date
                  <input className={tw.inlineInput} type="date" value={row.plan.supplier_ordered_at || ""} disabled={savingItemId === row.item.id} onChange={e => updatePanelPlanLocal(row, { supplier_ordered_at: e.target.value })} onBlur={e => updatePanelPlan(row, { supplier_ordered_at: e.target.value })} />
                </label>
                <label className={tw.fieldLabel}>
                  ETA
                  <input className={tw.inlineInput} type="date" value={row.plan.supplier_eta || ""} disabled={savingItemId === row.item.id} onChange={e => updatePanelPlanLocal(row, { supplier_eta: e.target.value })} onBlur={e => updatePanelPlan(row, { supplier_eta: e.target.value })} />
                </label>
              </div>
              <div className="pt-3 mt-3 border-t border-[#edf4eb]">
                <button type="button" className={tw.smBtn} onClick={() => openPanelNotes(row)}>{row.plan.notes ? "Edit notes" : "Add notes"}</button>
              </div>
            </article>
          ))}
          {!supplierMadeRows.length && (
            <p className="py-8 text-center text-[12px] text-[#8b8a81]">No supplier-made items yet.</p>
          )}
          <AdminPagination label="supplier-made items" page={supplierMadePagination.page} pageCount={supplierMadePagination.pageCount} totalItems={supplierMadePagination.totalItems} onPageChange={supplierMadePagination.setPage} />
        </div>
      </div>
    );
  }

  function renderMadeInHouse() {
    return (
      <div className={tw.card}>
        <div className="hidden md:block">
          <div className={tw.tableWrap}>
            <table className={tw.table}>
              <thead>
                <tr>
                  {["Item","Board required","Supplier","Ref","Ordered","ETA","Production stage","Notes"].map(h => (
                    <th key={h} className={tw.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {madeInHousePagination.pageItems.map(row => {
                  const boardRequired = !!row.plan.board_required;
                  return (
                    <tr key={row.key}>
                      <td className={tw.td}>
                        <p className="text-[12px] font-semibold text-[#1a1a18]">{row.source}</p>
                        <p className={tw.muted}>{row.piece} · {row.size} · {row.material}</p>
                      </td>
                      <td className={tw.td}>
                        <select
                          className={tw.inlineSelect}
                          style={{minWidth: "70px"}}
                          value={boardRequired ? "yes" : "no"}
                          disabled={savingItemId === row.item.id}
                          onChange={e => updatePanelPlan(row, { board_required: e.target.value === "yes" })}
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </td>
                      <td className={tw.td}>
                        <input
                          className={tw.inlineInput}
                          style={{minWidth: "90px"}}
                          value={boardRequired ? row.plan.supplier_name || defaultSupplierForItem(row.item) : ""}
                          disabled={savingItemId === row.item.id || !boardRequired}
                          onChange={e => updatePanelPlanLocal(row, { supplier_name: e.target.value })}
                          onBlur={e => updatePanelPlan(row, { supplier_name: e.target.value })}
                        />
                      </td>
                      <td className={tw.td}>
                        <input
                          className={tw.inlineInput}
                          style={{minWidth: "90px"}}
                          value={boardRequired ? row.plan.supplier_order_ref || "" : ""}
                          disabled={savingItemId === row.item.id || !boardRequired}
                          onChange={e => updatePanelPlanLocal(row, { supplier_order_ref: e.target.value })}
                          onBlur={e => updatePanelPlan(row, { supplier_order_ref: e.target.value })}
                        />
                      </td>
                      <td className={tw.td}>
                        <input
                          className={tw.inlineInput}
                          type="date"
                          style={{minWidth: "130px"}}
                          value={boardRequired ? row.plan.supplier_ordered_at || "" : ""}
                          disabled={savingItemId === row.item.id || !boardRequired}
                          onChange={e => updatePanelPlanLocal(row, { supplier_ordered_at: e.target.value })}
                          onBlur={e => updatePanelPlan(row, { supplier_ordered_at: e.target.value })}
                        />
                      </td>
                      <td className={tw.td}>
                        <input
                          className={tw.inlineInput}
                          type="date"
                          style={{minWidth: "130px"}}
                          value={boardRequired ? row.plan.supplier_eta || "" : ""}
                          disabled={savingItemId === row.item.id || !boardRequired}
                          onChange={e => updatePanelPlanLocal(row, { supplier_eta: e.target.value })}
                          onBlur={e => updatePanelPlan(row, { supplier_eta: e.target.value })}
                        />
                      </td>
                      <td className={tw.td}>
                        <select
                          className={tw.inlineSelect}
                          style={{minWidth: "140px"}}
                          value={row.plan.production_stage}
                          disabled={savingItemId === row.item.id}
                          onChange={e => updatePanelPlan(row, { production_stage: e.target.value })}
                        >
                          {ORDER_PRODUCTION_STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                        </select>
                      </td>
                      <td className={tw.tdLast}>
                        <button
                          type="button"
                          className={tw.smBtn}
                          onClick={() => openPanelNotes(row)}
                        >
                          {row.plan.notes ? "Edit notes" : "Add notes"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!madeInHouseRows.length && (
                  <tr><td colSpan={8} className="py-8 text-center text-[12px] text-[#8b8a81]">No made-in-house items yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <AdminPagination
            label="made-in-house items"
            page={madeInHousePagination.page}
            pageCount={madeInHousePagination.pageCount}
            totalItems={madeInHousePagination.totalItems}
            onPageChange={madeInHousePagination.setPage}
          />
        </div>
        <div className="md:hidden flex flex-col gap-3 p-3">
          {madeInHousePagination.pageItems.map(row => {
            const boardRequired = !!row.plan.board_required;
            return (
              <article key={row.key} className="bg-white border border-[#dbd8cc] rounded-[8px] p-4">
                <div className="mb-3">
                  <p className="text-[13px] font-semibold text-[#1a1a18]">{row.source}</p>
                  <p className="text-[11px] text-[#8b8a81]">{row.piece} · {row.size} · {row.material}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <label className={tw.fieldLabel}>
                    Board required
                    <select className={tw.inlineSelect} value={boardRequired ? "yes" : "no"} disabled={savingItemId === row.item.id} onChange={e => updatePanelPlan(row, { board_required: e.target.value === "yes" })}>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                  <label className={tw.fieldLabel}>
                    Supplier
                    <input className={tw.inlineInput} value={boardRequired ? row.plan.supplier_name || defaultSupplierForItem(row.item) : ""} disabled={savingItemId === row.item.id || !boardRequired} onChange={e => updatePanelPlanLocal(row, { supplier_name: e.target.value })} onBlur={e => updatePanelPlan(row, { supplier_name: e.target.value })} />
                  </label>
                  <label className={tw.fieldLabel}>
                    Ref
                    <input className={tw.inlineInput} value={boardRequired ? row.plan.supplier_order_ref || "" : ""} disabled={savingItemId === row.item.id || !boardRequired} onChange={e => updatePanelPlanLocal(row, { supplier_order_ref: e.target.value })} onBlur={e => updatePanelPlan(row, { supplier_order_ref: e.target.value })} />
                  </label>
                  <label className={tw.fieldLabel}>
                    Ordered date
                    <input className={tw.inlineInput} type="date" value={boardRequired ? row.plan.supplier_ordered_at || "" : ""} disabled={savingItemId === row.item.id || !boardRequired} onChange={e => updatePanelPlanLocal(row, { supplier_ordered_at: e.target.value })} onBlur={e => updatePanelPlan(row, { supplier_ordered_at: e.target.value })} />
                  </label>
                  <label className={tw.fieldLabel}>
                    ETA
                    <input className={tw.inlineInput} type="date" value={boardRequired ? row.plan.supplier_eta || "" : ""} disabled={savingItemId === row.item.id || !boardRequired} onChange={e => updatePanelPlanLocal(row, { supplier_eta: e.target.value })} onBlur={e => updatePanelPlan(row, { supplier_eta: e.target.value })} />
                  </label>
                  <label className={tw.fieldLabel}>
                    Production stage
                    <select className={tw.inlineSelect} value={row.plan.production_stage} disabled={savingItemId === row.item.id} onChange={e => updatePanelPlan(row, { production_stage: e.target.value })}>
                      {ORDER_PRODUCTION_STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                    </select>
                  </label>
                </div>
                <div className="pt-3 mt-3 border-t border-[#edf4eb]">
                  <button type="button" className={tw.smBtn} onClick={() => openPanelNotes(row)}>{row.plan.notes ? "Edit notes" : "Add notes"}</button>
                </div>
              </article>
            );
          })}
          {!madeInHouseRows.length && (
            <p className="py-8 text-center text-[12px] text-[#8b8a81]">No made-in-house items yet.</p>
          )}
          <AdminPagination label="made-in-house items" page={madeInHousePagination.page} pageCount={madeInHousePagination.pageCount} totalItems={madeInHousePagination.totalItems} onPageChange={madeInHousePagination.setPage} />
        </div>
      </div>
    );
  }

  function renderCutList() {
    const totalPieces = cutListRows.reduce((total, row) => total + Number(row.qty || 0), 0);
    return (
      <div className={tw.card}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#edf4eb] bg-[#f5f8f4]">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[18px] font-semibold text-[#1a1a18] font-mono">{cutListRows.length}</span>
              <span className={tw.muted + " ml-1"}>rows</span>
            </div>
            <div>
              <span className="text-[18px] font-semibold text-[#1a1a18] font-mono">{totalPieces}</span>
              <span className={tw.muted + " ml-1"}>total pieces</span>
            </div>
          </div>
          <button
            type="button"
            className={tw.secondaryBtn}
            disabled={isGeneratingCutListPdf || !cutListRows.length}
            onClick={generateCutListPdf}
          >
            {isGeneratingCutListPdf ? "Generating PDF..." : "Generate cut list PDF"}
          </button>
        </div>
        <div className="hidden md:block">
          <div className={tw.tableWrap}>
            <table className={tw.table}>
              <thead>
                <tr>
                  {["#","Source item","Cabinet size","Cut piece","Qty","Cut size","Thickness","Material","Edging","Notes"].map(h => (
                    <th key={h} className={tw.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cutListPagination.pageItems.map((row, index) => (
                  <tr key={row.key}>
                    <td className={tw.td + " text-[#8b8a81] font-mono text-[11px]"}>
                      {(cutListPagination.page - 1) * 8 + index + 1}
                    </td>
                    <td className={tw.td}>{row.source}</td>
                    <td className={tw.td + " whitespace-nowrap text-[#5a5a52]"}>{row.cabinet || "—"}</td>
                    <td className={tw.td + " font-medium"}>{row.piece}</td>
                    <td className={tw.td}>{row.qty}</td>
                    <td className={tw.td + " whitespace-nowrap font-mono text-[11px]"}>{row.size}</td>
                    <td className={tw.td}>{row.thickness}</td>
                    <td className={tw.td}>{row.material}</td>
                    <td className={tw.td}>{row.edging}</td>
                    <td className={tw.tdLast + " text-[#5a5a52] italic text-[11px]"}>{row.notes || "—"}</td>
                  </tr>
                ))}
                {!cutListRows.length && (
                  <tr><td colSpan={10} className="py-8 text-center text-[12px] text-[#8b8a81]">No cut list rows yet. Assign items to Made in house in Item Planning first.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <AdminPagination
            label="cut list rows"
            page={cutListPagination.page}
            pageCount={cutListPagination.pageCount}
            totalItems={cutListPagination.totalItems}
            onPageChange={cutListPagination.setPage}
          />
        </div>
        <div className="md:hidden flex flex-col gap-3 p-3">
          {cutListPagination.pageItems.map(row => (
            <article key={row.key} className="bg-white border border-[#dbd8cc] rounded-[8px] p-4">
              <div className="mb-2">
                <p className="text-[13px] font-semibold text-[#1a1a18]">{row.piece}</p>
                <p className="text-[11px] text-[#8b8a81]">{row.source}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                <div><dt className="text-[#8b8a81]">Cabinet</dt><dd className="text-[#1a1a18]">{row.cabinet || "—"}</dd></div>
                <div><dt className="text-[#8b8a81]">Qty</dt><dd className="text-[#1a1a18]">{row.qty}</dd></div>
                <div><dt className="text-[#8b8a81]">Cut size</dt><dd className="text-[#1a1a18] font-mono text-[11px]">{row.size}</dd></div>
                <div><dt className="text-[#8b8a81]">Thickness</dt><dd className="text-[#1a1a18]">{row.thickness}</dd></div>
                <div className="col-span-2"><dt className="text-[#8b8a81]">Material</dt><dd className="text-[#1a1a18]">{row.material}</dd></div>
                <div className="col-span-2"><dt className="text-[#8b8a81]">Edging</dt><dd className="text-[#1a1a18]">{row.edging}</dd></div>
              </dl>
              {row.notes && (
                <div className="pt-3 mt-3 border-t border-[#edf4eb]">
                  <p className="text-[11px] text-[#5a5a52] italic">{row.notes}</p>
                </div>
              )}
            </article>
          ))}
          {!cutListRows.length && (
            <p className="py-8 text-center text-[12px] text-[#8b8a81]">No cut list rows yet. Assign items to Made in house in Item Planning first.</p>
          )}
          <AdminPagination label="cut list rows" page={cutListPagination.page} pageCount={cutListPagination.pageCount} totalItems={cutListPagination.totalItems} onPageChange={cutListPagination.setPage} />
        </div>
      </div>
    );
  }

  function renderPayments() {
    return (
      <div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            ["Total", formatMoney(paymentTotals.orderTotal, order.currency || "AUD"), ""],
            ["Paid", formatMoney(paymentTotals.confirmed, order.currency || "AUD"), "text-[#2d5e28]"],
            ["Pending", formatMoney(paymentTotals.pending, order.currency || "AUD"), "text-[#5c4200]"],
            ["Remaining", formatMoney(paymentTotals.remaining, order.currency || "AUD"), ""],
          ].map(([label, value, valueClass]) => (
            <div key={label} className="bg-[#f5f8f4] border border-[#dbd8cc] rounded-[8px] p-2 md:p-3">
              <p className="text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] mb-1 truncate">{label}</p>
              <p className={`text-[13px] md:text-[18px] font-semibold font-mono text-[#1a1a18] truncate ${valueClass}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className={tw.card}>
          <div className={tw.cardHeader}>
            <span className={tw.cardTitle}>Payment lines</span>
            <div className="flex gap-2">
              <button
                type="button"
                className={tw.smBtn}
                onClick={() => setPaymentModal({ payment_type: "deposit", amount: "", is_paid: false, paid_at: "", notes: "" })}
              >
                Add deposit
              </button>
              <button
                type="button"
                className="h-[26px] px-3 text-[11px] font-medium rounded-[6px] bg-[#1c2b1e] text-white hover:bg-[#2d3f2f] transition-colors"
                onClick={() => setPaymentModal({ payment_type: "progress", amount: "", is_paid: false, paid_at: "", notes: "" })}
              >
                Add payment
              </button>
            </div>
          </div>
          <div className="hidden md:block">
            <div className={tw.tableWrap}>
              <table className={tw.table}>
                <thead>
                  <tr>
                    {["Type","Amount","Status","Date paid","Notes","Actions"].map(h => (
                      <th key={h} className={tw.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paymentPagination.pageItems.map(payment => (
                    <tr key={payment.id}>
                      <td className={tw.td}>
                        <select
                          className={tw.inlineSelect}
                          style={{minWidth: "120px"}}
                          value={payment.payment_type || "progress"}
                          disabled={savingPaymentId === payment.id}
                          onChange={e => updatePayment(payment, { payment_type: e.target.value })}
                        >
                          {paymentTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                        </select>
                      </td>
                      <td className={tw.td}>
                        <input
                          className={tw.inlineInput + " font-mono"}
                          type="number"
                          min="0"
                          step="0.01"
                          style={{minWidth: "100px"}}
                          value={payment.amount ?? ""}
                          disabled={savingPaymentId === payment.id}
                          onChange={e => updatePaymentLocal(payment.id, { amount: e.target.value })}
                          onBlur={e => updatePayment(payment, { amount: e.target.value || 0 })}
                        />
                      </td>
                      <td className={tw.td}>
                        <select
                          className={tw.inlineSelect}
                          style={{minWidth: "90px"}}
                          value={payment.is_paid ? "paid" : "pending"}
                          disabled={savingPaymentId === payment.id}
                          onChange={e => updatePayment(payment, { is_paid: e.target.value === "paid" })}
                        >
                          <option value="pending">Pending</option>
                          <option value="paid">Paid</option>
                        </select>
                      </td>
                      <td className={tw.td}>
                        <input
                          className={tw.inlineInput}
                          type="date"
                          style={{minWidth: "130px"}}
                          value={payment.paid_at || ""}
                          disabled={savingPaymentId === payment.id || !payment.is_paid}
                          onChange={e => updatePaymentLocal(payment.id, { paid_at: e.target.value })}
                          onBlur={e => updatePayment(payment, { paid_at: e.target.value })}
                        />
                      </td>
                      <td className={tw.td}>
                        <input
                          className={tw.inlineInput}
                          style={{minWidth: "160px"}}
                          value={payment.notes || ""}
                          disabled={savingPaymentId === payment.id}
                          onChange={e => updatePaymentLocal(payment.id, { notes: e.target.value })}
                          onBlur={e => updatePayment(payment, { notes: e.target.value })}
                        />
                      </td>
                      <td className={tw.tdLast}>
                        <div className="flex items-center gap-2">
                          {!payment.is_paid && Number(payment.amount || 0) > 0 && (
                            <button
                              type="button"
                              className={tw.smBtn}
                              disabled={savingPaymentId === payment.id}
                              onClick={() => setPaymentRequestModal({
                                payment,
                                subject: `Payment request — ${order.order_number || "Perth Cabinet Doors"}`,
                                message: [`Hi ${order.customer_name || "there"},`, "", `A payment is requested for ${order.order_number || "your order"}.`, "", "Please use the button below to complete your payment.", "", "Regards,", "Perth Cabinet Doors"].join("\n"),
                              })}
                            >
                              Request
                            </button>
                          )}
                          <button
                            type="button"
                            className={tw.dangerBtn}
                            disabled={savingPaymentId === payment.id}
                            onClick={() => deletePayment(payment)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!payments.length && (
                    <tr><td colSpan={6} className="py-8 text-center text-[12px] text-[#8b8a81]">No payment lines yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <AdminPagination
              label="payments"
              page={paymentPagination.page}
              pageCount={paymentPagination.pageCount}
              totalItems={paymentPagination.totalItems}
              onPageChange={paymentPagination.setPage}
            />
          </div>
          <div className="md:hidden flex flex-col gap-3 p-3">
            {paymentPagination.pageItems.map(payment => (
              <article key={payment.id} className="bg-white border border-[#dbd8cc] rounded-[8px] p-4">
                <div className="mb-3">
                  <select
                    className={tw.inlineSelect}
                    value={payment.payment_type || "progress"}
                    disabled={savingPaymentId === payment.id}
                    onChange={e => updatePayment(payment, { payment_type: e.target.value })}
                  >
                    {paymentTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] mb-3">
                  <div>
                    <dt className="text-[#8b8a81] mb-1">Amount</dt>
                    <dd><input className={tw.inlineInput + " font-mono"} type="number" min="0" step="0.01" value={payment.amount ?? ""} disabled={savingPaymentId === payment.id} onChange={e => updatePaymentLocal(payment.id, { amount: e.target.value })} onBlur={e => updatePayment(payment, { amount: e.target.value || 0 })} /></dd>
                  </div>
                  <div>
                    <dt className="text-[#8b8a81] mb-1">Status</dt>
                    <dd>
                      <select className={tw.inlineSelect} value={payment.is_paid ? "paid" : "pending"} disabled={savingPaymentId === payment.id} onChange={e => updatePayment(payment, { is_paid: e.target.value === "paid" })}>
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                      </select>
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[#8b8a81] mb-1">Date paid</dt>
                    <dd><input className={tw.inlineInput} type="date" value={payment.paid_at || ""} disabled={savingPaymentId === payment.id || !payment.is_paid} onChange={e => updatePaymentLocal(payment.id, { paid_at: e.target.value })} onBlur={e => updatePayment(payment, { paid_at: e.target.value })} /></dd>
                  </div>
                </dl>
                <div className="mb-3">
                  <input className={tw.inlineInput} placeholder="Notes" value={payment.notes || ""} disabled={savingPaymentId === payment.id} onChange={e => updatePaymentLocal(payment.id, { notes: e.target.value })} onBlur={e => updatePayment(payment, { notes: e.target.value })} />
                </div>
                <div className="pt-3 mt-3 border-t border-[#edf4eb] flex flex-wrap gap-2">
                  {!payment.is_paid && Number(payment.amount || 0) > 0 && (
                    <button type="button" className={tw.smBtn} disabled={savingPaymentId === payment.id} onClick={() => setPaymentRequestModal({
                      payment,
                      subject: `Payment request — ${order.order_number || "Perth Cabinet Doors"}`,
                      message: [`Hi ${order.customer_name || "there"},`, "", `A payment is requested for ${order.order_number || "your order"}.`, "", "Please use the button below to complete your payment.", "", "Regards,", "Perth Cabinet Doors"].join("\n"),
                    })}>Request</button>
                  )}
                  <button type="button" className={tw.dangerBtn} disabled={savingPaymentId === payment.id} onClick={() => deletePayment(payment)}>Delete</button>
                </div>
              </article>
            ))}
            {!payments.length && (
              <p className="py-8 text-center text-[12px] text-[#8b8a81]">No payment lines yet.</p>
            )}
            <AdminPagination label="payments" page={paymentPagination.page} pageCount={paymentPagination.pageCount} totalItems={paymentPagination.totalItems} onPageChange={paymentPagination.setPage} />
          </div>
        </div>
      </div>
    );
  }

  function renderPaymentModal() {
    if (!paymentModal) return null;

    const isDeposit = paymentModal.payment_type === "deposit";
    const currency = order.currency || "AUD";
    const existingTotal = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const outstandingAvailable = Math.max(0, paymentTotals.orderTotal - existingTotal);

    return (
      <Modal
        open={true}
        onClose={() => setPaymentModal(null)}
        title={isDeposit ? "Add Deposit Line" : "Add Payment Line"}
        subtitle={isDeposit ? "Deposit required" : "Payment line"}
        size="md"
        footer={
          <>
            <button type="button" className="h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors" onClick={() => setPaymentModal(null)}>
              Cancel
            </button>
            <button type="button" className="h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors" disabled={savingPaymentId === "new"} onClick={() => addPayment(paymentModal)}>
              Add line
            </button>
          </>
        }
      >
        <div className={styles.customerModalGrid}>
          <label className={styles.fieldLabel}>
            Payment type
            <select
              className={styles.fieldInput}
              value={paymentModal.payment_type}
              disabled={isDeposit}
              onChange={(event) => {
                const nextType = event.target.value;
                setPaymentModal((current) => ({
                  ...current,
                  payment_type: nextType,
                  ...(nextType === "final" ? { amount: String(outstandingAvailable) } : {}),
                }));
              }}
            >
              {paymentTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-[3px]">
            <label className={styles.fieldLabel}>
              Amount
              <input
                className={styles.fieldInput}
                type="number"
                min="0"
                max={outstandingAvailable}
                step="0.01"
                value={paymentModal.amount}
                onChange={(event) => setPaymentModal((current) => ({ ...current, amount: event.target.value }))}
                onBlur={(event) => {
                  const clamped = Math.min(Number(event.target.value || 0), outstandingAvailable);
                  setPaymentModal((current) => ({ ...current, amount: String(clamped) }));
                }}
              />
            </label>
            <p className="text-[11px] text-[#8b8a81]">Outstanding balance: {formatMoney(outstandingAvailable, currency)}</p>
          </div>
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
      </Modal>
    );
  }

  function renderPaymentRequestModal() {
    if (!paymentRequestModal) return null;
    const { payment, message, subject } = paymentRequestModal;
    const hasEmail = !!order.customer_email;
    const isSending = savingPaymentId === payment.id;

    return (
      <Modal
        open={true}
        onClose={() => setPaymentRequestModal(null)}
        title="Email customer"
        subtitle="Request payment"
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors"
              onClick={() => setPaymentRequestModal(null)}
              disabled={isSending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors"
              disabled={!hasEmail || isSending}
              onClick={() => {
                setPaymentRequestModal(null);
                requestPayment(payment, { message, subject });
              }}
            >
              {isSending ? "Sending…" : "Send request"}
            </button>
          </>
        }
      >
        <div className={styles.customerModalGrid}>
          <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
            To
            <input className={styles.fieldInput} value={order.customer_email || ""} disabled />
          </label>
          <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
            Subject
            <input
              className={styles.fieldInput}
              value={subject}
              onChange={(event) => setPaymentRequestModal((current) => ({ ...current, subject: event.target.value }))}
            />
          </label>
          <div className={`${styles.fieldWide} flex items-center justify-between px-3 py-2 bg-[#f5f8f4] border border-[#dbd8cc] rounded-[6px]`}>
            <span className="text-[12px] text-[#5a5a52]">{titleCaseStatus(payment.payment_type)}</span>
            <strong className="text-[13px] font-mono text-[#1a1a18]">{formatMoney(Number(payment.amount || 0), order.currency || "AUD")}</strong>
          </div>
          <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
            Email message
            <textarea
              className={`${styles.textareaInput} ${styles.quoteEmailTextarea}`}
              style={{ minHeight: "220px" }}
              value={message}
              onChange={(event) => setPaymentRequestModal((current) => ({ ...current, message: event.target.value }))}
            />
          </label>
        </div>
        {!hasEmail ? (
          <div className="mx-1 mt-3 px-3 py-2 bg-[#fffbeb] border border-[#fcd34d] rounded-[6px] text-[12px] text-[#92400e] flex items-center gap-2">
            <span>⚠</span>
            <span>Add a customer email to this order before sending a payment request.</span>
          </div>
        ) : null}
      </Modal>
    );
  }

  function renderPanelNotesModal() {
    if (!panelNotesModal) return null;
    const row = panelNotesModal.row;

    return (
      <Modal
        open={true}
        onClose={() => setPanelNotesModal(null)}
        title={row.piece}
        subtitle={row.source}
        size="md"
        footer={
          <>
            <button type="button" className="h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors" onClick={() => setPanelNotesModal(null)}>
              Cancel
            </button>
            <button type="button" className="h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors" disabled={savingItemId === row.item.id} onClick={async () => { await updatePanelPlan(row, { notes: panelNotesModal.notes }); setPanelNotesModal(null); }}>
              Save notes
            </button>
          </>
        }
      >
        <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
          Notes
          <textarea
            className={styles.textareaInput}
            rows={6}
            value={panelNotesModal.notes}
            onChange={(event) => setPanelNotesModal((current) => ({ ...current, notes: event.target.value }))}
          />
        </label>
      </Modal>
    );
  }

  function renderActivity() {
    return (
      <div className={tw.card}>
        <div className={tw.cardHeader}>
          <span className={tw.cardTitle}>Activity log</span>
          <span className={tw.muted}>{activity.length} {activity.length === 1 ? 'entry' : 'entries'}</span>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className={tw.table}>
            <thead>
              <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                {['Date', 'Event', 'Detail', 'Actor', 'Type'].map(h => (
                  <th key={h} className={tw.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activityPagination.pageItems.map((entry) => (
                <tr key={entry.id} className="border-b border-[#edf4eb] last:border-b-0 hover:bg-[#f5f8f4] transition-colors">
                  <td className={tw.td + ' whitespace-nowrap text-[#8b8a81] text-[11px]'}>
                    {formatDateTime(entry.created_at)}
                  </td>
                  <td className={tw.td + ' font-medium whitespace-nowrap'}>
                    {entry.title}
                  </td>
                  <td className={tw.td + ' text-[#5a5a52] max-w-[320px]'}>
                    <span className="block truncate text-[11px]" title={formatActivityDescription(entry.description)}>
                      {formatActivityDescription(entry.description) || '—'}
                    </span>
                  </td>
                  <td className={tw.td}>
                    <span className={`${tw.pill} ${
                      entry.actor_type === 'admin'
                        ? 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]'
                        : entry.actor_type === 'customer'
                        ? 'bg-[#eff6ff] text-[#1e5fa8] border-[#93c5fd]'
                        : 'bg-[#f5f5f4] text-[#8b8a81] border-[#dbd8cc]'
                    }`}>
                      {activityActorLabel(entry.actor_type)}
                    </span>
                  </td>
                  <td className={tw.tdLast}>
                    <span className="inline-flex items-center px-2 py-[2px] rounded-full text-[10px] font-medium border bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc] whitespace-nowrap">
                      {titleCaseStatus(entry.action_type)}
                    </span>
                  </td>
                </tr>
              ))}
              {!activity.length && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[12px] text-[#8b8a81]">
                    No activity recorded for this order yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden flex flex-col divide-y divide-[#edf4eb]">
          {activityPagination.pageItems.map(entry => (
            <div key={entry.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-[12px] font-semibold text-[#1a1a18]">{entry.title}</p>
                <time className="text-[10px] text-[#8b8a81] whitespace-nowrap flex-shrink-0 mt-[1px]">
                  {formatDateTime(entry.created_at)}
                </time>
              </div>
              {formatActivityDescription(entry.description) && (
                <p className="text-[11px] text-[#5a5a52] leading-relaxed mb-2">
                  {formatActivityDescription(entry.description)}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`${tw.pill} ${
                  entry.actor_type === 'admin'
                    ? 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]'
                    : entry.actor_type === 'customer'
                    ? 'bg-[#eff6ff] text-[#1e5fa8] border-[#93c5fd]'
                    : 'bg-[#f5f5f4] text-[#8b8a81] border-[#dbd8cc]'
                }`}>
                  {activityActorLabel(entry.actor_type)}
                </span>
                <span className="inline-flex items-center px-2 py-[2px] rounded-full text-[10px] font-medium border bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]">
                  {titleCaseStatus(entry.action_type)}
                </span>
              </div>
            </div>
          ))}
          {!activity.length && (
            <div className="py-8 text-center text-[12px] text-[#8b8a81]">
              No activity recorded for this order yet.
            </div>
          )}
        </div>

        <AdminPagination
          label="activity entries"
          page={activityPagination.page}
          pageCount={activityPagination.pageCount}
          totalItems={activityPagination.totalItems}
          onPageChange={activityPagination.setPage}
        />
      </div>
    );
  }

  function renderNotes() {
    return (
      <div className={tw.card}>
        <div className={tw.cardHeader}><span className={tw.cardTitle}>Internal notes</span></div>
        <div className={tw.cardBody}>
          <label className={tw.fieldLabel}>
            Production, purchasing, install, or risk notes (admin only)
            <textarea
              className="w-full border border-[#dbd8cc] rounded-[6px] px-3 py-2 text-[13px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] resize-y min-h-[120px] mt-1"
              rows={6}
              value={order.internal_notes || ""}
              onChange={e => updateOrderField("internal_notes", e.target.value)}
              onBlur={e => saveOrder({ internal_notes: e.target.value })}
              placeholder="Internal production, purchasing, install, or risk notes…"
            />
          </label>
          <p className={tw.muted + " mt-2"}>Saves automatically when you leave the field.</p>
        </div>
      </div>
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
    <>
      <div className="flex flex-col md:flex-row min-h-full">

        {/* Desktop left sidebar nav */}
        <aside className="hidden md:flex flex-col w-[220px] flex-shrink-0 border-r border-[#edf4eb] bg-white">
          <div className="px-4 py-4 border-b border-[#edf4eb]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8b8a81] mb-[2px]">Order</p>
            <p className="text-[15px] font-semibold text-[#1a1a18] truncate">{order.order_number || "Order"}</p>
            <Link href="/admin/orders" className="text-[12px] text-[#6b9e61] hover:underline mt-[2px] block">← Orders</Link>
          </div>
          <nav className="p-3 flex flex-col gap-[2px] overflow-y-auto flex-1" aria-label="Order sections">
            {sections.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={`flex items-center px-3 py-[9px] rounded-[6px] w-full text-left text-[13px] font-medium transition-colors ${
                  activeSection === section.key
                    ? "bg-[#edf4eb] text-[#1c2b1e]"
                    : "text-[#5a5a52] hover:bg-[#f5f8f4]"
                }`}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Mobile section list or content */}
        <div className="md:hidden w-full">
          {activeSection === "" ? (
            <div className="flex flex-col">
              <div className="px-4 py-4 bg-white border-b border-[#edf4eb]">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8b8a81] mb-[1px]">Order</p>
                <p className="text-[15px] font-semibold text-[#1a1a18]">{order.order_number || "Order"}</p>
                <Link href="/admin/orders" className="text-[12px] text-[#6b9e61] hover:underline mt-[2px] block">← Orders</Link>
              </div>
              {sections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActiveSection(section.key)}
                  className="w-full flex items-center justify-between px-4 py-[14px] text-[14px] font-medium text-[#1a1a18] bg-white border-b border-[#edf4eb] hover:bg-[#f5f8f4] transition-colors"
                >
                  {section.label}
                  <span className="text-[#c5cdd8]">›</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-[#edf4eb] flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveSection("")}
                  className="w-[32px] h-[32px] flex items-center justify-center text-[#5a5a52] hover:text-[#1a1a18] transition-colors -ml-1"
                  aria-label="Back to sections"
                >
                  ←
                </button>
                <span className="text-[15px] font-semibold text-[#1a1a18]">
                  {sections.find((s) => s.key === activeSection)?.label}
                </span>
              </div>
              <div className="p-4 bg-[#f5f8f4]">
                {renderSection()}
              </div>
            </div>
          )}
        </div>

        {/* Desktop right content panel */}
        <main className="hidden md:flex flex-1 flex-col min-w-0 bg-[#f5f8f4]">
          <div className="p-6">
            {renderSection()}
          </div>
        </main>

      </div>

      {renderPaymentModal()}
      {renderPaymentRequestModal()}
      {renderPanelNotesModal()}
    </>
  );
}


