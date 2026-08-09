"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { QuoteColourCombobox, QuoteImageCombobox, QuoteTileCombobox } from "@/components/admin/QuoteComboboxes";
import styles from "../../../../admin-content.module.css";
import { calculateQuoteLine, DEFAULT_BUSINESS_DEFAULTS, formatMoney, roundMoney, toNumber } from "../../../../../../lib/pcd-quote-utils";
import {
  edgeProfilesForMaterial,
  MATERIAL_OPTIONS,
  MATERIALS_BY_TYPE,
  PRODUCT_TYPES,
  profileNamesForSelection,
  profileTypesForSelection,
} from "../../../../../../lib/quote-form-data";
import { COLOUR_SUPPLIERS } from "../../../../../../lib/pcd-colour-library";

const actionOptions = [
  { value: "add", label: "Add item" },
  { value: "change", label: "Change item" },
  { value: "remove", label: "Remove item" },
  { value: "price_adjustment", label: "Price adjustment" },
];

const BASE_CABINET_TYPE = "base_cabinet";
const variationProductTypes = [
  ...PRODUCT_TYPES.map((type) => ({ value: type, label: type })),
  { value: BASE_CABINET_TYPE, label: "Base cabinet" },
];

const tw = {
  card: "bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden mb-3",
  cardHeader: "px-4 py-3 border-b border-[#edf4eb] flex items-center justify-between gap-3",
  cardTitle: "text-[13px] font-semibold text-[#1a1a18]",
  cardBody: "px-4 py-4",
  fieldLabel: "flex flex-col gap-1 text-[11px] font-medium text-[#5a5a52]",
  fieldInput: "h-[34px] w-full border border-[#dbd8cc] rounded-[6px] px-3 text-[13px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] disabled:bg-[#f5f8f4] disabled:text-[#8b8a81]",
  textarea: "w-full border border-[#dbd8cc] rounded-[6px] px-3 py-2 text-[13px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] resize-y",
  primaryBtn: "h-[34px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors",
  secondaryBtn: "h-[34px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors",
  smBtn: "h-[26px] px-3 text-[11px] font-medium rounded-[6px] border border-[#dbd8cc] bg-white text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors",
  dangerBtn: "h-[26px] px-3 text-[11px] font-medium rounded-[6px] border border-[#fca5a5] bg-white text-[#991b1b] hover:bg-[#fef2f2] disabled:opacity-50 transition-colors",
  muted: "text-[11px] text-[#8b8a81]",
  tableWrap: "overflow-x-auto md:max-h-[calc(100vh-300px)] md:overflow-auto",
  table: "w-full text-[13px] border-collapse",
  th: "sticky top-0 z-10 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52] px-4 py-[9px] border-b border-[#dbd8cc] bg-[#f5f8f4] whitespace-nowrap",
  td: "px-4 py-[11px] border-b border-[#edf4eb] text-[#1a1a18] align-middle",
  tdLast: "px-4 py-[11px] text-[#1a1a18] align-middle",
  inlineInput: "h-[28px] w-full border border-[#dbd8cc] rounded-[4px] px-2 text-[12px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] disabled:bg-[#f5f8f4] disabled:text-[#8b8a81]",
  inlineSelect: "h-[28px] w-full border border-[#dbd8cc] rounded-[4px] px-2 text-[12px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] disabled:bg-[#f5f8f4] disabled:text-[#8b8a81]",
  pill: "inline-flex items-center px-2 py-[2px] rounded-full text-[10px] font-medium border",
};

function sortedLines(variation) {
  return [...(variation?.pcd_order_variation_lines || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

function sortedItems(order) {
  return [...(order?.pcd_order_line_items || [])]
    .filter((item) => item.variation_status !== "removed")
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

function statusClass(status) {
  if (["applied", "approved"].includes(status)) return "bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]";
  if (status === "approved_pending_payment") return "bg-[#fffbeb] text-[#92400e] border-[#fcd34d]";
  if (status === "rejected" || status === "cancelled") return "bg-[#fef2f2] text-[#991b1b] border-[#fca5a5]";
  return "bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]";
}

function titleCase(value) {
  return String(value || "draft").replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function lineActionLabel(value) {
  return actionOptions.find((option) => option.value === value)?.label || titleCase(value);
}

function itemLabel(item) {
  return [item.title || item.product_type || "Order item", item.material, item.colour].filter(Boolean).join(" - ");
}

function variationLineItemLabel(line) {
  return [line.title || line.product_type || "Variation item", line.material, line.colour].filter(Boolean).join(" - ");
}

function productTypeLabel(value) {
  if (value === "base_cabinet") return "Base cabinet";
  return value || "";
}

function assetSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function edgeOptionSrc(label) {
  if (!String(label || "").trim().toLowerCase().startsWith("em")) return "";
  return `/images/edges/${assetSlug(label)}.png`;
}

function profileOptionSrc(profileType, label) {
  return `/images/profiles/${assetSlug(profileType)}/${assetSlug(label)}.jpg`;
}

function materialOptionsForType(productType) {
  return MATERIALS_BY_TYPE[productType] || MATERIAL_OPTIONS;
}

function firstBoardMaterialForType(productType) {
  if (!productType || productType === "Hardware" || productType === BASE_CABINET_TYPE) return "";
  return materialOptionsForType(productType)[0] || "";
}

function hardwareOptionLabel(item) {
  return [item.brand, item.name, item.sku ? `(${item.sku})` : ""].filter(Boolean).join(" ");
}

function hardwareTypeLabel(type) {
  return {
    handle: "Handle",
    hinge: "Hinge",
    drawer_runner: "Drawer runner",
    push_to_open: "Push-to-Open",
    cutlery_tray: "Cutlery Tray",
    wardrobe_hanging_rail: "Wardrobe Hanging Rail",
    slide_out_bin: "Slide Out Bin",
    bi_fold_door: "Bi-fold Door",
    cabinet_inserts: "Cabinet Inserts",
  }[type] || "Hardware";
}

function hardwareOptionsFromRows(rows = []) {
  return rows
    .filter((item) => item?.is_active !== false)
    .map((item) => ({
      id: item.id,
      value: item.id,
      name: hardwareOptionLabel(item),
      label: hardwareOptionLabel(item),
      meta: hardwareTypeLabel(item.type),
      src: item.image_url || "",
      item,
    }));
}

function emptyLine() {
  return {
    action: "add",
    order_line_item_id: "",
    title: "",
    description: "",
    product_type: "",
    hardware_catalogue_id: "",
    material: "",
    supplier_name: "",
    thickness: "",
    width_mm: "",
    height_mm: "",
    finish: "",
    colour: "",
    profile_type: "",
    profile: "",
    edge_mould: "",
    qty: 1,
    original_line_total_ex_gst: 0,
    proposed_line_total_ex_gst: "",
    unit_cost_mode: "auto",
    unit_cost_source_id: null,
    unit_cost_source_label: "",
    unit_cost_per_sqm_ex_gst: 0,
    calculated_unit_cost_ex_gst: 0,
    product_unit_cost_ex_gst: "",
    markup_percent: DEFAULT_BUSINESS_DEFAULTS.markup_percent,
    notes: "",
  };
}

function lineAreaSqm(line) {
  const width = Number(line?.width_mm || 0);
  const height = Number(line?.height_mm || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
  return (width * height) / 1000000;
}

function calculatedUnitCostFromLine(line) {
  let rate = Number(line?.unit_cost_per_sqm_ex_gst || 0);
  const boardCost = Number(line?.cost_per_board_ex_gst || 0);
  const boardWidth = Number(line?.preferred_board_width_mm || 0);
  const boardHeight = Number(line?.preferred_board_height_mm || 0);
  const boardArea = boardWidth > 0 && boardHeight > 0 ? (boardWidth * boardHeight) / 1000000 : 0;
  if ((!Number.isFinite(rate) || rate <= 0) && boardCost > 0 && boardArea > 0) {
    rate = roundMoney(boardCost / boardArea);
  }
  const area = lineAreaSqm(line);
  if (!Number.isFinite(rate) || rate <= 0 || area <= 0) return 0;
  return roundMoney(area * rate);
}

function isBoardVariationDraft(line) {
  return !["Hardware", BASE_CABINET_TYPE].includes(line.product_type) && Boolean(line.material);
}

function hasBoardCostSource(line) {
  return toNumber(line.unit_cost_per_sqm_ex_gst) > 0 || (
    toNumber(line.cost_per_board_ex_gst) > 0 &&
    toNumber(line.preferred_board_width_mm) > 0 &&
    toNumber(line.preferred_board_height_mm) > 0
  );
}

// Board lines price themselves off the colour library (rate per sqm x area x
// markup), exactly like a quote line. A typed unit cost flips the line to
// "manual" and is left alone until the operator resets it. Hardware and base
// cabinets have no board rate, so they price off the typed unit cost.
function applyVariationLinePricing(line, businessDefaults = DEFAULT_BUSINESS_DEFAULTS) {
  if (line.action === "remove") {
    return { ...line, proposed_line_total_ex_gst: 0 };
  }
  if (line.action === "price_adjustment") {
    return line;
  }

  const isBoard = isBoardVariationDraft(line);
  const calculatedUnitCost = isBoard ? calculatedUnitCostFromLine(line) : 0;
  const hasAutoSource = isBoard && hasBoardCostSource(line);
  const next = {
    ...line,
    calculated_unit_cost_ex_gst: calculatedUnitCost,
    unit_cost_mode: hasAutoSource ? line.unit_cost_mode || "auto" : "manual",
  };

  if (next.unit_cost_mode === "auto") {
    next.product_unit_cost_ex_gst = calculatedUnitCost > 0 ? calculatedUnitCost : "";
  }

  const unitCost = toNumber(next.product_unit_cost_ex_gst);
  if (!isBoard && unitCost <= 0) {
    // Nothing to price from — keep whatever total was typed by hand.
    return next;
  }

  next.proposed_line_total_ex_gst = unitCost > 0
    ? calculateQuoteLine(next, businessDefaults).line_total_ex_gst
    : "";

  return next;
}

function variationLinePricingError(line) {
  if (!["add", "change"].includes(line.action) || !isBoardVariationDraft(line)) return "";
  if (line.unit_cost_mode === "manual" && toNumber(line.product_unit_cost_ex_gst) > 0) return "";
  if (!line.colour || !line.thickness) {
    return "Select a priced board colour before saving this variation line.";
  }
  if (!hasBoardCostSource(line)) {
    return "This board does not have an uploaded price. Add the board cost before saving this variation line.";
  }
  if (calculatedUnitCostFromLine(line) <= 0) {
    return "Enter width and height so this board variation can be priced.";
  }
  return "";
}

function defaultVariationEmailSubject(variation, order) {
  return `${variation.variation_number} - ${order.order_number || "Order"} variation`;
}

function defaultVariationEmailMessage(variation, order, viewUrl) {
  return [
    `Hi ${variation.customer_name || order.customer_name || "there"},`,
    "",
    `We have prepared a variation for ${order.order_number || "your order"} for your review.`,
    "",
    "Please use the secure link below to review the changes and approve or reject the variation online.",
    "",
    `View variation: ${viewUrl}`,
    "",
    "Regards,",
    "Perth Cabinet Doors",
  ].join("\n");
}

export default function VariationEditor({ orderId, variationId }) {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  const [order, setOrder] = useState(null);
  const [variation, setVariation] = useState(null);
  const [lineDraft, setLineDraft] = useState(emptyLine);
  const [editingLineId, setEditingLineId] = useState(null);
  const [isAddLineModalOpen, setIsAddLineModalOpen] = useState(false);
  const [publishEmail, setPublishEmail] = useState(null);
  const [hardwareRows, setHardwareRows] = useState([]);
  const [businessDefaults, setBusinessDefaults] = useState(DEFAULT_BUSINESS_DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const lines = useMemo(() => sortedLines(variation), [variation]);
  const orderItems = useMemo(() => sortedItems(order), [order]);
  const hardwareOptions = useMemo(() => hardwareOptionsFromRows(hardwareRows), [hardwareRows]);
  const isEditable = ["draft", "sent", "viewed"].includes(variation?.status || "draft");
  const lineDraftMaterialOptions = materialOptionsForType(lineDraft.product_type);
  const lineDraftEdgeOptions = edgeProfilesForMaterial(lineDraft.material);
  const lineDraftProfileTypeOptions = profileTypesForSelection(lineDraft.material, lineDraft.thickness);
  const lineDraftProfileOptions = profileNamesForSelection(lineDraft.profile_type, lineDraft.material, lineDraft.thickness);
  const selectedSupplier = COLOUR_SUPPLIERS.includes(lineDraft.supplier_name) ? lineDraft.supplier_name : COLOUR_SUPPLIERS[0];
  const lineDraftPricingError = variationLinePricingError(lineDraft);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [orderResponse, variationResponse] = await Promise.all([
          fetch(`/api/admin/orders/${orderId}`, { cache: "no-store" }),
          fetch(`/api/admin/orders/${orderId}/variations/${variationId}`, { cache: "no-store" }),
        ]);
        const [orderPayload, variationPayload] = await Promise.all([orderResponse.json(), variationResponse.json()]);
        if (!orderResponse.ok || !orderPayload.ok) throw new Error(orderPayload.error || "Could not load order.");
        if (!variationResponse.ok || !variationPayload.ok) throw new Error(variationPayload.error || "Could not load variation.");
        setOrder(orderPayload.order);
        setVariation(variationPayload.variation);
      } catch (error) {
        toastRef.current({ title: error?.message || "Could not load variation.", variant: "error" });
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [orderId, variationId]);

  useEffect(() => {
    let cancelled = false;

    async function loadSupportingRows() {
      try {
        const [hardwareResponse, defaultsResponse] = await Promise.all([
          fetch("/api/admin/hardware", { cache: "no-store" }),
          fetch("/api/admin/business-defaults", { cache: "no-store" }),
        ]);
        const [hardwarePayload, defaultsPayload] = await Promise.all([
          hardwareResponse.json(),
          defaultsResponse.json(),
        ]);
        if (!cancelled && hardwarePayload.ok) setHardwareRows(hardwarePayload.hardware || []);
        if (!cancelled && defaultsPayload.ok) setBusinessDefaults(defaultsPayload.defaults || DEFAULT_BUSINESS_DEFAULTS);
      } catch {}
    }

    loadSupportingRows();
    return () => {
      cancelled = true;
    };
  }, []);

  function clearBoardSelection(next) {
    next.finish = "";
    next.colour = "";
    next.thickness = "";
    next.edge_mould = "";
    next.profile_type = "";
    next.profile = "";
    next.unit_cost_mode = "auto";
    next.unit_cost_source_id = null;
    next.unit_cost_source_label = "";
    next.unit_cost_per_sqm_ex_gst = 0;
    next.cost_per_board_ex_gst = 0;
    next.preferred_board_width_mm = 0;
    next.preferred_board_height_mm = 0;
    next.calculated_unit_cost_ex_gst = 0;
    next.product_unit_cost_ex_gst = "";
    next.proposed_line_total_ex_gst = "";
  }

  function updateLineDraft(changes) {
    setLineDraft((current) => {
      let next = { ...current, ...changes };
      const has = (field) => Object.prototype.hasOwnProperty.call(changes, field);

      if (has("product_type")) {
        // Keep the material if the new type still offers it, so switching
        // Doors -> Drawer fronts doesn't throw away the colour selection.
        const keepMaterial = Boolean(next.material) && materialOptionsForType(changes.product_type).includes(next.material);
        next.title = productTypeLabel(changes.product_type);
        next.hardware_catalogue_id = "";
        if (!keepMaterial) {
          next.material = firstBoardMaterialForType(changes.product_type);
          next.supplier_name = next.material ? COLOUR_SUPPLIERS[0] : "";
          clearBoardSelection(next);
        }
      }
      if (has("material")) {
        next.supplier_name = changes.material ? COLOUR_SUPPLIERS[0] : "";
        clearBoardSelection(next);
      }
      if (has("supplier_name") && !has("colour")) {
        // The old supplier's board rate must not survive the switch.
        clearBoardSelection(next);
      }
      if (has("thickness") && !has("colour")) {
        next.profile_type = "";
        next.profile = "";
      }
      if (has("profile_type")) {
        next.profile = "";
      }
      if (has("colour")) {
        // A colour pick brings its own board rate, so go back to auto pricing.
        next.unit_cost_mode = "auto";
      }
      if (has("product_unit_cost_ex_gst")) {
        next.unit_cost_mode = "manual";
      }
      if ([
        "qty", "width_mm", "height_mm", "unit_cost_per_sqm_ex_gst", "colour", "finish", "thickness",
        "markup_percent", "product_unit_cost_ex_gst", "material", "product_type", "unit_cost_mode",
        "supplier_name",
      ].some(has)) {
        next = applyVariationLinePricing(next, businessDefaults);
      }
      return next;
    });
  }

  function resetLineDraftUnitCost() {
    updateLineDraft({ unit_cost_mode: "auto" });
  }

  function changeLineDraftAction(action) {
    if (action === "add") {
      setLineDraft((current) => ({ ...emptyLine(), id: current.id, action, markup_percent: businessDefaults.markup_percent, notes: current.notes }));
      return;
    }
    if (action === "price_adjustment") {
      setLineDraft((current) => ({ ...emptyLine(), id: current.id, action, title: "Price adjustment", markup_percent: businessDefaults.markup_percent, notes: current.notes }));
      return;
    }
    updateLineDraft({ action, proposed_line_total_ex_gst: action === "remove" ? 0 : lineDraft.proposed_line_total_ex_gst });
  }

  function openAddLineModal() {
    setEditingLineId(null);
    setLineDraft({ ...emptyLine(), markup_percent: businessDefaults.markup_percent });
    setIsAddLineModalOpen(true);
  }

  function openEditLineModal(line) {
    const draft = { ...emptyLine() };
    Object.entries(line).forEach(([field, value]) => {
      // Nulls from the database would turn controlled inputs uncontrolled.
      draft[field] = value === null ? emptyLine()[field] ?? "" : value;
    });
    const calculated = calculatedUnitCostFromLine(draft);
    draft.unit_cost_mode = calculated > 0 && toNumber(draft.product_unit_cost_ex_gst) !== calculated ? "manual" : "auto";
    setEditingLineId(line.id);
    setLineDraft(draft);
    setIsAddLineModalOpen(true);
  }

  function closeLineModal() {
    setIsAddLineModalOpen(false);
    setEditingLineId(null);
    setLineDraft(emptyLine());
  }

  function chooseHardwareOption(value) {
    const option = hardwareOptions.find((entry) => entry.value === value);
    if (!option?.item) return;
    const item = option.item;
    const label = option.label || hardwareOptionLabel(item);
    setLineDraft((current) => applyVariationLinePricing({
      ...current,
      hardware_catalogue_id: item.id,
      product_type: "Hardware",
      title: label,
      description: item.description || label,
      material: "",
      supplier_name: "",
      finish: "",
      colour: "",
      thickness: "",
      width_mm: item.width_mm || item.length_mm || "",
      height_mm: item.height_mm || item.projection_mm || "",
      edge_mould: "",
      profile_type: "",
      profile: "",
      unit_cost_mode: "manual",
      unit_cost_source_id: item.id,
      unit_cost_source_label: label,
      unit_cost_per_sqm_ex_gst: 0,
      calculated_unit_cost_ex_gst: 0,
      product_unit_cost_ex_gst: Number(item.unit_cost_ex_gst || 0),
    }, businessDefaults));
  }

  function applySourceLineToDraft(itemId, setter = setLineDraft) {
    const item = orderItems.find((entry) => entry.id === itemId);
    setter((current) => ({
      ...current,
      order_line_item_id: itemId,
      title: item?.title || "",
      description: item?.description || "",
      product_type: item?.product_type || "",
      hardware_catalogue_id: item?.unit_cost_source_id || "",
      material: item?.material || "",
      supplier_name: item?.supplier_name || "",
      thickness: item?.thickness || "",
      width_mm: item?.width_mm || "",
      height_mm: item?.height_mm || "",
      finish: item?.finish || "",
      colour: item?.colour || "",
      profile_type: item?.profile_type || "",
      profile: item?.profile || "",
      edge_mould: item?.edge_mould || "",
      qty: item?.qty || 1,
      unit_cost_mode: item?.unit_cost_source_id ? "auto" : "manual",
      unit_cost_source_id: item?.unit_cost_source_id || null,
      unit_cost_source_label: item?.unit_cost_source_label || "",
      unit_cost_per_sqm_ex_gst: item?.unit_cost_per_sqm_ex_gst || 0,
      calculated_unit_cost_ex_gst: item?.calculated_unit_cost_ex_gst || 0,
      product_unit_cost_ex_gst: item?.product_unit_cost_ex_gst || "",
      original_line_total_ex_gst: item?.line_total_ex_gst || 0,
      proposed_line_total_ex_gst: current.action === "remove" ? 0 : item?.line_total_ex_gst || 0,
      markup_percent: item?.markup_percent ?? current.markup_percent ?? businessDefaults.markup_percent,
    }));
  }

  async function saveVariation(changes) {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/variations/${variationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not save variation.", variant: "error" });
        return null;
      }
      setVariation(payload.variation);
      return payload.variation;
    } catch (error) {
      toast({ title: error?.message || "Could not save variation.", variant: "error" });
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function addLine() {
    if (!isEditable) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/variations/${variationId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lineDraft),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not add variation line.", variant: "error" });
        return;
      }
      setVariation(payload.variation);
      setLineDraft(emptyLine());
      closeLineModal();
      toast({ title: "Variation line added.", variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not add variation line.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  async function updateLine(lineId) {
    if (!lineId || !isEditable) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/variations/${variationId}/lines/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lineDraft),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not update variation line.", variant: "error" });
        return;
      }
      setVariation(payload.variation);
      closeLineModal();
      toast({ title: "Variation line updated.", variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not update variation line.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteLine(lineId) {
    if (!isEditable) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/variations/${variationId}/lines/${lineId}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not delete variation line.", variant: "error" });
        return;
      }
      setVariation(payload.variation);
    } catch (error) {
      toast({ title: error?.message || "Could not delete variation line.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  function prepareSend() {
    const viewUrl = typeof window !== "undefined" ? `${window.location.origin}/variations/view?code=${variation.access_code}` : "";
    setPublishEmail({
      subject: defaultVariationEmailSubject(variation, order),
      message: defaultVariationEmailMessage(variation, order, viewUrl),
      include_price: true,
    });
  }

  async function sendVariation() {
    if (!publishEmail?.subject?.trim() || !publishEmail?.message?.trim()) {
      toast({ title: "Enter an email subject and message before sending.", variant: "error" });
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/variations/${variationId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(publishEmail),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not send variation.", variant: "error" });
        return;
      }
      setPublishEmail(null);
      setVariation((current) => ({ ...current, status: "sent", sent_at: new Date().toISOString(), viewed_at: null }));
      toast({
        title: payload.emailSent
          ? "Variation sent to customer."
          : `Variation published. Resend is not configured, so use this link: ${payload.viewUrl}`,
        variant: "success",
      });
    } catch (error) {
      toast({ title: error?.message || "Could not send variation.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  function renderLineEditor(line) {
    return (
      <tr key={line.id}>
        <td className={tw.td}>{lineActionLabel(line.action)}</td>
        <td className={tw.td}>{line.order_line_item_id ? itemLabel(orderItems.find((item) => item.id === line.order_line_item_id) || line) : variationLineItemLabel(line)}</td>
        <td className={tw.td}>{line.title || "-"}</td>
        <td className={tw.td}>{line.qty ?? "-"}</td>
        <td className={tw.td + " font-mono"}>{formatMoney(line.original_line_total_ex_gst, variation.currency)}</td>
        <td className={tw.td + " font-mono"}>{formatMoney(line.proposed_line_total_ex_gst, variation.currency)}</td>
        <td className={tw.td + " font-mono"}>{formatMoney(toNumber(line.line_total_ex_gst), variation.currency)}</td>
        <td className={tw.td}>{line.notes || "-"}</td>
        <td className={tw.tdLast}>
          {isEditable ? (
            <div className="flex gap-2">
              <button type="button" className={tw.smBtn} disabled={isSaving} onClick={() => openEditLineModal(line)}>Edit</button>
              <button type="button" className={tw.dangerBtn} disabled={isSaving} onClick={() => deleteLine(line.id)}>Delete</button>
            </div>
          ) : null}
        </td>
      </tr>
    );
  }

  function renderAddLineFields() {
    const isRemove = lineDraft.action === "remove";
    const isPriceAdjustment = lineDraft.action === "price_adjustment";
    const isHardware = lineDraft.product_type === "Hardware";
    const isBaseCabinet = lineDraft.product_type === BASE_CABINET_TYPE;
    const isBoardLine = isBoardVariationDraft(lineDraft);
    const boardFieldsLocked = isRemove || isPriceAdjustment || isHardware || isBaseCabinet;
    const showEdges = !boardFieldsLocked && lineDraftEdgeOptions.length > 0;
    const showProfiles = !boardFieldsLocked && lineDraftProfileTypeOptions.length > 0;
    const canResetUnitCost =
      isBoardLine &&
      lineDraft.unit_cost_mode === "manual" &&
      toNumber(lineDraft.calculated_unit_cost_ex_gst) > 0 &&
      toNumber(lineDraft.product_unit_cost_ex_gst) !== toNumber(lineDraft.calculated_unit_cost_ex_gst);

    const notApplicable = <input className={tw.fieldInput} value="Not applicable" disabled readOnly />;

    return (
      <div className="grid gap-3 md:grid-cols-4">
        <label className={tw.fieldLabel}>Action
          <QuoteTileCombobox
            compact={false}
            placeholder="Select action"
            value={lineDraft.action}
            options={actionOptions}
            onChange={(option) => changeLineDraftAction(option.value)}
          />
        </label>
        <label className={`${tw.fieldLabel} ${isPriceAdjustment ? "md:col-span-2" : "md:col-span-3"}`}>Order item
          <QuoteTileCombobox
            compact={false}
            disabled={["add", "price_adjustment"].includes(lineDraft.action)}
            placeholder={["add", "price_adjustment"].includes(lineDraft.action) ? "Not applicable" : "Select item"}
            value={lineDraft.order_line_item_id}
            options={orderItems.map((item) => ({ value: item.id, label: itemLabel(item), name: itemLabel(item) }))}
            onChange={(option) => applySourceLineToDraft(option.value)}
          />
        </label>
        {/* Every other line names itself from its product type or hardware item,
            the same way a quote line does. A price adjustment has neither, so it
            is the only line that needs a name typed in. */}
        {isPriceAdjustment ? (
          <label className={tw.fieldLabel}>Adjustment name
            <input
              className={tw.fieldInput}
              placeholder="Price adjustment"
              value={lineDraft.title}
              onChange={(event) => updateLineDraft({ title: event.target.value })}
            />
          </label>
        ) : null}

        <label className={tw.fieldLabel}>Product type
          <QuoteTileCombobox
            compact={false}
            disabled={isRemove || isPriceAdjustment}
            placeholder="Select type"
            value={lineDraft.product_type}
            options={variationProductTypes.map((type) => ({ ...type, name: type.label, meta: "Product type" }))}
            onChange={(option) => updateLineDraft({ product_type: option.value })}
          />
        </label>
        {isHardware ? (
          <label className={`${tw.fieldLabel} md:col-span-3`}>Hardware item
            <QuoteImageCombobox
              disabled={isRemove}
              placeholder="Select hardware"
              value={lineDraft.hardware_catalogue_id || ""}
              displayValue={lineDraft.title}
              options={hardwareOptions}
              onChange={(option) => chooseHardwareOption(option.value)}
            />
          </label>
        ) : (
          <>
            <label className={tw.fieldLabel}>Material
              <QuoteTileCombobox
                compact={false}
                disabled={isRemove || isPriceAdjustment}
                placeholder="Select material"
                value={lineDraft.material}
                options={lineDraftMaterialOptions.map((material) => ({ value: material, label: material, name: material, meta: "Material" }))}
                onChange={(option) => updateLineDraft({ material: option.value || option.name || option.label })}
              />
            </label>
            <label className={tw.fieldLabel}>Supplier
              <QuoteTileCombobox
                compact={false}
                disabled={isRemove || isPriceAdjustment || !lineDraft.material}
                placeholder={lineDraft.material ? "Select supplier" : "Select material first"}
                value={selectedSupplier}
                options={COLOUR_SUPPLIERS.map((supplier) => ({ label: supplier, name: supplier, value: supplier }))}
                onChange={(option) => updateLineDraft({ supplier_name: option.value })}
              />
            </label>
            <label className={tw.fieldLabel}>Colour
              <QuoteColourCombobox
                compact={false}
                disabled={isRemove || isPriceAdjustment}
                line={lineDraft}
                onChange={(patch) => updateLineDraft(patch)}
              />
            </label>
          </>
        )}

        <label className={tw.fieldLabel}>Finish
          <input className={tw.fieldInput} value={lineDraft.finish || ""} placeholder="Set by the colour" disabled readOnly />
        </label>
        <label className={tw.fieldLabel}>Thickness
          <input className={tw.fieldInput} value={lineDraft.thickness || ""} placeholder="Set by the colour" disabled readOnly />
        </label>
        <label className={tw.fieldLabel}>Width mm
          <input className={tw.fieldInput} type="number" value={lineDraft.width_mm} disabled={isRemove || isPriceAdjustment} onChange={(event) => updateLineDraft({ width_mm: event.target.value })} />
        </label>
        <label className={tw.fieldLabel}>Height mm
          <input className={tw.fieldInput} type="number" value={lineDraft.height_mm} disabled={isRemove || isPriceAdjustment} onChange={(event) => updateLineDraft({ height_mm: event.target.value })} />
        </label>

        <label className={tw.fieldLabel}>Qty
          <input className={tw.fieldInput} type="number" step="0.01" value={lineDraft.qty} disabled={isRemove} onChange={(event) => updateLineDraft({ qty: event.target.value })} />
        </label>
        <label className={tw.fieldLabel}>Edge
          {showEdges ? (
            <QuoteImageCombobox
              disabled={isRemove}
              placeholder="Select edge"
              value={lineDraft.edge_mould}
              options={lineDraftEdgeOptions.map((edge) => ({ value: edge, label: edge, name: edge, meta: "Edge", src: edgeOptionSrc(edge) }))}
              onChange={(option) => updateLineDraft({ edge_mould: option.value || option.name || option.label })}
            />
          ) : notApplicable}
        </label>
        <label className={tw.fieldLabel}>Profile type
          {showProfiles ? (
            <QuoteTileCombobox
              compact={false}
              disabled={isRemove}
              placeholder="Select profile type"
              value={lineDraft.profile_type}
              options={lineDraftProfileTypeOptions.map((profileType) => ({ value: profileType, label: profileType, name: profileType, meta: "Profile type" }))}
              onChange={(option) => updateLineDraft({ profile_type: option.value || option.name || option.label })}
            />
          ) : notApplicable}
        </label>
        <label className={tw.fieldLabel}>Profile
          {showProfiles ? (
            <QuoteImageCombobox
              disabled={isRemove || !lineDraft.profile_type}
              placeholder={lineDraft.profile_type ? "Select profile" : "Select profile type first"}
              value={lineDraft.profile}
              options={lineDraftProfileOptions.map((profile) => ({ value: profile, label: profile, name: profile, meta: lineDraft.profile_type, src: profileOptionSrc(lineDraft.profile_type, profile) }))}
              onChange={(option) => updateLineDraft({ profile: option.value || option.name || option.label })}
            />
          ) : notApplicable}
        </label>

        <label className={tw.fieldLabel}>Unit cost ex GST
          <input
            className={tw.fieldInput}
            type="number"
            step="0.01"
            placeholder={isBoardLine ? "Calculated from the board rate" : "0.00"}
            value={lineDraft.product_unit_cost_ex_gst}
            disabled={isRemove || isPriceAdjustment}
            onChange={(event) => updateLineDraft({ product_unit_cost_ex_gst: event.target.value })}
          />
          {canResetUnitCost ? (
            <button type="button" className="self-start text-[11px] font-medium text-[#2d5e28] hover:underline" onClick={resetLineDraftUnitCost}>
              Reset to {formatMoney(lineDraft.calculated_unit_cost_ex_gst, variation.currency)}
            </button>
          ) : null}
        </label>
        <label className={tw.fieldLabel}>Markup %
          <input
            className={tw.fieldInput}
            type="number"
            step="0.01"
            value={lineDraft.markup_percent}
            disabled={isRemove || isPriceAdjustment}
            onChange={(event) => updateLineDraft({ markup_percent: event.target.value })}
          />
        </label>
        <label className={`${tw.fieldLabel} md:col-span-2`}>Proposed ex GST
          <input
            className={tw.fieldInput}
            type="number"
            step="0.01"
            value={lineDraft.proposed_line_total_ex_gst}
            disabled={isRemove || (isBoardLine && lineDraft.unit_cost_mode === "auto")}
            onChange={(event) => updateLineDraft({ proposed_line_total_ex_gst: event.target.value })}
          />
          {isBoardLine ? (
            <span className={lineDraftPricingError ? "text-[11px] font-semibold text-[#991b1b]" : "text-[11px] text-[#2d5e28]"}>
              {lineDraftPricingError
                || (lineDraft.unit_cost_mode === "manual"
                  ? "Using the unit cost typed above."
                  : `Calculated from ${formatMoney(lineDraft.unit_cost_per_sqm_ex_gst, variation.currency)} per sqm.`)}
              {lineDraftPricingError.includes("uploaded price") ? (
                <>
                  {" "}
                  <Link className="underline underline-offset-2" href="/admin/options" target="_blank">
                    Open Board Library
                  </Link>
                </>
              ) : null}
            </span>
          ) : null}
        </label>

        <div className="grid grid-cols-3 gap-3 rounded-[6px] border border-[#edf4eb] bg-[#f5f8f4] px-3 py-2 md:col-span-4">
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">Current ex GST</span>
            <span className="mt-1 block font-mono text-[14px] font-semibold text-[#1a1a18]">{formatMoney(lineDraft.original_line_total_ex_gst, variation.currency)}</span>
          </div>
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">Proposed ex GST</span>
            <span className="mt-1 block font-mono text-[14px] font-semibold text-[#1a1a18]">{formatMoney(toNumber(lineDraft.proposed_line_total_ex_gst), variation.currency)}</span>
          </div>
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">Variation</span>
            <span className="mt-1 block font-mono text-[14px] font-semibold text-[#2d5e28]">
              {formatMoney(toNumber(lineDraft.proposed_line_total_ex_gst) - toNumber(lineDraft.original_line_total_ex_gst), variation.currency)}
            </span>
          </div>
        </div>

        <label className={`${tw.fieldLabel} md:col-span-4`}>Notes
          <input className={tw.fieldInput} value={lineDraft.notes} onChange={(event) => updateLineDraft({ notes: event.target.value })} />
        </label>
      </div>
    );
  }

  if (isLoading || !order || !variation) {
    return <div className="p-6 text-[13px] text-[#5a5a52]">Loading variation...</div>;
  }

  return (
    <>
      <div className="min-h-full bg-[#f5f8f4] p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <Link href={`/admin/orders/${orderId}`} className="text-[12px] text-[#6b9e61] hover:underline">Back to order</Link>
            <h1 className="mt-1 text-[20px] font-semibold text-[#1a1a18]">{variation.variation_number}</h1>
            <p className="text-[12px] text-[#8b8a81]">{order.order_number} - {variation.customer_name || order.customer_name || "Customer"}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`${tw.pill} ${statusClass(variation.status)}`}>{titleCase(variation.status)}</span>
            {isEditable ? <button type="button" className={tw.primaryBtn} disabled={isSaving || !lines.length} onClick={prepareSend}>Send variation</button> : null}
          </div>
        </div>

        <div className="flex flex-col gap-3">
            <div className={tw.card}>
              <div className={tw.cardHeader}>
                <div className="flex items-center gap-3">
                  <span className={tw.cardTitle}>Variation lines</span>
                  <span className={tw.muted}>{lines.length} lines</span>
                </div>
                {isEditable ? (
                  <button type="button" className={tw.primaryBtn} disabled={isSaving} onClick={openAddLineModal}>
                    Add variation line
                  </button>
                ) : null}
              </div>
              <div className={tw.tableWrap}>
                <table className={tw.table}>
                  <thead>
                    <tr>
                      {["Action", "Order item", "Title", "Qty", "Current ex GST", "Proposed ex GST", "Variation", "Notes", "Actions"].map((heading) => (
                        <th className={tw.th} key={heading}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(renderLineEditor)}
                    {!lines.length ? (
                      <tr><td colSpan={9} className="py-8 text-center text-[12px] text-[#8b8a81]">Add at least one variation line before sending to the customer.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
            <div className={tw.card}>
              <div className={tw.cardHeader}><span className={tw.cardTitle}>Details</span></div>
              <div className={`${tw.cardBody} flex flex-col gap-3`}>
                <label className={tw.fieldLabel}>Title
                  <input className={tw.fieldInput} value={variation.title || ""} disabled={!isEditable} onChange={(event) => setVariation((current) => ({ ...current, title: event.target.value }))} onBlur={(event) => saveVariation({ title: event.target.value })} />
                </label>
                <label className={tw.fieldLabel}>Customer email
                  <input className={tw.fieldInput} value={variation.customer_email || ""} disabled={!isEditable} onChange={(event) => setVariation((current) => ({ ...current, customer_email: event.target.value }))} onBlur={(event) => saveVariation({ customer_email: event.target.value })} />
                </label>
                <label className={tw.fieldLabel}>Require deposit top-up
                  <select className={tw.fieldInput} value={variation.deposit_required ? "yes" : "no"} disabled={!isEditable} onChange={(event) => saveVariation({ deposit_required: event.target.value === "yes" })}>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className={tw.fieldLabel}>Deposit %
                  <input className={tw.fieldInput} type="number" min="0" max="100" value={variation.deposit_percent || 0} disabled={!isEditable || !variation.deposit_required} onChange={(event) => setVariation((current) => ({ ...current, deposit_percent: event.target.value }))} onBlur={(event) => saveVariation({ deposit_percent: event.target.value })} />
                </label>
                <label className={tw.fieldLabel}>Notes
                  <textarea className={tw.textarea} rows={4} value={variation.notes || ""} disabled={!isEditable} onChange={(event) => setVariation((current) => ({ ...current, notes: event.target.value }))} onBlur={(event) => saveVariation({ notes: event.target.value })} />
                </label>
              </div>
            </div>
            <div className={tw.card}>
              <div className={tw.cardHeader}><span className={tw.cardTitle}>Totals</span></div>
              <div className={tw.cardBody}>
                <div className="flex justify-between py-2 border-b border-[#edf4eb] text-[12px]"><span>Variation ex GST</span><strong>{formatMoney(variation.subtotal_ex_gst, variation.currency)}</strong></div>
                <div className="flex justify-between py-2 border-b border-[#edf4eb] text-[12px]"><span>GST</span><strong>{formatMoney(variation.gst_amount, variation.currency)}</strong></div>
                <div className="flex justify-between py-2 border-b border-[#edf4eb] text-[12px]"><span>Variation inc GST</span><strong>{formatMoney(variation.total_inc_gst, variation.currency)}</strong></div>
                <div className="flex justify-between py-2 border-b border-[#edf4eb] text-[12px]"><span>Revised order total</span><strong>{formatMoney(variation.revised_order_total_inc_gst, variation.currency)}</strong></div>
                <div className="flex justify-between pt-3 text-[13px] text-[#2d5e28]"><span>Deposit top-up</span><strong>{formatMoney(variation.deposit_topup_required, variation.currency)}</strong></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isAddLineModalOpen ? (
        <Modal
          open={true}
          onClose={closeLineModal}
          title={editingLineId ? "Edit variation line" : "Add variation line"}
          subtitle={variation.variation_number}
          size="xl"
          footer={
            <>
              <button type="button" className={tw.secondaryBtn} onClick={closeLineModal} disabled={isSaving}>Cancel</button>
              <button type="button" className={tw.primaryBtn} disabled={isSaving} onClick={editingLineId ? () => updateLine(editingLineId) : addLine}>
                {isSaving ? (editingLineId ? "Saving..." : "Adding...") : (editingLineId ? "Save line" : "Add line")}
              </button>
            </>
          }
        >
          {renderAddLineFields()}
        </Modal>
      ) : null}

      {publishEmail ? (
        <Modal
          open={true}
          onClose={() => setPublishEmail(null)}
          title="Email customer"
          subtitle="Send variation"
          size="lg"
          footer={
            <>
              <button type="button" className={tw.secondaryBtn} onClick={() => setPublishEmail(null)} disabled={isSaving}>Cancel</button>
              <button type="button" className={tw.primaryBtn} onClick={sendVariation} disabled={isSaving || !variation.customer_email}>{isSaving ? "Sending..." : "Send variation"}</button>
            </>
          }
        >
          <div className={styles.customerModalGrid}>
            <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>To
              <input className={styles.fieldInput} value={variation.customer_email || ""} disabled />
            </label>
            <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>Subject
              <input className={styles.fieldInput} value={publishEmail.subject} onChange={(event) => setPublishEmail((current) => ({ ...current, subject: event.target.value }))} />
            </label>
            <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>Email message
              <textarea className={`${styles.textareaInput} ${styles.quoteEmailTextarea}`} value={publishEmail.message} onChange={(event) => setPublishEmail((current) => ({ ...current, message: event.target.value }))} />
            </label>
            <label className={`${styles.checkboxRow} ${styles.fieldWide}`}>
              <input type="checkbox" checked={Boolean(publishEmail.include_price)} onChange={(event) => setPublishEmail((current) => ({ ...current, include_price: event.target.checked }))} />
              Include variation price in email
            </label>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
