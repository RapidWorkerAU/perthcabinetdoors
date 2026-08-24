"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addressColumns, addressFromRecord } from "../../../../lib/pcd-contact-details";
import AddressFields from "../../../../components/admin/AddressFields";
import JobDetailsScopeNote from "../../../../components/admin/JobDetailsScopeNote";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { IconMessage } from "@tabler/icons-react";
import {
  formatItemSpecs,
  formatMoney,
  ORDER_LINE_STATUSES,
  ORDER_PRODUCTION_STAGES,
  ORDER_STATUSES,
} from "../../../../lib/pcd-quote-utils";
import { canRefreshPaymentRequest, canRequestPayment, hasPaymentRequest } from "../../../../lib/pcd-payment-requests";
import { canSettleOutsideLink, canUndoSettlement } from "../../../../lib/pcd-payment-settlement";
import SettlePaymentModal from "../../_components/SettlePaymentModal";
import RefundModal from "../../_components/RefundModal";
import {
  canProcessRefund,
  defaultRefundMessage,
  defaultRefundSubject,
  isRefund,
  refundAmount,
  refundMethodLabel,
  refundablePayments,
} from "../../../../lib/pcd-refunds";
import { ConfirmModal, Modal } from '@/components/ui/Modal';
import AdminLoading from "@/components/admin/AdminLoading";
import { panelNumberKey } from "../../../../lib/pcd-order-panel-numbers";
import { groupProductionRows } from "../../../../lib/pcd-production-groups";
import { lineNotes, lineNotesText } from "../../../../lib/pcd-line-notes";
import { supplierFromColour, supplierLookupKey } from "../../../../lib/pcd-line-supplier";
import { historyGaps, orderVersions } from "../../../../lib/pcd-order-history";
import {
  ISSUE_KINDS,
  ISSUE_OWNERS,
  ISSUE_BLOCKS,
  issueKindLabel,
  issueOwnerLabel,
  issueBlocksLabel,
  progressKindFor,
  progressValueFor,
  progressReads,
  openIssues,
  issuesForPanel,
  validateIssue,
  validateResolution,
  sortIssues,
  daysSince,
  openReworkCost,
  panelIssueSummary,
} from "../../../../lib/pcd-order-issues";
import { ActionMenu, ActionMenuItem } from "@/components/ui/ActionMenu";
import { StatusFilterBar } from "@/components/ui/StatusFilterBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { IconAlertCircleFilled } from "@tabler/icons-react";
import { SUPPLIER, isDecided, isMadeHere, isSupplierMade } from "../../../../lib/pcd-order-planning";
import {
  PRODUCTION_TIMEFRAMES,
  targetCompletionFrom,
  hasLegacyTarget,
} from "../../../../lib/pcd-order-schedule";
import { useToast } from "@/components/ui/Toast";
import styles from "../../admin-content.module.css";

const sections = [
  { key: "overview", label: "Overview" },
  { key: "quoteSummary", label: "Quote Summary" },
  { key: "items", label: "Item Planning" },
  { key: "supplierMade", label: "Supplier Made" },
  { key: "madeInHouse", label: "Made In House" },
  { key: "cutList", label: "Production List" },
  { key: "issues", label: "Issues" },
  { key: "payments", label: "Payments" },
  { key: "variations", label: "Variations" },
  { key: "history", label: "Order History" },
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
  return [...(order?.pcd_order_line_items || [])]
    .filter((item) => item.variation_status !== "removed")
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
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

function sortedVariations(order) {
  return [...(order?.pcd_order_variations || [])].sort(
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
  return formatItemSpecs(item);
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
    // No fallback to in house. An undecided panel has to READ as undecided, or
    // the Item Planning tab can never be said to be finished.
    fulfilment_method: thermolaminated ? SUPPLIER : plan.fulfilment_method || item.fulfilment_method || "",
    status: plan.status || item.status || "Not Ordered",
    supplier_name: plan.supplier_name ?? item.supplier_name ?? "",
    supplier_order_ref: plan.supplier_order_ref ?? item.supplier_order_ref ?? "",
    supplier_ordered_at: plan.supplier_ordered_at ?? item.supplier_ordered_at ?? "",
    supplier_eta: plan.supplier_eta ?? item.supplier_eta ?? "",
    board_required: typeof plan.board_required === "boolean" ? plan.board_required : !!item.board_required,
    production_stage: plan.production_stage || item.production_stage || "Not Started",
    // THE PANEL'S OWN NOTE, and only that. It used to fall back through the
    // line's notes, which did two bad things at once: a note written on the
    // quote appeared to be a note written against this panel, and opening the
    // notes box to add something copied that quote note into the panel. What
    // else is written against the line is read through lineNotes, which adds
    // them up rather than picking one. See lib/pcd-line-notes.js.
    notes: plan.notes ?? "",
  };
}

// A mark, not a sentence: the row already says what the panel is, so this only
// has to answer whether something is wrong with it.
function panelIssueMark(rowIssues) {
  if (!rowIssues.length) return <span className="text-[#dbd8cc]">·</span>;
  const blocking = rowIssues.some((issue) => issue.blocks === "order");
  return (
    <span
      className={`inline-flex items-center gap-[3px] rounded-[5px] px-[3px] ${
        blocking ? "bg-[#b42318] px-[5px] py-[3px] text-white" : "text-[#b42318]"
      }`}
      title={panelIssueSummary(rowIssues)}
    >
      <IconAlertCircleFilled size={15} />
      {rowIssues.length > 1 && <span className="text-[10px] font-bold leading-none">{rowIssues.length}</span>}
    </span>
  );
}

function isPanelMadeInHouse(row) {
  return isMadeHere(row.plan.fulfilment_method);
}

// Deliberately not "everything else". A panel nobody has decided about must not
// fall onto a supplier order by default.
function isPanelSupplierMade(row) {
  return isSupplierMade(row.plan.fulfilment_method);
}

function isPanelUndecided(row) {
  return !isDecided(row.plan.fulfilment_method);
}

// The badge for who makes a panel. Amber for undecided, because that is a
// question rather than an answer.
function madeByBadge(row) {
  if (isPanelUndecided(row)) return { label: "Not decided", tone: "bg-[#fffdf0] text-[#8a6d0b] border-[#e8d68f]" };
  if (isPanelMadeInHouse(row)) return { label: "We cut it", tone: "bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]" };
  return { label: "Supplier", tone: "bg-[#fbf2e1] text-[#8a5a12] border-[#8a5a12]" };
}

function formatCutDimension(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${number}mm` : "-";
}

function formatCutSize(heightMm, widthMm) {
  return `${formatCutDimension(heightMm)} x ${formatCutDimension(widthMm)}`;
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
              size: formatCutSize(piece.height_mm, piece.width_mm),
              thickness: piece.thickness_mm ? `${piece.thickness_mm}mm` : item.thickness || "-",
              material: cutMaterialDisplay(item, piece),
              edging: cutEdgingDisplay(item, piece),
              // The piece's own cutting instruction (e.g. a diagonal corner's
              // chamfer) comes first, then any manual per-panel planning note.
              // The piece's own cutting instruction first, then everything
              // written against this panel and this line. Same helper the
              // production sheet uses, so the screen and the print agree.
              notes: [piece.notes, lineNotesText(item, panelPlanFor(item, panelKey))].filter(Boolean).join(" · "),
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
      size: item.width_mm || item.height_mm ? formatCutSize(item.height_mm, item.width_mm) : "-",
      thickness: item.thickness || "-",
      material: cutMaterialDisplay(item),
      edging: cutEdgingDisplay(item),
      notes: lineNotesText(item, panelPlanFor(item, panelKey)),
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
  return depth ? `${height} x ${width} x ${depth}mm` : `${height} x ${width}mm`;
}

function lineValue(value, fallback = "-") {
  return value === null || value === undefined || value === "" ? fallback : value;
}

export default function OrderDetail({ orderId }) {
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");
  const [activeSection, setActiveSection] = useState(
    sections.some((s) => s.key === sectionParam) ? sectionParam : "overview"
  );

  // Deep links come from the board, which points at the tab holding the thing
  // that needs doing. Following the parameter afterwards keeps a link to what
  // you are actually looking at copyable.
  function goToSection(key) {
    setActiveSection(key);
    const next = new URLSearchParams(Array.from(searchParams.entries()));
    if (key === "overview") next.delete("section");
    else next.set("section", key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  // A link arriving while the page is already open still moves the tab.
  useEffect(() => {
    if (sectionParam && sections.some((s) => s.key === sectionParam) && sectionParam !== activeSection) {
      setActiveSection(sectionParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionParam]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [makingDeliveryLabel, setMakingDeliveryLabel] = useState(false);
  const [savingRefund, setSavingRefund] = useState(false);
  // The email shown before a refund is processed. Same two step shape as a
  // payment request: nothing moves until this is sent.
  const [refundEmailModal, setRefundEmailModal] = useState(null);
  // Set when the route refuses because money is still owed. Holding the reason
  // rather than a boolean means the second question can say what the first one
  // found rather than repeating itself.
  const [archiveOutstanding, setArchiveOutstanding] = useState("");
  const [savingItemId, setSavingItemId] = useState("");
  const [savingPaymentId, setSavingPaymentId] = useState("");
  const [editingPaymentId, setEditingPaymentId] = useState("");
  const [isGeneratingCutListPdf, setIsGeneratingCutListPdf] = useState(false);
  const [generatingLabels, setGeneratingLabels] = useState("");
  // "all" | "here" | "mto". Narrowing to the cut work is what someone at the
  // saw wants; the whole order is what everyone else wants.
  const [productionFilter, setProductionFilter] = useState("all");
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
  const supplierMadeRows = useMemo(() => planningRows.filter(isPanelSupplierMade), [planningRows]);
  const madeInHouseRows = useMemo(() => planningRows.filter(isPanelMadeInHouse), [planningRows]);
  const cutListRows = useMemo(() => planningRows.filter(isPanelMadeInHouse), [planningRows]);
  const madeToOrderRows = useMemo(() => planningRows.filter(isPanelSupplierMade), [planningRows]);
  // Panel numbers are stored against the order and assigned the first time a
  // production document is generated, so the screen can show the same number
  // the sheet and the labels carry rather than a position that shifts.
  const panelNumbers = useMemo(
    () => new Map(
      (order?.panel_numbers || []).map((row) => [panelNumberKey(row.order_line_item_id, row.panel_key), row.panel_no])
    ),
    [order]
  );
  const panelNo = (row) => panelNumbers.get(panelNumberKey(row.item?.id, row.panelKey)) || null;

  // The quote lines carry design_item_id, which is what ties a door to the
  // cabinet it belongs to. Same grouping the printed sheet uses.
  const assemblyQuoteLines = useMemo(() => order?.pcd_quote?.pcd_quote_line_items || [], [order]);
  const productionGroups = useMemo(
    () => groupProductionRows(
      planningRows.map((row) => ({ ...row, itemId: row.item.id })),
      { items, quoteLines: assemblyQuoteLines }
    ),
    [planningRows, items, assemblyQuoteLines]
  );

  // The same disc the printed label carries. A panel with no number has not
  // been through a print yet, so it shows as an empty outline rather than a
  // dash: not issued reads differently to missing.
  function renderPanelBadge(row) {
    const number = panelNo(row);
    if (!number) {
      return (
        <span
          className="inline-flex h-[24px] w-[24px] items-center justify-center rounded-full border border-dashed border-[#dbd8cc] text-[11px] font-medium text-[#8b8a81]"
          title="Assigned when the production sheet or labels are first printed"
        >
          &ndash;
        </span>
      );
    }
    return (
      <span className="inline-flex h-[24px] w-[24px] items-center justify-center rounded-full bg-[#1c2b1e] text-[11px] font-semibold text-white font-mono">
        {number}
      </span>
    );
  }
  // One label per physical piece, counted off the same rows the cut list sheet
  // prints, so the button can say how many will come out before anyone loads a
  // roll. Covers both tables on the sheet: what we cut and what a supplier makes.
  const labelCount = useMemo(
    () => planningRows.reduce((total, row) => total + Math.max(1, Math.floor(Number(row.qty) || 1)), 0),
    [planningRows]
  );
  // EVERY VERSION OF THIS ORDER, oldest first.
  //
  // Derived rather than stored: the order as it stands, rewound one variation at
  // a time using the before-state each variation recorded. Nothing new is
  // written, so this can never contradict the order, because it is made of it.
  // See lib/pcd-order-history.js.
  //
  // Declared here with the other hooks and NOT beside renderHistory, which sits
  // below this component's loading gate. A hook after an early return only runs
  // once the gate has passed, so React counts a different number of hooks on the
  // first render than on the second and refuses to continue.
  const versions = useMemo(() => orderVersions({
    order,
    lines: items,
    variations: order?.pcd_order_variations || [],
    variationLinesByVariationId: new Map(
      (order?.pcd_order_variations || []).map((entry) => [entry.id, entry.pcd_order_variation_lines || []])
    ),
  }), [order, items]);
  const versionGaps = useMemo(() => historyGaps(versions), [versions]);
  const [openVersion, setOpenVersion] = useState(null);
  // The payment being closed off because the money arrived some other way. A
  // link that did not work for the customer is ordinary, and before this there
  // was no way to record the transfer they sent instead.
  const [settlingPayment, setSettlingPayment] = useState(null);

  const quoteLines = useMemo(() => sortedQuoteLines(order), [order]);
  const payments = useMemo(() => sortedPayments(order), [order]);
  const activity = useMemo(() => sortedActivity(order), [order]);
  const variations = useMemo(() => sortedVariations(order), [order]);
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

  // Panel issues. Raised from Supplier Made and Made In House, listed here.
  const issues = useMemo(() => order?.pcd_order_issues || [], [order?.pcd_order_issues]);
  const issuesOpen = useMemo(() => openIssues(issues), [issues]);
  const [issueFilter, setIssueFilter] = useState("open");
  const [issueSearch, setIssueSearch] = useState("");
  const [issueDraft, setIssueDraft] = useState(null);
  const [resolveDraft, setResolveDraft] = useState(null);
  const [issueErrors, setIssueErrors] = useState({});
  const [savingIssue, setSavingIssue] = useState(false);

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
    smBtn: "inline-flex h-[26px] items-center justify-center px-3 text-[11px] font-medium rounded-[6px] border border-[#dbd8cc] bg-white text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors",
    dangerBtn: "inline-flex h-[26px] items-center justify-center px-3 text-[11px] font-medium rounded-[6px] border border-[#fca5a5] bg-white text-[#991b1b] hover:bg-[#fef2f2] disabled:opacity-50 transition-colors",
    muted: "text-[11px] text-[#8b8a81]",
    mono: "font-mono",
    pill: "inline-flex items-center px-2 py-[2px] rounded-full text-[10px] font-medium border",
    tableWrap: "overflow-x-auto md:max-h-[calc(100vh-260px)] md:overflow-auto",
    /* min-w-max stops these wide tables being crushed into the panel width.
       Without it the browser wraps every cell ("1mm Square Edge" over three
       lines) instead of letting the wrapper scroll sideways. Free text cells
       opt back into wrapping with tw.cellText so one long note cannot stretch
       the whole table. */
    table: "w-full min-w-max text-[13px] border-collapse",
    /* Fixed layout, so the declared shares are the widths and one long value
       cannot stretch a column. The floor keeps ten columns readable on a narrow
       window: below it the wrapper scrolls rather than crushing them. */
    tableFixed: "w-full table-fixed min-w-[1180px] text-[13px] border-collapse",
    wrapCell: "whitespace-normal break-words",
    th: "sticky top-0 z-10 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52] px-4 py-[9px] border-b border-[#dbd8cc] bg-[#f5f8f4] whitespace-nowrap",
    td: "px-4 py-[11px] border-b border-[#edf4eb] text-[#1a1a18] align-middle",
    tdLast: "px-4 py-[11px] text-[#1a1a18] align-middle",
    cellText: "block max-w-[280px] whitespace-normal",
    inlineInput: "h-[28px] w-full border border-[#dbd8cc] rounded-[4px] px-2 text-[12px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] disabled:bg-[#f5f8f4] disabled:text-[#8b8a81]",
    inlineSelect: "h-[28px] w-full border border-[#dbd8cc] rounded-[4px] px-2 text-[12px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] disabled:bg-[#f5f8f4] disabled:text-[#8b8a81]",
    totalRow: "flex justify-between items-center gap-4 py-[5px] border-b border-[#edf4eb] text-[12px] last:border-0",
    saveBar: "flex justify-end pt-3 border-t border-[#edf4eb] mt-3",
  }

  // The panel's progress is read from the plan and COPIED onto the issue. The
  // plan itself is never touched: that is the whole reason issues stopped being
  // a status.
  function openIssueFor(row) {
    setIssueErrors({});
    // No row means the whole order: a complaint after delivery has no panel to
    // hang off, and the issues table allows a null line.
    if (!row) {
      setIssueDraft({
        line_item_id: null,
        panel_key: null,
        panel_label: "The whole order",
        progress_kind: "Stage",
        stage_at_report: "",
        kind: "",
        detail: "",
        owner: "us",
        blocks: "order",
        extra_cost_ex_gst: "",
      });
      return;
    }
    const method = row.plan.fulfilment_method;
    setIssueDraft({
      line_item_id: row.item.id,
      panel_key: row.panelKey || null,
      panel_label: row.piece || row.source,
      progress_kind: progressKindFor(method),
      stage_at_report: progressValueFor(row.plan, method),
      kind: "",
      detail: "",
      owner: "us",
      blocks: "panel",
      extra_cost_ex_gst: "",
    });
  }

  async function saveIssue() {
    const errors = validateIssue(issueDraft);
    setIssueErrors(errors);
    if (Object.keys(errors).length) return;

    setSavingIssue(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(issueDraft),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setIssueErrors(payload.fieldErrors || {});
        toast({ title: payload.error || "Could not raise the issue.", variant: "error" });
        return;
      }
      setIssueDraft(null);
      await loadOrder();
      toast({ title: `Issue raised. The panel is still at ${issueDraft.stage_at_report || "where it was"}.` });
    } catch (error) {
      toast({ title: error?.message || "Could not raise the issue.", variant: "error" });
    } finally {
      setSavingIssue(false);
    }
  }

  async function patchIssue(issueId, body, words) {
    setSavingIssue(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setIssueErrors(payload.fieldErrors || {});
        toast({ title: payload.error || "Could not update the issue.", variant: "error" });
        return false;
      }
      await loadOrder();
      toast({ title: words });
      return true;
    } catch (error) {
      toast({ title: error?.message || "Could not update the issue.", variant: "error" });
      return false;
    } finally {
      setSavingIssue(false);
    }
  }

  async function saveResolution() {
    const errors = validateResolution(resolveDraft?.resolution);
    setIssueErrors(errors);
    if (Object.keys(errors).length) return;
    const done = await patchIssue(resolveDraft.id, { resolution: resolveDraft.resolution }, "Resolved. It stays on the record.");
    if (done) setResolveDraft(null);
  }

  async function undoSettlement(payment) {
    const reason = typeof window === "undefined" ? "" : window.prompt(
      "Why are you undoing this? It is recorded against the order.\n\nThe payment goes back to owing. The old payment link was cancelled when it was settled, so a new one has to be sent."
    );
    if (!reason || !reason.trim()) return;
    setSavingPaymentId(payment.id);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/payments/${payment.id}/settle`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not undo this settlement.");
      toast({ title: result.message, variant: "success" });
      await loadOrder();
    } catch (error) {
      toast({ title: error?.message || "Could not undo this settlement.", variant: "error" });
    } finally {
      setSavingPaymentId("");
    }
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

  // All three parts and the joined one-liner move together on every keystroke.
  // Setting one part on its own would be wrong for an order whose address is
  // still only the one-liner: the other two boxes are showing values read out
  // of that string, and writing a single structured column makes the reader
  // switch to the structured columns, blanking the two nobody has typed in yet.
  function updateOrderAddress(key, value) {
    setOrder((current) => {
      if (!current) return current;
      return { ...current, ...addressColumns({ ...addressFromRecord(current), [key]: value }) };
    });
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

  async function createVariation() {
    if (!order) return;
    setIsSavingOrder(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/variations`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not create variation.", variant: "error" });
        return;
      }
      setOrder((current) => current ? {
        ...current,
        pcd_order_variations: [payload.variation, ...(current.pcd_order_variations || [])],
      } : current);
      router.push(`/admin/orders/${orderId}/variations/${payload.variation.id}`);
    } catch (error) {
      toast({ title: error?.message || "Could not create variation.", variant: "error" });
    } finally {
      setIsSavingOrder(false);
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
    if (!canDeletePaymentLine(payment)) {
      toast({ title: "Only unpaid payment lines with no sent payment request can be deleted.", variant: "error" });
      return;
    }
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
      closePaymentEdit(payment.id);
    } catch (error) {
      setOrder(previousOrder);
      toast({ title: error?.message || "Could not delete payment.", variant: "error" });
    } finally {
      setSavingPaymentId("");
    }
  }


  // Raising a refund line. Nothing moves and nobody is told: see RefundModal.
  async function addRefund(input) {
    if (!order) return;
    setSavingRefund(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/refunds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not raise the refund.", variant: "error" });
        return;
      }
      setRefundModalOpen(false);
      toast({ title: "Refund line added. Process it when you are ready to send it.", variant: "success" });
      await loadOrder();
    } catch (error) {
      toast({ title: error?.message || "Could not raise the refund.", variant: "error" });
    } finally {
      setSavingRefund(false);
    }
  }

  // Processing: the money goes back, then the customer is told. The route does
  // them in that order and reports the email separately, because a refund that
  // was sent and an email that was not is a different thing from a refund that
  // never happened.
  async function processRefund(refund, emailData) {
    if (!order || !refund?.id) return;
    setSavingPaymentId(refund.id);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/payments/${refund.id}/process-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailData || {}),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not process the refund.", variant: "error" });
        return;
      }
      if (payload.emailSent) {
        toast({ title: "Refund processed and the customer has been told.", variant: "success" });
      } else {
        toast({
          title: "Refund processed. The customer was NOT told.",
          description: payload.emailError || "The email did not send.",
          variant: "warning",
        });
      }
      await loadOrder();
    } catch (error) {
      toast({ title: error?.message || "Could not process the refund.", variant: "error" });
    } finally {
      setSavingPaymentId(null);
    }
  }

  function openRefundEmail(refund) {
    setRefundEmailModal({
      refund,
      subject: defaultRefundSubject(order),
      message: defaultRefundMessage({
        order,
        amount: refundAmount(refund),
        reason: refund.refund_reason,
      }),
    });
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
      toast({
        title: payload.refreshed
          ? `Fresh payment link created: ${payload.checkoutUrl}`
          : payload.emailSent
            ? "Payment request sent to customer."
            : `Payment request created. Email is not configured, use this link: ${payload.checkoutUrl}`,
        variant: "success",
      });
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

  // Labels are one per physical piece, so a line with qty 4 downloads 4 of
  // them. The PDF prints straight to the Brother QL on a 62mm roll; the CSV is
  // there for P-touch Editor if the driver argues about the page size.
  // The label that goes on the OUTSIDE of the bundle: who it is for and where
  // it goes, rather than which panel it is. Same roll and same masthead as the
  // production labels, so a job carries one family of labels.
  async function downloadDeliveryLabel() {
    setMakingDeliveryLabel(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/delivery-label`, { cache: "no-store" });
      if (!response.ok) {
        let message = "Could not make the delivery label.";
        if ((response.headers.get("content-type") || "").includes("application/json")) {
          const payload = await response.json();
          message = payload.error || message;
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const sent = (response.headers.get("content-disposition") || "").match(/filename="([^"]+)"/);
      link.download = sent ? sent[1] : `delivery-label-${order?.order_number || "order"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: error?.message || "Could not make the delivery label.", variant: "error" });
    } finally {
      setMakingDeliveryLabel(false);
    }
  }

  async function downloadLabels(format) {
    setGeneratingLabels(format);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/labels?format=${format}`, { cache: "no-store" });
      if (!response.ok) {
        let message = "Could not generate the labels.";
        if ((response.headers.get("content-type") || "").includes("application/json")) {
          const payload = await response.json();
          message = payload.error || message;
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      // The server stamps the filename with the minute it generated the file,
      // so two downloads of the same order are two files rather than one plus a
      // "(1)". Opening the first one after a change looks exactly like a change
      // that did not take effect, which is a long way to chase nothing.
      const sent = (response.headers.get("content-disposition") || "").match(/filename="([^"]+)"/);
      link.download = sent ? sent[1] : `labels-${order?.order_number || "order"}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      toast({ title: error?.message || "Could not generate the labels.", variant: "error" });
    } finally {
      setGeneratingLabels("");
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

  function paymentHasRequest(payment) {
    return hasPaymentRequest(payment);
  }

  function canDeletePaymentLine(payment) {
    return !payment?.is_paid && !paymentHasRequest(payment);
  }

  function canRequestPaymentLine(payment) {
    return canRequestPayment(payment);
  }

  function canEditPaymentFinancialFields(payment) {
    return !payment?.is_paid && !paymentHasRequest(payment);
  }

  function canRefreshPaymentLine(payment) {
    return canRefreshPaymentRequest(payment);
  }

  function paymentStatusText(payment) {
    if (payment.is_paid) return "Paid";
    if (paymentHasRequest(payment)) return "Requested";
    return "Pending";
  }

  function paymentStatusClass(payment) {
    if (payment.is_paid) return "bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]";
    if (paymentHasRequest(payment)) return "bg-[#fffbeb] text-[#92400e] border-[#fcd34d]";
    return "bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]";
  }

  function paymentTypeText(value) {
    return paymentTypes.find((type) => type.value === value)?.label || titleCaseStatus(value || "progress");
  }

  function closePaymentEdit(paymentId) {
    setEditingPaymentId((current) => (current === paymentId ? "" : current));
  }

  function panelNotesButton(row, className = "") {
    // Every note against this line, not just the one typed against this panel.
    // A quote line that said "mitre the return, customer has seen it" used to
    // leave this button looking empty.
    const notes = lineNotes(row.item, row.plan);
    const hasNotes = notes.length > 0;
    const disabled = savingItemId === row.item.id;
    return (
      <button
        type="button"
        className={`inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[5px] border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          hasNotes
            ? "border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28] hover:bg-[#dfeedd]"
            : "border-[#dbd8cc] bg-white text-[#8b8a81] hover:bg-[#f5f8f4] hover:text-[#1a1a18]"
        } ${className}`}
        onClick={() => openPanelNotes(row)}
        disabled={disabled}
        title={hasNotes ? notes.map(note => `${note.label}: ${note.text}`).join("\n") : "No notes attached"}
        aria-label={hasNotes ? `View ${notes.length} note${notes.length === 1 ? "" : "s"} for ${row.piece}` : `Add notes for ${row.piece}`}
      >
        <span className="relative inline-flex">
          <IconMessage size={13} />
          {hasNotes && (
            <span className="absolute -right-[3px] -top-[3px] h-[5px] w-[5px] rounded-full bg-[#2d5e28] ring-1 ring-white" />
          )}
        </span>
      </button>
    );
  }

  // The same answer the production sheet prints, out of the same function. The
  // screen used to work this out on its own and the sheet knew nothing about
  // it, so a row read "Polytec" here and a dash on the paper the workshop was
  // holding. See lib/pcd-line-supplier.js.
  function defaultSupplierForItem(item) {
    return supplierFromColour(item, colourSupplierMap);
  }

  if (isLoading) return <AdminLoading steps={["Opening the order", "Loading the line items", "Almost there"]} label="Loading order" />;
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
                  {/* Shown only when it IS archived, so the dropdown reads
                      truthfully, and never as something to choose. */}
                  {order.status === "archived" && <option value="archived">Archived</option>}
                </select>
              </label>
              {/* Archiving used to be a field in here, sitting between the job
                  name and the schedule as though it were another detail to fill
                  in. It is an action on the whole order, so it lives with the
                  other order actions in the sidebar. */}
              <label className={tw.fieldLabel}>
                Scheduled start
                <input
                  className={tw.fieldInput}
                  type="date"
                  value={order.scheduled_start_date || ""}
                  onChange={e => updateOrderField("scheduled_start_date", e.target.value)}
                  onBlur={e => saveOrder({ scheduled_start_date: e.target.value })}
                />
              </label>
              <label className={tw.fieldLabel}>
                How long it takes
                <select
                  className={tw.fieldInput}
                  value={order.production_lead_days || ""}
                  onChange={e => saveOrder({ production_lead_days: e.target.value ? Number(e.target.value) : null })}
                  disabled={isSavingOrder}
                >
                  <option value="">Not set</option>
                  {PRODUCTION_TIMEFRAMES.map(t => (
                    <option key={t.days} value={t.days}>{t.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <ScheduleOutcome order={order} />
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
                <span className="mt-[3px] text-[11px] leading-[1.45] text-[#8b8a81]">
                  Where this order&apos;s payment requests, refunds and variations are sent. It does not change who the
                  order belongs to.
                </span>
              </label>
              <label className={tw.fieldLabel}>
                Phone
                <input className={tw.fieldInput} value={order.customer_phone || ""} onChange={e => updateOrderField("customer_phone", e.target.value)} onBlur={e => saveOrder({ customer_phone: e.target.value })} />
              </label>
              {/* Saved as the three parts AND the joined one-liner. Writing
                  only site_address here used to leave the suburb and postcode
                  columns holding the address from before the edit, which is
                  exactly the data a delivery run is planned from. */}
              <AddressFields
                value={addressFromRecord(order)}
                onChange={updateOrderAddress}
                onBlur={() => saveOrder(addressColumns(addressFromRecord(order)))}
              />
            </div>
            <JobDetailsScopeNote customerId={order.customer_id} what="order" />
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
      <div className="md:flex md:h-full md:min-h-0 md:flex-col">
        <div className="mb-3 px-3 py-2 bg-[#edf4eb] border border-[#a8c5a0] rounded-[6px] text-[12px] text-[#2d5e28]">
          Read only — edit line items in the original quote.
        </div>

        <div className={`${tw.card} md:flex md:min-h-0 md:flex-1 md:flex-col`}>
          <div className={tw.cardHeader}>
            <span className={tw.cardTitle}>Line items</span>
            <span className={tw.muted}>{quoteLines.length} {quoteLines.length === 1 ? "line" : "lines"}</span>
          </div>
          <div className={`${tw.tableWrap} md:min-h-0 md:flex-1 md:overflow-auto`}>
            <table className={tw.table}>
              <thead>
                <tr>
                  {["#","Type","Material / colour","Size","Qty","Edge","Drill?","Hinge qty","Unit cost","Markup","Unit price","Total ex GST"].map(h => (
                    <th key={h} className={`${tw.th} md:sticky md:top-0 md:z-10`}>{h}</th>
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
                      <td className={tw.td}>{hingesApplicable && line.hinge_holes ? lineValue(line.hinge_qty) : "N/A"}</td>
                      <td className={tw.td + " " + tw.mono}>{formatMoney(line.product_unit_cost_ex_gst || 0, quoteCurrency)}</td>
                      {/* The markup this line was actually quoted at. It used to
                          print the built-in 40% whenever the line had none,
                          which read as fact: this screen never loads business
                          defaults, so that number was neither the line's nor
                          the configured one. A dash says "not recorded". */}
                      <td className={tw.td + " " + tw.mono}>
                        {line.markup_percent === null || line.markup_percent === undefined
                          ? "-"
                          : `${line.markup_percent}%`}
                      </td>
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
          <div className="flex justify-between items-center gap-4 pt-2 mt-1">
            <span className="text-[14px] font-semibold text-[#2d5e28]">Total inc GST</span>
            <strong className="text-[18px] font-semibold text-[#1a1a18] font-mono whitespace-nowrap">{formatMoney(quote.total_inc_gst, quoteCurrency)}</strong>
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
                {planningRows.map(row => {
                  const item = row.item;
                  const thermolaminated = isThermolaminatedItem(item);
                  return (
                    <tr key={row.key}>
                      <td className={tw.td}>
                        <p className={`${tw.cellText} text-[12px] font-semibold text-[#1a1a18]`}>{row.source}</p>
                        <p className={`${tw.cellText} ${tw.muted}`}>{itemMeta(item) || "No item details recorded"}</p>
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
                          <option value="">Not decided yet</option>
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
        </div>
        <div className="md:hidden flex flex-col gap-3 p-3">
          {planningRows.map(row => {
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
                    <option value="">Not decided yet</option>
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
                  {["Item","Order status","Supplier","Ref","Ordered","ETA","Notes","Issues",""].map(h => (
                    <th key={h || "actions"} className={tw.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supplierMadeRows.map(row => (
                  <tr key={row.key}>
                    <td className={tw.td}>
                      <p className={`${tw.cellText} text-[12px] font-semibold text-[#1a1a18]`}>{row.source}</p>
                      <p className={`${tw.cellText} ${tw.muted}`}>{row.piece} · {row.size} · {row.material}</p>
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
                    <td className={tw.td}>
                      {panelNotesButton(row)}
                    </td>
                    <td className={tw.td + " text-center"}>
                      {panelIssueMark(issuesForPanel(issues, row.item.id, row.panelKey))}
                    </td>
                    <td className={tw.tdLast + " text-right"}>
                      <ActionMenu label="Panel actions" size="xs">
                        <ActionMenuItem variant="danger" onClick={() => openIssueFor(row)}>
                          Report an issue
                        </ActionMenuItem>
                      </ActionMenu>
                    </td>
                  </tr>
                ))}
                {!supplierMadeRows.length && (
                  <tr><td colSpan={9} className="py-8 text-center text-[12px] text-[#8b8a81]">No supplier-made items yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="md:hidden flex flex-col gap-3 p-3">
          {supplierMadeRows.map(row => (
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
                {panelNotesButton(row)}
              </div>
            </article>
          ))}
          {!supplierMadeRows.length && (
            <p className="py-8 text-center text-[12px] text-[#8b8a81]">No supplier-made items yet.</p>
          )}
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
                  {["Item","Board required","Supplier","Ref","Ordered","ETA","Production stage","Notes","Issues",""].map(h => (
                    <th key={h || "actions"} className={tw.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {madeInHouseRows.map(row => {
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
                      <td className={tw.td}>
                        {panelNotesButton(row)}
                      </td>
                      <td className={tw.td + " text-center"}>
                        {panelIssueMark(issuesForPanel(issues, row.item.id, row.panelKey))}
                      </td>
                      <td className={tw.tdLast + " text-right"}>
                        <ActionMenu label="Panel actions" size="xs">
                          <ActionMenuItem variant="danger" onClick={() => openIssueFor(row)}>
                            Report an issue
                          </ActionMenuItem>
                        </ActionMenu>
                      </td>
                    </tr>
                  );
                })}
                {!madeInHouseRows.length && (
                  <tr><td colSpan={10} className="py-8 text-center text-[12px] text-[#8b8a81]">No made-in-house items yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="md:hidden flex flex-col gap-3 p-3">
          {madeInHouseRows.map(row => {
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
                  {panelNotesButton(row)}
                </div>
              </article>
            );
          })}
          {!madeInHouseRows.length && (
            <p className="py-8 text-center text-[12px] text-[#8b8a81]">No made-in-house items yet.</p>
          )}
        </div>
      </div>
    );
  }

  // The production tab: the same table the sheet prints.
  //
  // Same columns, same meanings, same grouping, so nobody has to translate
  // between the screen and the paper in their hand. Two differences, both
  // deliberate. Cabinet assemblies get a header bar; anything supplied on its
  // own just lists, because a bar reading "Doors" over a list of doors is a row
  // of chrome that says nothing on a screen you can already filter. And two
  // columns exist here that paper cannot have: what a panel's status is right
  // now, and who makes it, the latter only while the filter is showing both.
  function renderCutList() {
    const showMadeBy = productionFilter === "all";
    const visible = (rows) => (productionFilter === "here"
      ? rows.filter(isPanelMadeInHouse)
      : productionFilter === "mto"
      ? rows.filter((row) => !isPanelMadeInHouse(row))
      : rows);

    // Cabinets keep their bar, everything else is flattened into one run that
    // follows them.
    const groups = productionGroups
      .map((group) => ({ ...group, rows: visible(group.rows) }))
      .filter((group) => group.rows.length);
    const assemblies = groups.filter((group) => group.key.startsWith("assembly:"));
    const standalone = groups.filter((group) => !group.key.startsWith("assembly:")).flatMap((group) => group.rows);

    const visibleRows = visible(planningRows);
    const pieces = visibleRows.reduce((total, row) => total + Number(row.qty || 0), 0);

    const filters = [
      { key: "all", label: "All panels", count: planningRows.length },
      { key: "here", label: "Cut here", count: cutListRows.length },
      { key: "mto", label: "Made to order", count: madeToOrderRows.length },
    ];

    // Same discipline as the printed sheet: every column sized to what actually
    // goes in it, none wider than a fifth, and everything wraps. A legacy line
    // whose Piece cell holds a whole cabinet spec sentence now wraps inside its
    // column instead of dragging the table sideways.
    //
    // Shares are declared once and drive the widths and the headers together,
    // so the two cannot drift apart. They total 100 in both states.
    const columns = showMadeBy
      ? [
          { label: "#", share: 4 },
          { label: "Piece", share: 17 },
          { label: "Made by", share: 8 },
          { label: "Qty", share: 3 },
          { label: "Cut size", share: 12 },
          { label: "Thick.", share: 5 },
          { label: "Material / colour", share: 18 },
          { label: "Edging / supplier", share: 13 },
          { label: "Notes", share: 20 },
        ]
      : [
          { label: "#", share: 4 },
          { label: "Piece", share: 19 },
          { label: "Qty", share: 3 },
          { label: "Cut size", share: 13 },
          { label: "Thick.", share: 5 },
          { label: "Material / colour", share: 19 },
          { label: "Edging / supplier", share: 17 },
          { label: "Notes", share: 20 },
        ];

    function renderRow(row) {
      const madeHere = isPanelMadeInHouse(row);
      return (
        <tr key={row.key}>
          <td className={tw.td}>{renderPanelBadge(row)}</td>
          <td className={tw.td + " " + tw.wrapCell}>
            <p className="text-[12px] font-semibold text-[#1a1a18]">{row.piece}</p>
          </td>
          {showMadeBy ? (
            <td className={tw.td}>
              <span className={`${tw.pill} ${madeByBadge(row).tone}`}>
                {madeByBadge(row).label}
              </span>
            </td>
          ) : null}
          <td className={tw.td + " font-mono"}>{row.qty}</td>
          <td className={tw.td + " whitespace-nowrap font-mono text-[11px]"}>{row.size}</td>
          <td className={tw.td + " font-mono text-[11px]"}>{row.thickness}</td>
          <td className={tw.td + " " + tw.wrapCell}>{row.material}</td>
          <td className={tw.td + " " + tw.wrapCell}>
            {madeHere ? row.edging : (row.plan.supplier_name || defaultSupplierForItem(row.item))}
          </td>
          <td className={tw.tdLast + " " + tw.wrapCell + " text-[11px] text-[#5a5a52] italic"}>{row.notes || "—"}</td>
        </tr>
      );
    }

    return (
      <div className={tw.card}>
        <div className="flex items-center justify-between gap-4 flex-wrap px-4 py-3 border-b border-[#edf4eb] bg-[#f5f8f4]">
          <div className="flex items-center gap-5">
            <div>
              <span className="text-[18px] font-semibold text-[#1a1a18] font-mono">{visibleRows.length}</span>
              <span className={tw.muted + " ml-1"}>panels</span>
            </div>
            <div>
              <span className="text-[18px] font-semibold text-[#1a1a18] font-mono">{pieces}</span>
              <span className={tw.muted + " ml-1"}>pieces</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Labels are numbered off this list, so they live beside it. */}
            <button
              type="button"
              className={tw.primaryBtn + " whitespace-nowrap"}
              disabled={Boolean(generatingLabels) || !labelCount}
              onClick={() => downloadLabels("pdf")}
              title={`${labelCount} labels, one per piece, numbered to match the production sheet`}
            >
              {generatingLabels === "pdf" ? "Building labels..." : `Print ${labelCount} labels`}
            </button>
            <button
              type="button"
              className={tw.secondaryBtn + " whitespace-nowrap"}
              disabled={Boolean(generatingLabels) || !labelCount}
              onClick={() => downloadLabels("csv")}
              title="One row per label, for P-touch Editor"
            >
              {generatingLabels === "csv" ? "Building CSV..." : "Labels as CSV"}
            </button>
            <button
              type="button"
              className={tw.secondaryBtn + " whitespace-nowrap"}
              disabled={isGeneratingCutListPdf || !labelCount}
              onClick={generateCutListPdf}
            >
              {isGeneratingCutListPdf ? "Generating PDF..." : "Production sheet PDF"}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap px-4 py-3 border-b border-[#dbd8cc]">
          <div className="inline-flex rounded-[6px] border border-[#dbd8cc] overflow-hidden">
            {filters.map((filter, index) => (
              <button
                key={filter.key}
                type="button"
                aria-pressed={productionFilter === filter.key}
                onClick={() => setProductionFilter(filter.key)}
                className={`h-[30px] px-3 text-[12px] font-medium transition-colors ${index ? "border-l border-[#dbd8cc]" : ""} ${
                  productionFilter === filter.key
                    ? "bg-[#1c2b1e] text-white"
                    : "bg-white text-[#5a5a52] hover:bg-[#f5f8f4]"
                }`}
              >
                {filter.label}{filter.key === "all" ? "" : ` (${filter.count})`}
              </button>
            ))}
          </div>
          <span className={tw.muted}>Same rows, numbers and grouping as the production sheet</span>
        </div>

        <div className="hidden md:block">
          <div className={tw.tableWrap}>
            <table className={tw.tableFixed}>
              <colgroup>
                {columns.map(column => (
                  <col key={column.label} style={{ width: `${column.share}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {columns.map(column => (
                    <th key={column.label} className={tw.th + " whitespace-normal"}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assemblies.map(group => (
                  <React.Fragment key={group.key}>
                    <tr>
                      <td colSpan={columns.length} className="px-4 py-[7px] bg-[#eae6da] border-y border-[#c9c4b4]">
                        <span className="text-[12px] font-semibold text-[#1a1a18]">{group.name}</span>
                        {group.meta ? <span className={tw.muted + " ml-2"}>{group.meta}</span> : null}
                        <span className={tw.muted + " float-right"}>
                          {group.rows.length} {group.rows.length === 1 ? "row" : "rows"}
                        </span>
                      </td>
                    </tr>
                    {group.rows.map(renderRow)}
                  </React.Fragment>
                ))}
                {standalone.map(renderRow)}
                {!visibleRows.length && (
                  <tr><td colSpan={columns.length} className="py-8 text-center text-[12px] text-[#8b8a81]">No panels in this view.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="md:hidden flex flex-col gap-3 p-3">
          {[...assemblies.flatMap(group => group.rows), ...standalone].map(row => {
            const madeHere = isPanelMadeInHouse(row);
            return (
              <article key={row.key} className="bg-white border border-[#dbd8cc] rounded-[8px] p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-start gap-2">
                    {renderPanelBadge(row)}
                    <div>
                      <p className="text-[13px] font-semibold text-[#1a1a18]">{row.piece}</p>
                      <p className="text-[11px] text-[#8b8a81]">{row.source}</p>
                    </div>
                  </div>
                  <span className={`${tw.pill} ${madeByBadge(row).tone}`}>
                    {madeByBadge(row).label}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                  <div><dt className="text-[#8b8a81]">Qty</dt><dd className="text-[#1a1a18]">{row.qty}</dd></div>
                  <div><dt className="text-[#8b8a81]">Cut size</dt><dd className="text-[#1a1a18] font-mono text-[11px]">{row.size}</dd></div>
                  <div><dt className="text-[#8b8a81]">Thickness</dt><dd className="text-[#1a1a18]">{row.thickness}</dd></div>
                  <div className="col-span-2"><dt className="text-[#8b8a81]">Material</dt><dd className="text-[#1a1a18]">{row.material}</dd></div>
                  <div className="col-span-2">
                    <dt className="text-[#8b8a81]">{madeHere ? "Edging" : "Supplier"}</dt>
                    <dd className="text-[#1a1a18]">{madeHere ? row.edging : (row.plan.supplier_name || defaultSupplierForItem(row.item))}</dd>
                  </div>
                </dl>
                {row.notes && (
                  <div className="pt-3 mt-3 border-t border-[#edf4eb]">
                    <p className="text-[11px] text-[#5a5a52] italic">{row.notes}</p>
                  </div>
                )}
              </article>
            );
          })}
          {!visibleRows.length && (
            <p className="py-8 text-center text-[12px] text-[#8b8a81]">No panels in this view.</p>
          )}
        </div>
      </div>
    );
  }

  // The Issues tab. Status pills and a search, the same shape as the Orders and
  // Quotes lists, because it is the same kind of list.
  function panelLabelForIssue(issue) {
    const row = planningRows.filter(r => r.item.id === issue.line_item_id && (r.panelKey || null) === (issue.panel_key || null))[0];
    if (row) return row.piece || row.source;
    const item = (order?.pcd_order_line_items || []).filter(i => i.id === issue.line_item_id)[0];
    return item?.title || "Panel no longer on this order";
  }

  function renderIssues() {
    const query = issueSearch.trim().toLowerCase();
    const rows = sortIssues(issues).filter(issue => {
      if (issueFilter === "open" && issue.resolved_at) return false;
      if (issueFilter === "resolved" && !issue.resolved_at) return false;
      if (!query) return true;
      return [issueKindLabel(issue.kind), issue.detail, issue.resolution, panelLabelForIssue(issue)]
        .filter(Boolean).join(" ").toLowerCase().includes(query);
    });

    const counts = {
      open: issuesOpen.length,
      resolved: issues.length - issuesOpen.length,
      all: issues.length,
    };
    const rework = openReworkCost(issues);

    return (
      <div className={tw.card}>
        <div className={tw.cardHeader}>
          <StatusFilterBar
            value={issueFilter}
            onChange={setIssueFilter}
            options={[
              { value: "open", label: "Open", count: counts.open },
              { value: "resolved", label: "Resolved", count: counts.resolved },
              { value: "all", label: "All", count: counts.all },
            ]}
          />
          <div className="flex items-center gap-3">
            {rework > 0 && (
              <span className={tw.muted}>{formatMoney(rework, order.currency || "AUD")} of open rework</span>
            )}
            <button type="button" className={tw.smBtn} onClick={() => openIssueFor(null)}>
              Report an issue with the order
            </button>
            <input
              className="h-[36px] w-[220px] rounded-[6px] border border-[#dbd8cc] px-3 text-[13px] text-[#1a1a18] outline-none transition-colors placeholder:text-[#8b8a81] focus:border-[#6b9e61]"
              placeholder="Search issues"
              value={issueSearch}
              onChange={e => setIssueSearch(e.target.value)}
            />
          </div>
        </div>

        {!rows.length ? (
          <EmptyState
            title={query ? "Nothing matches that search" : issueFilter === "open" ? "No open issues" : "Nothing here"}
            description={
              query
                ? "Try a different word."
                : issueFilter === "open"
                  ? "Every problem raised on this job has been resolved."
                  : "Nothing on this order is in that state."
            }
          />
        ) : (
          <div className={tw.tableWrap}>
            <table className={tw.table}>
              <thead>
                <tr>
                  {["Panel","What is wrong","Was at","To fix","Blocks","Rework","Raised","Status",""].map(h => (
                    <th key={h || "actions"} className={tw.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(issue => (
                  <tr key={issue.id}>
                    <td className={tw.td}>
                      <p className="text-[12px] font-semibold text-[#1a1a18]">{panelLabelForIssue(issue)}</p>
                    </td>
                    <td className={tw.td}>
                      <p className="text-[12px] font-semibold text-[#1a1a18]">{issueKindLabel(issue.kind)}</p>
                      <p className={`${tw.cellText} ${tw.muted}`}>{issue.detail}</p>
                      {issue.resolution && (
                        <p className={`${tw.cellText} text-[11px] text-[#2d5e28] mt-[3px]`}>
                          <b className="font-semibold">Fixed.</b> {issue.resolution}
                        </p>
                      )}
                    </td>
                    <td className={tw.td}>
                      {issue.stage_at_report
                        ? <span className={`${tw.pill} bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]`}>{progressReads(issue)}</span>
                        : <span className={tw.muted}>Not recorded</span>}
                    </td>
                    <td className={tw.td}>{issueOwnerLabel(issue.owner)}</td>
                    <td className={tw.td}>
                      {issue.blocks === "order"
                        ? <span className={`${tw.pill} bg-[#fef2f2] text-[#b91c1c] border-[#fca5a5]`}>The whole order</span>
                        : <span className={tw.muted}>{issueBlocksLabel(issue.blocks)}</span>}
                    </td>
                    <td className={tw.td + " " + tw.mono}>
                      {Number(issue.extra_cost_ex_gst) > 0
                        ? formatMoney(issue.extra_cost_ex_gst, order.currency || "AUD")
                        : <span className={tw.muted}>·</span>}
                    </td>
                    <td className={tw.td + " whitespace-nowrap"}>{daysSince(issue.raised_at)}d ago</td>
                    <td className={tw.td}>
                      {issue.resolved_at
                        ? <span className={`${tw.pill} bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]`}>Resolved</span>
                        : <span className={`${tw.pill} bg-[#fef2f2] text-[#b91c1c] border-[#fca5a5]`}>Open</span>}
                    </td>
                    <td className={tw.tdLast + " text-right"}>
                      <ActionMenu label="Issue actions" size="xs">
                        {issue.resolved_at ? (
                          <ActionMenuItem
                            onClick={() => patchIssue(issue.id, { reopen: true }, "Reopened. It is back on the board.")}
                          >
                            Reopen
                          </ActionMenuItem>
                        ) : (
                          <ActionMenuItem
                            onClick={() => { setIssueErrors({}); setResolveDraft({ id: issue.id, kind: issue.kind, detail: issue.detail, resolution: "" }); }}
                          >
                            Mark resolved
                          </ActionMenuItem>
                        )}
                      </ActionMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                className="h-[26px] px-3 text-[11px] font-medium rounded-[6px] bg-[#1c2b1e] text-white hover:bg-[#2d3f2f] transition-colors"
                onClick={() => setPaymentModal({ payment_type: "progress", amount: "", is_paid: false, paid_at: "", notes: "" })}
              >
                Add payment
              </button>
              {/* Only where there is money to give back. Offering it against an
                  order nobody has paid would be offering something that cannot
                  be done. */}
              {refundablePayments(payments).length > 0 && (
                <button
                  type="button"
                  className="h-[26px] px-3 text-[11px] font-medium rounded-[6px] border border-[#dbd8cc] bg-white text-[#5a5a52] hover:bg-[#f5f8f4] transition-colors"
                  onClick={() => setRefundModalOpen(true)}
                  title="Give money back on this order"
                >
                  Add refund
                </button>
              )}
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
                  {payments.map(payment => {
                    const isEditing = editingPaymentId === payment.id;
                    const isSaving = savingPaymentId === payment.id;
                    const hasRequest = paymentHasRequest(payment);
                    const canEditFinancialFields = canEditPaymentFinancialFields(payment);
                    const canDelete = canDeletePaymentLine(payment);
                    const canRefresh = canRefreshPaymentLine(payment);
                    return (
                      <tr key={payment.id}>
                        <td className={tw.td}>
                          {isEditing && !isRefund(payment) ? (
                            <select
                              className={tw.inlineSelect}
                              style={{minWidth: "120px"}}
                              value={payment.payment_type || "progress"}
                              disabled={isSaving || !canEditFinancialFields}
                              onChange={e => updatePayment(payment, { payment_type: e.target.value })}
                            >
                              {paymentTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                            </select>
                          ) : (
                            <span className="text-[12px] font-medium text-[#1a1a18]">
                              {isRefund(payment) ? "Refund" : paymentTypeText(payment.payment_type)}
                              {isRefund(payment) && (
                                <span className="block text-[10.5px] font-normal text-[#8b8a81]">
                                  {refundMethodLabel(payment.refund_method)}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className={tw.td}>
                          {isEditing ? (
                            <input
                              className={tw.inlineInput + " font-mono"}
                              type="number"
                              min="0"
                              step="0.01"
                              style={{minWidth: "100px"}}
                              value={payment.amount ?? ""}
                              disabled={isSaving || !canEditFinancialFields}
                              onChange={e => updatePaymentLocal(payment.id, { amount: e.target.value })}
                              onBlur={e => updatePayment(payment, { amount: e.target.value || 0 })}
                            />
                          ) : (
                            <span className="font-mono text-[12px] text-[#1a1a18]">{formatMoney(Number(payment.amount || 0), order.currency || "AUD")}</span>
                          )}
                        </td>
                        <td className={tw.td}>
                          {isEditing ? (
                            <select
                              className={tw.inlineSelect}
                              style={{minWidth: "90px"}}
                              value={payment.is_paid ? "paid" : "pending"}
                              disabled={isSaving || !canEditFinancialFields}
                              onChange={e => updatePayment(payment, { is_paid: e.target.value === "paid" })}
                            >
                              <option value="pending">Pending</option>
                              <option value="paid">Paid</option>
                            </select>
                          ) : (
                            <span className={`${tw.pill} ${paymentStatusClass(payment)}`}>{paymentStatusText(payment)}</span>
                          )}
                        </td>
                        <td className={tw.td}>
                          {isEditing ? (
                            <input
                              className={tw.inlineInput}
                              type="date"
                              style={{minWidth: "130px"}}
                              value={payment.paid_at || ""}
                              disabled={isSaving || !canEditFinancialFields || !payment.is_paid}
                              onChange={e => updatePaymentLocal(payment.id, { paid_at: e.target.value })}
                              onBlur={e => updatePayment(payment, { paid_at: e.target.value })}
                            />
                          ) : (
                            <span className="text-[12px] text-[#5a5a52]">{payment.paid_at ? formatDate(payment.paid_at) : "—"}</span>
                          )}
                        </td>
                        <td className={tw.td}>
                          {isEditing ? (
                            <input
                              className={tw.inlineInput}
                              style={{minWidth: "160px"}}
                              value={payment.notes || ""}
                              disabled={isSaving}
                              onChange={e => updatePaymentLocal(payment.id, { notes: e.target.value })}
                              onBlur={e => updatePayment(payment, { notes: e.target.value })}
                            />
                          ) : (
                            // Wrapped, not truncated. A payment note now carries the
                            // settlement trail as well as whatever was typed, and an
                            // ellipsis hid exactly the part saying how the money arrived.
                            <span className="block min-w-[260px] max-w-[460px] whitespace-normal break-words text-[12px] leading-[1.45] text-[#5a5a52]">{payment.notes || "—"}</span>
                          )}
                        </td>
                        <td className={tw.tdLast}>
                          <div className="flex items-center gap-2">
                            {!payment.is_paid && hasRequest && payment.request_url ? (
                              <a className={tw.smBtn} href={payment.request_url} target="_blank" rel="noopener noreferrer">Payment link</a>
                            ) : null}
                            {canRefresh && (
                              <button
                                type="button"
                                className={tw.smBtn}
                                disabled={isSaving}
                                onClick={() => requestPayment(payment)}
                              >
                                Refresh link
                              </button>
                            )}
                            {canUndoSettlement(payment) && (
                              <button
                                type="button"
                                className={tw.smBtn}
                                disabled={isSaving}
                                onClick={() => undoSettlement(payment)}
                                title="Put this back to owing. Only possible on a payment marked received by hand."
                              >
                                Undo
                              </button>
                            )}
                            {!isRefund(payment) && canSettleOutsideLink(payment) && (
                              <button
                                type="button"
                                className={tw.smBtn}
                                disabled={isSaving}
                                onClick={() => setSettlingPayment(payment)}
                                title="The money arrived by transfer, cash or some other way"
                              >
                                Mark received
                              </button>
                            )}
                            {canProcessRefund(payment) && (
                              <button
                                type="button"
                                className={tw.smBtn}
                                disabled={isSaving}
                                onClick={() => openRefundEmail(payment)}
                                title="Send the money back and tell the customer"
                              >
                                Process
                              </button>
                            )}
                            {!isRefund(payment) && canRequestPaymentLine(payment) && (
                              <button
                                type="button"
                                className={tw.smBtn}
                                disabled={isSaving}
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
                              className={isEditing ? tw.primaryBtn + " !h-[26px] !px-3 !text-[11px]" : tw.smBtn}
                              disabled={isSaving}
                              onClick={() => (isEditing ? closePaymentEdit(payment.id) : setEditingPaymentId(payment.id))}
                            >
                              {isEditing ? "Done" : "Edit"}
                            </button>
                            {canDelete && (
                              <button
                                type="button"
                                className={tw.dangerBtn}
                                disabled={isSaving}
                                onClick={() => deletePayment(payment)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!payments.length && (
                    <tr><td colSpan={6} className="py-8 text-center text-[12px] text-[#8b8a81]">No payment lines yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="md:hidden flex flex-col gap-3 p-3">
            {payments.map(payment => {
              const isEditing = editingPaymentId === payment.id;
              const isSaving = savingPaymentId === payment.id;
              const hasRequest = paymentHasRequest(payment);
              const canEditFinancialFields = canEditPaymentFinancialFields(payment);
              const canDelete = canDeletePaymentLine(payment);
              const canRefresh = canRefreshPaymentLine(payment);
              return (
                <article key={payment.id} className="bg-white border border-[#dbd8cc] rounded-[8px] p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-semibold text-[#1a1a18]">{paymentTypeText(payment.payment_type)}</p>
                      <p className="font-mono text-[12px] text-[#5a5a52]">{formatMoney(Number(payment.amount || 0), order.currency || "AUD")}</p>
                    </div>
                    <span className={`${tw.pill} ${paymentStatusClass(payment)}`}>{paymentStatusText(payment)}</span>
                  </div>
                  {isEditing ? (
                    <>
                      <div className="mb-3">
                        <select
                          className={tw.inlineSelect}
                          value={payment.payment_type || "progress"}
                          disabled={isSaving || !canEditFinancialFields}
                          onChange={e => updatePayment(payment, { payment_type: e.target.value })}
                        >
                          {paymentTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                        </select>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] mb-3">
                        <div>
                          <dt className="text-[#8b8a81] mb-1">Amount</dt>
                          <dd><input className={tw.inlineInput + " font-mono"} type="number" min="0" step="0.01" value={payment.amount ?? ""} disabled={isSaving || !canEditFinancialFields} onChange={e => updatePaymentLocal(payment.id, { amount: e.target.value })} onBlur={e => updatePayment(payment, { amount: e.target.value || 0 })} /></dd>
                        </div>
                        <div>
                          <dt className="text-[#8b8a81] mb-1">Status</dt>
                          <dd>
                            <select className={tw.inlineSelect} value={payment.is_paid ? "paid" : "pending"} disabled={isSaving || !canEditFinancialFields} onChange={e => updatePayment(payment, { is_paid: e.target.value === "paid" })}>
                              <option value="pending">Pending</option>
                              <option value="paid">Paid</option>
                            </select>
                          </dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-[#8b8a81] mb-1">Date paid</dt>
                          <dd><input className={tw.inlineInput} type="date" value={payment.paid_at || ""} disabled={isSaving || !canEditFinancialFields || !payment.is_paid} onChange={e => updatePaymentLocal(payment.id, { paid_at: e.target.value })} onBlur={e => updatePayment(payment, { paid_at: e.target.value })} /></dd>
                        </div>
                      </dl>
                      <div className="mb-3">
                        <input className={tw.inlineInput} placeholder="Notes" value={payment.notes || ""} disabled={isSaving} onChange={e => updatePaymentLocal(payment.id, { notes: e.target.value })} onBlur={e => updatePayment(payment, { notes: e.target.value })} />
                      </div>
                    </>
                  ) : (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] mb-3">
                      <div><dt className="text-[#8b8a81]">Date paid</dt><dd className="text-[#1a1a18]">{payment.paid_at ? formatDate(payment.paid_at) : "—"}</dd></div>
                      <div><dt className="text-[#8b8a81]">Notes</dt><dd className="text-[#1a1a18]">{payment.notes || "—"}</dd></div>
                    </dl>
                  )}
                  <div className="pt-3 mt-3 border-t border-[#edf4eb] flex flex-wrap gap-2">
                    {!payment.is_paid && hasRequest && payment.request_url ? (
                      <a className={tw.smBtn} href={payment.request_url} target="_blank" rel="noopener noreferrer">Payment link</a>
                    ) : null}
                    {canRefresh && (
                      <button type="button" className={tw.smBtn} disabled={isSaving} onClick={() => requestPayment(payment)}>Refresh link</button>
                    )}
                    {canUndoSettlement(payment) && (
                      <button type="button" className={tw.smBtn} disabled={isSaving} onClick={() => undoSettlement(payment)}>Undo</button>
                    )}
                    {!isRefund(payment) && canSettleOutsideLink(payment) && (
                      <button
                        type="button"
                        className={tw.smBtn}
                        disabled={isSaving}
                        onClick={() => setSettlingPayment(payment)}
                        title="The money arrived by transfer, cash or some other way"
                      >
                        Mark received
                      </button>
                    )}
                    {canProcessRefund(payment) && (
                      <button
                        type="button"
                        className={tw.smBtn}
                        disabled={isSaving}
                        onClick={() => openRefundEmail(payment)}
                        title="Send the money back and tell the customer"
                      >
                        Process
                      </button>
                    )}
                    {!isRefund(payment) && canRequestPaymentLine(payment) && (
                      <button type="button" className={tw.smBtn} disabled={isSaving} onClick={() => setPaymentRequestModal({
                        payment,
                        subject: `Payment request — ${order.order_number || "Perth Cabinet Doors"}`,
                        message: [`Hi ${order.customer_name || "there"},`, "", `A payment is requested for ${order.order_number || "your order"}.`, "", "Please use the button below to complete your payment.", "", "Regards,", "Perth Cabinet Doors"].join("\n"),
                      })}>Request</button>
                    )}
                    <button type="button" className={isEditing ? tw.primaryBtn + " !h-[26px] !px-3 !text-[11px]" : tw.smBtn} disabled={isSaving} onClick={() => (isEditing ? closePaymentEdit(payment.id) : setEditingPaymentId(payment.id))}>{isEditing ? "Done" : "Edit"}</button>
                    {canDelete && (
                      <button type="button" className={tw.dangerBtn} disabled={isSaving} onClick={() => deletePayment(payment)}>Delete</button>
                    )}
                  </div>
                </article>
              );
            })}
            {!payments.length && (
              <p className="py-8 text-center text-[12px] text-[#8b8a81]">No payment lines yet.</p>
            )}
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

  function renderRefundEmailModal() {
    if (!refundEmailModal) return null;
    const { refund, message, subject } = refundEmailModal;
    const hasEmail = !!order.customer_email;
    const isSending = savingPaymentId === refund.id;

    return (
      <Modal
        open={true}
        onClose={() => setRefundEmailModal(null)}
        title="Process refund"
        subtitle="The money goes back and the customer is told"
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors"
              onClick={() => setRefundEmailModal(null)}
              disabled={isSending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors"
              disabled={isSending}
              onClick={() => {
                setRefundEmailModal(null);
                processRefund(refund, { message, subject });
              }}
            >
              {isSending ? "Processing…" : "Process refund and send"}
            </button>
          </>
        }
      >
        <div className={styles.customerModalGrid}>
          {/* What is about to happen, before the email that describes it. A card
              refund cannot be taken back, so it is worth reading twice. */}
          <div className={`${styles.fieldWide} rounded-[6px] border border-[#f0d060] bg-[#fffef0] px-3 py-2`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] text-[#8a6d0b]">
                {refundMethodLabel(refund.refund_method)}
              </span>
              <strong className="font-mono text-[14px] text-[#1a1a18]">
                {formatMoney(refundAmount(refund), order.currency || "AUD")}
              </strong>
            </div>
            <p className="mt-[3px] text-[11.5px] leading-[1.5] text-[#8a6d0b]">
              Once this is sent it cannot be undone from here.
            </p>
          </div>

          <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
            To
            <input className={styles.fieldInput} value={order.customer_email || ""} disabled />
          </label>
          {!hasEmail && (
            <p className={`${styles.fieldWide} text-[12px] text-[#991b1b]`}>
              This order has no customer email. The refund can still be processed, but nobody will be told.
            </p>
          )}
          <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
            Subject
            <input
              className={styles.fieldInput}
              value={subject}
              onChange={(event) => setRefundEmailModal((current) => ({ ...current, subject: event.target.value }))}
            />
          </label>
          <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
            Email message
            <textarea
              className={`${styles.textareaInput} ${styles.fieldWide}`}
              rows={10}
              value={message}
              onChange={(event) => setRefundEmailModal((current) => ({ ...current, message: event.target.value }))}
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

  function renderHistory() {
    // Default to the newest, which is what somebody opening this usually wants.
    const selected =
      versions.find((version) => version.key === openVersion) || versions[versions.length - 1];
    if (!selected) return null;

    return (
      <div className="flex flex-col gap-3">
        {versionGaps.length ? (
          <div className="rounded-[6px] border border-[#e8d68f] bg-[#fffdf0] px-3 py-2 text-[12px] leading-[1.5] text-[#8a6d0b]">
            {/* A gap shown as a fact is worse than a gap shown as a gap. */}
            {versionGaps.map((gap) => (
              <p key={gap.version + gap.reason} className="m-0">{gap.version}: {gap.reason}</p>
            ))}
          </div>
        ) : null}

        <div className={tw.card}>
          <div className={tw.cardHeader}>
            <div>
              <span className={tw.cardTitle}>Order history</span>
              <p className={tw.muted}>What this order was at each stage, and what each variation changed.</p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-[#edf4eb]">
            {versions.map((version) => {
              const active = version.key === selected.key;
              return (
                <button
                  key={version.key}
                  type="button"
                  onClick={() => setOpenVersion(version.key)}
                  className={"flex-shrink-0 rounded-[6px] border px-3 py-2 text-left transition-colors " + (active
                    ? "border-[#1c2b1e] bg-[#1c2b1e] text-white"
                    : "border-[#dbd8cc] bg-white text-[#1a1a18] hover:bg-[#f5f8f4]")}
                >
                  <span className="block text-[12px] font-semibold">{version.label}</span>
                  <span className={"block text-[11px] " + (active ? "text-[#c7d8c4]" : "text-[#8b8a81]")}>
                    {version.at ? formatDate(version.at) : "-"} · {formatMoney(version.total, order.currency || "AUD")}
                  </span>
                </button>
              );
            })}
          </div>

          {selected.changes.length ? (
            <div className="px-4 py-3 border-b border-[#edf4eb] bg-[#f9faf8]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52] mb-2">
                What this variation changed
              </p>
              <div className="flex flex-col gap-2">
                {selected.changes.map((change, index) => (
                  <div key={change.label + index} className="text-[12px] text-[#1a1a18]">
                    <span className="font-semibold">{change.summary}</span>
                    {change.unknownBefore ? (
                      <span className="text-[#8a6d0b]"> · what it was beforehand was not recorded</span>
                    ) : null}
                    {change.fields.length ? (
                      <div className="mt-[3px] flex flex-col gap-[2px] pl-3 border-l-2 border-[#dbd8cc]">
                        {change.fields.map((field) => (
                          <span key={field.field} className="text-[11px] text-[#5a5a52]">
                            {field.label}:{" "}
                            <span className="line-through text-[#8b8a81]">{String(field.from) || "blank"}</span>
                            {" to "}
                            <span className="font-medium text-[#1a1a18]">{String(field.to) || "blank"}</span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className={tw.tableWrap}>
            <table className={tw.table}>
              <thead>
                <tr>
                  {["#", "Item", "Material / colour", "Size", "Qty", "Total ex GST"].map((header) => (
                    <th key={header} className={tw.th}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((line, index) => (
                  <tr key={line.id || index} className={line.variation_status === "removed" ? "opacity-55" : ""}>
                    <td className={tw.td}>{index + 1}</td>
                    <td className={tw.td}>
                      <span className={tw.cellText + " font-medium"}>{line.title || line.product_type || "Item"}</span>
                      {line.variation_status === "removed" ? <span className={tw.muted}>Removed</span> : null}
                      {line.history_unknown ? (
                        <span className="block text-[11px] text-[#8a6d0b]">Shown as it is now</span>
                      ) : null}
                    </td>
                    <td className={tw.td}>{[line.material, line.colour].filter(Boolean).join(" - ") || "-"}</td>
                    <td className={tw.td + " whitespace-nowrap"}>{formatCutSize(line.height_mm, line.width_mm)}</td>
                    <td className={tw.td}>{line.qty || 1}</td>
                    <td className={tw.tdLast + " " + tw.mono}>
                      {formatMoney(line.line_total_ex_gst || 0, order.currency || "AUD")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ARCHIVING AN ORDER, AND PUTTING IT BACK.
  //
  // Not a status somebody picks from the dropdown above: archiving has to
  // record what the order WAS, so the restore puts it back rather than dropping
  // it to active. The route refuses to archive an order with money still owed
  // on it until that has been said out loud, and this passes the confirmation
  // back when it has been.
  async function setArchived(archived, acknowledge = false) {
    setIsSavingOrder(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived, acknowledge_outstanding: acknowledge }),
      });
      const result = await response.json();

      // Money still owed on it. Not a refusal, a second question, and it is
      // asked in the same modal language as the first rather than in a browser
      // dialog that looks like it came from somewhere else.
      if (result?.needsAcknowledgement) {
        setArchiveOutstanding(result.error || "There is still money owed on this order.");
        return;
      }
      if (!response.ok || !result.ok) {
        toast({ title: result?.error || "Could not archive that order.", variant: "error" });
        return;
      }

      setArchiveOutstanding("");
      toast({
        title: archived
          ? "Archived. It stops counting anywhere until you restore it."
          : "Restored. It is back the way it was before it was archived.",
        variant: "success",
      });
      await loadOrder();
      router.refresh();
    } catch (error) {
      toast({ title: error?.message || "Could not archive that order.", variant: "error" });
    } finally {
      setIsSavingOrder(false);
    }
  }

  // AN APPROVED VARIATION THAT NEVER REACHED THE ORDER.
  //
  // Approving records the customer's answer and then writes the variation onto
  // the order. The second half can fail on its own, and when it does the
  // variation sits at "approved" while the order still shows the old money: the
  // balance owing is short by exactly what the customer agreed to, and nothing
  // on the page says so. This finishes it.
  async function applyVariation(variationId) {
    setIsSavingOrder(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/variations/${variationId}/apply`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        // The message is whatever stopped it, which is the thing to fix before
        // pressing it again.
        window.alert(result?.error || "Could not write this variation onto the order.");
        return;
      }
      router.refresh();
    } catch (error) {
      window.alert(error?.message || "Could not write this variation onto the order.");
    } finally {
      setIsSavingOrder(false);
    }
  }

  function renderVariations() {
    return (
      <div className={tw.card}>
        <div className={tw.cardHeader}>
          <div>
            <span className={tw.cardTitle}>Order variations</span>
            <p className={tw.muted}>Commercial changes are sent to the customer for approval before they update the order.</p>
          </div>
          <button type="button" className={tw.primaryBtn} disabled={isSavingOrder} onClick={createVariation}>
            Create variation
          </button>
        </div>
        <div className={tw.tableWrap}>
          <table className={tw.table}>
            <thead>
              <tr>
                {["Variation", "Status", "Lines", "Variation total", "Deposit top-up", "Sent", "Approved"].map((heading) => (
                  <th key={heading} className={tw.th}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {variations.map((variation) => (
                /* The whole row opens the variation, like every other table in
                   the admin. An Open button in its own column was a target the
                   size of a word on a row the width of the screen. */
                <tr
                  key={variation.id}
                  className="cursor-pointer transition-colors hover:bg-[#f5f8f4]"
                  onClick={() => router.push(`/admin/orders/${orderId}/variations/${variation.id}`)}
                >
                  <td className={tw.td}>
                    <p className="text-[12px] font-semibold text-[#1a1a18]">{variation.variation_number}</p>
                    <p className={`${tw.cellText} ${tw.muted}`}>{variation.title || "Order Variation"}</p>
                  </td>
                  <td className={tw.td}>
                    <span className={`${tw.pill} ${
                      ["applied", "approved"].includes(variation.status)
                        ? "bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]"
                        : variation.status === "approved_pending_payment"
                        ? "bg-[#fffbeb] text-[#92400e] border-[#fcd34d]"
                        : ["rejected", "cancelled"].includes(variation.status)
                        ? "bg-[#fef2f2] text-[#991b1b] border-[#fca5a5]"
                        : "bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]"
                    }`}>{titleCaseStatus(variation.status)}</span>
                  </td>
                  <td className={tw.td}>{variation.pcd_order_variation_lines?.length || 0}</td>
                  <td className={tw.td + " font-mono"}>{formatMoney(variation.total_inc_gst, variation.currency || order.currency || "AUD")}</td>
                  <td className={tw.td + " font-mono"}>{formatMoney(variation.deposit_topup_required, variation.currency || order.currency || "AUD")}</td>
                  <td className={tw.td}>{formatDate(variation.sent_at)}</td>
                  <td className={tw.tdLast}>{formatDate(variation.approved_at || variation.applied_at)}</td>
                </tr>
              ))}
              {/* Approved and never written onto the order. Said here, on the
                  order, because this is the screen where the money looks right
                  and is not. */}
              {variations.filter((v) => v.status === "approved").map((variation) => (
                <tr key={`stuck-${variation.id}`} onClick={(event) => event.stopPropagation()}>
                  <td className={tw.tdLast} colSpan={7}>
                    <div className="flex flex-wrap items-center gap-2 rounded-[6px] border border-[#fcd34d] bg-[#fffbeb] px-3 py-2">
                      <span className="text-[12px] text-[#92400e]">
                        <strong className="font-semibold">{variation.variation_number} was approved but has not been added to this order.</strong>{" "}
                        The totals below do not include it
                        {variation.apply_error ? `, because: ${variation.apply_error}` : "."}
                      </span>
                      <button
                        type="button"
                        className={tw.smBtn + " ml-auto"}
                        disabled={isSavingOrder}
                        onClick={() => applyVariation(variation.id)}
                      >
                        Add it to the order
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!variations.length ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[12px] text-[#8b8a81]">
                    No variations yet. Create one when the customer asks to add, change, or remove accepted scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
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
        {/* WHAT IS ALREADY WRITTEN AGAINST THIS LINE, before the box you type
            in. These come from the quote and from the order and are read only
            here: the quote is the record of what was agreed, and the way to
            change what the customer was told is to raise a variation. Showing
            them means a note about a mitre written when the job was sold is in
            front of the person deciding what to write now. */}
        {lineNotes(row.item, {}).length > 0 && (
          <div className="mb-3 flex flex-col gap-2">
            {lineNotes(row.item, {}).map((note) => (
              <div key={note.key} className="rounded-[6px] border border-[#dbd8cc] bg-[#faf9f5] px-3 py-2">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">{note.label}</div>
                <p className="mt-[2px] whitespace-pre-wrap text-[12.5px] leading-[1.5] text-[#1a1a18]">{note.text}</p>
              </div>
            ))}
          </div>
        )}

        <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
          Note for this panel
          <textarea
            className={styles.textareaInput}
            rows={5}
            placeholder="Anything about cutting this piece that is not already said above."
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
        <div className={`${tw.tableWrap} hidden md:block`}>
          <table className={tw.table}>
            <thead>
              <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                {['Date', 'Event', 'Detail', 'Actor', 'Type'].map(h => (
                  <th key={h} className={tw.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activity.map((entry) => (
                <tr key={entry.id} className="border-b border-[#edf4eb] last:border-b-0 hover:bg-[#f5f8f4] transition-colors">
                  <td className={tw.td + ' whitespace-nowrap text-[#8b8a81] text-[11px]'}>
                    {formatDateTime(entry.created_at)}
                  </td>
                  <td className={tw.td + ' font-medium whitespace-nowrap'}>
                    {entry.title}
                  </td>
                  <td className={tw.td + ' text-[#5a5a52]'}>
                    <span className="block max-w-[320px] truncate text-[11px]" title={formatActivityDescription(entry.description)}>
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
          {activity.map(entry => (
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
    if (activeSection === "issues") return renderIssues();
    if (activeSection === "payments") return renderPayments();
    if (activeSection === "variations") return renderVariations();
    if (activeSection === "history") return renderHistory();
    if (activeSection === "activity") return renderActivity();
    if (activeSection === "notes") return renderNotes();
    return renderOverview();
  }

  // Raising an issue. The panel's progress is shown, and said to be untouched,
  // because that is the behaviour people have to be able to trust.
  const issueModal = (
    <Modal
      open={Boolean(issueDraft)}
      onClose={() => setIssueDraft(null)}
      title="Report an issue"
      subtitle={issueDraft
        ? `${issueDraft.panel_label} · ${order?.order_number || ""}${issueDraft.stage_at_report ? ` · ${issueDraft.progress_kind.toLowerCase()} is ${issueDraft.stage_at_report}` : ""}`
        : ""}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => setIssueDraft(null)} disabled={savingIssue}>Cancel</Button>
          <Button onClick={saveIssue} disabled={savingIssue}>Raise the issue</Button>
        </>
      }
    >
      {issueDraft && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-[6px]">
            <span className="text-[11px] font-medium text-[#5a5a52]">
              What is wrong <span className="text-[#991b1b]">*</span>
            </span>
            <div className="flex flex-wrap gap-[6px]">
              {ISSUE_KINDS.map(kind => (
                <button
                  key={kind.key}
                  type="button"
                  onClick={() => setIssueDraft(d => ({ ...d, kind: kind.key }))}
                  className={`rounded-[6px] border px-3 py-[6px] text-[12px] font-medium transition-colors ${
                    issueDraft.kind === kind.key
                      ? "border-[#1c2b1e] bg-[#1c2b1e] text-white"
                      : "border-[#dbd8cc] bg-white text-[#5a5a52] hover:bg-[#f5f8f4]"
                  }`}
                >
                  {kind.label}
                </button>
              ))}
            </div>
            {issueErrors.kind && <span className="text-[11px] text-[#991b1b]">{issueErrors.kind}</span>}
          </div>

          <Textarea
            label="What happened"
            error={issueErrors.detail}
            rows={3}
            placeholder="Say what went wrong, in the words you would use to somebody on the bench."
            value={issueDraft.detail}
            onChange={e => setIssueDraft(d => ({ ...d, detail: e.target.value }))}
          />

          <div className={tw.grid2}>
            <Select
              label="Who has to fix it"
              value={issueDraft.owner}
              onChange={e => setIssueDraft(d => ({ ...d, owner: e.target.value }))}
              options={ISSUE_OWNERS.map(o => ({ value: o.key, label: o.label }))}
            />
            <Select
              label="Does it stop the job"
              value={issueDraft.blocks}
              onChange={e => setIssueDraft(d => ({ ...d, blocks: e.target.value }))}
              options={ISSUE_BLOCKS.map(b => ({ value: b.key, label: b.label }))}
            />
          </div>

          <Input
            label="Extra cost, ex GST"
            optional
            inputMode="decimal"
            placeholder="0.00"
            error={issueErrors.extra_cost_ex_gst}
            containerClassName="max-w-[240px]"
            value={issueDraft.extra_cost_ex_gst}
            onChange={e => setIssueDraft(d => ({ ...d, extra_cost_ex_gst: e.target.value }))}
          />

          {issueDraft.stage_at_report && (
            <p className="rounded-[6px] border border-[#dbd8cc] bg-[#f5f8f4] px-3 py-[10px] text-[11.5px] leading-[1.5] text-[#5a5a52]">
              The panel stays at <b className="text-[#1a1a18]">{issueDraft.stage_at_report}</b>. Its{" "}
              {issueDraft.progress_kind.toLowerCase()} is copied onto the issue so you can see where it got to,
              and is never overwritten.
            </p>
          )}
        </div>
      )}
    </Modal>
  );

  // Resolving. The sentence is required: it is the difference between a problem
  // that was fixed and one somebody got tired of looking at.
  const resolveModal = (
    <Modal
      open={Boolean(resolveDraft)}
      onClose={() => setResolveDraft(null)}
      title="Resolve this issue"
      subtitle={resolveDraft ? issueKindLabel(resolveDraft.kind) : ""}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => setResolveDraft(null)} disabled={savingIssue}>Cancel</Button>
          <Button onClick={saveResolution} disabled={savingIssue}>Mark resolved</Button>
        </>
      }
    >
      {resolveDraft && (
        <div className="flex flex-col gap-4">
          <p className="rounded-[6px] border border-[#dbd8cc] bg-[#f5f8f4] px-3 py-[11px] text-[12.5px] leading-[1.5] text-[#5a5a52]">
            {resolveDraft.detail}
          </p>
          <Textarea
            label="What was done about it"
            error={issueErrors.resolution}
            rows={3}
            placeholder="Recut from the offcut and re-edged. Back on the bench."
            value={resolveDraft.resolution}
            onChange={e => setResolveDraft(d => ({ ...d, resolution: e.target.value }))}
          />
        </div>
      )}
    </Modal>
  );

  const activeLabel = sections.find((section) => section.key === activeSection)?.label || "Overview";

  return (
    <>
      <div className="flex flex-col md:flex-row min-h-full md:h-full md:min-h-0">

        {/* Desktop left sidebar nav */}
        <aside className="hidden md:flex flex-col w-[220px] h-full min-h-0 flex-shrink-0 border-r border-[#edf4eb] bg-white">
          <div className="px-4 py-4 border-b border-[#edf4eb]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8b8a81] mb-[2px]">Order</p>
            <p className="text-[15px] font-semibold text-[#1a1a18] truncate">{order.order_number || "Order"}</p>
            <Link href="/admin/orders" className="text-[12px] text-[#6b9e61] hover:underline mt-[2px] block">← Orders</Link>
          </div>

          {/* THE ACTIONS ON THE WHOLE ORDER, in the same place the quote builder
              keeps its own, so the two pages are learned once rather than twice.
              There are fewer of them here on purpose: an order has no draft to
              save, because every field writes as you leave it, and its documents
              are numbered off the production list so they live beside it. */}
          <div className="px-3 py-3 border-b border-[#edf4eb] flex flex-col gap-2">
            {order.pcd_quote?.id ? (
              <Link
                href={`/admin/quotes/${order.pcd_quote.id}`}
                className="h-[32px] flex items-center justify-center px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] transition-colors"
                title={`The quote this order was raised from${order.pcd_quote.quote_number ? `, ${order.pcd_quote.quote_number}` : ""}`}
              >
                Open the quote
              </Link>
            ) : null}
            <button
              type="button"
              onClick={downloadDeliveryLabel}
              disabled={makingDeliveryLabel}
              title="A 62mm label for the outside of the bundle: who it is for, where it goes and how many pieces"
              className="h-[32px] flex items-center justify-center px-3 bg-[#1c2b1e] rounded-[6px] text-[12px] font-medium text-white hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors"
            >
              {makingDeliveryLabel ? "Making…" : "Print Delivery Label"}
            </button>
            <button
              type="button"
              onClick={() => setArchiveOpen(true)}
              disabled={isSavingOrder}
              title={order.status === "archived"
                ? "Put it back the way it was before it was archived."
                : "Takes it off the board, out of the financials and out of the lists. Nothing is deleted and it can be restored."}
              className="h-[32px] flex items-center justify-center px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#5a5a52] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors"
            >
              {order.status === "archived" ? "Restore" : "Archive"}
            </button>
          </div>

          <nav className="p-3 flex flex-col gap-[2px] overflow-y-auto flex-1" aria-label="Order sections">
            {sections.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => goToSection(section.key)}
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

              {/* The same order actions as the sidebar. Archiving was reachable
                  on a phone only by scrolling into Overview and finding it among
                  the fields; here it sits with the sections, where the desktop
                  keeps it. */}
              <div className="px-4 py-3 bg-white border-b border-[#edf4eb] flex flex-wrap gap-2">
                {order.pcd_quote?.id ? (
                  <Link
                    href={`/admin/quotes/${order.pcd_quote.id}`}
                    className="min-h-[40px] flex items-center justify-center px-4 border border-[#dbd8cc] rounded-[6px] text-[13px] font-medium text-[#1a1a18]"
                  >
                    Open the quote
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={downloadDeliveryLabel}
                  disabled={makingDeliveryLabel}
                  className="min-h-[40px] flex items-center justify-center px-4 bg-[#1c2b1e] rounded-[6px] text-[13px] font-medium text-white disabled:opacity-50"
                >
                  {makingDeliveryLabel ? "Making…" : "Print Delivery Label"}
                </button>
                <button
                  type="button"
                  onClick={() => setArchiveOpen(true)}
                  disabled={isSavingOrder}
                  className="min-h-[40px] flex items-center justify-center px-4 border border-[#dbd8cc] rounded-[6px] text-[13px] font-medium text-[#5a5a52] disabled:opacity-50"
                >
                  {order.status === "archived" ? "Restore" : "Archive"}
                </button>
              </div>

              {sections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => goToSection(section.key)}
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
        <main className="hidden md:flex flex-1 flex-col min-w-0 min-h-0 bg-[#f5f8f4]">
          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            {renderSection()}
          </div>
        </main>

      </div>

      {renderPaymentModal()}
      {renderPaymentRequestModal()}
      {renderRefundEmailModal()}

      <RefundModal
        open={refundModalOpen}
        onClose={() => setRefundModalOpen(false)}
        onSubmit={addRefund}
        payments={payments}
        currency={order.currency || "AUD"}
        saving={savingRefund}
      />

      <SettlePaymentModal
        payment={settlingPayment}
        hadLink={hasPaymentRequest(settlingPayment)}
        onClose={() => setSettlingPayment(null)}
        onSettled={(result) => {
          setSettlingPayment(null);
          toast({ title: result.message || "Payment marked as received.", variant: "success" });
          loadOrder();
        }}
        onSubmit={async (body) => {
          const response = await fetch(
            `/api/admin/orders/${orderId}/payments/${settlingPayment.id}/settle`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          );
          const result = await response.json();
          if (!response.ok || !result.ok) throw new Error(result.error || "Could not mark this payment as received.");
          return result;
        }}
      />
      {renderPanelNotesModal()}
      {issueModal}
      {resolveModal}

      {/* Archiving takes an order off the board, out of the financials and out
          of the lists all at once. Reversible, but not something to do by
          brushing past a button. */}
      <ConfirmModal
        open={archiveOpen && !archiveOutstanding}
        onClose={() => setArchiveOpen(false)}
        title={order.status === "archived"
          ? `Restore ${order.order_number || "this order"}?`
          : `Archive ${order.order_number || "this order"}?`}
        description={order.status === "archived"
          ? "It goes back to the status it had before it was archived, and starts counting on the board, in the lists and in the financials again."
          : "It comes off the board, out of the financials and out of the lists. Nothing is deleted and you can restore it from the Archived tab."}
        variant={order.status === "archived" ? "default" : "warning"}
        confirmLabel={order.status === "archived" ? "Restore it" : "Archive it"}
        cancelLabel="Keep it as it is"
        loading={isSavingOrder}
        onConfirm={async () => {
          await setArchived(order.status !== "archived");
          setArchiveOpen(false);
        }}
      />

      {/* The second question, asked only when the route says there is money
          still owed. Separate rather than a warning inside the first, because
          agreeing to archive is not the same as agreeing to walk away from a
          balance, and the two should not be answered with one click. */}
      <ConfirmModal
        open={Boolean(archiveOutstanding)}
        onClose={() => { setArchiveOutstanding(""); setArchiveOpen(false); }}
        title="There is still money owed on this order"
        description={`${archiveOutstanding} Archiving it takes that balance out of the financials, so it will stop being chased and stop being counted.`}
        variant="danger"
        confirmLabel="Archive it anyway"
        cancelLabel="Leave it where it is"
        loading={isSavingOrder}
        onConfirm={async () => {
          setArchiveOutstanding("");
          await setArchived(true, true);
          setArchiveOpen(false);
        }}
      />
    </>
  );
}



// What the schedule adds up to. The due date is derived, never typed, so this
// says what it is and where it came from instead of offering a box that would
// let the two disagree.
function ScheduleOutcome({ order }) {
  const derived = targetCompletionFrom(order.scheduled_start_date, order.production_lead_days);
  const legacy = hasLegacyTarget(order);

  const dateWords = (value) =>
    new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });

  if (derived) {
    return (
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 border border-[#a8c5a0] bg-[#f5fff5] rounded-[6px] px-3 py-2">
        <span className="text-[11px] text-[#5a5a52]">Due</span>
        <span className="text-[13px] font-semibold text-[#2d5e28]">{dateWords(derived)}</span>
        <span className="text-[11px] text-[#8b8a81]">
          worked out from the start date and how long it takes. Never a weekend.
        </span>
      </div>
    );
  }

  if (legacy) {
    return (
      <div className="mt-3 border border-[#f0d060] bg-[#fffef0] rounded-[6px] px-3 py-2">
        <div className="text-[11px] text-[#8a6d0b]">
          <b className="font-semibold">Due {dateWords(order.target_completion_date)}</b>, typed in by hand before jobs
          were scheduled.
        </div>
        <div className="text-[11px] text-[#8b8a81] mt-[2px]">
          Set a start date and a timeframe above and this will be worked out for you from then on.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border border-[#dbd8cc] bg-[#faf9f5] rounded-[6px] px-3 py-2">
      <div className="text-[11px] text-[#8b8a81]">
        {order.scheduled_start_date
          ? "Pick how long it takes and the due date follows."
          : order.production_lead_days
            ? "Set the start date and the due date follows."
            : "Not scheduled yet. Set a start date and how long it takes, and the due date follows."}
      </div>
    </div>
  );
}
