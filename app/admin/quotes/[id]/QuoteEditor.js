"use client";

import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";
import { optionsFromColourFamily } from "../../../../lib/pcd-colour-library";
import { calculateQuoteLine, calculateQuoteTotals, DEFAULT_BUSINESS_DEFAULTS, formatMoney, roundMoney } from "../../../../lib/pcd-quote-utils";
import CabinetConfigurator from "../../../../components/admin/CabinetConfigurator";
import RoomManager from "./_components/RoomManager";
import PlannerOverlay from "./_components/PlannerOverlay";
import ElevationPanel from "./_components/ElevationPanel";
import {
  edgeProfilesForMaterial,
  isEdgeProfileSelectionAvailable,
  MATERIAL_OPTIONS,
  MATERIALS_BY_TYPE,
  PRODUCT_TYPES,
  isProfileSelectionAvailable,
  profileNamesForSelection,
  profileTypesForSelection,
  thicknessOptionsForMaterial,
} from "../../../../lib/quote-form-data";
import styles from "../../admin-content.module.css";
import quoteStyles from "./quote-editor.module.css";
import workflowStyles from "../../_components/admin-workflow.module.css";
import { AdminActionDropdown, AdminConfirmDeleteAction } from "../../_components/AdminActionDropdown";
import { AdminTablePagination, useAdminTablePagination } from "../../_components/AdminTablePagination";
import { AdminPagination } from "../../_components/AdminPagination";

const sections = [
  { key: "details", label: "Information & Contacts" },
  { key: "items", label: "Quote Items" },
  { key: "cabinets", label: "Base Cabinets" },
  { key: "costs", label: "Costs & Markup" },
  { key: "totals", label: "Quote Totals" },
  { key: "notes", label: "Notes" },
  { key: "attachments", label: "Attachments" },
  { key: "elevations", label: "Elevations"   },
];

const BASE_CABINET_TYPE = "base_cabinet";
const colourOptionsCache = new Map();
const quoteProductTypes = [
  ...PRODUCT_TYPES.map((type) => ({ value: type, label: type })),
  { value: BASE_CABINET_TYPE, label: "Base cabinet" },
];
const ADMIN_DROPDOWN_OPEN_EVENT = "pcd-admin-dropdown-open";

const CABINET_TYPE_LABELS = {
  base: "Base", wall: "Wall", tall: "Tall",
  corner_base: "Corner Base", corner_wall: "Corner Wall", island: "Island",
};

const emptyLine = {
  product_type: "",
  product_name: "",
  material: "",
  thickness: "",
  width_mm: "",
  height_mm: "",
  finish: "",
  colour: "",
  profile_type: "",
  profile: "",
  edge_mould: "",
  qty: 1,
  hinge_holes: false,
  hinge_supply: false,
  hinge_qty: "",
  product_unit_cost_ex_gst: "",
  unit_cost_mode: "manual",
  unit_cost_source_id: null,
  unit_cost_source_label: "",
  unit_cost_per_sqm_ex_gst: 0,
  calculated_unit_cost_ex_gst: 0,
  markup_percent: DEFAULT_BUSINESS_DEFAULTS.markup_percent,
  notes: "",
  client_note: "",
};

function emptyLineWithDefaults(defaults = DEFAULT_BUSINESS_DEFAULTS) {
  return {
    ...emptyLine,
    markup_percent: defaults.markup_percent ?? DEFAULT_BUSINESS_DEFAULTS.markup_percent,
  };
}

const emptyForm = {
  id: "",
  quote_number: "",
  access_code: "",
  order_id: "",
  customer_id: "",
  status: "draft",
  title: "Cabinetry Quote",
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  site_address: "",
  project_name: "",
  currency: DEFAULT_BUSINESS_DEFAULTS.currency,
  gst_rate: DEFAULT_BUSINESS_DEFAULTS.gst_rate,
  labour_hours: "",
  worker_hourly_rate: DEFAULT_BUSINESS_DEFAULTS.worker_hourly_rate,
  travel_cost_ex_gst: "",
  delivery_cost_ex_gst: "",
  installation_cost_ex_gst: "",
  other_cost_ex_gst: 0,
  markup_percent: 0,
  markup_amount_ex_gst: 0,
  deposit_required: false,
  deposit_percent: 0,
  notes: "",
  client_notes: "",
  assumptions: "",
  exclusions: "",
  terms: "Prices are valid for 14 days. Final measurements and site conditions may affect the final invoice.",
  lines: [emptyLineWithDefaults()],
  attachments: [],
};

const emptyCustomerForm = {
  name: "",
  company_name: "",
  email: "",
  phone: "",
  site_address: "",
  notes: "",
};

function lineFromQuoteLine(line) {
  return {
    ...emptyLine,
    ...line,
    cabinet_config: Array.isArray(line.pcd_cabinet_configs)
      ? line.pcd_cabinet_configs[0] || null
      : line.pcd_cabinet_configs || line.cabinet_config || null,
    product_type: line.product_type ?? "",
    product_name: line.product_name ?? "",
    description: line.description ?? "",
    material: line.material ?? "",
    thickness: line.thickness ?? "",
    width_mm: line.width_mm ?? "",
    height_mm: line.height_mm ?? "",
    profile_type: line.profile_type ?? "",
    hinge_holes: Boolean(line.hinge_holes),
    hinge_supply: Boolean(line.hinge_supply),
    hinge_qty: line.hinge_qty ?? "",
    product_unit_cost_ex_gst: line.product_unit_cost_ex_gst ?? "",
    unit_cost_mode: line.unit_cost_mode === "auto" ? "auto" : "manual",
    unit_cost_source_id: line.unit_cost_source_id || null,
    unit_cost_source_label: line.unit_cost_source_label || "",
    unit_cost_per_sqm_ex_gst: line.unit_cost_per_sqm_ex_gst ?? 0,
    calculated_unit_cost_ex_gst: line.calculated_unit_cost_ex_gst ?? 0,
    markup_percent: line.markup_percent ?? "",
    client_note: line.client_note ?? "",
    notes: line.notes ?? "",
  };
}

function linesFromQuote(quote) {
  return [...(quote?.pcd_quote_line_items || [])]
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(lineFromQuoteLine);
}

function formFromQuote(quote) {
  const lines = linesFromQuote(quote);
  return {
    ...emptyForm,
    ...quote,
    order_id: quote.order_id || "",
    customer_id: quote.customer_id || "",
    customer_name: quote.customer_name || "",
    customer_email: quote.customer_email || "",
    customer_phone: quote.customer_phone || "",
    site_address: quote.site_address || "",
    project_name: quote.project_name || "",
    labour_hours: quote.labour_hours ?? "",
    worker_hourly_rate: quote.worker_hourly_rate ?? "",
    travel_cost_ex_gst: quote.travel_cost_ex_gst ?? "",
    delivery_cost_ex_gst: quote.delivery_cost_ex_gst ?? "",
    installation_cost_ex_gst: quote.installation_cost_ex_gst ?? "",
    other_cost_ex_gst: 0,
    markup_percent: quote.markup_percent ?? 0,
    markup_amount_ex_gst: quote.markup_amount_ex_gst ?? 0,
    deposit_required: Boolean(quote.deposit_required),
    deposit_percent: quote.deposit_percent ?? 0,
    notes: quote.notes || "",
    client_notes: quote.client_notes || "",
    assumptions: quote.assumptions || "",
    exclusions: quote.exclusions || "",
    terms: quote.terms || emptyForm.terms,
    lines: lines.length ? lines : [{ ...emptyLine }],
    attachments: [...(quote.pcd_quote_attachments || [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
  };
}

function mergeQuoteIntoForm(current, quote) {
  return {
    ...current,
    ...quote,
    order_id: quote.order_id || "",
    customer_id: quote.customer_id || "",
    customer_name: quote.customer_name || "",
    customer_email: quote.customer_email || "",
    customer_phone: quote.customer_phone || "",
    site_address: quote.site_address || "",
    project_name: quote.project_name || "",
    labour_hours: quote.labour_hours ?? "",
    worker_hourly_rate: quote.worker_hourly_rate ?? "",
    travel_cost_ex_gst: quote.travel_cost_ex_gst ?? "",
    delivery_cost_ex_gst: quote.delivery_cost_ex_gst ?? "",
    installation_cost_ex_gst: quote.installation_cost_ex_gst ?? "",
    other_cost_ex_gst: 0,
    markup_percent: quote.markup_percent ?? 0,
    markup_amount_ex_gst: quote.markup_amount_ex_gst ?? 0,
    deposit_required: Boolean(quote.deposit_required),
    deposit_percent: quote.deposit_percent ?? 0,
    notes: quote.notes || "",
    client_notes: quote.client_notes || "",
    assumptions: quote.assumptions || "",
    exclusions: quote.exclusions || "",
    terms: quote.terms || emptyForm.terms,
    lines: current.lines,
    attachments: current.attachments,
  };
}

function Field({ label, children, wide = false }) {
  return (
    <label className={`${styles.fieldLabel} ${wide ? styles.fieldWide : ""}`}>
      {label}
      {children}
    </label>
  );
}

function quoteLineSizeText(line) {
  if (!line.width_mm && !line.height_mm) return "";
  return `${line.width_mm || "-"} x ${line.height_mm || "-"}`;
}

function lineValue(value, fallback = "-") {
  return value || fallback;
}

function isBaseCabinetLine(line) {
  return line?.product_type === BASE_CABINET_TYPE;
}

function displayProductType(value) {
  return value === BASE_CABINET_TYPE ? "Base cabinet" : value;
}

function defaultQuoteEmailSubject(form) {
  return `${form.quote_number || "Your quote"} - Perth Cabinet Doors quote`;
}

function defaultQuoteEmailMessage(form, viewUrl) {
  return [
    `Hi ${form.customer_name || "there"},`,
    "",
    "Your Perth Cabinet Doors quote is ready to review.",
    "",
    "Please use the secure link below to view the quote, check the line items and approve or reject it online.",
    "",
    `View quote: ${viewUrl || "Quote link will be generated when sent."}`,
    form.access_code ? `Access code: ${form.access_code}` : null,
    "",
    "Regards,",
    "Perth Cabinet Doors",
  ].filter((line) => line !== null).join("\n");
}

function colourSrcForLine(line) {
  return line.colour_src || "";
}

function hasHingeConfig(line) {
  return Boolean(line?.hinge_holes || line?.hinge_supply);
}

function hingeConfigLines(line) {
  if (!hasHingeConfig(line)) return [];
  return [
    `Drilling: ${line.hinge_holes ? "Required" : "Not required"}`,
    `Supply: ${line.hinge_supply ? "Required" : "Not required"}`,
    `Qty: ${line.hinge_qty || "Per door"}`,
  ];
}

function hasProfileConfig(line) {
  return Boolean(line?.profile_type || line?.profile);
}

function profileConfigLines(line) {
  if (!hasProfileConfig(line)) return [];
  return [
    `Type: ${line.profile_type || "-"}`,
    `Name: ${line.profile || "-"}`,
  ];
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "-";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function assetSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function edgeOptionSrc(label) {
  return `/images/edges/${assetSlug(label)}.png`;
}

function profileOptionSrc(profileType, label) {
  return `/images/profiles/${assetSlug(profileType)}/${assetSlug(label)}.jpg`;
}

function optionMetaLabel(option) {
  return [option.finish || option.meta || "", option.supplier || ""].filter(Boolean).join(" - ");
}

function quoteLineAreaSqm(line) {
  const width = Number(line?.width_mm || 0);
  const height = Number(line?.height_mm || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
  return (width * height) / 1000000;
}

function calculatedUnitCostFromLine(line) {
  const rate = Number(line?.unit_cost_per_sqm_ex_gst || 0);
  const area = quoteLineAreaSqm(line);
  if (!Number.isFinite(rate) || rate <= 0 || area <= 0) return 0;
  return roundMoney(area * rate);
}

function applyCalculatedUnitCost(line, { forceAuto = false } = {}) {
  const calculated = calculatedUnitCostFromLine(line);
  const hasAutoSource = Number(line?.unit_cost_per_sqm_ex_gst || 0) > 0;
  const next = {
    ...line,
    calculated_unit_cost_ex_gst: calculated,
  };

  if (forceAuto && hasAutoSource) {
    next.unit_cost_mode = "auto";
  }

  if (next.unit_cost_mode === "auto" && hasAutoSource && calculated > 0) {
    next.product_unit_cost_ex_gst = calculated;
  }

  return next;
}

const tw = {
  card: "bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden mb-3",
  cardHeader: "px-4 py-3 border-b border-[#edf4eb] flex items-center justify-between",
  cardTitle: "text-[13px] font-semibold text-[#1a1a18]",
  cardBody: "px-4 py-4",
  fieldLabel: "flex flex-col gap-1 text-[11px] font-medium text-[#5a5a52]",
  fieldInput: "h-[34px] w-full border border-[#dbd8cc] rounded-[6px] px-3 text-[13px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61]",
  textarea: "w-full border border-[#dbd8cc] rounded-[6px] px-3 py-2 text-[13px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] resize-none",
  grid2: "grid grid-cols-2 gap-3",
  grid3: "grid grid-cols-3 gap-3",
  wide: "col-span-2",
  primaryBtn: "h-[34px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors",
  secondaryBtn: "h-[34px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors",
  smBtn: "h-[28px] px-3 text-[12px] font-medium rounded-[6px] border border-[#dbd8cc] bg-white text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors",
  dangerBtn: "h-[28px] px-3 text-[12px] font-medium rounded-[6px] border border-[#fca5a5] bg-white text-[#991b1b] hover:bg-[#fef2f2] disabled:opacity-50 transition-colors",
  muted: "text-[11px] text-[#8b8a81]",
  mono: "font-mono text-[12px]",
  pill: "inline-flex items-center px-2 py-[2px] rounded-full text-[11px] font-medium border",
  sectionLabel: "text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8b8a81] mb-3",
  saveBar: "flex justify-end pt-3 border-t border-[#edf4eb] mt-3",
};

const QuoteImageCombobox = memo(function QuoteImageCombobox({ disabled = false, placeholder, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const [menuStyle, setMenuStyle] = useState({});
  const dropdownIdRef = useRef(`quote-combobox-${Math.random().toString(36).slice(2)}`);
  const menuRef = useRef(null);
  const wrapRef = useRef(null);
  const cleanedQuery = query.trim().toLowerCase();
  const visibleOptions =
    cleanedQuery.length >= 3
      ? options.filter((option) => option.label.toLowerCase().includes(cleanedQuery))
      : options;

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    if (!open) return;

    function closeOtherDropdowns(event) {
      if (event.detail !== dropdownIdRef.current) setOpen(false);
    }

    function closeOnOutsidePointer(event) {
      const target = event.target;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    window.addEventListener(ADMIN_DROPDOWN_OPEN_EVENT, closeOtherDropdowns);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener(ADMIN_DROPDOWN_OPEN_EVENT, closeOtherDropdowns);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !wrapRef.current) return;

    function positionMenu() {
      const rect = wrapRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const preferredWidth = Math.max(rect.width, 320);
      const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2);
      const left = Math.min(
        Math.max(rect.left, viewportPadding),
        window.innerWidth - width - viewportPadding
      );
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(160, Math.min(360, availableHeight - 4));
      setMenuStyle({
        bottom: openAbove ? `${window.innerHeight - rect.top + 4}px` : "auto",
        left: `${left}px`,
        maxHeight: `${maxHeight}px`,
        top: openAbove ? "auto" : `${rect.bottom + 4}px`,
        width: `${width}px`,
      });
    }

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  function choose(option) {
    setQuery(option.name || option.label);
    onChange(option);
    setOpen(false);
  }

  function openMenu() {
    if (disabled) return;
    window.dispatchEvent(new CustomEvent(ADMIN_DROPDOWN_OPEN_EVENT, { detail: dropdownIdRef.current }));
    setOpen(true);
  }

  return (
    <div className={`${styles.quoteColourCombo} ${quoteStyles.quoteColourCombo}`} ref={wrapRef}>
      <input
        disabled={disabled}
        placeholder={placeholder}
        type="text"
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          openMenu();
          onChange({ name: nextQuery, label: nextQuery, finish: "" });
        }}
        onFocus={openMenu}
      />
      <button
        aria-label="Open options"
        className={quoteStyles.quoteColourComboButton}
        disabled={disabled}
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          if (disabled) return;
          if (open) {
            setOpen(false);
          } else {
            openMenu();
          }
        }}
      />
      {open && !disabled && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.quoteColourMenu} ref={menuRef} style={menuStyle}>
              {visibleOptions.length ? (
                visibleOptions.map((option) => (
                  <button
                    className={styles.quoteColourOption}
                    key={`${option.label}-${option.src}`}
                    type="button"
                    onMouseDown={() => choose(option)}
                  >
                    <span className={styles.quoteOptionThumb}>
                      {option.src ? <img alt="" src={option.src} /> : <span>{String(option.name || option.label || "?").slice(0, 2).toUpperCase()}</span>}
                    </span>
                    <span>
                      <strong>{option.name || option.label}</strong>
                      <small>{optionMetaLabel(option)}</small>
                    </span>
                  </button>
                ))
              ) : (
                <div className={styles.quoteColourEmpty}>No match</div>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
});

const QuoteTileCombobox = memo(function QuoteTileCombobox({ disabled = false, placeholder, value, options, onChange }) {
  return (
    <QuoteImageCombobox
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      options={options.map((option) => (typeof option === "string" ? { label: option, name: option } : option))}
      onChange={onChange}
    />
  );
});

function QuoteLineActionDropdown({ children, disabled = false, index, isOpen, onClose, onToggle }) {
  const buttonRef = useRef(null);
  const dropdownIdRef = useRef(`quote-action-${Math.random().toString(36).slice(2)}`);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    // If the button is inside a display:none container, close immediately and bail out.
    if (buttonRef.current.offsetParent === null) { onClose(); return; }

    function closeOtherDropdowns(event) {
      if (event.detail !== dropdownIdRef.current) onClose();
    }

    function closeOnOutsidePointer(event) {
      const target = event.target;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    }

    function positionMenu() {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const width = 156;
      const left = Math.min(
        Math.max(rect.right - width, viewportPadding),
        window.innerWidth - width - viewportPadding
      );
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openAbove = spaceBelow < 150 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(132, Math.min(260, (openAbove ? spaceAbove : spaceBelow) - 4));

      setMenuStyle({
        bottom: openAbove ? `${window.innerHeight - rect.top + 4}px` : "auto",
        left: `${left}px`,
        maxHeight: `${maxHeight}px`,
        position: "fixed",
        right: "auto",
        top: openAbove ? "auto" : `${rect.bottom + 4}px`,
        width: `${width}px`,
      });
    }

    positionMenu();
    window.addEventListener(ADMIN_DROPDOWN_OPEN_EVENT, closeOtherDropdowns);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener(ADMIN_DROPDOWN_OPEN_EVENT, closeOtherDropdowns);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [isOpen, onClose]);

  return (
    <div className={quoteStyles.quoteActionMenuWrap}>
      <button
        type="button"
        className={quoteStyles.quoteActionMenuButton}
        onClick={() => {
          if (!isOpen) window.dispatchEvent(new CustomEvent(ADMIN_DROPDOWN_OPEN_EVENT, { detail: dropdownIdRef.current }));
          onToggle();
        }}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-label={`Open actions for quote line ${index + 1}`}
        ref={buttonRef}
      >
        Actions
      </button>
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div className={quoteStyles.quoteActionMenu} ref={menuRef} style={menuStyle}>
              {children}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

const QuoteColourCombobox = memo(function QuoteColourCombobox({ disabled = false, line, onChange }) {
  const [databaseOptions, setDatabaseOptions] = useState(null);
  const options = databaseOptions || [];

  useEffect(() => {
    let cancelled = false;

    async function loadDatabaseColours() {
      setDatabaseOptions(null);
      if (!line.material || !line.thickness) return;
      const cacheKey = `${line.material}::${line.thickness}`;
      if (colourOptionsCache.has(cacheKey)) {
        setDatabaseOptions(colourOptionsCache.get(cacheKey));
        return;
      }

      try {
        const response = await fetch(`/api/colour-library?material=${encodeURIComponent(line.material)}&thickness=${encodeURIComponent(line.thickness)}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!cancelled) {
          const options = payload?.colourFamily?.groups?.length ? optionsFromColourFamily(payload.colourFamily) : [];
          colourOptionsCache.set(cacheKey, options);
          setDatabaseOptions(options);
        }
      } catch (error) {
        if (!cancelled) setDatabaseOptions([]);
      }
    }

    loadDatabaseColours();
    return () => {
      cancelled = true;
    };
  }, [line.material, line.thickness]);

  return (
    <QuoteImageCombobox
      disabled={disabled || !line.material || !line.thickness}
      placeholder={line.material && line.thickness ? "Colour" : "Select material and thickness first"}
      value={line.colour}
      options={options}
      onChange={(option) =>
        onChange({
          colour: option.name || option.label,
          finish: option.finish || "",
          unit_cost_source_id: option.id || null,
          unit_cost_source_label: option.label || option.name || "",
          unit_cost_per_sqm_ex_gst: Number(option.costPerSqmExGst || 0),
        })
      }
    />
  );
});

export default function QuoteEditor({ quoteId }) {
  const fileInputRef = useRef(null);
  const lineViewModelCacheRef = useRef(new WeakMap());
  const quoteItemsScrollerRef = useRef(null);
  const shouldScrollQuoteItemsToBottomRef = useRef(false);
  const [activeSection, setActiveSection] = useState("details");
  const [form, setForm] = useState(emptyForm);
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [editableLineIndex, setEditableLineIndex] = useState(null);
  const [editableLineDraft, setEditableLineDraft] = useState(null);
  const [openLineActionIndex, setOpenLineActionIndex] = useState(null);
  const [deleteLineConfirmIndex, setDeleteLineConfirmIndex] = useState(null);
  const [activeCabinetLineIndex, setActiveCabinetLineIndex] = useState(null);
  const [hingeModal, setHingeModal] = useState(null);
  const [profileModal, setProfileModal] = useState(null);
  const [lineNoteModal, setLineNoteModal] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savingLineIndex, setSavingLineIndex] = useState(null);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingCabinetPdf, setIsGeneratingCabinetPdf] = useState(false);
  const [isGeneratingQuotePdf, setIsGeneratingQuotePdf] = useState(false);
  const [publishEmail, setPublishEmail] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [businessDefaults, setBusinessDefaults] = useState(DEFAULT_BUSINESS_DEFAULTS);
  const [rooms, setRooms] = useState([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [isGeneratingLines, setIsGeneratingLines] = useState(false);
  const [plannerRoom, setPlannerRoom] = useState(null);

  const totals = useMemo(
    () => calculateQuoteTotals(form.lines, form.gst_rate, { ...form, business_defaults: businessDefaults }),
    [
      form.lines,
      form.gst_rate,
      form.labour_hours,
      form.worker_hourly_rate,
      form.travel_cost_ex_gst,
      form.delivery_cost_ex_gst,
      form.installation_cost_ex_gst,
      businessDefaults,
    ]
  );
  const publicUrl =
    typeof window !== "undefined" && form.access_code
      ? `${window.location.origin}/quotes/view?code=${form.access_code}`
      : "";
  const attachmentPagination = useAdminTablePagination(form.attachments);

  function lineViewModel(line) {
    const cached = lineViewModelCacheRef.current.get(line);
    if (cached?.businessDefaults === businessDefaults) return cached.value;

    const edgeProfiles = edgeProfilesForMaterial(line.material);
    const value = {
      calculated: calculateQuoteLine(line, businessDefaults),
      materialOptions: MATERIALS_BY_TYPE[line.product_type] || MATERIAL_OPTIONS,
      thicknessOptions: thicknessOptionsForMaterial(line.material),
      showEdges: edgeProfiles.length > 0,
      showProfiles: line.material === "Thermolaminate",
      edgeOptions: edgeProfiles.map((edge) => ({
        name: edge,
        label: edge,
        meta: "Edge profile",
        src: edgeOptionSrc(edge),
      })),
      hingesApplicable: line.product_type === "Door",
      colourSrc: colourSrcForLine(line),
      isBaseCabinet: isBaseCabinetLine(line),
    };

    lineViewModelCacheRef.current.set(line, { businessDefaults, value });
    return value;
  }

  async function loadQuote() {
    setIsLoading(true);
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
      setFeedback(payload.error || "Could not load quote.");
        return;
      }
      setForm(formFromQuote(payload.quote));
      setEditableLineIndex(null);
      setEditableLineDraft(null);
      setActiveCabinetLineIndex(null);
    } catch (error) {
      setFeedback(error?.message || "Could not load quote.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCustomers() {
    try {
      const response = await fetch("/api/admin/customers", { cache: "no-store" });
      const payload = await response.json();
      if (payload.ok) setCustomers(payload.customers || []);
    } catch (error) {
      setFeedback(error?.message || "Could not load customers.");
    }
  }

  useEffect(() => {
    loadQuote();
    loadCustomers();
    loadBusinessDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  useEffect(() => {
    if ((activeSection !== "rooms" && activeSection !== "elevations") || roomsLoaded) return;
    loadRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, roomsLoaded]);

  useEffect(() => {
    if (!shouldScrollQuoteItemsToBottomRef.current) return;
    shouldScrollQuoteItemsToBottomRef.current = false;
    const scroller = quoteItemsScrollerRef.current;
    if (!scroller) return;
    requestAnimationFrame(() => {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
    });
  }, [form.lines.length]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timeout = window.setTimeout(() => setFeedback(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && editableLineIndex !== null) {
        setEditableLineIndex(null);
        setEditableLineDraft(null);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editableLineIndex]);

  async function loadBusinessDefaults() {
    try {
      const response = await fetch("/api/admin/business-defaults", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) return;
      const nextDefaults = { ...DEFAULT_BUSINESS_DEFAULTS, ...payload.defaults };
      setBusinessDefaults(nextDefaults);
      setForm((current) => ({
        ...current,
        currency:
          current.currency === "" || current.currency === null || current.currency === undefined
            ? nextDefaults.currency
            : current.currency,
        gst_rate:
          current.gst_rate === "" || current.gst_rate === null || current.gst_rate === undefined
            ? nextDefaults.gst_rate
            : current.gst_rate,
        worker_hourly_rate:
          current.worker_hourly_rate === "" || current.worker_hourly_rate === null || current.worker_hourly_rate === undefined
            ? nextDefaults.worker_hourly_rate
            : current.worker_hourly_rate,
        lines: (current.lines || []).map((line) => ({
          ...line,
          markup_percent:
            line.markup_percent === "" || line.markup_percent === null || line.markup_percent === undefined
              ? nextDefaults.markup_percent
              : line.markup_percent,
        })),
      }));
    } catch {
      // Business defaults are optional; built-in defaults remain available.
    }
  }

  async function loadRooms() {
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}/rooms`, { cache: "no-store" });
      const payload = await response.json();
      if (payload.ok) {
        setRooms(payload.rooms || []);
        setRoomsLoaded(true);
      }
    } catch {}
  }

  async function handleGenerateLineItems() {
    if (!rooms.length) return;
    setIsGeneratingLines(true);
    setFeedback("");
    let created = 0;
    let linkFailed = 0;
    const sortBase = form.lines.filter((l) => l.id).length;
    try {
      for (const room of rooms) {
        // Room with no cabinets returns ok:true with empty array — skips cleanly
        const cabRes = await fetch(`/api/admin/quotes/${quoteId}/rooms/${room.id}/cabinets`, { cache: "no-store" });
        const cabData = await cabRes.json();
        if (!cabData.ok) continue;
        // quote_line_item_id filter prevents duplicates if run twice
        const unlinked = (cabData.cabinets || []).filter((c) => !c.quote_line_item_id);
        for (const cabinet of unlinked) {
          const lineRes = await fetch(`/api/admin/quotes/${quoteId}/lines`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              line: {
                product_name: CABINET_TYPE_LABELS[cabinet.cabinet_type] || "Cabinet",
                description: `Room: ${room.name}`,
                width_mm: cabinet.width_mm || null,
                height_mm: cabinet.height_mm || null,
              },
              sort_order: sortBase + created,
            }),
          });
          const lineData = await lineRes.json();
          if (!lineData.ok) continue;
          created++;
          const patchRes = await fetch(`/api/admin/quotes/${quoteId}/rooms/${room.id}/cabinets/${cabinet.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quote_line_item_id: lineData.line.id }),
          });
          const patchData = await patchRes.json();
          if (!patchData.ok) {
            console.warn(`Cabinet ${cabinet.id}: line ${lineData.line.id} created but link PATCH failed:`, patchData.error);
            linkFailed++;
          }
        }
      }
      if (created > 0) {
        const quoteRes = await fetch(`/api/admin/quotes/${quoteId}`, { cache: "no-store" });
        const quoteData = await quoteRes.json();
        if (quoteData.ok) setForm(formFromQuote(quoteData.quote));
      }
      const base = created > 0
        ? `Generated ${created} line item${created !== 1 ? "s" : ""} and linked to cabinets.`
        : "All cabinets are already linked to line items.";
      const warning = linkFailed > 0
        ? ` Warning: ${linkFailed} cabinet${linkFailed !== 1 ? "s" : ""} could not be linked — check the console.`
        : "";
      setFeedback(base + warning);
    } catch (err) {
      setFeedback(err?.message || "Could not generate line items.");
    } finally {
      setIsGeneratingLines(false);
    }
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyCustomer(customerId) {
    if (!customerId) {
      setForm((current) => ({ ...current, customer_id: "" }));
      return;
    }
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return;
    setForm((current) => ({
      ...current,
      customer_id: customer.id,
      customer_name: customer.name || "",
      customer_email: customer.email || "",
      customer_phone: customer.phone || "",
      site_address: customer.site_address || current.site_address || "",
    }));
  }

  function openCustomerModal() {
    setCustomerForm({
      ...emptyCustomerForm,
      name: form.customer_name || "",
      email: form.customer_email || "",
      phone: form.customer_phone || "",
      site_address: form.site_address || "",
    });
    setFeedback("");
    setIsCustomerModalOpen(true);
  }

  function updateCustomerForm(field, value) {
    setCustomerForm((current) => ({ ...current, [field]: value }));
  }

  function updateSavedLine(index, updater) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => (lineIndex === index ? updater(line) : line)),
    }));
  }

  function applyLineFieldPatch(line, field, value) {
    const next = { ...line, [field]: value };
    if (field === "product_unit_cost_ex_gst") {
      return {
        ...next,
        unit_cost_mode: "manual",
      };
    }
    if (field === "width_mm" || field === "height_mm") {
      return applyCalculatedUnitCost(next);
    }
    return next;
  }

  function updateLine(index, field, value) {
    if (index === editableLineIndex) {
      setEditableLineDraft((current) => applyLineFieldPatch(current || form.lines[index] || emptyLineWithDefaults(businessDefaults), field, value));
      return;
    }
    updateSavedLine(index, (line) => applyLineFieldPatch(line, field, value));
  }

  function openHingeModal(index) {
    const line = index === editableLineIndex && editableLineDraft ? editableLineDraft : form.lines[index];
    if (!line || line.product_type !== "Door") return;
    setHingeModal({
      lineIndex: index,
      hinge_holes: Boolean(line.hinge_holes),
      hinge_supply: Boolean(line.hinge_supply),
      hinge_qty: line.hinge_qty || "",
    });
  }

  function updateHingeModal(field, value) {
    setHingeModal((current) => {
      if (!current) return current;
      const next = { ...current, [field]: value };
      if ((field === "hinge_holes" || field === "hinge_supply") && !next.hinge_holes && !next.hinge_supply) {
        next.hinge_qty = "";
      }
      return next;
    });
  }

  function saveHingeModal() {
    if (!hingeModal) return;
    const hasRequirements = hingeModal.hinge_holes || hingeModal.hinge_supply;
    const patch = {
      hinge_holes: Boolean(hingeModal.hinge_holes),
      hinge_supply: Boolean(hingeModal.hinge_supply),
      hinge_qty: hasRequirements ? hingeModal.hinge_qty : "",
    };
    if (hingeModal.lineIndex === editableLineIndex) {
      setEditableLineDraft((current) => ({ ...(current || form.lines[hingeModal.lineIndex] || emptyLineWithDefaults(businessDefaults)), ...patch }));
    } else {
      updateSavedLine(hingeModal.lineIndex, (line) => ({ ...line, ...patch }));
    }
    setHingeModal(null);
  }

  function openProfileModal(index) {
    const line = index === editableLineIndex && editableLineDraft ? editableLineDraft : form.lines[index];
    if (!line || line.material !== "Thermolaminate" || isBaseCabinetLine(line)) return;
    setProfileModal({
      lineIndex: index,
      material: line.material || "",
      thickness: line.thickness || "",
      profile_type: line.profile_type || "",
      profile: line.profile || "",
    });
  }

  function updateProfileModal(field, value) {
    setProfileModal((current) => {
      if (!current) return current;
      const next = { ...current, [field]: value };
      if (field === "profile_type") next.profile = "";
      return next;
    });
  }

  function saveProfileModal() {
    if (!profileModal) return;
    const patch = {
      profile_type: profileModal.profile_type,
      profile: profileModal.profile,
    };
    if (profileModal.lineIndex === editableLineIndex) {
      setEditableLineDraft((current) => ({ ...(current || form.lines[profileModal.lineIndex] || emptyLineWithDefaults(businessDefaults)), ...patch }));
    } else {
      updateSavedLine(profileModal.lineIndex, (line) => ({ ...line, ...patch }));
    }
    setProfileModal(null);
  }

  function openLineNoteModal(index) {
    if (editableLineIndex !== null || savingLineIndex !== null) return;
    const line = form.lines[index];
    if (!line) return;
    setLineNoteModal({
      lineIndex: index,
      client_note: line.client_note || "",
    });
  }

  function updateLineNoteModal(value) {
    setLineNoteModal((current) => (current ? { ...current, client_note: value } : current));
  }

  async function saveLineNoteModal() {
    if (!lineNoteModal) return;
    const line = form.lines[lineNoteModal.lineIndex];
    if (!line) return;
    const nextLine = { ...line, client_note: lineNoteModal.client_note };
    updateSavedLine(lineNoteModal.lineIndex, () => nextLine);
    const saved = await saveLineAtIndex(lineNoteModal.lineIndex, nextLine, { updateDraft: false });
    if (saved) setLineNoteModal(null);
  }

  function applyProductLinePatch(line, patch) {
    const next = { ...line, ...patch };

    if (Object.prototype.hasOwnProperty.call(patch, "product_type")) {
      next.product_name = patch.product_type || "";
      if (patch.product_type === BASE_CABINET_TYPE) {
        next.product_name = "Base cabinet";
        next.qty = next.qty || 1;
        next.width_mm = "";
        next.height_mm = "";
        next.edge_mould = "";
        next.profile_type = "";
        next.profile = "";
        next.hinge_holes = false;
        next.hinge_supply = false;
        next.hinge_qty = "";
        next.product_unit_cost_ex_gst = "";
        next.markup_percent = next.markup_percent ?? businessDefaults.markup_percent;
      }
      if (patch.product_type !== "Door") {
        next.hinge_holes = false;
        next.hinge_supply = false;
        next.hinge_qty = "";
      }
      if (patch.product_type !== BASE_CABINET_TYPE) {
        next.cabinet_config = null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "material")) {
      next.thickness = "";
      next.finish = "";
      next.colour = "";
      next.unit_cost_mode = "manual";
      next.unit_cost_source_id = null;
      next.unit_cost_source_label = "";
      next.unit_cost_per_sqm_ex_gst = 0;
      next.calculated_unit_cost_ex_gst = 0;
      if (!isEdgeProfileSelectionAvailable(next.edge_mould, next.material)) {
        next.edge_mould = "";
      }
      if (next.product_type === BASE_CABINET_TYPE) {
        next.thickness = thicknessOptionsForMaterial(patch.material)[0] || "";
      }
      if (patch.material !== "Thermolaminate") {
        next.profile_type = "";
        next.profile = "";
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "thickness")) {
      next.finish = "";
      next.colour = "";
      next.unit_cost_mode = "manual";
      next.unit_cost_source_id = null;
      next.unit_cost_source_label = "";
      next.unit_cost_per_sqm_ex_gst = 0;
      next.calculated_unit_cost_ex_gst = 0;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "unit_cost_per_sqm_ex_gst")) {
      const hasAutoCost = Number(patch.unit_cost_per_sqm_ex_gst || 0) > 0;
      next.unit_cost_mode = hasAutoCost ? "auto" : "manual";
      if (!hasAutoCost) {
        next.unit_cost_source_id = null;
        next.unit_cost_source_label = "";
        next.calculated_unit_cost_ex_gst = 0;
        return next;
      }
      return applyCalculatedUnitCost(next, { forceAuto: true });
    }

    if (Object.prototype.hasOwnProperty.call(patch, "profile_type")) {
      next.profile = "";
    }

    if (
      (Object.prototype.hasOwnProperty.call(patch, "thickness") ||
        Object.prototype.hasOwnProperty.call(patch, "material")) &&
      !isProfileSelectionAvailable(next.profile_type, next.profile, next.material, next.thickness)
    ) {
      next.profile_type = "";
      next.profile = "";
    }

    if (
      (Object.prototype.hasOwnProperty.call(patch, "hinge_supply") ||
        Object.prototype.hasOwnProperty.call(patch, "hinge_holes")) &&
      !next.hinge_supply &&
      !next.hinge_holes
    ) {
      next.hinge_qty = "";
    }

    return applyCalculatedUnitCost(next);
  }

  function updateProductLine(index, patch) {
    if (index === editableLineIndex) {
      setEditableLineDraft((current) => applyProductLinePatch(current || form.lines[index] || emptyLineWithDefaults(businessDefaults), patch));
      return;
    }
    updateSavedLine(index, (line) => applyProductLinePatch(line, patch));
  }

  function resetLineUnitCost(index) {
    const reset = (line) => applyCalculatedUnitCost({ ...line, unit_cost_mode: "auto" }, { forceAuto: true });
    if (index === editableLineIndex) {
      setEditableLineDraft((current) => reset(current || form.lines[index] || emptyLineWithDefaults(businessDefaults)));
      return;
    }
    updateSavedLine(index, reset);
  }

  async function editLine(index) {
    if (editableLineIndex !== null && editableLineIndex !== index) {
      const saved = await saveLineAtIndex(editableLineIndex, editableLineDraft || form.lines[editableLineIndex]);
      if (!saved) return;
    }
    setEditableLineDraft(form.lines[index] || emptyLineWithDefaults(businessDefaults));
    setEditableLineIndex(index);
    setActiveSection("items");
  }

  async function saveLine() {
    if (editableLineIndex === null) return;
    const lineIndex = editableLineIndex;
    const lineDraft = editableLineDraft || form.lines[lineIndex];
    if (!lineDraft) return;

    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, index) => (index === lineIndex ? lineDraft : line)),
    }));
    setEditableLineIndex(null);
    setEditableLineDraft(null);
    setActiveCabinetLineIndex(null);

    const saved = await saveLineAtIndex(lineIndex, lineDraft);
    if (!saved) {
      setEditableLineIndex(lineIndex);
      setEditableLineDraft(lineDraft);
      setActiveSection("items");
    }
  }

  async function addLine() {
    if (editableLineIndex !== null) {
      const saved = await saveLineAtIndex(editableLineIndex, editableLineDraft || form.lines[editableLineIndex], { updateDraft: false });
      if (!saved) return;
    }
    const nextIndex = form.lines.length;
    const nextLine = emptyLineWithDefaults(businessDefaults);
    shouldScrollQuoteItemsToBottomRef.current = true;
    setForm((current) => ({ ...current, lines: [...current.lines, nextLine] }));
    setEditableLineDraft(nextLine);
    setEditableLineIndex(nextIndex);
    setActiveSection("items");
  }

  async function duplicateLine(index) {
    if (editableLineIndex !== null) {
      const saved = await saveLineAtIndex(editableLineIndex, editableLineDraft || form.lines[editableLineIndex], { updateDraft: false });
      if (!saved) return;
    }
    const sourceLine = form.lines[index];
    if (!sourceLine) return;
    const { id: _id, ...rest } = sourceLine;
    const nextLine = { ...rest };
    const nextIndex = form.lines.length;
    shouldScrollQuoteItemsToBottomRef.current = true;
    setForm((current) => ({ ...current, lines: [...current.lines, nextLine] }));
    setEditableLineDraft(nextLine);
    setEditableLineIndex(nextIndex);
    setActiveSection("items");
  }

  async function removeLine(index) {
    if (form.lines.length <= 1) return;
    if (editableLineIndex !== null && editableLineIndex !== index) {
      const saved = await saveLineAtIndex(editableLineIndex, editableLineDraft || form.lines[editableLineIndex]);
      if (!saved) return;
    }
    const line = form.lines[index];
    if (line?.id) {
      setSavingLineIndex(index);
      setFeedback("");
      try {
        const response = await fetch(`/api/admin/quotes/${quoteId}/lines/${line.id}`, {
          method: "DELETE",
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          setFeedback(payload.error || "Could not delete quote line.");
          return;
        }
        setForm((current) => mergeQuoteIntoForm(current, payload.quote));
      } catch (error) {
        setFeedback(error?.message || "Could not delete quote line.");
        return;
      } finally {
        setSavingLineIndex(null);
      }
    }
    setForm((current) => ({
      ...current,
      lines: current.lines.length > 1 ? current.lines.filter((_, lineIndex) => lineIndex !== index) : current.lines,
    }));
    setEditableLineIndex((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
    setEditableLineDraft((current) => (editableLineIndex === index ? null : current));
    setActiveCabinetLineIndex((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  }

  function closeLineActions() {
    setOpenLineActionIndex(null);
    setDeleteLineConfirmIndex(null);
  }

  function runLineAction(callback) {
    closeLineActions();
    callback();
  }

  async function moveLine(index, direction) {
    const targetIndex = index + direction;
    const currentLines = form.lines;
    if (
      targetIndex < 0 ||
      targetIndex >= currentLines.length ||
      editableLineIndex !== null ||
      savingLineIndex !== null
    ) {
      return;
    }
    if (currentLines.some((line) => !line.id)) {
      setFeedback("Save all quote lines before reordering.");
      return;
    }

    const nextLines = [...currentLines];
    [nextLines[index], nextLines[targetIndex]] = [nextLines[targetIndex], nextLines[index]];
    setForm((current) => ({ ...current, lines: nextLines }));
    setActiveCabinetLineIndex((current) => {
      if (current === index) return targetIndex;
      if (current === targetIndex) return index;
      return current;
    });
    setSavingLineIndex(targetIndex);
    setFeedback("");

    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}/lines/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_ids: nextLines.map((line) => line.id) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setForm((current) => ({ ...current, lines: currentLines }));
        setActiveCabinetLineIndex((current) => {
          if (current === index) return targetIndex;
          if (current === targetIndex) return index;
          return current;
        });
        setFeedback(payload.error || "Could not reorder quote lines.");
        return;
      }
      setFeedback("Line order updated.");
    } catch (error) {
      setForm((current) => ({ ...current, lines: currentLines }));
      setActiveCabinetLineIndex((current) => {
        if (current === index) return targetIndex;
        if (current === targetIndex) return index;
        return current;
      });
      setFeedback(error?.message || "Could not reorder quote lines.");
    } finally {
      setSavingLineIndex(null);
    }
  }

  async function saveLineAtIndex(index, nextLine = form.lines[index], { updateDraft = true } = {}) {
    if (!nextLine) return false;
    setSavingLineIndex(index);
    setFeedback("");
    try {
      const endpoint = nextLine.id
        ? `/api/admin/quotes/${quoteId}/lines/${nextLine.id}`
        : `/api/admin/quotes/${quoteId}/lines`;
      const response = await fetch(endpoint, {
        method: nextLine.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line: nextLine, sort_order: index }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not save quote line.");
        return false;
      }

      const savedLine = lineFromQuoteLine(payload.line);
      setForm((current) => {
        const lines = current.lines.map((line, lineIndex) => (lineIndex === index ? savedLine : line));
        return mergeQuoteIntoForm({ ...current, lines }, payload.quote);
      });
      if (updateDraft && index === editableLineIndex) setEditableLineDraft(savedLine);
      setFeedback("Line saved.");
      return true;
    } catch (error) {
      setFeedback(error?.message || "Could not save quote line.");
      return false;
    } finally {
      setSavingLineIndex(null);
    }
  }

  async function saveQuote(eventOrForm) {
    const nextForm = eventOrForm && typeof eventOrForm.preventDefault === "function" ? form : eventOrForm || form;
    if (eventOrForm && typeof eventOrForm.preventDefault === "function") {
      eventOrForm.preventDefault();
    }
    if (editableLineIndex !== null && (editableLineDraft || nextForm.lines?.[editableLineIndex])) {
      const savedLine = await saveLineAtIndex(editableLineIndex, editableLineDraft || nextForm.lines[editableLineIndex]);
      if (!savedLine) return false;
    }
    setIsSaving(true);
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextForm),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not save quote.");
        return false;
      }
      setForm((current) => mergeQuoteIntoForm(current, payload.quote));
      setFeedback("Quote saved.");
      return true;
    } catch (error) {
      setFeedback(error?.message || "Could not save quote.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCabinetLine(index, cabinetPayload) {
    const nextForm = {
      ...form,
      lines: form.lines.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        return {
          ...line,
          ...cabinetPayload.line_item_patch,
          cabinet_config: cabinetPayload,
          qty: line.qty || 1,
          markup_percent: line.markup_percent ?? businessDefaults.markup_percent,
        };
      }),
    };

    setForm(nextForm);
    const saved = await saveLineAtIndex(index, nextForm.lines[index]);
    if (saved) {
      setEditableLineIndex(null);
      setActiveCabinetLineIndex(null);
    }
  }

  async function generateQuotePdf() {
    setIsGeneratingQuotePdf(true);
    setFeedback("");
    try {
      const saved = await saveQuote();
      if (!saved) return;
      if (typeof window !== "undefined") {
        window.open(`/api/admin/quotes/${quoteId}/pdf?t=${Date.now()}`, "_blank", "noopener,noreferrer");
      }
      setFeedback("Quote PDF generated.");
    } catch (error) {
      setFeedback(error?.message || "Could not generate quote PDF.");
    } finally {
      setIsGeneratingQuotePdf(false);
    }
  }

  async function publishQuote() {
    setIsSaving(true);
    setFeedback("");
    try {
      const saved = await saveQuote();
      if (!saved) return;
      const nextViewUrl =
        typeof window !== "undefined" && form.access_code
          ? `${window.location.origin}/quotes/view?code=${form.access_code}`
          : publicUrl;
      setPublishEmail({
        subject: defaultQuoteEmailSubject(form),
        message: defaultQuoteEmailMessage(form, nextViewUrl),
        deposit_required: Boolean(form.deposit_required),
        deposit_percent: form.deposit_percent || 0,
      });
      setFeedback("");
    } catch (error) {
      setFeedback(error?.message || "Could not prepare quote email.");
    } finally {
      setIsSaving(false);
    }
  }

  function updatePublishEmail(field, value) {
    setPublishEmail((current) => ({ ...(current || {}), [field]: value }));
  }

  async function sendPublishedQuote() {
    if (!publishEmail?.subject?.trim()) {
      setFeedback("Enter an email subject before sending.");
      return;
    }
    if (!publishEmail?.message?.trim()) {
      setFeedback("Enter email content before sending.");
      return;
    }

    setIsSaving(true);
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: publishEmail.subject,
          message: publishEmail.message,
          deposit_required: publishEmail.deposit_required,
          deposit_percent: publishEmail.deposit_percent,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not publish quote.");
        return;
      }
      setPublishEmail(null);
      setFeedback(
        payload.emailSent
          ? "Quote published and sent to customer."
          : `Quote published. Resend is not configured, so use this link: ${payload.viewUrl}`
      );
      await loadQuote();
    } catch (error) {
      setFeedback(error?.message || "Could not publish quote.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCustomerFromDetails() {
    if (!customerForm.name.trim()) {
      setFeedback("Enter a customer name before saving the contact.");
      return;
    }
    setIsSavingCustomer(true);
    setFeedback("");
    try {
      const response = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerForm),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not save customer.");
        return;
      }
      setCustomers((current) => [payload.customer, ...current.filter((customer) => customer.id !== payload.customer.id)]);
      setForm((current) => ({
        ...current,
        customer_id: payload.customer.id,
        customer_name: payload.customer.name || "",
        customer_email: payload.customer.email || "",
        customer_phone: payload.customer.phone || "",
        site_address: payload.customer.site_address || "",
      }));
      setIsCustomerModalOpen(false);
      setFeedback("Customer saved. Save the quote to keep it attached.");
    } catch (error) {
      setFeedback(error?.message || "Could not save customer.");
    } finally {
      setIsSavingCustomer(false);
    }
  }

  async function uploadAttachments() {
    if (!selectedFiles.length) {
      setFeedback("Choose one or more files first.");
      return;
    }
    setIsUploading(true);
    setFeedback("");
    try {
      const supabase = createSupabaseBrowserClient();
      const rows = [];
      for (const file of selectedFiles) {
        const cleanName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
        const path = `${quoteId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${cleanName}`;
        const { error: uploadError } = await supabase.storage.from("attachments").upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from("attachments").getPublicUrl(path);
        rows.push({
          quote_id: quoteId,
          file_name: file.name,
          file_path: path,
          file_url: publicUrl,
          file_type: file.type || "File",
          file_size: file.size,
        });
      }
      const { error: insertError } = await supabase.from("pcd_quote_attachments").insert(rows);
      if (insertError) throw insertError;
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadQuote();
      setFeedback("Attachments uploaded.");
    } catch (error) {
      setFeedback(error?.message || "Could not upload attachments.");
    } finally {
      setIsUploading(false);
    }
  }

  async function deleteAttachment(attachment) {
    setIsUploading(true);
    setFeedback("");
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.storage.from("attachments").remove([attachment.file_path]);
      const { error } = await supabase.from("pcd_quote_attachments").delete().eq("id", attachment.id);
      if (error) throw error;
      await loadQuote();
      setFeedback("Attachment deleted.");
    } catch (error) {
      setFeedback(error?.message || "Could not delete attachment.");
    } finally {
      setIsUploading(false);
    }
  }


  async function generateCabinetDrawingsAttachment() {
    setIsGeneratingCabinetPdf(true);
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}/cabinet-drawings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not generate cabinet drawings PDF.");
      await loadQuote();
      setFeedback("Cabinet drawings PDF generated and attached.");
    } catch (error) {
      setFeedback(error?.message || "Could not generate cabinet drawings PDF.");
    } finally {
      setIsGeneratingCabinetPdf(false);
    }
  }

  // ---- Room CRUD (state-only callbacks — RoomManager owns the API calls) ----

  function handleRoomAdd(room) {
    setRooms((prev) => [...prev, room]);
  }

  function handleRoomUpdate(room) {
    setRooms((prev) => prev.map((r) => (r.id === room.id ? room : r)));
  }

  function handleRoomDelete(roomId) {
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
  }

  async function handlePlannerSaved() {
    await loadRooms();
    setPlannerRoom(null);
  }

  function renderRooms() {
    return (
      <div className={quoteStyles.roomPlannerSection}>
        <div className={quoteStyles.roomPlannerActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleGenerateLineItems}
            disabled={isGeneratingLines || !rooms.length}
          >
            {isGeneratingLines ? "Generating…" : "Generate line items"}
          </button>
        </div>
        <RoomManager
          quoteId={quoteId}
          rooms={rooms}
          onRoomAdd={handleRoomAdd}
          onRoomUpdate={handleRoomUpdate}
          onRoomDelete={handleRoomDelete}
          onOpenPlanner={setPlannerRoom}
        />
      </div>
    );
  }

  function renderDetails() {
    return (
      <div>
        {/* Quote details card */}
        <div className={tw.card}>
          <div className={tw.cardHeader}>
            <span className={tw.cardTitle}>Quote details</span>
            {form.status && (
              <span className={tw.pill + " bg-[#f5f8f4] text-[#5a5a52] border-[#dbd8cc]"}>
                {form.status.replace(/^./, c => c.toUpperCase())}
              </span>
            )}
          </div>
          <div className={tw.cardBody}>
            <div className={tw.grid2}>
              <label className={tw.fieldLabel}>
                Quote title
                <input className={tw.fieldInput} value={form.title} onChange={e => updateForm("title", e.target.value)} />
              </label>
              <label className={tw.fieldLabel}>
                Status
                <select className={tw.fieldInput} value={form.status} onChange={e => updateForm("status", e.target.value)}>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="viewed">Viewed</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <label className={tw.fieldLabel}>
                Job / order reference
                <input className={tw.fieldInput} value={form.project_name} onChange={e => updateForm("project_name", e.target.value)} />
              </label>
              <label className={tw.fieldLabel}>
                Currency
                <input className={tw.fieldInput} value={form.currency} onChange={e => updateForm("currency", e.target.value)} />
              </label>
            </div>
          </div>
        </div>

        {/* Customer card */}
        <div className={tw.card}>
          <div className={tw.cardHeader}>
            <span className={tw.cardTitle}>Customer</span>
            <button type="button" className={tw.smBtn} onClick={openCustomerModal}>
              + Create new customer
            </button>
          </div>
          <div className={tw.cardBody}>
            <label className={tw.fieldLabel + " mb-3"}>
              Select existing customer
              <select className={tw.fieldInput} value={form.customer_id || ""} onChange={e => applyCustomer(e.target.value)}>
                <option value="">Manual / new customer</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}{customer.email ? ` - ${customer.email}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className={tw.grid2}>
              <label className={tw.fieldLabel}>
                Contact name
                <input className={tw.fieldInput} value={form.customer_name} onChange={e => updateForm("customer_name", e.target.value)} />
              </label>
              <label className={tw.fieldLabel}>
                Contact email
                <input className={tw.fieldInput} type="email" value={form.customer_email} onChange={e => updateForm("customer_email", e.target.value)} />
              </label>
              <label className={tw.fieldLabel}>
                Contact phone
                <input className={tw.fieldInput} value={form.customer_phone} onChange={e => updateForm("customer_phone", e.target.value)} />
              </label>
              <label className={tw.fieldLabel}>
                Site / delivery address
                <input className={tw.fieldInput} value={form.site_address} onChange={e => updateForm("site_address", e.target.value)} />
              </label>
            </div>
            <div className={tw.saveBar}>
              <button type="submit" className={tw.primaryBtn} disabled={isSaving || isLoading}>
                {isSaving ? "Saving..." : "Save information"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function baseCabinetLines() {
    return form.lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => isBaseCabinetLine(line));
  }

  function renderCabinets() {
    const cabinets = baseCabinetLines();

    return (
      <div className={styles.cabinetConfigList}>
        <div className={`${styles.quoteSectionActions} ${quoteStyles.quoteSectionActions}`}>
          <button type="button" className={styles.secondaryButton} onClick={() => setActiveSection("items")}>
            Back to quote items
          </button>
        </div>
        {cabinets.length ? (
          <div className={styles.productsTableWrap}>
            <table className={`${styles.productsTable} ${styles.cabinetConfigTable}`}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cabinet</th>
                  <th>Material</th>
                  <th>Colour</th>
                  <th>Qty</th>
                  <th>Configuration</th>
                  <th>Total ex GST</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cabinets.map(({ line, index }) => {
                  const config = line.cabinet_config;
                  const isConfigured = Boolean(config?.calculated_cut_list?.length);
                  return (
                    <tr key={line.id || index}>
                      <td><span className={`${styles.quoteItemRowNum} ${workflowStyles.quoteItemRowNum}`}>{index + 1}</span></td>
                      <td>
                        <strong>{config?.label || line.product_name || "Base cabinet"}</strong>
                        <small>{line.description || "Configure cabinet dimensions, cut list, pricing and schematic."}</small>
                      </td>
                      <td>{lineValue(line.material)}</td>
                      <td>{lineValue(line.colour)}</td>
                      <td>{line.qty || 1}</td>
                      <td>
                        <span className={`${styles.statusPill} ${isConfigured ? styles.statusPillActive : styles.statusPillDraft}`}>
                          {isConfigured ? "Configured" : "Needs configuration"}
                        </span>
                      </td>
                      <td>{formatMoney(line.line_total_ex_gst || 0, form.currency)}</td>
                      <td className={styles.actionsCol}>
                        <AdminActionDropdown label={`Open actions for ${config?.label || line.product_name || "base cabinet"}`}>
                          <button type="button" className={styles.tableActionMenuItem} onClick={() => setActiveCabinetLineIndex(index)}>
                            Configure
                          </button>
                          <AdminConfirmDeleteAction onConfirm={() => removeLine(index)} />
                        </AdminActionDropdown>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateTitle}>No base cabinets yet</p>
            <p className={styles.emptyStateText}>Add a line item with type Base cabinet first.</p>
          </div>
        )}
      </div>
    );
  }

  function renderItems() {
    const td = 'px-2 py-[7px] border-b border-[#edf4eb] align-top text-[#1a1a18]'
    const v1 = 'text-[12px] font-medium text-[#1a1a18] leading-[1.25] block'
    const v2 = 'text-[11px] text-[#5a5a52] leading-[1.25] block mt-[1px]'
    const v3 = 'text-[10px] text-[#8b8a81] leading-[1.25] block mt-[1px]'
    const naText = 'text-[11px] text-[#c5cdd8] italic block'
    const monoClass = 'font-mono'
    const fl = 'text-[9px] font-semibold uppercase tracking-[0.05em] text-[#8b8a81] block mb-[2px]'
    const fi = 'w-full h-[22px] text-[11px] border border-[#a8c5a0] rounded-[3px] bg-white px-[5px] font-[inherit] block mb-[3px] last:mb-0 focus:outline-none focus:border-[#6b9e61]'
    const fiMono = 'font-mono'

    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] text-[#8b8a81]">
            {form.lines.length} line {form.lines.length === 1 ? 'item' : 'items'}
          </span>
          <button
            type="button"
            className="h-[32px] px-4 bg-[#1c2b1e] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#2d3f2f] transition-colors"
            onClick={addLine}
          >
            + Add line item
          </button>
        </div>

        <div className="bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
          <div className="overflow-x-auto" ref={quoteItemsScrollerRef}>
            <table className="w-full border-collapse" style={{minWidth: '960px', tableLayout: 'fixed'}}>
              <colgroup>
                <col style={{width: '24px'}} />
                <col style={{width: '15%'}} />
                <col style={{width: '14%'}} />
                <col style={{width: '9%'}} />
                <col style={{width: '12%'}} />
                <col style={{width: '10%'}} />
                <col style={{width: '5%'}} />
                <col style={{width: '11%'}} />
                <col style={{width: '12%'}} />
                <col style={{width: '56px'}} />
              </colgroup>
              <thead>
                <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                  {['#', 'Product', 'Spec', 'Size', 'Edge & profile', 'Hinges', 'Qty', 'Cost & markup', 'Price & total', ''].map((h, i) => (
                    <th
                      key={i}
                      className="px-2 py-[7px] text-left text-[9px] font-semibold uppercase tracking-[0.07em] text-[#8b8a81] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.lines.map((savedLine, index) => {
                  const isEditable = editableLineIndex === index
                  const line = isEditable && editableLineDraft ? editableLineDraft : savedLine
                  const {
                    calculated,
                    materialOptions,
                    thicknessOptions,
                    showEdges,
                    showProfiles,
                    edgeOptions,
                    hingesApplicable,
                    colourSrc,
                    isBaseCabinet,
                  } = lineViewModel(line)
                  const isBaseCabinetEditable = isEditable && isBaseCabinet
                  const isLineSaving = savingLineIndex === index
                  const canMoveLines = editableLineIndex === null && savingLineIndex === null && savedLine.id
                  const canResetUnitCost =
                    isEditable &&
                    !isBaseCabinetEditable &&
                    line.unit_cost_mode === 'manual' &&
                    Number(line.calculated_unit_cost_ex_gst || 0) > 0

                  const hintText = isBaseCabinetEditable
                    ? 'Base cabinet — dimensions configured in the Base Cabinets tab'
                    : 'Edge, profile and hinge config open in modals'

                  return (
                    <React.Fragment key={savedLine.id || index}>
                      <tr
                        className={`group transition-colors ${
                          isEditable
                            ? 'bg-[#fafffe] shadow-[inset_3px_0_0_#6b9e61]'
                            : 'hover:bg-[#f5f8f4]'
                        } ${isLineSaving ? 'opacity-60' : ''}`}
                      >

                        {/* # */}
                        <td className={td}>
                          <div className="flex flex-col items-center gap-[1px]">
                            <span className="text-[10px] font-medium text-[#8b8a81] bg-[#f5f8f4] w-[17px] h-[17px] rounded-[3px] flex items-center justify-center flex-shrink-0">
                              {index + 1}
                            </span>
                            {canMoveLines && (
                              <div className="flex flex-col gap-[1px] opacity-0 group-hover:opacity-100 transition-opacity mt-[1px]">
                                <button
                                  type="button"
                                  onClick={() => moveLine(index, -1)}
                                  disabled={index === 0}
                                  className="w-[14px] h-[11px] flex items-center justify-center text-[#c5cdd8] hover:text-[#5a5a52] disabled:opacity-30 text-[9px] leading-none"
                                  aria-label={`Move line ${index + 1} up`}
                                >▲</button>
                                <button
                                  type="button"
                                  onClick={() => moveLine(index, 1)}
                                  disabled={index === form.lines.length - 1}
                                  className="w-[14px] h-[11px] flex items-center justify-center text-[#c5cdd8] hover:text-[#5a5a52] disabled:opacity-30 text-[9px] leading-none"
                                  aria-label={`Move line ${index + 1} down`}
                                >▼</button>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Product & material */}
                        <td className={td}>
                          {isEditable ? (
                            <>
                              <span className={fl}>Type</span>
                              <QuoteTileCombobox
                                placeholder="Select type"
                                value={displayProductType(line.product_type)}
                                options={quoteProductTypes.map(t => ({ label: t.label, name: t.label, value: t.value, meta: 'Product type' }))}
                                onChange={option => updateProductLine(index, { product_type: option.value || option.name || option.label })}
                              />
                              <span className={fl} style={{marginTop: '3px'}}>Material</span>
                              <QuoteTileCombobox
                                placeholder="Select material"
                                value={line.material}
                                options={materialOptions.map(m => ({ label: m, name: m, meta: 'Material' }))}
                                onChange={option => updateProductLine(index, { material: option.name || option.label })}
                              />
                            </>
                          ) : (
                            <>
                              <span className={v1}>{displayProductType(line.product_type) || <span className="text-[#c5cdd8]">—</span>}</span>
                              <span className={v2}>{line.material || <span className="text-[#c5cdd8]">—</span>}</span>
                            </>
                          )}
                        </td>

                        {/* Spec: thickness, finish, colour */}
                        <td className={td}>
                          {isEditable ? (
                            <>
                              <span className={fl}>Thickness</span>
                              <QuoteTileCombobox
                                disabled={!line.material || isBaseCabinetEditable}
                                placeholder={line.material ? 'Thickness' : '—'}
                                value={line.thickness}
                                options={thicknessOptions.map(t => ({ label: t, name: t, meta: 'Thickness' }))}
                                onChange={option => updateProductLine(index, { thickness: option.name || option.label })}
                              />
                              <span className={fl} style={{marginTop: '3px'}}>Finish &amp; colour</span>
                              <QuoteColourCombobox line={line} onChange={patch => updateProductLine(index, patch)} />
                            </>
                          ) : (
                            <>
                              <span className={v1}>{line.thickness || <span className="text-[#c5cdd8]">—</span>}</span>
                              <span className={v2}>{line.finish || <span className="text-[#c5cdd8]">—</span>}</span>
                              <span className={v3}>
                                {colourSrc && (
                                  <img src={colourSrc} alt="" className="w-[10px] h-[10px] rounded-[2px] object-cover border border-[#dbd8cc] inline-block mr-[3px] align-middle" />
                                )}
                                {line.colour || ''}
                              </span>
                            </>
                          )}
                        </td>

                        {/* Size: W × H */}
                        <td className={td}>
                          {isEditable && !isBaseCabinetEditable ? (
                            <>
                              <span className={fl}>Width mm</span>
                              <input
                                type="number"
                                min="1"
                                placeholder="W"
                                value={line.width_mm}
                                onChange={e => updateLine(index, 'width_mm', e.target.value)}
                                className={`${fi} ${fiMono}`}
                              />
                              <span className={fl}>Height mm</span>
                              <input
                                type="number"
                                min="1"
                                placeholder="H"
                                value={line.height_mm}
                                onChange={e => updateLine(index, 'height_mm', e.target.value)}
                                className={`${fi} ${fiMono}`}
                              />
                            </>
                          ) : isBaseCabinetEditable ? (
                            <span className={naText}>Via cabinet tab</span>
                          ) : (
                            <span className="text-[11px] text-[#1a1a18] font-mono block leading-[1.25]">
                              {line.width_mm && line.height_mm
                                ? `${line.width_mm} × ${line.height_mm}`
                                : <span className="text-[#c5cdd8]">—</span>}
                            </span>
                          )}
                        </td>

                        {/* Edge & profile */}
                        <td className={td}>
                          {isEditable && !isBaseCabinetEditable ? (
                            <>
                              <span className={fl}>Edge</span>
                              {showEdges ? (
                                <QuoteImageCombobox
                                  placeholder="Edge profile"
                                  value={line.edge_mould}
                                  options={edgeOptions}
                                  onChange={option => updateLine(index, 'edge_mould', option.name || option.label)}
                                />
                              ) : (
                                <span className={naText}>N/A for material</span>
                              )}
                              <span className={fl} style={{marginTop: '3px'}}>Profile</span>
                              {showProfiles ? (
                                <button
                                  type="button"
                                  onClick={() => openProfileModal(index)}
                                  className="inline-flex items-center gap-[3px] text-[10px] font-medium text-[#2d5e28] border border-[#a8c5a0] rounded-[3px] px-[5px] py-[2px] bg-white hover:bg-[#edf4eb] transition-colors leading-none w-full justify-between"
                                >
                                  <span>{hasProfileConfig(line) ? profileConfigLines(line)[0] : 'Configure profile'}</span>
                                  <span>↗</span>
                                </button>
                              ) : (
                                <span className={naText}>N/A for material</span>
                              )}
                            </>
                          ) : (
                            <>
                              {showEdges ? (
                                <div className="flex items-center justify-between gap-1 mb-[3px]">
                                  <span className="text-[11px] text-[#1a1a18] leading-[1.25]">
                                    {line.edge_mould || <span className="text-[#c5cdd8]">No edge</span>}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => runLineAction(() => editLine(index))}
                                    className="inline-flex items-center gap-[2px] text-[9px] font-medium text-[#8b8a81] hover:text-[#6b9e61] leading-none flex-shrink-0"
                                  >
                                    <i className="ti ti-pencil" style={{fontSize:'9px'}} aria-hidden="true" />
                                  </button>
                                </div>
                              ) : (
                                <span className={naText}>Edge N/A</span>
                              )}
                              {showProfiles ? (
                                <div className="flex items-center justify-between gap-1 mt-[3px]">
                                  <span className="text-[11px] text-[#1a1a18] leading-[1.25]">
                                    {hasProfileConfig(line)
                                      ? profileConfigLines(line).join(' · ')
                                      : <span className="text-[#c5cdd8]">No profile</span>}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openProfileModal(index)}
                                    className="inline-flex items-center gap-[2px] text-[9px] font-medium text-[#8b8a81] hover:text-[#6b9e61] leading-none flex-shrink-0"
                                  >
                                    <i className="ti ti-pencil" style={{fontSize:'9px'}} aria-hidden="true" />
                                  </button>
                                </div>
                              ) : (
                                <span className={naText + ' mt-[3px]'}>Profile N/A</span>
                              )}
                            </>
                          )}
                        </td>

                        {/* Hinges */}
                        <td className={td}>
                          {isEditable && !isBaseCabinetEditable ? (
                            hingesApplicable ? (
                              <button
                                type="button"
                                onClick={() => openHingeModal(index)}
                                className="inline-flex items-center gap-[3px] text-[10px] font-medium text-[#2d5e28] border border-[#a8c5a0] rounded-[3px] px-[5px] py-[2px] bg-white hover:bg-[#edf4eb] transition-colors leading-none w-full justify-between"
                              >
                                <span>{hasHingeConfig(line) ? hingeConfigLines(line).join(' · ') : 'Configure hinges'}</span>
                                <span>↗</span>
                              </button>
                            ) : (
                              <span className={naText}>N/A</span>
                            )
                          ) : hingesApplicable ? (
                            <div className="flex items-start justify-between gap-1">
                              <div>
                                {hasHingeConfig(line) ? (
                                  <>
                                    <div className="flex items-center gap-[4px] mb-[1px]">
                                      <span className={line.hinge_holes ? 'text-[#2d5e28] text-[11px] font-medium leading-none' : 'text-[#c5cdd8] text-[11px] leading-none'}>
                                        {line.hinge_holes ? '✓' : '✕'}
                                      </span>
                                      <span className="text-[10px] text-[#5a5a52]">Drill</span>
                                    </div>
                                    <div className="flex items-center gap-[4px] mb-[2px]">
                                      <span className={line.hinge_supply ? 'text-[#2d5e28] text-[11px] font-medium leading-none' : 'text-[#c5cdd8] text-[11px] leading-none'}>
                                        {line.hinge_supply ? '✓' : '✕'}
                                      </span>
                                      <span className="text-[10px] text-[#5a5a52]">Supply</span>
                                    </div>
                                    {line.hinge_qty && (
                                      <span className="text-[10px] text-[#8b8a81] block">{line.hinge_qty}</span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-[#c5cdd8] text-[11px]">Not set</span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => openHingeModal(index)}
                                className="inline-flex items-center gap-[2px] text-[9px] font-medium text-[#8b8a81] hover:text-[#6b9e61] leading-none flex-shrink-0 mt-[1px]"
                              >
                                <i className="ti ti-pencil" style={{fontSize:'9px'}} aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <span className={naText}>N/A</span>
                          )}
                        </td>

                        {/* Qty */}
                        <td className={td}>
                          {isEditable ? (
                            <>
                              <span className={fl}>Qty</span>
                              <input
                                type="number"
                                min="1"
                                value={line.qty}
                                onChange={e => updateLine(index, 'qty', e.target.value)}
                                className={`${fi} ${fiMono}`}
                              />
                            </>
                          ) : (
                            <span className="text-[12px] font-medium text-[#1a1a18]">{line.qty || 1}</span>
                          )}
                        </td>

                        {/* Cost & markup */}
                        <td className={td}>
                          {isEditable && !isBaseCabinetEditable ? (
                            <>
                              <span className={fl}>Unit cost</span>
                              <div className="flex items-center h-[22px] border border-[#a8c5a0] rounded-[3px] overflow-hidden mb-[3px] bg-white">
                                <span className="px-[4px] h-full flex items-center text-[10px] text-[#8b8a81] bg-[#f5f8f4] border-r border-[#a8c5a0] font-mono flex-shrink-0">$</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  value={line.product_unit_cost_ex_gst}
                                  onChange={e => updateLine(index, 'product_unit_cost_ex_gst', e.target.value)}
                                  className="flex-1 h-full px-[4px] text-[11px] font-mono text-[#1a1a18] focus:outline-none bg-transparent border-none"
                                />
                              </div>
                              {canResetUnitCost && (
                                <button
                                  type="button"
                                  onClick={() => resetLineUnitCost(index)}
                                  className="text-[9px] text-[#6b9e61] hover:underline block mb-[3px]"
                                >
                                  Reset to {formatMoney(line.calculated_unit_cost_ex_gst, form.currency)}
                                </button>
                              )}
                              <span className={fl}>Markup</span>
                              <div className="flex items-center h-[22px] border border-[#a8c5a0] rounded-[3px] overflow-hidden bg-white">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={line.markup_percent}
                                  onChange={e => updateLine(index, 'markup_percent', e.target.value)}
                                  className="flex-1 h-full px-[4px] text-[11px] font-mono text-[#1a1a18] focus:outline-none bg-transparent border-none"
                                />
                                <span className="px-[4px] h-full flex items-center text-[10px] text-[#8b8a81] bg-[#f5f8f4] border-l border-[#a8c5a0] flex-shrink-0">%</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="text-[11px] text-[#1a1a18] font-mono block leading-[1.25]">
                                {formatMoney(line.product_unit_cost_ex_gst || 0, form.currency)}
                              </span>
                              <span className="text-[11px] text-[#5a5a52] font-mono block mt-[1px] leading-[1.25]">
                                {line.markup_percent ?? businessDefaults.markup_percent}%
                              </span>
                            </>
                          )}
                        </td>

                        {/* Price & total */}
                        <td className={td}>
                          {isEditable ? (
                            <>
                              <span className={fl}>Unit price</span>
                              <span className="text-[12px] font-medium font-mono text-[#1a1a18] block mb-[4px]">
                                {formatMoney(calculated.unit_price_ex_gst, form.currency)}
                              </span>
                              <span className={fl}>Line total</span>
                              <span className="text-[14px] font-semibold font-mono text-[#1a1a18] block">
                                {formatMoney(calculated.line_total_ex_gst, form.currency)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-[11px] text-[#1a1a18] font-mono block leading-[1.25]">
                                {formatMoney(calculated.unit_price_ex_gst, form.currency)}
                              </span>
                              <span className="text-[12px] font-semibold text-[#1a1a18] font-mono block mt-[1px] leading-[1.25]">
                                {formatMoney(calculated.line_total_ex_gst, form.currency)}
                              </span>
                            </>
                          )}
                        </td>

                        {/* Actions */}
                        <td className={td}>
                          {isEditable ? (
                            <div className="flex flex-col gap-[3px]">
                              <button
                                type="button"
                                onClick={() => runLineAction(saveLine)}
                                disabled={isLineSaving}
                                className="h-[22px] w-full text-[10px] font-medium rounded-[3px] bg-[#1c2b1e] text-white hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors"
                              >
                                {isLineSaving ? '...' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditableLineIndex(null); setEditableLineDraft(null) }}
                                disabled={isLineSaving}
                                className="h-[22px] w-full text-[10px] font-medium rounded-[3px] border border-[#dbd8cc] bg-white text-[#5a5a52] hover:bg-[#f5f8f4] disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-[2px] opacity-0 group-hover:opacity-100 transition-opacity">
                              <QuoteLineActionDropdown
                                disabled={isLineSaving || savingLineIndex !== null}
                                index={index}
                                isOpen={openLineActionIndex === index}
                                onClose={closeLineActions}
                                onToggle={() => {
                                  setOpenLineActionIndex(current => current === index ? null : index)
                                  setDeleteLineConfirmIndex(null)
                                }}
                              >
                                {deleteLineConfirmIndex === index ? (
                                  <>
                                    <span className={quoteStyles.quoteActionConfirmText}>Delete line?</span>
                                    <button type="button" className={quoteStyles.quoteActionDangerItem} onClick={() => runLineAction(() => removeLine(index))}>
                                      Confirm delete
                                    </button>
                                    <button type="button" className={quoteStyles.quoteActionMenuItem} onClick={() => setDeleteLineConfirmIndex(null)}>
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" className={quoteStyles.quoteActionMenuItem} onClick={() => runLineAction(() => openLineNoteModal(index))}>
                                      {line.client_note ? 'Edit note' : 'Add note'}
                                    </button>
                                    <button type="button" className={quoteStyles.quoteActionMenuItem} onClick={() => runLineAction(() => editLine(index))}>
                                      Edit
                                    </button>
                                    <button type="button" className={quoteStyles.quoteActionMenuItem} onClick={() => runLineAction(() => duplicateLine(index))}>
                                      Duplicate
                                    </button>
                                    <button type="button" className={quoteStyles.quoteActionDangerItem} onClick={() => setDeleteLineConfirmIndex(index)}>
                                      Delete
                                    </button>
                                  </>
                                )}
                              </QuoteLineActionDropdown>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Info bar below editing row */}
                      {isEditable && (
                        <tr>
                          <td
                            colSpan={10}
                            className="px-3 py-[5px] bg-[#edf4eb] border-b border-[#a8c5a0] text-[10px] text-[#2d5e28] border-l-[3px] border-l-[#6b9e61]"
                          >
                            <div className="flex items-center justify-between">
                              <span>{hintText}</span>
                              <span className="text-[#5a5a52]">
                                <kbd className="font-mono bg-white border border-[#dbd8cc] rounded-[2px] px-[3px] text-[9px]">Esc</kbd> to cancel
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Client note row */}
                      {!isEditable && line.client_note && (
                        <tr>
                          <td colSpan={10} className="px-3 py-[4px] bg-[#f5f8f4] border-b border-[#edf4eb] text-[10px] text-[#5a5a52] italic">
                            Note: {line.client_note}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}

                {form.lines.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-10 text-center">
                      <p className="text-[13px] font-medium text-[#1a1a18] mb-1">No line items yet</p>
                      <p className="text-[11px] text-[#8b8a81] mb-3">Add your first line to start building this quote.</p>
                      <button
                        type="button"
                        onClick={addLine}
                        className="h-[32px] px-4 bg-[#1c2b1e] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#2d3f2f] transition-colors"
                      >
                        + Add line item
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  function renderNotes() {
    return (
      <div className={tw.card}>
        <div className={tw.cardHeader}><span className={tw.cardTitle}>Notes and terms</span></div>
        <div className={tw.cardBody}>
          <div className={tw.grid2}>
            <label className={tw.fieldLabel}>
              Client notes (visible on quote)
              <textarea className={tw.textarea} rows={5} value={form.client_notes} onChange={e => updateForm("client_notes", e.target.value)} placeholder="Notes the customer will see on the published quote." />
            </label>
            <label className={tw.fieldLabel}>
              Internal notes (admin only)
              <textarea className={tw.textarea} rows={5} value={form.notes} onChange={e => updateForm("notes", e.target.value)} placeholder="Internal production, sourcing, or risk notes." />
            </label>
            <label className={tw.fieldLabel}>
              Assumptions
              <textarea className={tw.textarea} rows={4} value={form.assumptions} onChange={e => updateForm("assumptions", e.target.value)} placeholder="e.g. standard ceiling height, no obstacles." />
            </label>
            <label className={tw.fieldLabel}>
              Exclusions
              <textarea className={tw.textarea} rows={4} value={form.exclusions} onChange={e => updateForm("exclusions", e.target.value)} placeholder="e.g. installation, handles, plumbing." />
            </label>
            <label className={tw.fieldLabel + " col-span-2"}>
              Terms
              <textarea className={tw.textarea} rows={3} value={form.terms} onChange={e => updateForm("terms", e.target.value)} />
            </label>
          </div>
          <div className={tw.saveBar}>
            <button type="submit" className={tw.primaryBtn} disabled={isSaving || isLoading}>
              {isSaving ? "Saving..." : "Save notes"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderCosts() {
    return (
      <div className="grid grid-cols-2 gap-4">
        {/* Left: input cards */}
        <div className="flex flex-col gap-3">
          <div className={tw.card}>
            <div className={tw.cardHeader}><span className={tw.cardTitle}>Labour</span></div>
            <div className={tw.cardBody}>
              <div className={tw.grid2}>
                <label className={tw.fieldLabel}>
                  Hours
                  <input className={tw.fieldInput + " font-mono"} type="number" step="0.01" value={form.labour_hours} onChange={e => updateForm("labour_hours", e.target.value)} />
                </label>
                <label className={tw.fieldLabel}>
                  Hourly rate ex GST
                  <div className="flex items-center h-[34px] border border-[#dbd8cc] rounded-[6px] overflow-hidden">
                    <span className="px-3 h-full flex items-center text-[13px] text-[#8b8a81] bg-[#f5f8f4] border-r border-[#dbd8cc]">$</span>
                    <input type="number" step="0.01" value={form.worker_hourly_rate} onChange={e => updateForm("worker_hourly_rate", e.target.value)} className="flex-1 h-full px-3 text-[13px] text-[#1a1a18] focus:outline-none bg-white font-mono" />
                  </div>
                </label>
              </div>
            </div>
          </div>
          <div className={tw.card}>
            <div className={tw.cardHeader}><span className={tw.cardTitle}>Logistics</span></div>
            <div className={tw.cardBody}>
              <div className="flex flex-col gap-3">
                {[
                  ["Travel cost ex GST", "travel_cost_ex_gst"],
                  ["Delivery cost ex GST", "delivery_cost_ex_gst"],
                  ["Consumables ex GST", "installation_cost_ex_gst"],
                ].map(([label, field]) => (
                  <label key={field} className={tw.fieldLabel}>
                    {label}
                    <div className="flex items-center h-[34px] border border-[#dbd8cc] rounded-[6px] overflow-hidden">
                      <span className="px-3 h-full flex items-center text-[13px] text-[#8b8a81] bg-[#f5f8f4] border-r border-[#dbd8cc]">$</span>
                      <input type="number" step="0.01" value={form[field]} onChange={e => updateForm(field, e.target.value)} className="flex-1 h-full px-3 text-[13px] text-[#1a1a18] focus:outline-none bg-white font-mono" />
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: live breakdown summary */}
        <div className="bg-[#f5f8f4] border border-[#dbd8cc] rounded-[8px] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8b8a81] mb-3">Live cost breakdown</p>
          {[
            ["Product lines", totals.product_lines_cost_ex_gst],
            [`Hinge drilling (${totals.hinge_drilling_qty || 0})`, totals.hinge_drilling_cost_ex_gst],
            [`Hinge supply (${totals.hinge_supply_qty || 0})`, totals.hinge_supply_cost_ex_gst],
            ["Labour", totals.labour_cost_ex_gst],
            ["Travel", totals.travel_cost_ex_gst],
            ["Delivery", totals.delivery_cost_ex_gst],
            ["Consumables", totals.installation_cost_ex_gst],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center py-[6px] border-b border-[#edf4eb] text-[12px]">
              <span className="text-[#5a5a52]">{label}</span>
              <strong className="text-[#1a1a18] font-mono font-medium">{formatMoney(value, form.currency)}</strong>
            </div>
          ))}
          <div className="flex justify-between items-center py-[6px] text-[13px] font-semibold mt-1">
            <span className="text-[#5a5a52]">Line markups (profit)</span>
            <strong className="text-[#1a1a18] font-mono">{formatMoney(totals.markup_amount_ex_gst, form.currency)}</strong>
          </div>
        </div>
      </div>
    );
  }

  function renderTotals() {
    const groups = [
      {
        label: "Products and hardware",
        desc: "Product lines, per-line markup, drilling, and hinge supply",
        total: totals.material_cost_ex_gst,
        rows: [
          ["Product lines", totals.product_lines_cost_ex_gst],
          ["Line markups", totals.markup_amount_ex_gst],
          [`Hinge drilling (${totals.hinge_drilling_qty || 0})`, totals.hinge_drilling_cost_ex_gst],
          [`Hinge supply (${totals.hinge_supply_qty || 0})`, totals.hinge_supply_cost_ex_gst],
        ],
      },
      {
        label: "Labour",
        desc: "Workshop labour from hours and hourly rate",
        total: totals.labour_cost_ex_gst,
        rows: [
          ["Labour hours", totals.labour_hours || 0],
          ["Hourly rate", formatMoney(totals.worker_hourly_rate, form.currency)],
          ["Labour total", formatMoney(totals.labour_cost_ex_gst, form.currency)],
        ],
      },
      {
        label: "Logistics and consumables",
        desc: "Travel, delivery, and small materials",
        total: (totals.travel_cost_ex_gst || 0) + (totals.delivery_cost_ex_gst || 0) + (totals.installation_cost_ex_gst || 0),
        rows: [
          ["Travel", totals.travel_cost_ex_gst],
          ["Delivery", totals.delivery_cost_ex_gst],
          ["Consumables", totals.installation_cost_ex_gst],
        ],
      },
    ];

    return (
      <div>
        {groups.map(group => (
          <details key={group.label} className="border border-[#dbd8cc] rounded-[8px] mb-3 overflow-hidden" open>
            <summary className="px-4 py-3 flex items-center justify-between cursor-pointer bg-white hover:bg-[#f5f8f4] transition-colors list-none">
              <div>
                <p className="text-[13px] font-semibold text-[#1a1a18]">{group.label}</p>
                <p className={tw.muted}>{group.desc}</p>
              </div>
              <strong className="text-[14px] font-semibold text-[#1a1a18] font-mono flex-shrink-0 ml-4">
                {typeof group.total === "number" ? formatMoney(group.total, form.currency) : group.total}
              </strong>
            </summary>
            <div className="px-4 py-3 bg-[#f5f8f4] border-t border-[#edf4eb]">
              {group.rows.map(([label, value]) => (
                <div key={label} className="flex justify-between items-center py-[5px] border-b border-[#edf4eb] last:border-0 text-[12px]">
                  <span className="text-[#5a5a52]">{label}</span>
                  <strong className="text-[#1a1a18] font-mono font-medium">
                    {typeof value === "number" ? formatMoney(value, form.currency) : value}
                  </strong>
                </div>
              ))}
            </div>
          </details>
        ))}

        {/* Final total card */}
        <div className="bg-[#edf4eb] border border-[#a8c5a0] rounded-[8px] p-4 mt-4">
          {[
            ["Subtotal ex GST", formatMoney(totals.subtotal_ex_gst, form.currency)],
            [`GST (${Math.round((form.gst_rate || 0.1) * 100)}%)`, formatMoney(totals.gst_amount, form.currency)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center py-[5px] border-b border-[#a8c5a0] text-[13px]">
              <span className="text-[#2d5e28]">{label}</span>
              <strong className="text-[#1a1a18] font-mono font-medium">{value}</strong>
            </div>
          ))}
          <div className="flex justify-between items-center pt-3 mt-1">
            <span className="text-[15px] font-semibold text-[#2d5e28]">Total inc GST</span>
            <strong className="text-[20px] font-semibold text-[#1a1a18] font-mono">{formatMoney(totals.total_inc_gst, form.currency)}</strong>
          </div>
        </div>
      </div>
    );
  }

  function renderAttachments() {
    return (
      <div className={tw.card}>
        <div className={tw.cardHeader}>
          <span className={tw.cardTitle}>Files and attachments</span>
          <button type="button" className={tw.smBtn} onClick={generateCabinetDrawingsAttachment} disabled={isGeneratingCabinetPdf || isUploading}>
            {isGeneratingCabinetPdf ? "Generating..." : "Generate cabinet PDF"}
          </button>
        </div>
        <div className={tw.cardBody}>
          {/* Upload area */}
          <div className="flex items-center gap-3 p-3 bg-[#f5f8f4] border border-dashed border-[#dbd8cc] rounded-[6px] mb-4">
            <div className="flex-1 min-w-0">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={e => setSelectedFiles(Array.from(e.target.files || []))}
                className="text-[12px] text-[#5a5a52] w-full"
              />
            </div>
            <button type="button" className={tw.primaryBtn} onClick={uploadAttachments} disabled={isUploading}>
              {isUploading ? "Uploading..." : "Upload"}
            </button>
          </div>

          {/* File list */}
          {form.attachments.length === 0 ? (
            <p className={tw.muted + " text-center py-6"}>No attachments yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[#edf4eb]">
              {attachmentPagination.pageItems.map(attachment => (
                <div key={attachment.id} className="flex items-center gap-3 py-3">
                  <div className="w-[32px] h-[32px] rounded-[6px] bg-[#edf4eb] flex items-center justify-center flex-shrink-0 text-[#6b9e61] text-[11px] font-bold">
                    {(attachment.file_type || "FILE").slice(0, 3).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#1a1a18] truncate">{attachment.file_name}</p>
                    <p className={tw.muted}>
                      {attachment.file_type || "File"} · {formatFileSize(attachment.file_size)} · {attachment.created_at ? new Date(attachment.created_at).toLocaleDateString("en-AU") : "-"}
                    </p>
                  </div>
                  <a href={attachment.file_url} target="_blank" rel="noreferrer" className="text-[12px] font-medium text-[#6b9e61] hover:underline flex-shrink-0">
                    View
                  </a>
                  <button type="button" onClick={() => deleteAttachment(attachment)} disabled={isUploading} className="text-[12px] font-medium text-[#b42318] hover:underline disabled:opacity-50 flex-shrink-0">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
          <AdminPagination
            label="attachments"
            page={attachmentPagination.page}
            pageCount={attachmentPagination.pageCount}
            totalItems={attachmentPagination.totalItems}
            onPageChange={attachmentPagination.setPage}
          />
        </div>
      </div>
    );
  }

  function renderActiveSection() {
    if (activeSection === "items") return renderItems();
    if (activeSection === "cabinets") return renderCabinets();
    if (activeSection === "costs") return renderCosts();
    if (activeSection === "notes") return renderNotes();
    if (activeSection === "totals") return renderTotals();
    if (activeSection === "attachments") return renderAttachments();
    if (activeSection === "rooms") return renderRooms();
    if (activeSection === "elevations") return <ElevationPanel rooms={rooms} quoteId={quoteId} quoteNumber={form.quote_number} />;
    return renderDetails();
  }

  const activeLabel = sections.find((section) => section.key === activeSection)?.label || "Information & Contacts";
  const activeCabinetLine = activeCabinetLineIndex !== null ? form.lines[activeCabinetLineIndex] : null;
  const profileModalTypes = profileModal
    ? profileTypesForSelection(profileModal.material, profileModal.thickness)
    : [];
  const profileModalNames = profileModal
    ? profileNamesForSelection(profileModal.profile_type, profileModal.material, profileModal.thickness)
    : [];
  const profileModalOptions = profileModalNames.map((profile) => ({
    name: profile,
    label: profile,
    meta: profileModal?.profile_type || "Profile",
    src: profileOptionSrc(profileModal?.profile_type, profile),
  }));
  const isFeedbackInModal = Boolean(publishEmail || isCustomerModalOpen || lineNoteModal);

  return (
    <>
      <div className="flex flex-col md:flex-row min-h-full">

        {/* Desktop left sidebar nav */}
        <aside className="hidden md:flex flex-col w-[220px] flex-shrink-0 border-r border-[#edf4eb] bg-white">
          <div className="px-4 py-4 border-b border-[#edf4eb]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8b8a81] mb-[2px]">Quote</p>
            <p className="text-[15px] font-semibold text-[#1a1a18] truncate">{form.quote_number || "Draft quote"}</p>
            <Link href="/admin/quotes" className="text-[12px] text-[#6b9e61] hover:underline mt-[2px] block">← Quotes</Link>
          </div>
          <div className="px-3 py-3 border-b border-[#edf4eb] flex flex-col gap-2">
            {publicUrl ? (
              <a href={publicUrl} target="_blank" rel="noreferrer" className="h-[32px] flex items-center justify-center px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] transition-colors">
                View public quote
              </a>
            ) : null}
            <button type="button" onClick={generateQuotePdf} disabled={isSaving || isLoading || isGeneratingQuotePdf} className="h-[32px] flex items-center justify-center px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors">
              {isGeneratingQuotePdf ? "Generating..." : "Generate PDF"}
            </button>
            <button type="button" onClick={publishQuote} disabled={isSaving || isLoading} className="h-[32px] flex items-center justify-center px-3 bg-[#1c2b1e] rounded-[6px] text-[12px] font-medium text-white hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors">
              Publish quote
            </button>
            <button type="button" onClick={saveQuote} disabled={isSaving || isLoading} className="h-[32px] flex items-center justify-center px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors">
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
          <nav className="p-3 flex flex-col gap-[2px] overflow-y-auto flex-1" aria-label="Quote builder sections">
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

        {/* Mobile: section list or section content */}
        <div className="md:hidden w-full">
          {activeSection === "" ? (
            <div className="flex flex-col">
              <div className="px-4 py-4 bg-white border-b border-[#edf4eb]">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8b8a81] mb-[1px]">Quote</p>
                <p className="text-[15px] font-semibold text-[#1a1a18]">{form.quote_number || "Draft quote"}</p>
                <Link href="/admin/quotes" className="text-[12px] text-[#6b9e61] hover:underline mt-[2px] block">← Quotes</Link>
              </div>
              <div className="px-4 py-3 bg-white border-b border-[#edf4eb] flex flex-wrap gap-2">
                {publicUrl && <a href={publicUrl} target="_blank" rel="noreferrer" className="h-[32px] px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#1a1a18] flex items-center">View public</a>}
                <button type="button" onClick={publishQuote} disabled={isSaving || isLoading} className="h-[32px] px-3 bg-[#1c2b1e] rounded-[6px] text-[12px] font-medium text-white disabled:opacity-50">Publish</button>
                <button type="button" onClick={saveQuote} disabled={isSaving || isLoading} className="h-[32px] px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#1a1a18] disabled:opacity-50">{isSaving ? "Saving..." : "Save"}</button>
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
                <form onSubmit={saveQuote}>
                  {isLoading ? <div className="text-[13px] text-[#8b8a81] py-8 text-center">Loading quote...</div> : renderActiveSection()}
                  {form.order_id ? <div className="mt-3 px-4 py-3 rounded-[6px] bg-[#edf4eb] border border-[#a8c5a0] text-[13px] text-[#2d5e28]">This quote has been approved and converted to an order.</div> : null}
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Desktop right content panel */}
        <main className="hidden md:flex flex-1 flex-col min-w-0 bg-[#f5f8f4]">
          <form onSubmit={saveQuote} className="flex-1 p-6">
            {isLoading ? <div className="text-[13px] text-[#8b8a81] py-8 text-center">Loading quote...</div> : renderActiveSection()}
            {form.order_id ? <div className="mt-3 px-4 py-3 rounded-[6px] bg-[#edf4eb] border border-[#a8c5a0] text-[13px] text-[#2d5e28]">This quote has been approved and converted to an order.</div> : null}
          </form>
        </main>

      </div>

      {feedback && !isFeedbackInModal ? <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-white border border-[#dbd8cc] rounded-[8px] shadow-lg text-[13px] font-medium text-[#1a1a18]" role="status">{feedback}</div> : null}
      {publishEmail && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="publish-quote-email-title">
              <div className={`${styles.customerModal} ${styles.publishQuoteModal}`}>
                <div className={styles.customerModalHeader}>
                  <span className={styles.customerModalIcon}>PCD</span>
                  <div>
                    <p className={styles.tableMeta}>Publish quote</p>
                    <h2 id="publish-quote-email-title">Email customer</h2>
                  </div>
                  <button type="button" className={styles.modalCloseButton} onClick={() => setPublishEmail(null)} disabled={isSaving}>
                    Close
                  </button>
                </div>
                <div className={styles.customerModalBody}>
                  <div className={styles.customerModalGrid}>
                    <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
                      To
                      <input className={styles.fieldInput} value={form.customer_email || ""} disabled />
                    </label>
                    <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
                      Subject
                      <input className={styles.fieldInput} value={publishEmail.subject} onChange={(event) => updatePublishEmail("subject", event.target.value)} />
                    </label>
                    <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
                      Email message
                      <textarea
                        className={`${styles.textareaInput} ${styles.quoteEmailTextarea}`}
                        value={publishEmail.message}
                        onChange={(event) => updatePublishEmail("message", event.target.value)}
                      />
                    </label>
                    <label className={`${styles.checkboxRow} ${styles.fieldWide}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(publishEmail.deposit_required)}
                        onChange={(event) => updatePublishEmail("deposit_required", event.target.checked)}
                      />
                      Require deposit before quote acceptance is completed
                    </label>
                    <label className={styles.fieldLabel}>
                      Deposit %
                      <input
                        className={styles.fieldInput}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={publishEmail.deposit_percent}
                        disabled={!publishEmail.deposit_required}
                        onChange={(event) => updatePublishEmail("deposit_percent", event.target.value)}
                      />
                    </label>
                    <label className={styles.fieldLabel}>
                      Deposit amount
                      <input
                        className={styles.fieldInput}
                        value={formatMoney((Number(form.total_inc_gst || totals.total_inc_gst || 0) * Number(publishEmail.deposit_percent || 0)) / 100, form.currency)}
                        disabled
                      />
                    </label>
                  </div>
                  {!form.customer_email ? <p className={styles.inlineNotice}>Add a customer email before sending this quote.</p> : null}
                  {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
                </div>
                <div className={styles.customerModalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setPublishEmail(null)} disabled={isSaving}>
                    Cancel
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={sendPublishedQuote} disabled={isSaving || !form.customer_email}>
                    {isSaving ? "Sending..." : "Send quote"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {isCustomerModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="create-customer-title">
              <div className={styles.customerModal}>
                <div className={styles.customerModalHeader}>
                  <span className={styles.customerModalIcon}>PCD</span>
                  <div>
                    <p className={styles.tableMeta}>Customer</p>
                    <h2 id="create-customer-title">Create new customer</h2>
                  </div>
                  <button type="button" className={styles.modalCloseButton} onClick={() => setIsCustomerModalOpen(false)} disabled={isSavingCustomer}>
                    Close
                  </button>
                </div>
                <div className={styles.customerModalBody}>
                  <div className={styles.customerModalGrid}>
                    <input className={styles.fieldInput} placeholder="Customer name" value={customerForm.name} onChange={(event) => updateCustomerForm("name", event.target.value)} />
                    <input className={styles.fieldInput} placeholder="Company name" value={customerForm.company_name} onChange={(event) => updateCustomerForm("company_name", event.target.value)} />
                    <input className={styles.fieldInput} placeholder="Email" type="email" value={customerForm.email} onChange={(event) => updateCustomerForm("email", event.target.value)} />
                    <input className={styles.fieldInput} placeholder="Phone" value={customerForm.phone} onChange={(event) => updateCustomerForm("phone", event.target.value)} />
                    <input className={`${styles.fieldInput} ${styles.fieldWide}`} placeholder="Site / delivery address" value={customerForm.site_address} onChange={(event) => updateCustomerForm("site_address", event.target.value)} />
                    <textarea className={`${styles.textareaInput} ${styles.fieldWide}`} placeholder="Notes" value={customerForm.notes} onChange={(event) => updateCustomerForm("notes", event.target.value)} />
                  </div>
                  {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
                </div>
                <div className={styles.customerModalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setIsCustomerModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={saveCustomerFromDetails} disabled={isSavingCustomer || !customerForm.name.trim()}>
                    {isSavingCustomer ? "Saving..." : "Save customer"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {lineNoteModal && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="line-note-title">
              <div className={`${styles.customerModal} ${quoteStyles.lineNoteModal}`}>
                <div className={styles.customerModalHeader}>
                  <span className={styles.customerModalIcon}>NT</span>
                  <div>
                    <p className={styles.tableMeta}>Client note</p>
                    <h2 id="line-note-title">Line {lineNoteModal.lineIndex + 1} note</h2>
                  </div>
                  <button type="button" className={styles.modalCloseButton} onClick={() => setLineNoteModal(null)} disabled={savingLineIndex !== null}>
                    Close
                  </button>
                </div>
                <div className={styles.customerModalBody}>
                  <label className={styles.fieldLabel}>
                    Note shown on public quote
                    <textarea
                      className={styles.textareaInput}
                      rows={6}
                      value={lineNoteModal.client_note}
                      onChange={(event) => updateLineNoteModal(event.target.value)}
                      placeholder="Add a short note for the client about this line item."
                    />
                  </label>
                  {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
                </div>
                <div className={styles.customerModalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setLineNoteModal(null)} disabled={savingLineIndex !== null}>
                    Cancel
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={saveLineNoteModal} disabled={savingLineIndex !== null}>
                    {savingLineIndex === lineNoteModal.lineIndex ? "Saving..." : "Save note"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {profileModal && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="profile-config-title">
              <div className={`${styles.customerModal} ${quoteStyles.profileConfigModal}`}>
                <div className={styles.customerModalHeader}>
                  <span className={styles.customerModalIcon}>PR</span>
                  <div>
                    <p className={styles.tableMeta}>Line item profile</p>
                    <h2 id="profile-config-title">Edit Profile</h2>
                  </div>
                  <button type="button" className={styles.modalCloseButton} onClick={() => setProfileModal(null)}>
                    Close
                  </button>
                </div>
                <div className={styles.customerModalBody}>
                  <div className={quoteStyles.profileConfigForm}>
                    <label className={styles.fieldLabel}>
                      Profile type
                      <select
                        className={styles.fieldInput}
                        value={profileModal.profile_type}
                        onChange={(event) => updateProfileModal("profile_type", event.target.value)}
                      >
                        <option value="">Profile type</option>
                        {profileModalTypes.map((type) => <option key={type}>{type}</option>)}
                      </select>
                    </label>
                    <label className={styles.fieldLabel}>
                      Profile name
                      <QuoteImageCombobox
                        disabled={!profileModal.profile_type}
                        placeholder={profileModal.profile_type ? "Profile name" : "Select profile type first"}
                        value={profileModal.profile}
                        options={profileModalOptions}
                        onChange={(option) => updateProfileModal("profile", option.name || option.label)}
                      />
                    </label>
                  </div>
                </div>
                <div className={styles.customerModalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setProfileModal(null)}>
                    Cancel
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={saveProfileModal}>
                    Save profile
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {hingeModal && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="hinge-config-title">
              <div className={`${styles.customerModal} ${quoteStyles.hingeConfigModal}`}>
                <div className={styles.customerModalHeader}>
                  <span className={styles.customerModalIcon}>HN</span>
                  <div>
                    <p className={styles.tableMeta}>Line item hinges</p>
                    <h2 id="hinge-config-title">Edit Hinges</h2>
                  </div>
                  <button type="button" className={styles.modalCloseButton} onClick={() => setHingeModal(null)}>
                    Close
                  </button>
                </div>
                <div className={styles.customerModalBody}>
                  <div className={quoteStyles.hingeConfigForm}>
                    <label className={quoteStyles.hingeConfigToggle}>
                      <input
                        type="checkbox"
                        checked={hingeModal.hinge_holes}
                        onChange={(event) => updateHingeModal("hinge_holes", event.target.checked)}
                      />
                      <span>
                        <strong>Hinge drilling required</strong>
                        <small>Add hinge hole drilling to this door line.</small>
                      </span>
                    </label>
                    <label className={quoteStyles.hingeConfigToggle}>
                      <input
                        type="checkbox"
                        checked={hingeModal.hinge_supply}
                        onChange={(event) => updateHingeModal("hinge_supply", event.target.checked)}
                      />
                      <span>
                        <strong>Hinge supply required</strong>
                        <small>Add supplied hinges to this door line.</small>
                      </span>
                    </label>
                    <label className={styles.fieldLabel}>
                      Quantity
                      <select
                        className={styles.fieldInput}
                        value={hingeModal.hinge_qty}
                        onChange={(event) => updateHingeModal("hinge_qty", event.target.value)}
                        disabled={!hingeModal.hinge_holes && !hingeModal.hinge_supply}
                      >
                        <option value="">Please select hinge quantity...</option>
                        <option>2 hinges</option>
                        <option>3 hinges</option>
                        <option>4 hinges</option>
                      </select>
                    </label>
                    <p className={styles.tableMeta}>Leave both options unticked when no hinge items are required.</p>
                  </div>
                </div>
                <div className={styles.customerModalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setHingeModal(null)}>
                    Cancel
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={saveHingeModal}>
                    Save hinges
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {plannerRoom && (
        <PlannerOverlay
          room={plannerRoom}
          quoteId={quoteId}
          quoteLineItems={form.lines.filter((l) => l.id)}
          onClose={() => setPlannerRoom(null)}
          onSaved={handlePlannerSaved}
        />
      )}
      {activeCabinetLine && isBaseCabinetLine(activeCabinetLine) && typeof document !== "undefined"
        ? createPortal(
            <div
              className={styles.modalOverlay}
              role="dialog"
              aria-modal="true"
              aria-labelledby="cabinet-configurator-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className={styles.cabinetOverlayModal} onMouseDown={(event) => event.stopPropagation()}>
                <div className={styles.cabinetOverlayBody} onMouseDown={(event) => event.stopPropagation()}>
                  <CabinetConfigurator
                    lineItemId={activeCabinetLine.id}
                    quoteId={form.id || quoteId}
                    quoteLine={activeCabinetLine}
                    existingConfig={{
                      ...(activeCabinetLine.cabinet_config || {}),
                      carcass_material: activeCabinetLine.cabinet_config?.carcass_material || activeCabinetLine.material || "",
                      shelf_material: activeCabinetLine.cabinet_config?.shelf_material || activeCabinetLine.material || "",
                      label: activeCabinetLine.cabinet_config?.label || activeCabinetLine.product_name || `Base cabinet ${activeCabinetLineIndex + 1}`,
                    }}
                    onCancel={() => setActiveCabinetLineIndex(null)}
                    onSave={(cabinetPayload) => saveCabinetLine(activeCabinetLineIndex, cabinetPayload)}
                  />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
