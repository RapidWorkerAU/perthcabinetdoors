"use client";

import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import TermsEditor from "../../_components/TermsEditor";
import { joinTermsHtml, termsHtmlToPlainText } from "../../../../lib/pcd-terms-html";
import { IconCheck, IconCopy, IconEdit, IconExternalLink, IconMessage, IconSettings, IconTrash, IconX } from "@tabler/icons-react";
import { addressColumns, addressFromRecord, addressIsEmpty } from "../../../../lib/pcd-contact-details";
import { edgeImageSrc } from "../../../../lib/pcd-profile-images";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";
import { COLOUR_SUPPLIERS, colourSelectionPatch, optionsFromColourFamily } from "../../../../lib/pcd-colour-library";
import { asSelectionRows, useProfileLibrary } from "../../../../lib/use-profile-library";
import {
  edgesForSupplier,
  fieldsClearedBySupplierChange,
  profileCategoriesForSupplier,
  profilesForSupplier,
  suppliersForMaterial,
  supplierOffersEdges,
  supplierOffersProfiles,
} from "../../../../lib/pcd-supplier-selection";
import { calculateQuoteLine, calculateQuoteTotals, DEFAULT_BUSINESS_DEFAULTS, formatMoney, roundMoney } from "../../../../lib/pcd-quote-utils";
import AddressFields from "../../../../components/admin/AddressFields";
import JobDetailsScopeNote from "../../../../components/admin/JobDetailsScopeNote";
import OverrideModal from "../../_components/OverrideModal";
import LockedRegion from "../../_components/LockedRegion";
import AcceptForCustomerModal from "../../_components/AcceptForCustomerModal";
import { editability } from "../../../../lib/pcd-document-lock";
import CabinetConfigurator from "../../../../components/admin/CabinetConfigurator";
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
import { ConfirmModal, Modal } from '@/components/ui/Modal';
import { ActionMenu, ActionMenuItem } from "@/components/ui/ActionMenu";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import AdminLoading from "@/components/admin/AdminLoading";
import styles from "../../admin-content.module.css";
import quoteStyles from "./quote-editor.module.css";
import workflowStyles from "../../_components/admin-workflow.module.css";

const sections = [
  { key: "details", label: "Information & Contacts" },
  { key: "items", label: "Quote Items" },
  { key: "cabinets", label: "Base Cabinets" },
  { key: "costs", label: "Costs & Markup" },
  { key: "totals", label: "Quote Totals" },
  { key: "notes", label: "Notes" },
  { key: "attachments", label: "Attachments" },
];

const BASE_CABINET_TYPE = "base_cabinet";
const BENCHTOP_TYPE = "Benchtop";
// Hardware has no board behind it and a benchtop is priced from the benchtop
// material list, so neither is expected to carry a colour-library cost. Same
// set the conversion and the reprice route use.
const NON_BOARD_PRODUCT_TYPES = new Set(["Hardware", BENCHTOP_TYPE]);
const colourOptionsCache = new Map();
const quoteProductTypes = [
  ...PRODUCT_TYPES.map((type) => ({ value: type, label: type })),
  ...(PRODUCT_TYPES.includes(BENCHTOP_TYPE) ? [] : [{ value: BENCHTOP_TYPE, label: BENCHTOP_TYPE }]),
  { value: BASE_CABINET_TYPE, label: "Base cabinet" },
];
const ADMIN_DROPDOWN_OPEN_EVENT = "pcd-admin-dropdown-open";

const emptyLine = {
  product_type: "",
  product_name: "",
  material: "",
  thickness: "",
  width_mm: "",
  height_mm: "",
  finish: "",
  colour: "",
  supplier_name: "",
  profile_type: "",
  profile: "",
  edge_mould: "",
  qty: 1,
  hinge_holes: false,
  hinge_qty: "",
  product_unit_cost_ex_gst: "",
  unit_cost_mode: "manual",
  unit_cost_source_id: null,
  unit_cost_source_label: "",
  unit_cost_per_sqm_ex_gst: 0,
  calculated_unit_cost_ex_gst: 0,
  // Blank, not the built-in 40%. Seeding the constant here stamped 40% onto any
  // line built before the business-defaults fetch came back, and the "fill the
  // blanks from defaults" pass then skipped it because 40 is not blank — so the
  // markup on the settings screen never reached the line. Blank means "inherit",
  // and both this component and the server's calculateQuoteLine resolve it.
  markup_percent: "",
  notes: "",
  client_note: "",
};

// A NEW LINE WAITS FOR THE REAL MARKUP RATHER THAN GUESSING AT ONE.
//
// businessDefaults starts as the built-in constants and is replaced when the
// settings come back from the server. A line added in that gap was stamped with
// the built-in 40%, and nothing ever put it right: the effect that fills in
// defaults only touches a BLANK markup, and 40 is not blank. It then looked
// exactly like a rate somebody had chosen. 59 lines across the quotes in the
// database are at 40% while the configured markup is 75%, on quotes that mix
// the two on the same material.
//
// So until the real settings are in, the markup is left blank and filled the
// moment they arrive. calculateQuoteLine reads a blank as "use the default", so
// the figure is right even in that gap.
function emptyLineWithDefaults(defaults, loaded = false) {
  return {
    ...emptyLine,
    markup_percent: loaded && defaults?.markup_percent != null ? defaults.markup_percent : "",
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
  site_street: "",
  site_suburb: "",
  site_postcode: "",
  project_name: "",
  currency: DEFAULT_BUSINESS_DEFAULTS.currency,
  gst_rate: DEFAULT_BUSINESS_DEFAULTS.gst_rate,
  labour_hours: "",
  worker_hourly_rate: DEFAULT_BUSINESS_DEFAULTS.worker_hourly_rate,
  travel_cost_ex_gst: "",
  delivery_cost_ex_gst: "",
  installation_cost_ex_gst: "",
  painting_cost_ex_gst: "",
  glass_cost_ex_gst: "",
  removal_cost_ex_gst: "",
  // Blank means "follow the lines". Only a typed figure pins the edging cost.
  edging_cost_override_ex_gst: "",
  other_cost_ex_gst: 0,
  markup_percent: 0,
  markup_amount_ex_gst: 0,
  deposit_required: false,
  deposit_percent: 0,
  notes: "",
  client_notes: "",
  assumptions: "",
  exclusions: "",
  terms: "",
  // Which library terms have been added to this quote, so the Add terms list
  // can say what is already on it. The wording in `terms` is the truth; this is
  // for that list and nothing else.
  terms_term_ids: [],
  lines: [emptyLineWithDefaults()],
  attachments: [],
};

const emptyCustomerForm = {
  name: "",
  company_name: "",
  email: "",
  phone: "",
  site_address: "",
  site_street: "",
  site_suburb: "",
  site_postcode: "",
  notes: "",
};

// pcd_quotes.worker_hourly_rate is `not null default 0`, so a quote that never
// captured a rate loads as 0 rather than blank — and `0 ?? ""` is 0, so the
// "fill blanks from business defaults" pass below skipped it and the quote
// priced its labour at nothing. Treat a zero rate as blank on load: nobody
// deliberately quotes a $0/hour worker.
function hourlyRateForForm(value) {
  return Number(value) > 0 ? value : "";
}

// A COST OF NOTHING IS AN EMPTY BOX, NOT A ZERO.
//
// The costs are stored as numbers, so clearing one and saving stored 0 and the
// quote came back with "0" typed in the box. Clear it again and it is 0 again:
// the same "it will not let me delete it", one save slower. Nothing is charged
// either way, so the box says nothing.
function costForForm(value) {
  return Number(value) > 0 ? value : "";
}

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
    supplier_name: line.supplier_name || supplierFromSourceLabel(line.unit_cost_source_label) || "",
    profile_type: line.profile_type ?? "",
    hinge_holes: Boolean(line.hinge_holes),
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
    ...addressColumns(addressFromRecord(quote)),
    project_name: quote.project_name || "",
    // The override, not the total. Null means nothing has been typed, so the
    // box shows what the lines work out to and stays editable.
    labour_hours: quote.manual_labour_hours ?? "",
    worker_hourly_rate: hourlyRateForForm(quote.worker_hourly_rate),
    travel_cost_ex_gst: costForForm(quote.travel_cost_ex_gst),
    delivery_cost_ex_gst: costForForm(quote.delivery_cost_ex_gst),
    installation_cost_ex_gst: costForForm(quote.installation_cost_ex_gst),
    painting_cost_ex_gst: costForForm(quote.painting_cost_ex_gst),
    glass_cost_ex_gst: costForForm(quote.glass_cost_ex_gst),
    removal_cost_ex_gst: costForForm(quote.removal_cost_ex_gst),
    // The override, not the total: a real 0 here means "charge nothing for
    // edging" and has to survive, so this one keeps its own rule.
    edging_cost_override_ex_gst: quote.edging_cost_override_ex_gst ?? "",
    other_cost_ex_gst: 0,
    markup_percent: quote.markup_percent ?? 0,
    markup_amount_ex_gst: quote.markup_amount_ex_gst ?? 0,
    deposit_required: Boolean(quote.deposit_required),
    deposit_percent: quote.deposit_percent ?? 0,
    notes: quote.notes || "",
    client_notes: quote.client_notes || "",
    assumptions: quote.assumptions || "",
    exclusions: quote.exclusions || "",
    terms: quote.terms ?? "",
    terms_term_ids: Array.isArray(quote.terms_term_ids) ? quote.terms_term_ids : [],
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
    ...addressColumns(addressFromRecord(quote)),
    project_name: quote.project_name || "",
    // The override, not the total. Null means nothing has been typed, so the
    // box shows what the lines work out to and stays editable.
    labour_hours: quote.manual_labour_hours ?? "",
    worker_hourly_rate: hourlyRateForForm(quote.worker_hourly_rate),
    travel_cost_ex_gst: costForForm(quote.travel_cost_ex_gst),
    delivery_cost_ex_gst: costForForm(quote.delivery_cost_ex_gst),
    installation_cost_ex_gst: costForForm(quote.installation_cost_ex_gst),
    painting_cost_ex_gst: costForForm(quote.painting_cost_ex_gst),
    glass_cost_ex_gst: costForForm(quote.glass_cost_ex_gst),
    removal_cost_ex_gst: costForForm(quote.removal_cost_ex_gst),
    // The override, not the total: a real 0 here means "charge nothing for
    // edging" and has to survive, so this one keeps its own rule.
    edging_cost_override_ex_gst: quote.edging_cost_override_ex_gst ?? "",
    other_cost_ex_gst: 0,
    markup_percent: quote.markup_percent ?? 0,
    markup_amount_ex_gst: quote.markup_amount_ex_gst ?? 0,
    deposit_required: Boolean(quote.deposit_required),
    deposit_percent: quote.deposit_percent ?? 0,
    notes: quote.notes || "",
    client_notes: quote.client_notes || "",
    assumptions: quote.assumptions || "",
    exclusions: quote.exclusions || "",
    terms: quote.terms ?? "",
    terms_term_ids: Array.isArray(quote.terms_term_ids) ? quote.terms_term_ids : [],
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
  return `${line.height_mm || "-"} x ${line.width_mm || "-"}`;
}

function lineValue(value, fallback = "-") {
  return value || fallback;
}

// Width/height/qty are plain type="text" inputs (so partial input like an
// empty box while retyping isn't fought by the browser's number-input
// validation), which means nothing was stopping a pasted value like
// "1,200" from turning into NaN downstream and silently zeroing out the
// line's calculated cost. Restrict to digits only - every one of these is a
// whole-unit mm dimension or a whole cabinet/door count in this business.
function sanitizeIntegerInput(value) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

// Used by the qty +/- steppers so a stray non-numeric value already in the
// field can't produce "NaN" written back into it.
function safeLineQty(value) {
  const num = Math.round(Number(value));
  return Number.isFinite(num) && num > 0 ? num : 1;
}

// Markup should never go negative (that's a below-cost quote line with no
// warning) - strip a typed/pasted minus sign at input time rather than only
// catching it after the fact.
function sanitizeNonNegativeDecimalInput(value) {
  return String(value ?? "").replace(/[^0-9.]/g, "");
}

// Trim/case-insensitive comparison so a product_type coming from anywhere
// other than this editor's own dropdown (e.g. a future design-tool import
// change) can't silently fall through an exact-match check and lose its
// cabinet/hinge UI.
function normalizeProductTypeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isBaseCabinetLine(line) {
  return normalizeProductTypeKey(line?.product_type) === normalizeProductTypeKey(BASE_CABINET_TYPE);
}

function isBenchtopLine(line) {
  return normalizeProductTypeKey(line?.product_type) === normalizeProductTypeKey(BENCHTOP_TYPE);
}

// Turns an unrecognized raw value (e.g. "drawer_front") into a readable
// fallback instead of ever rendering a snake_case/underscored code as-is.
function humanizeUnknownProductType(value) {
  const text = String(value || "").replace(/[_-]+/g, " ").trim();
  if (!text) return "";
  return text.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function displayProductType(value) {
  if (normalizeProductTypeKey(value) === normalizeProductTypeKey(BASE_CABINET_TYPE)) return "Base cabinet";
  const knownMatch = PRODUCT_TYPES.find((type) => normalizeProductTypeKey(type) === normalizeProductTypeKey(value));
  if (knownMatch) return knownMatch;
  return humanizeUnknownProductType(value) || value;
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

// The swatch shown next to a saved line's colour.
//
// `colour_src` is not a column on the quote line and never was, so this always
// returned "" once a quote was reloaded and every swatch disappeared. The image
// belongs to the colour library row, so it is looked up there instead, by the
// same library id the line already stores against its cost. Falls back to
// matching on finish and colour for lines saved before ids were captured.
function colourSrcForLine(line, swatchesById = null, swatchesByName = null) {
  if (line.colour_src) return line.colour_src;
  if (!line.colour || !swatchesById) return "";

  if (line.unit_cost_source_id) {
    const byId = swatchesById.get(line.unit_cost_source_id);
    if (byId) return byId;
  }

  const colour = String(line.colour).trim().toLowerCase();
  const finish = String(line.finish || "").trim().toLowerCase();
  return swatchesByName.get(`${finish}|${colour}`) || swatchesByName.get(`|${colour}`) || "";
}

function hasHingeConfig(line) {
  return Boolean(line?.hinge_holes);
}

function hingeConfigLines(line) {
  if (!hasHingeConfig(line)) return [];
  return [
    `Drilling: ${line.hinge_holes ? "Required" : "Not required"}`,
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

// Where an edge photo lives. Asked of lib/pcd-profile-images.js rather than
// worked out here: the rule has exceptions, and a copy of it that does not
// know them is how the 1mm Bevel Edge showed a broken tile while the square
// edge beside it was fine.
function edgeOptionSrc(label) {
  return edgeImageSrc(label);
}

function profileOptionSrc(profileType, label) {
  return `/images/profiles/${assetSlug(profileType)}/${assetSlug(label)}.jpg`;
}

function optionMetaLabel(option) {
  return [option.finish || option.meta || "", option.thickness || "", option.supplier || ""].filter(Boolean).join(" - ");
}

function supplierFromSourceLabel(label) {
  const text = String(label || "");
  return COLOUR_SUPPLIERS.find((supplier) => text.toLowerCase().includes(supplier.toLowerCase())) || "";
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
  textarea: "min-h-[90px] w-full border border-[#dbd8cc] rounded-[6px] px-3 py-2 text-[13px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] resize-y",
  grid2: "grid grid-cols-1 md:grid-cols-2 gap-3",
  grid3: "grid grid-cols-2 md:grid-cols-3 gap-3",
  wide: "md:col-span-2",
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

const QuoteImageCombobox = memo(function QuoteImageCombobox({ className = "", disabled = false, placeholder, value, displayValue = "", options, onChange, disablePortal = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState({});
  const searchRef = useRef(null);
  const dropdownIdRef = useRef(`quote-combobox-${Math.random().toString(36).slice(2)}`);
  const menuRef = useRef(null);
  const wrapRef = useRef(null);
  const cleanedQuery = query.trim().toLowerCase();
  const selectedOption = options.find((option) => [option.value, option.name, option.label].filter(Boolean).includes(value));
  const visibleOptions =
    cleanedQuery.length >= 3
      ? options.filter((option) =>
          [option.label, option.name, option.finish, option.thickness, option.supplier, option.meta]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(cleanedQuery))
        )
      : options;

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

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
    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener(ADMIN_DROPDOWN_OPEN_EVENT, closeOtherDropdowns);
      document.removeEventListener("mousedown", closeOnOutsidePointer);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !wrapRef.current) return;

    function positionMenu() {
      const rect = wrapRef.current.getBoundingClientRect();
      const viewportPadding = 12;

      if (disablePortal) {
        // Rendered inline (no portal) - position relative to the wrapper via `absolute`.
        // `position: fixed` would be offset by Dialog.Content's CSS transform.
        const gap = 8;
        const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
        const spaceAbove = rect.top - viewportPadding;
        const openAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
        const availableHeight = openAbove ? spaceAbove : spaceBelow;
        const maxHeight = Math.max(160, Math.min(360, availableHeight - 4));
        setMenuStyle({
          bottom: openAbove ? `calc(100% + ${gap}px)` : "auto",
          left: 0,
          maxHeight: `${maxHeight}px`,
          minWidth: "320px",
          position: "absolute",
          top: openAbove ? "auto" : `calc(100% + ${gap}px)`,
          width: "100%",
          zIndex: 9999,
        });
        return;
      }

      const preferredWidth = Math.max(rect.width, 320);
      const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2);
      const left = Math.min(
        Math.max(rect.left, viewportPadding),
        window.innerWidth - width - viewportPadding
      );
      const gap = 8;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(160, Math.min(360, availableHeight - 4));
      setMenuStyle({
        bottom: openAbove ? `${window.innerHeight - rect.top + gap}px` : "auto",
        left: `${left}px`,
        maxHeight: `${maxHeight}px`,
        position: "fixed",
        top: openAbove ? "auto" : `${rect.bottom + gap}px`,
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
  }, [open, disablePortal]);

  function choose(option) {
    onChange(option);
    setOpen(false);
    setQuery("");
  }

  function openMenu() {
    if (disabled) return;
    window.dispatchEvent(new CustomEvent(ADMIN_DROPDOWN_OPEN_EVENT, { detail: dropdownIdRef.current }));
    setOpen(true);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  return (
    <div className={`${styles.quoteColourCombo} ${quoteStyles.quoteColourCombo} ${className}`} ref={wrapRef}>
      <button
        disabled={disabled}
        type="button"
        onClick={() => open ? setOpen(false) : openMenu()}
        className="flex min-w-0 flex-1 items-center gap-2 bg-transparent text-left text-[inherit] text-[#1a1a18] outline-none disabled:cursor-not-allowed disabled:text-[#8b8a81]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedOption?.src ? (
          <img src={selectedOption.src} alt="" className="h-4 w-4 flex-shrink-0 rounded-[3px] border border-[#dbd8cc] object-cover" />
        ) : null}
        <span className={`min-w-0 flex-1 truncate ${value ? "" : "text-[#8b8a81]"}`}>
          {selectedOption?.label ||
            selectedOption?.name ||
            displayValue ||
            (value && !String(value).includes("::") ? value : "") ||
            placeholder}
        </span>
      </button>
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
        ? (() => {
            const menu = (
              <div className={styles.quoteColourMenu} ref={menuRef} style={menuStyle}>
                <div className="border-b border-[#edf4eb] p-2">
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search..."
                    className="h-[32px] w-full rounded-[4px] border border-[#dbd8cc] bg-[#f5f8f4] px-3 text-[13px] text-[#1a1a18] outline-none transition-colors focus:border-[#6b9e61] focus:bg-white"
                  />
                </div>
                {visibleOptions.length ? (
                  visibleOptions.map((option) => (
                    <button
                      className={styles.quoteColourOption}
                      key={`${option.label}-${option.src}`}
                      type="button"
                      onClick={() => choose(option)}
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
              </div>
            );
            return disablePortal ? menu : createPortal(menu, document.body);
          })()
        : null}
    </div>
  );
});

const QuoteTileCombobox = memo(function QuoteTileCombobox({ compact = true, disabled = false, placeholder, value, options, onChange }) {
  const normalizedOptions = options.map((option) => {
    const item = typeof option === "string" ? { label: option, name: option } : option;
    return {
      ...item,
      value: item.value || item.name || item.label || "",
      label: item.label || item.name || item.value || "",
    };
  });
  const selected = normalizedOptions.find((option) =>
    [option.value, option.name, option.label].filter(Boolean).includes(value)
  );

  return (
    <Dropdown
      disabled={disabled}
      placeholder={placeholder}
      options={normalizedOptions.map((option) => ({ value: option.value, label: option.label, group: option.group }))}
      value={selected?.value || ""}
      onChange={(nextValue) => {
        const selectedOption = normalizedOptions.find((option) => option.value === nextValue);
        if (selectedOption) onChange(selectedOption);
      }}
      clearable={false}
      searchable
      autoWidth
      contentZIndex={9999}
      triggerClassName={compact
        ? "!h-[30px] !min-h-0 !rounded-[3px] !px-[6px] !pr-[24px] !text-[10px]"
        : "!h-[44px] !rounded-[6px] !px-3 !pr-[34px] !text-[14px]"
      }
    />
  );
});

const QuoteColourCombobox = memo(function QuoteColourCombobox({ compact = true, disabled = false, line, onChange }) {
  const [databaseOptions, setDatabaseOptions] = useState(null);
  const options = databaseOptions || [];
  const selectedSupplier = String(line.supplier_name || "").trim();
  const filteredOptions = selectedSupplier
    ? options.filter((option) => String(option.supplier || "").toLowerCase() === selectedSupplier.toLowerCase())
    : [];
  const selectedValue = line.colour
    ? [selectedSupplier, line.finish, line.colour, line.thickness].filter(Boolean).join("::")
    : "";
  const displayValue = [line.colour, line.thickness].filter(Boolean).join(" - ");

  useEffect(() => {
    let cancelled = false;

    async function loadDatabaseColours() {
      setDatabaseOptions(null);
      if (!line.material) return;
      const cacheKey = `${line.material}::all`;
      if (colourOptionsCache.has(cacheKey)) {
        setDatabaseOptions(colourOptionsCache.get(cacheKey));
        return;
      }

      try {
        const response = await fetch(`/api/colour-library?material=${encodeURIComponent(line.material)}`, {
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
  }, [line.material]);

  return (
    <QuoteImageCombobox
      disabled={disabled || !line.material || !selectedSupplier}
      placeholder={
        !line.material
          ? "Select material first"
          : !selectedSupplier
            ? "Pick a brand first"
            : "Finish, colour & thickness"
      }
      value={selectedValue}
      displayValue={displayValue}
      options={filteredOptions}
      // Shared with the order-variation editor's copy of this widget, so the
      // two cannot write a line differently. See colourSelectionPatch.
      onChange={(option) => onChange(colourSelectionPatch(option, selectedSupplier))}
    />
  );
});

const QUOTE_COL_KEY = 'pcd-quote-table-col-widths'
const QUOTE_COL_DEFAULTS = [22, 34, 130, 150, 110, 105, 170, 85, 80, 80, 65, 105, 85, 130, 135, 135, 95, 95, 105, 110, 190]
const QUOTE_COL_TOTAL = QUOTE_COL_DEFAULTS.reduce((a, b) => a + b, 0)
const QUOTE_COL_MIN = 36
// Drag handles appear between resizable columns only (indices 2-13); cols 0,1,15 are fixed utility cols
const RESIZE_HANDLE_INDICES = new Set(Array.from({ length: QUOTE_COL_DEFAULTS.length - 3 }, (_, index) => index + 2))

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

function benchtopOptionsFromRows(rows = []) {
  return rows
    .filter((item) => item?.is_active !== false)
    .map((item) => ({
      id: item.id,
      value: item.id,
      name: item.name,
      label: item.name,
      meta: `${formatMoney(item.cost_per_sqm_ex_gst || 0)} / sqm`,
      item,
    }));
}

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
  const [deleteLineConfirmIndex, setDeleteLineConfirmIndex] = useState(null);
  const [deleteAttachmentConfirmId, setDeleteAttachmentConfirmId] = useState(null);
  const [activeCabinetLineIndex, setActiveCabinetLineIndex] = useState(null);
  const [hardwareRows, setHardwareRows] = useState([]);
  // The terms library, for the Add terms list. Adding one COPIES its wording
  // onto the quote; the library is never read again when the quote is printed.
  const [termsLibrary, setTermsLibrary] = useState([]);
  const [addTermsOpen, setAddTermsOpen] = useState(false);
  const [termsToAdd, setTermsToAdd] = useState([]);
  const [benchtopMaterialRows, setBenchtopMaterialRows] = useState([]);
  const [hingeModal, setHingeModal] = useState(null);
  const [profileModal, setProfileModal] = useState(null);
  const [lineNoteModal, setLineNoteModal] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // On mobile, open the section menu first rather than dropping straight into
  // the Information & Contacts (customer) page. Runs once on mount.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setActiveSection("");
    }
  }, []);
  const [isSaving, setIsSaving] = useState(false);
  const [savingLineIndex, setSavingLineIndex] = useState(null);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingCabinetPdf, setIsGeneratingCabinetPdf] = useState(false);
  const [isAttachingQuotePdf, setIsAttachingQuotePdf] = useState(false);
  const [isGeneratingQuotePdf, setIsGeneratingQuotePdf] = useState(false);
  const [isRepricing, setIsRepricing] = useState(false);
  const { toast } = useToast();
  const [publishEmail, setPublishEmail] = useState(null);
  const [businessDefaults, setBusinessDefaults] = useState(DEFAULT_BUSINESS_DEFAULTS);
  // Which calculated field the cursor is in, so it can hold an empty box while
  // somebody is clearing it. See showsTyped.
  const [focusedField, setFocusedField] = useState("");
  // Whether these are the REAL settings or still the built-in constants. Without
  // this the two are indistinguishable, which is how a line came to be stamped
  // with a markup nobody configured.
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [businessDefaultsError, setBusinessDefaultsError] = useState("");

  const colEls = useRef([])
  const [colWidths, setColWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(QUOTE_COL_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length === QUOTE_COL_DEFAULTS.length) return parsed
      }
    } catch {}
    return [...QUOTE_COL_DEFAULTS]
  })

  function startColResize(colIndex, e) {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const startX = e.clientX
    const startWidths = colEls.current.map((el, i) =>
      el ? parseFloat(el.style.width) || QUOTE_COL_DEFAULTS[i] : QUOTE_COL_DEFAULTS[i]
    )
    function onMouseMove(e) {
      const delta = e.clientX - startX
      const left = Math.max(QUOTE_COL_MIN, startWidths[colIndex] + delta)
      const actualDelta = left - startWidths[colIndex]
      const right = Math.max(QUOTE_COL_MIN, startWidths[colIndex + 1] - actualDelta)
      if (colEls.current[colIndex]) colEls.current[colIndex].style.width = `${left}px`
      if (colEls.current[colIndex + 1]) colEls.current[colIndex + 1].style.width = `${right}px`
    }
    function onMouseUp() {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const finalWidths = colEls.current.map((el, i) =>
        el ? parseFloat(el.style.width) || QUOTE_COL_DEFAULTS[i] : QUOTE_COL_DEFAULTS[i]
      )
      setColWidths(finalWidths)
      try { localStorage.setItem(QUOTE_COL_KEY, JSON.stringify(finalWidths)) } catch {}
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const totals = useMemo(
    // form.labour_hours is the OVERRIDE here, not a base to add on top. Blank
    // means follow the lines. See calculateQuoteTotals.
    () => calculateQuoteTotals(form.lines, form.gst_rate, { ...form, manual_labour_hours: form.labour_hours, business_defaults: businessDefaults }),
    [
      form.lines,
      form.gst_rate,
      form.labour_hours,
      form.worker_hourly_rate,
      form.travel_cost_ex_gst,
      form.delivery_cost_ex_gst,
      form.installation_cost_ex_gst,
      form.painting_cost_ex_gst,
      form.glass_cost_ex_gst,
      form.removal_cost_ex_gst,
      form.edging_cost_override_ex_gst,
      businessDefaults,
    ]
  );
  // A CALCULATED FIGURE BELONGS IN ITS FIELD, NOT BESIDE IT.
  //
  // Both of these boxes hold a number worked out from the business defaults
  // until somebody types over it. Before, one of them held a blank with the
  // figure greyed out behind it as a placeholder, and the other held only the
  // part of the number the person had typed, with the automatic part shown in
  // a sentence underneath. Either way the number on screen could not be
  // selected, edited or cleared, so a wrong figure was a dead end on the very
  // screen it should have been corrected from.
  //
  // Now the box shows the figure, typing pins it, and clearing it goes back to
  // following the lines.
  const isOverridden = (value) => String(value ?? "").trim() !== "";
  const labourOverridden = isOverridden(form.labour_hours);
  const edgingOverridden = isOverridden(form.edging_cost_override_ex_gst);

  // WHILE YOU ARE IN THE BOX, THE BOX IS YOURS.
  //
  // These two fields show what the lines work out to until somebody types over
  // it, which is right, and it made them impossible to clear. Backspace over
  // the last character and the field was empty for no time at all: empty means
  // "follow the lines", so the calculated figure was put straight back, on the
  // very next render. You could replace the number by selecting it and typing,
  // because that never passes through empty, but you could not delete it. Which
  // is exactly what it felt like.
  //
  // The calculated figure is what the field shows when nobody is in it. While
  // the cursor is in it, it shows what has been typed, blank included, and
  // leaving it empty goes back to following the lines on the way out.
  const showsTyped = (field, overridden) => overridden || focusedField === field;
  const labourFieldValue = showsTyped("labour_hours", labourOverridden)
    ? form.labour_hours
    : String(totals.calculated_labour_hours ?? 0);
  const edgingFieldValue = showsTyped("edging_cost_override_ex_gst", edgingOverridden)
    ? form.edging_cost_override_ex_gst
    : String(totals.edging_calculated_cost_ex_gst ?? 0);

  const publicUrl =
    typeof window !== "undefined" && form.access_code
      ? `${window.location.origin}/quotes/view?code=${form.access_code}`
      : "";
  const hardwareOptions = useMemo(() => hardwareOptionsFromRows(hardwareRows), [hardwareRows]);
  const benchtopMaterialOptions = useMemo(() => benchtopOptionsFromRows(benchtopMaterialRows), [benchtopMaterialRows]);

  // Swatch images for saved lines, indexed both ways: by the library row id the
  // line stores against its cost, and by finish + colour for lines saved before
  // ids were captured. One flat read, shared by every line, rather than the
  // per-material fetch the colour picker does.
  const [colourSwatches, setColourSwatches] = useState([]);
  // Which brands stock which material. Same source the public quote form
  // reads, so the two screens offer the same brands for the same material.
  const [supplierColourRows, setSupplierColourRows] = useState([]);
  // The profile catalogue. One fetch for the whole editor, not one per line.
  const profileLibrary = useProfileLibrary();
  const profileRows = useMemo(() => asSelectionRows(profileLibrary.profiles), [profileLibrary.profiles]);
  const swatchIndex = useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    colourSwatches.forEach((item) => {
      if (!item.src) return;
      if (item.id) byId.set(item.id, item.src);
      const colour = String(item.colour || "").trim().toLowerCase();
      if (!colour) return;
      const finish = String(item.finish || "").trim().toLowerCase();
      if (!byName.has(`${finish}|${colour}`)) byName.set(`${finish}|${colour}`, item.src);
      if (!byName.has(`|${colour}`)) byName.set(`|${colour}`, item.src);
    });
    return { byId, byName };
  }, [colourSwatches]);

  /**
   * The brands that stock this line's material.
   *
   * Derived from the colour library rather than a list in code, so adding
   * Formica is adding its colours. A brand already on the line is kept in the
   * list even if it is no longer stocked, or an older line would read as
   * having no brand and quietly lose it on the next save.
   */
  function supplierOptionsFor(line) {
    const names = suppliersForMaterial(supplierColourRows, line.material);
    const current = String(line.supplier_name || "").trim();
    const all =
      current && !names.some((name) => name.toLowerCase() === current.toLowerCase())
        ? [...names, current]
        : names;
    return all.map((name) => ({ label: name, name, value: name }));
  }

  function profileTypesFor(line, supplier, useLibrary) {
    return useLibrary
      ? profileCategoriesForSupplier(profileRows, { supplier, thickness: line.thickness })
      : profileTypesForSelection(line.material, line.thickness);
  }

  function lineViewModel(line) {
    const cached = lineViewModelCacheRef.current.get(line);
    if (
      cached?.businessDefaults === businessDefaults &&
      cached?.swatchIndex === swatchIndex &&
      cached?.profileRows === profileRows
    ) {
      return cached.value;
    }

    // WHOSE BOARD IS THIS. A door is one brand's colour on that brand's
    // profile, so the brand on the line decides both lists below. Until the
    // catalogue has actually loaded we leave the old material-wide lists in
    // place rather than narrowing to nothing, because an empty dropdown and a
    // failed read look identical on screen.
    const supplier = String(line.supplier_name || "").trim();
    const useLibrary = profileLibrary.isReady && Boolean(supplier);
    const edgeProfiles = useLibrary
      ? edgesForSupplier(profileRows, { supplier, material: line.material })
      : edgeProfilesForMaterial(line.material);
    // A brand that makes no edges gets no edge field at all, not an empty one.
    const brandDoesEdges = useLibrary ? supplierOffersEdges(profileRows, supplier) : true;
    const brandDoesProfiles = useLibrary ? supplierOffersProfiles(profileRows, supplier) : true;
    const value = {
      calculated: calculateQuoteLine(line, businessDefaults),
      materialOptions: MATERIALS_BY_TYPE[line.product_type] || MATERIAL_OPTIONS,
      showEdges: edgeProfiles.length > 0 && brandDoesEdges,
      showProfiles:
        line.material === "Thermolaminate" &&
        Boolean(line.thickness) &&
        brandDoesProfiles &&
        profileTypesFor(line, supplier, useLibrary).length > 0,
      // Both lists carry the brand that produced them, so the row can say
      // "pick a brand first" instead of showing an empty box.
      supplier,
      useLibrary,
      edgeOptions: edgeProfiles.map((edge) => {
        const name = typeof edge === "string" ? edge : edge.name;
        const image = typeof edge === "string" ? "" : edge.image_url;
        return { name, label: name, meta: "Edge profile", src: image || edgeOptionSrc(name) };
      }),
      isHardware: normalizeProductTypeKey(line.product_type) === normalizeProductTypeKey("Hardware"),
      isBenchtop: isBenchtopLine(line),
      hingesApplicable: normalizeProductTypeKey(line.product_type) === normalizeProductTypeKey("Door"),
      colourSrc: colourSrcForLine(line, swatchIndex.byId, swatchIndex.byName),
      isBaseCabinet: isBaseCabinetLine(line),
    };

    lineViewModelCacheRef.current.set(line, { businessDefaults, swatchIndex, profileRows, value });
    return value;
  }

  async function loadQuote() {
    setIsLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        const message = payload.error || "Could not load quote.";
        setLoadError(message);
        toast({ title: message, variant: "error" });
        return;
      }
      setForm(formFromQuote(payload.quote));
      setEditableLineIndex(null);
      setEditableLineDraft(null);
      setActiveCabinetLineIndex(null);
    } catch (error) {
      const message = error?.message || "Could not load quote.";
      setLoadError(message);
      toast({ title: message, variant: "error" });
    } finally {
      setIsLoading(false);
    }
  }

  // Board lines sitting at no cost. These are the ones a converted quote used
  // to be full of, and the ones Reprice is for, so the count is shown rather
  // than left for someone to spot by scrolling.
  const unpricedLineCount = useMemo(
    () =>
      form.lines.filter(
        (line) =>
          !NON_BOARD_PRODUCT_TYPES.has(line.product_type) &&
          // A cabinet is costed from its cut list, so it reads $0 until someone
          // configures it. The Cabinets tab already says so; counting it here
          // would just be the same warning twice.
          line.product_type !== BASE_CABINET_TYPE &&
          line.colour &&
          Number(line.product_unit_cost_ex_gst || 0) <= 0
      ).length,
    [form.lines]
  );

  /**
   * Look every board line up in the colour library again and apply the price it
   * holds now.
   *
   * A rate used to be stamped on a line once, when somebody clicked a colour,
   * and never revisited. So a quote converted from a request had no rate at all,
   * and putting board prices up left every open draft quoting the old number.
   * The server does the matching (see /api/admin/quotes/[id]/reprice) and leaves
   * deliberate manual overrides alone.
   */
  async function repriceFromLibrary() {
    if (isRepricing) return;
    setIsRepricing(true);
    try {
      // The option list is cached for the life of the page, so a price changed
      // in the library would otherwise still be the old one in the picker even
      // after a reprice.
      colourOptionsCache.clear();

      const response = await fetch(`/api/admin/quotes/${quoteId}/reprice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not reprice this quote.", variant: "error" });
        return;
      }

      await loadQuote();

      const cabinetNote = payload.cabinetCount
        ? ` ${payload.cabinetCount} cabinet${payload.cabinetCount === 1 ? "" : "s"} got a new board rate, so reopen them to recost the cut list.`
        : "";

      if (!payload.changedCount && !payload.cabinetCount && !payload.unmatchedCount) {
        toast({ title: "Every line already matches the colour library." });
      } else if (payload.unmatchedCount) {
        toast({
          title: `${payload.changedCount} line${payload.changedCount === 1 ? "" : "s"} repriced. ${payload.unmatchedCount} could not be matched to a library colour.${cabinetNote}`,
          variant: "error",
        });
      } else {
        toast({ title: `${payload.changedCount} line${payload.changedCount === 1 ? "" : "s"} repriced from the colour library.${cabinetNote}` });
      }
    } catch (error) {
      toast({ title: error?.message || "Could not reprice this quote.", variant: "error" });
    } finally {
      setIsRepricing(false);
    }
  }

  async function loadCustomers() {
    try {
      const response = await fetch("/api/admin/customers", { cache: "no-store" });
      const payload = await response.json();
      if (payload.ok) setCustomers(payload.customers || []);
    } catch (error) {
      toast({ title: error?.message || "Could not load customers.", variant: "error" });
    }
  }

  async function loadColourSwatches() {
    try {
      const availability = await fetch("/api/colour-library?availability=1", { cache: "no-store" })
        .then((result) => result.json())
        .catch(() => null);
      if (availability?.ok) setSupplierColourRows(availability.brandPairs || []);

      const response = await fetch("/api/colour-library?items=1", { cache: "no-store" });
      const payload = await response.json();
      if (payload?.ok) setColourSwatches(payload.items || []);
    } catch {
      // A missing swatch is cosmetic. The colour name still reads, so this is
      // not worth interrupting anyone over.
    }
  }

  useEffect(() => {
    loadQuote();
    loadCustomers();
    loadBusinessDefaults();
    loadColourSwatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  // Filling the form's blank fields from the business defaults used to happen
  // inside loadBusinessDefaults, which raced loadQuote: both fire on mount, and
  // whenever the quote landed second it replaced the form wholesale and threw
  // the freshly-applied defaults away. Doing it here instead means it runs once
  // both the defaults and the quote are in hand, in either order.
  // NOTE ON TERMS. This used to also swap the old hardcoded "valid for 14 days"
  // wording out for the configured terms. It was removed, because it only ever
  // changed the form in the browser: the row kept the old text until somebody
  // pressed Save, while the PDF and the customer's copy read the row. So the
  // screen showed the right terms and the customer got the wrong ones, which is
  // worse than showing the problem. Terms are now written correctly by every
  // creation path, and the rows already carrying the old wording are repaired by
  // supabase/202608171600_pcd_repair_legacy_quote_terms.sql.
  useEffect(() => {
    const isBlank = (value) => value === "" || value === null || value === undefined;
    // A STORED ZERO HOURLY RATE IS NOT A DECISION, it is a column that was never
    // filled in, and normalizeBusinessDefaults already prices it at the
    // configured rate rather than pricing the labour at nothing. The form did
    // not agree: it left the 0 in the box, so the quote charged $85 an hour
    // while the field on screen said $0. Same rule in both places now.
    const isBlankOrZero = (value) => isBlank(value) || Number(value) === 0;

    setForm((current) => ({
      ...current,
      currency: isBlank(current.currency) ? businessDefaults.currency : current.currency,
      gst_rate: isBlank(current.gst_rate) ? businessDefaults.gst_rate : current.gst_rate,
      worker_hourly_rate: isBlankOrZero(current.worker_hourly_rate)
        ? businessDefaults.worker_hourly_rate
        : current.worker_hourly_rate,
      lines: (current.lines || []).map((line) =>
        isBlank(line.markup_percent) ? { ...line, markup_percent: businessDefaults.markup_percent } : line
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessDefaults, form.id]);

  useEffect(() => {
    let cancelled = false;
    async function loadTermsLibrary() {
      try {
        const response = await fetch("/api/admin/quote-terms", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled && payload.ok) setTermsLibrary(payload.terms || []);
      } catch {}
    }
    loadTermsLibrary();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadHardwareRows() {
      try {
        const response = await fetch("/api/admin/hardware", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled && payload.ok) setHardwareRows(payload.hardware || []);
      } catch {}
    }
    loadHardwareRows();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadBenchtopMaterials() {
      try {
        const response = await fetch("/api/admin/benchtop-materials", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled && payload.ok) setBenchtopMaterialRows(payload.materials || []);
      } catch {}
    }
    loadBenchtopMaterials();
    return () => {
      cancelled = true;
    };
  }, []);

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
    function handleKeyDown(e) {
      if (e.key === 'Escape' && editableLineIndex !== null) {
        setEditableLineIndex(null);
        setEditableLineDraft(null);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editableLineIndex]);

  // Business defaults are NOT optional, which is what the old comment here
  // claimed. Markup, the hourly rate and the hinge drilling fee all come from
  // them, so a failed load meant the editor quietly priced the job at the
  // built-in 40% and $85/hr while showing no sign anything was wrong. Say so
  // instead: the numbers on screen are not the configured ones.
  async function loadBusinessDefaults() {
    try {
      const response = await fetch("/api/admin/business-defaults", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setBusinessDefaultsError(payload?.error || "Could not load your business defaults.");
        return;
      }
      setBusinessDefaults({ ...DEFAULT_BUSINESS_DEFAULTS, ...payload.defaults });
      setDefaultsLoaded(true);
      setBusinessDefaultsError("");
    } catch (error) {
      setBusinessDefaultsError(error?.message || "Could not load your business defaults.");
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
      ...addressColumns(
        addressIsEmpty(addressFromRecord(customer)) ? addressFromRecord(current) : addressFromRecord(customer)
      ),
    }));
  }

  function openCustomerModal() {
    setCustomerForm({
      ...emptyCustomerForm,
      name: form.customer_name || "",
      email: form.customer_email || "",
      phone: form.customer_phone || "",
      ...addressColumns(addressFromRecord(form)),
    });
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
      setEditableLineDraft((current) => applyLineFieldPatch(current || form.lines[index] || emptyLineWithDefaults(businessDefaults, defaultsLoaded), field, value));
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
      hinge_qty: line.hinge_qty || "",
    });
  }

  function updateHingeModal(field, value) {
    setHingeModal((current) => {
      if (!current) return current;
      const next = { ...current, [field]: value };
      if (field === "hinge_holes" && !next.hinge_holes) {
        next.hinge_qty = "";
      }
      return next;
    });
  }

  function saveHingeModal() {
    if (!hingeModal) return;
    const hasRequirements = hingeModal.hinge_holes;
    const patch = {
      hinge_holes: Boolean(hingeModal.hinge_holes),
      hinge_qty: hasRequirements ? hingeModal.hinge_qty : "",
    };
    if (hingeModal.lineIndex === editableLineIndex) {
      setEditableLineDraft((current) => ({ ...(current || form.lines[hingeModal.lineIndex] || emptyLineWithDefaults(businessDefaults, defaultsLoaded)), ...patch }));
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
      supplier_name: line.supplier_name || "",
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
      setEditableLineDraft((current) => ({ ...(current || form.lines[profileModal.lineIndex] || emptyLineWithDefaults(businessDefaults, defaultsLoaded)), ...patch }));
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
      notes: line.notes || "",
    });
  }

  function updateLineNoteModal(value) {
    setLineNoteModal((current) => (current ? { ...current, client_note: value } : current));
  }

  function updateLineNoteInternal(value) {
    setLineNoteModal((current) => (current ? { ...current, notes: value } : current));
  }

  async function saveLineNoteModal() {
    if (!lineNoteModal) return;
    const line = form.lines[lineNoteModal.lineIndex];
    if (!line) return;
    const nextLine = { ...line, client_note: lineNoteModal.client_note, notes: lineNoteModal.notes };
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
        next.hinge_qty = "";
        next.product_unit_cost_ex_gst = "";
        next.markup_percent = next.markup_percent ?? businessDefaults.markup_percent;
      }
      if (patch.product_type !== "Door") {
        next.hinge_holes = false;
        next.hinge_qty = "";
      }
      if (patch.product_type !== BASE_CABINET_TYPE) {
        next.cabinet_config = null;
      }
      if (patch.product_type === "Hardware") {
        next.product_name = "";
        next.description = "";
        next.material = "";
        next.supplier_name = "";
        next.thickness = "";
        next.finish = "";
        next.colour = "";
        next.edge_mould = "";
        next.profile_type = "";
        next.profile = "";
        next.width_mm = "";
        next.height_mm = "";
        next.unit_cost_mode = "manual";
        next.unit_cost_source_id = null;
        next.unit_cost_source_label = "";
        next.unit_cost_per_sqm_ex_gst = 0;
        next.calculated_unit_cost_ex_gst = 0;
      }
      if (patch.product_type === BENCHTOP_TYPE) {
        next.product_name = "Benchtop";
        next.description = next.description || "Benchtop";
        next.material = "";
        next.supplier_name = "";
        next.thickness = "";
        next.finish = "";
        next.colour = "";
        next.edge_mould = "";
        next.profile_type = "";
        next.profile = "";
        next.hinge_holes = false;
        next.hinge_qty = "";
        next.unit_cost_mode = "manual";
        next.unit_cost_source_id = null;
        next.unit_cost_source_label = "";
        next.unit_cost_per_sqm_ex_gst = 0;
        next.calculated_unit_cost_ex_gst = 0;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "hardware_catalogue_id")) {
      const item = hardwareRows.find((row) => row.id === patch.hardware_catalogue_id);
      if (item) {
        const label = hardwareOptionLabel(item);
        next.product_type = "Hardware";
        next.product_name = label;
        next.description = item.description || label;
        next.material = "";
        next.supplier_name = "";
        next.thickness = "";
        next.finish = "";
        next.colour = "";
        next.edge_mould = "";
        next.profile_type = "";
        next.profile = "";
        next.width_mm = item.width_mm || item.length_mm || "";
        next.height_mm = item.height_mm || item.projection_mm || "";
        next.product_unit_cost_ex_gst = Number(item.unit_cost_ex_gst || 0);
        next.unit_cost_mode = "manual";
        next.unit_cost_source_id = item.id;
        next.unit_cost_source_label = label;
        next.unit_cost_per_sqm_ex_gst = 0;
        next.calculated_unit_cost_ex_gst = 0;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "benchtop_material_id")) {
      const item = benchtopMaterialRows.find((row) => row.id === patch.benchtop_material_id);
      if (item) {
        const rate = Number(item.cost_per_sqm_ex_gst || 0);
        next.product_type = BENCHTOP_TYPE;
        next.product_name = "Benchtop";
        next.description = next.description || "Benchtop";
        next.material = item.name || "";
        next.supplier_name = "";
        next.thickness = "";
        next.finish = "";
        next.colour = "";
        next.edge_mould = "";
        next.profile_type = "";
        next.profile = "";
        next.hinge_holes = false;
        next.hinge_qty = "";
        next.unit_cost_mode = rate > 0 ? "auto" : "manual";
        next.unit_cost_source_id = item.id;
        next.unit_cost_source_label = item.name || "";
        next.unit_cost_per_sqm_ex_gst = rate;
        return applyCalculatedUnitCost(next, { forceAuto: rate > 0 });
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

    if (Object.prototype.hasOwnProperty.call(patch, "supplier_name")) {
      const patchIncludesColourSelection =
        Object.prototype.hasOwnProperty.call(patch, "finish") ||
        Object.prototype.hasOwnProperty.call(patch, "colour") ||
        Object.prototype.hasOwnProperty.call(patch, "unit_cost_per_sqm_ex_gst");
      const losing = fieldsClearedBySupplierChange(
        { supplier_name: line.supplier_name, colour: line.colour, profile: line.profile, edge_mould: line.edge_mould },
        next.supplier_name,
        { colourRows: supplierColourRows, profileRows }
      );
      if (losing.some((entry) => entry.field === "profile")) {
        next.profile = "";
        next.profile_type = "";
      }
      if (losing.some((entry) => entry.field === "edge_mould")) next.edge_mould = "";
      if (!patchIncludesColourSelection) {
        next.thickness = "";
        next.finish = "";
        next.colour = "";
        next.unit_cost_mode = "manual";
        next.unit_cost_source_id = null;
        next.unit_cost_source_label = "";
        next.unit_cost_per_sqm_ex_gst = 0;
        next.calculated_unit_cost_ex_gst = 0;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "thickness")) {
      const patchIncludesColourSelection =
        Object.prototype.hasOwnProperty.call(patch, "finish") ||
        Object.prototype.hasOwnProperty.call(patch, "colour") ||
        Object.prototype.hasOwnProperty.call(patch, "unit_cost_per_sqm_ex_gst");
      if (!patchIncludesColourSelection) {
        next.finish = "";
        next.colour = "";
        next.unit_cost_mode = "manual";
        next.unit_cost_source_id = null;
        next.unit_cost_source_label = "";
        next.unit_cost_per_sqm_ex_gst = 0;
        next.calculated_unit_cost_ex_gst = 0;
      }
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

    if (Object.prototype.hasOwnProperty.call(patch, "hinge_holes") && !next.hinge_holes) {
      next.hinge_qty = "";
    }

    return applyCalculatedUnitCost(next);
  }

  function updateProductLine(index, patch) {
    if (index === editableLineIndex) {
      setEditableLineDraft((current) => applyProductLinePatch(current || form.lines[index] || emptyLineWithDefaults(businessDefaults, defaultsLoaded), patch));
      return;
    }
    updateSavedLine(index, (line) => applyProductLinePatch(line, patch));
  }

  function resetLineUnitCost(index) {
    const reset = (line) => applyCalculatedUnitCost({ ...line, unit_cost_mode: "auto" }, { forceAuto: true });
    if (index === editableLineIndex) {
      setEditableLineDraft((current) => reset(current || form.lines[index] || emptyLineWithDefaults(businessDefaults, defaultsLoaded)));
      return;
    }
    updateSavedLine(index, reset);
  }

  async function editLine(index) {
    if (editableLineIndex !== null && editableLineIndex !== index) {
      const saved = await saveLineAtIndex(editableLineIndex, editableLineDraft || form.lines[editableLineIndex]);
      if (!saved) return;
    }
    setEditableLineDraft(form.lines[index] || emptyLineWithDefaults(businessDefaults, defaultsLoaded));
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
    const nextLine = emptyLineWithDefaults(businessDefaults, defaultsLoaded);
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
    // Drop design_item_id too - a manually duplicated line is a distinct
    // line the user is deliberately creating, not something a design-tool
    // reimport should manage/replace alongside its original.
    const { id: _id, design_item_id: _designItemId, ...rest } = sourceLine;
    // A duplicated line must get its own cabinet_config row on save, not
    // reuse the source cabinet's - otherwise saving the duplicate's config
    // upserts with the original cabinet's primary key, which already
    // belongs to a different line and fails to save.
    const nextLine = {
      ...rest,
      cabinet_config: rest.cabinet_config
        ? (() => {
            const { id: _configId, ...configRest } = rest.cabinet_config;
            return configRest;
          })()
        : rest.cabinet_config,
    };
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
      try {
        const response = await fetch(`/api/admin/quotes/${quoteId}/lines/${line.id}`, {
          method: "DELETE",
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          toast({ title: payload.error || "Could not delete quote line.", variant: "error" });
          return;
        }
        setForm((current) => mergeQuoteIntoForm(current, payload.quote));
      } catch (error) {
        toast({ title: error?.message || "Could not delete quote line.", variant: "error" });
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
      toast({ title: "Save all quote lines before reordering.", variant: "error" });
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
        toast({ title: payload.error || "Could not reorder quote lines.", variant: "error" });
        return;
      }
      toast({ title: "Line order updated.", variant: "success" });
    } catch (error) {
      setForm((current) => ({ ...current, lines: currentLines }));
      setActiveCabinetLineIndex((current) => {
        if (current === index) return targetIndex;
        if (current === targetIndex) return index;
        return current;
      });
      toast({ title: error?.message || "Could not reorder quote lines.", variant: "error" });
    } finally {
      setSavingLineIndex(null);
    }
  }

  async function saveLineAtIndex(index, nextLine = form.lines[index], { updateDraft = true } = {}) {
    if (loadError) {
      toast({ title: loadError, variant: "error" });
      return false;
    }
    if (!nextLine) return false;
    setSavingLineIndex(index);
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
        toast({ title: payload.error || "Could not save quote line.", variant: "error" });
        return false;
      }

      const savedLine = lineFromQuoteLine(payload.line);
      setForm((current) => {
        const lines = current.lines.map((line, lineIndex) => (lineIndex === index ? savedLine : line));
        return mergeQuoteIntoForm({ ...current, lines }, payload.quote);
      });
      if (updateDraft && index === editableLineIndex) setEditableLineDraft(savedLine);
      toast({ title: "Line saved.", variant: "success" });
      return true;
    } catch (error) {
      toast({ title: error?.message || "Could not save quote line.", variant: "error" });
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
    if (loadError) {
      toast({ title: loadError, variant: "error" });
      return false;
    }
    if (editableLineIndex !== null && (editableLineDraft || nextForm.lines?.[editableLineIndex])) {
      const savedLine = await saveLineAtIndex(editableLineIndex, editableLineDraft || nextForm.lines[editableLineIndex]);
      if (!savedLine) return false;
    }
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // form.labour_hours is the OVERRIDE - persist it as manual_labour_hours,
        // null when blank. The server derives labour_hours from the lines unless
        // this pins it.
        // The three boxes are what was typed. site_address is rebuilt from
        // them on the way out so the one-liner every existing screen and the
        // PDF still read can never disagree with the parts.
        body: JSON.stringify({
          ...nextForm,
          ...addressColumns(addressFromRecord(nextForm)),
          manual_labour_hours: String(nextForm.labour_hours ?? "").trim() === "" ? null : Number(nextForm.labour_hours),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not save quote.", variant: "error" });
        return false;
      }
      setForm((current) => mergeQuoteIntoForm(current, payload.quote));
      toast({ title: "Quote saved.", variant: "success" });
      return true;
    } catch (error) {
      toast({ title: error?.message || "Could not save quote.", variant: "error" });
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
    try {
      const saved = await saveQuote();
      if (!saved) return;
      if (typeof window !== "undefined") {
        window.open(`/api/admin/quotes/${quoteId}/pdf?t=${Date.now()}`, "_blank", "noopener,noreferrer");
      }
      toast({ title: "Quote PDF generated.", variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not generate quote PDF.", variant: "error" });
    } finally {
      setIsGeneratingQuotePdf(false);
    }
  }

  async function publishQuote() {
    setIsSaving(true);
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
        include_price: false,
      });
    } catch (error) {
      toast({ title: error?.message || "Could not prepare quote email.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  function updatePublishEmail(field, value) {
    setPublishEmail((current) => ({ ...(current || {}), [field]: value }));
  }

  async function sendPublishedQuote() {
    if (!publishEmail?.subject?.trim()) {
      toast({ title: "Enter an email subject before sending.", variant: "error" });
      return;
    }
    if (!publishEmail?.message?.trim()) {
      toast({ title: "Enter email content before sending.", variant: "error" });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: publishEmail.subject,
          message: publishEmail.message,
          deposit_required: publishEmail.deposit_required,
          deposit_percent: publishEmail.deposit_percent,
          include_price: publishEmail.include_price,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not publish quote.", variant: "error" });
        return;
      }
      setPublishEmail(null);
      // NOT SENT IS NOT ALWAYS "NOT CONFIGURED". A refused message came back
      // from Resend as a quiet failure and this said the quote had gone. The
      // quote IS published either way, so the link is offered rather than the
      // whole thing reading as a failure.
      toast({
        title: payload.emailSent
          ? "Quote published and sent to customer."
          : payload.emailError
            ? `Quote published, but the email did not go out: ${payload.emailError} Send it again, or use this link: ${payload.viewUrl}`
            : `Quote published. Resend is not configured, so use this link: ${payload.viewUrl}`,
        variant: payload.emailSent ? "success" : "error",
      });
      // The quote still went out, so this is a warning rather than a failure.
      // Said out loud all the same: the customer's copy is not in Attachments
      // and someone has to generate it by hand.
      if (payload.pdfAttached === false) {
        toast({
          title: payload.pdfError || "The quote PDF could not be attached. Generate it from Attachments.",
          variant: "error",
        });
      }
      await loadQuote();
    } catch (error) {
      toast({ title: error?.message || "Could not publish quote.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCustomerFromDetails() {
    if (!customerForm.name.trim()) {
      toast({ title: "Enter a customer name before saving the contact.", variant: "error" });
      return;
    }
    setIsSavingCustomer(true);
    try {
      const response = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...customerForm, ...addressColumns(addressFromRecord(customerForm)) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not save customer.", variant: "error" });
        return;
      }
      setCustomers((current) => [payload.customer, ...current.filter((customer) => customer.id !== payload.customer.id)]);
      setForm((current) => ({
        ...current,
        customer_id: payload.customer.id,
        customer_name: payload.customer.name || "",
        customer_email: payload.customer.email || "",
        customer_phone: payload.customer.phone || "",
        ...addressColumns(addressFromRecord(payload.customer)),
      }));
      setIsCustomerModalOpen(false);
      toast({ title: "Customer saved. Save the quote to keep it attached.", variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not save customer.", variant: "error" });
    } finally {
      setIsSavingCustomer(false);
    }
  }

  async function uploadAttachments() {
    if (!selectedFiles.length) {
      toast({ title: "Choose one or more files first.", variant: "error" });
      return;
    }
    setIsUploading(true);
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
      toast({ title: "Attachments uploaded.", variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not upload attachments.", variant: "error" });
    } finally {
      setIsUploading(false);
    }
  }

  async function deleteAttachment(attachment) {
    setIsUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.storage.from("attachments").remove([attachment.file_path]);
      const { error } = await supabase.from("pcd_quote_attachments").delete().eq("id", attachment.id);
      if (error) throw error;
      await loadQuote();
      toast({ title: "Attachment deleted.", variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not delete attachment.", variant: "error" });
    } finally {
      setIsUploading(false);
      setDeleteAttachmentConfirmId(null);
    }
  }


  // Sending the quote does this on its own. The button is for a quote sent
  // before that existed, or a send where the attachment failed.
  async function generateQuotePdfAttachment() {
    setIsAttachingQuotePdf(true);
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}/quote-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not generate the quote PDF.");
      await loadQuote();
      toast({ title: "Quote PDF generated and attached.", variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not generate the quote PDF.", variant: "error" });
    } finally {
      setIsAttachingQuotePdf(false);
    }
  }

  async function generateCabinetDrawingsAttachment() {
    setIsGeneratingCabinetPdf(true);
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}/cabinet-drawings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not generate cabinet drawings PDF.");
      await loadQuote();
      toast({ title: "Cabinet drawings PDF generated and attached.", variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not generate cabinet drawings PDF.", variant: "error" });
    } finally {
      setIsGeneratingCabinetPdf(false);
    }
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
                <select
                  className={tw.fieldInput}
                  value={form.status}
                  disabled={form.status === "approved" || form.status === "rejected"}
                  onChange={e => updateForm("status", e.target.value)}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="viewed">Viewed</option>
                  {/* Shown only when the quote is already in that state, so the
                      dropdown can display it without being able to select it. */}
                  {form.status === "approved" ? <option value="approved">Approved</option> : null}
                  {form.status === "rejected" ? <option value="rejected">Rejected</option> : null}
                </select>
                <span className="text-[11px] text-[#8b8a81]">
                  {form.status === "approved" || form.status === "rejected"
                    ? "The customer has answered, so this is a record rather than a setting."
                    : "Accepting is not a status. Use Accept for the customer, which raises the order."}
                </span>
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
              <Dropdown
                placeholder="Manual / new customer"
                searchPlaceholder="Search by name or email"
                value={form.customer_id || ""}
                options={customers.map((customer) => ({
                  value: customer.id,
                  // The email is in the label rather than beside it, because the
                  // search matches the label: two customers with the same name
                  // are told apart by it, and it is how people search anyway.
                  label: `${customer.name}${customer.email ? ` - ${customer.email}` : ""}`,
                }))}
                // Clearing goes back to typing the details by hand, which is a
                // real choice here, not an empty state.
                onChange={(value) => applyCustomer(String(value || ""))}
                triggerClassName="!h-[34px] !text-[13px]"
              />
            </label>
            <div className={tw.grid2}>
              <label className={tw.fieldLabel}>
                Contact name
                <input className={tw.fieldInput} value={form.customer_name} onChange={e => updateForm("customer_name", e.target.value)} />
              </label>
              <label className={tw.fieldLabel}>
                Contact email
                <input className={tw.fieldInput} type="email" value={form.customer_email} onChange={e => updateForm("customer_email", e.target.value)} />
                <span className="mt-[3px] text-[11px] leading-[1.45] text-[#8b8a81]">
                  Where this quote is sent. It does not change who the quote belongs to.
                </span>
              </label>
              <label className={tw.fieldLabel}>
                Contact phone
                <input className={tw.fieldInput} value={form.customer_phone} onChange={e => updateForm("customer_phone", e.target.value)} />
              </label>
              <AddressFields
                value={{ street: form.site_street, suburb: form.site_suburb, postcode: form.site_postcode }}
                onChange={(key, value) => updateForm(`site_${key}`, value)}
              />
            </div>
            <JobDetailsScopeNote customerId={form.customer_id} what="quote" />
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
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
              <div className="max-h-[calc(100vh-260px)] overflow-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                      {['#', 'Cabinet', 'Material', 'Colour', 'Qty', 'Configuration', 'Total ex GST', 'Actions'].map(h => (
                        <th key={h} className="sticky top-0 z-10 bg-[#f5f8f4] px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cabinets.map(({ line, index }) => {
                      const config = line.cabinet_config;
                      const isConfigured = Boolean(config?.calculated_cut_list?.length);
                      return (
                        <tr key={line.id || index} className="border-b border-[#edf4eb] hover:bg-[#f5f8f4] transition-colors last:border-b-0">
                          <td className="px-4 py-[11px] text-[#8b8a81] text-[12px] font-medium">{index + 1}</td>
                          <td className="px-4 py-[11px]">
                            <span className="text-[13px] font-medium text-[#1a1a18] block">{config?.label || line.product_name || "Base cabinet"}</span>
                            <span className="text-[11px] text-[#8b8a81] block mt-[1px]">{line.description || "Configure cabinet dimensions, cut list, pricing and schematic."}</span>
                          </td>
                          <td className="px-4 py-[11px] text-[#1a1a18]">{lineValue(line.material)}</td>
                          <td className="px-4 py-[11px] text-[#1a1a18]">{lineValue(line.colour)}</td>
                          <td className="px-4 py-[11px] text-[#1a1a18]">{line.qty || 1}</td>
                          <td className="px-4 py-[11px]">
                            <span className={`inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border ${isConfigured ? 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]' : 'bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]'}`}>
                              {isConfigured ? "Configured" : "Needs configuration"}
                            </span>
                          </td>
                          <td className="px-4 py-[11px] text-[#1a1a18] font-mono">{formatMoney(line.line_total_ex_gst || 0, form.currency)}</td>
                          <td className="px-4 py-[11px]">
                            <ActionMenu label={`Open actions for ${config?.label || line.product_name || "base cabinet"}`}>
                              <ActionMenuItem icon={<IconSettings size={14} />} onClick={() => setActiveCabinetLineIndex(index)}>
                                Configure
                              </ActionMenuItem>
                              <ActionMenuItem icon={<IconTrash size={14} />} variant="danger" onClick={() => setDeleteLineConfirmIndex(index)}>
                                Delete
                              </ActionMenuItem>
                            </ActionMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-2">
              {cabinets.map(({ line, index }) => {
                const config = line.cabinet_config;
                const isConfigured = Boolean(config?.calculated_cut_list?.length);
                return (
                  <div key={line.id || index} className="bg-white border border-[#dbd8cc] rounded-[8px] p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <span className="text-[13px] font-semibold text-[#1a1a18] block">{config?.label || line.product_name || "Base cabinet"}</span>
                        <span className="text-[11px] text-[#8b8a81] block mt-[1px]">{line.description || "Configure cabinet dimensions, cut list, pricing and schematic."}</span>
                      </div>
                      <span className="text-[10px] font-medium text-[#8b8a81] bg-[#f5f8f4] w-[18px] h-[18px] rounded-[3px] flex items-center justify-center flex-shrink-0">{index + 1}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#5a5a52] mb-3">
                      {line.material && <span>{line.material}</span>}
                      {line.colour && <span>{line.colour}</span>}
                      {line.qty && line.qty !== 1 && <span>Qty {line.qty}</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border ${isConfigured ? 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]' : 'bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]'}`}>
                        {isConfigured ? "Configured" : "Needs configuration"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold font-mono text-[#1a1a18]">{formatMoney(line.line_total_ex_gst || 0, form.currency)}</span>
                        <ActionMenu label={`Open actions for ${config?.label || line.product_name || "base cabinet"}`}>
                          <ActionMenuItem icon={<IconSettings size={14} />} onClick={() => setActiveCabinetLineIndex(index)}>
                            Configure
                          </ActionMenuItem>
                          <ActionMenuItem icon={<IconTrash size={14} />} variant="danger" onClick={() => setDeleteLineConfirmIndex(index)}>
                            Delete
                          </ActionMenuItem>
                        </ActionMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
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
    const stickyCellBg = (isEditable) => (isEditable ? '#f3faf6' : '#f7f5ee')
    const stickyHeaderClass = (index) => {
      const base = 'sticky top-0 z-20 bg-[#f5f8f4] border-b border-[#dbd8cc] px-2 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52] whitespace-nowrap select-none'
      if (index === 0) return `${base} left-0 z-40`
      if (index === 1) return `${base} z-40 border-r border-[#c4caba] shadow-[8px_0_14px_rgba(15,22,31,0.08)]`
      if (index === QUOTE_COL_DEFAULTS.length - 1) return `${base} right-0 z-40 border-l border-[#c4caba] shadow-[-8px_0_14px_rgba(15,22,31,0.1)]`
      return `${base} relative overflow-visible`
    }
    const stickyHeaderStyle = (index) => {
      if (index === 1) return { left: colWidths[0] || QUOTE_COL_DEFAULTS[0] }
      return undefined
    }
    const stickyCellClass = (index, isEditable) => {
      if (index === 0) return `${td} sticky left-0 z-20`
      if (index === 1) return `${td} sticky z-20 border-r border-[#cfd5c4] shadow-[8px_0_14px_rgba(15,22,31,0.06)]`
      if (index === QUOTE_COL_DEFAULTS.length - 1) return `${td} sticky right-0 z-20 border-l border-[#cfd5c4] shadow-[-8px_0_14px_rgba(15,22,31,0.1)]`
      return td
    }
    const stickyCellStyle = (index, isEditable) => {
      if (index === 0) return { backgroundColor: stickyCellBg(isEditable) }
      if (index === 1) return { left: colWidths[0] || QUOTE_COL_DEFAULTS[0], backgroundColor: stickyCellBg(isEditable) }
      if (index === QUOTE_COL_DEFAULTS.length - 1) return { backgroundColor: stickyCellBg(isEditable) }
      return undefined
    }
    const v1 = 'text-[12px] font-medium text-[#1a1a18] leading-[1.25] block'
    const v2 = 'text-[11px] text-[#5a5a52] leading-[1.25] block mt-[1px]'
    const v3 = 'text-[10px] text-[#8b8a81] leading-[1.25] block mt-[1px]'
    const naText = 'text-[10px] text-[#c5cdd8] italic block'
    const monoClass = 'font-mono'
    const fl = 'text-[9px] font-semibold uppercase tracking-[0.05em] text-[#8b8a81] block mb-[2px]'
    const fi = 'w-full h-[22px] text-[10px] border border-[#a8c5a0] rounded-[3px] bg-white px-[5px] font-[inherit] block mb-[3px] last:mb-0 focus:outline-none focus:border-[#6b9e61]'
    const fiMono = 'font-mono'

    return (
      <div className="md:flex md:flex-col md:flex-1 md:min-h-0">
        <div className="flex items-center justify-between mb-3 flex-shrink-0 gap-3">
          <span className="text-[12px] text-[#8b8a81]">
            {form.lines.length} line {form.lines.length === 1 ? 'item' : 'items'}
            {unpricedLineCount > 0 ? (
              <span className="ml-2 text-[#991b1b] font-medium">
                {unpricedLineCount} with no board cost
              </span>
            ) : null}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-[32px] px-3 bg-white border border-[#dbd8cc] text-[12px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors"
              onClick={repriceFromLibrary}
              disabled={isRepricing || isLocked}
              title="Look every board line up in the colour library again and apply the current price"
            >
              {isRepricing ? 'Repricing...' : 'Reprice from colour library'}
            </button>
            <button
              type="button"
              className="h-[32px] px-4 bg-[#1c2b1e] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#2d3f2f] transition-colors"
              onClick={addLine}
            >
              + Add line item
            </button>
          </div>
        </div>

        <div className={`hidden md:block bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden ${quoteStyles.quoteItemsTable}`}>
          <div className="max-h-[calc(100vh-260px)] overflow-auto" ref={quoteItemsScrollerRef}>
            <table className="w-full border-collapse" style={{minWidth: `${QUOTE_COL_TOTAL}px`, tableLayout: 'fixed'}}>
              <colgroup>
                {colWidths.map((w, i) => (
                  <col key={i} ref={el => { colEls.current[i] = el }} style={{width: `${w}px`}} />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                  {['', '#', 'Type', 'Item / material', 'Supplier', 'Finish', 'Colour', 'Thickness', 'H mm', 'W mm', 'Qty', 'Unit cost', 'Markup', 'Edge profile', 'Profile type', 'Front profile', 'Hinge drill', 'Hinge qty', 'Unit price', 'Total', 'Actions'].map((h, i) => (
                    <th
                      key={i}
                      className={stickyHeaderClass(i)}
                      style={stickyHeaderStyle(i)}
                    >
                      {h}
                      {RESIZE_HANDLE_INDICES.has(i) && (
                        <div
                          className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize z-10 group/resizer"
                          onMouseDown={e => startColResize(i, e)}
                        >
                          <div className="absolute left-[2px] top-[20%] bottom-[20%] w-[1px] bg-[#8b8a81]/30 group-hover/resizer:bg-[#6b9e61]/70 transition-colors" />
                        </div>
                      )}
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
                    colourSrc,
                    isHardware,
                    isBenchtop,
                    isBaseCabinet,
                    showEdges,
                    showProfiles,
                    edgeOptions,
                    hingesApplicable,
                    supplier,
                    useLibrary,
                  } = lineViewModel(line)
                  const isBaseCabinetEditable = isEditable && isBaseCabinet
                  const isLineSaving = savingLineIndex === index
                  const hasLineNote = Boolean(line.notes || line.client_note)
                  const canMoveLines = editableLineIndex === null && savingLineIndex === null && savedLine.id
                  const libraryProfiles = useLibrary
                    ? profilesForSupplier(profileRows, { supplier, thickness: line.thickness })
                    : []
                  const profileTypeOptions = profileTypesFor(line, supplier, useLibrary)
                  const profileNameOptions = useLibrary
                    ? libraryProfiles
                        .filter((row) => !line.profile_type || row.category === line.profile_type)
                        .map((row) => ({
                          name: row.name,
                          label: row.name,
                          meta: row.category || "Profile",
                          src: row.image_url || profileOptionSrc(row.category, row.name),
                        }))
                    : profileNamesForSelection(line.profile_type, line.material, line.thickness).map((profile) => ({
                        name: profile,
                        label: profile,
                        meta: line.profile_type || "Profile",
                        src: profileOptionSrc(line.profile_type, profile),
                      }))
                  const canResetUnitCost = !isBaseCabinetEditable && line.unit_cost_mode === 'manual' && Number(line.calculated_unit_cost_ex_gst || 0) > 0
                  const hintText = isBaseCabinetEditable
                    ? 'Base cabinet - dimensions configured in the Base Cabinets tab'
                    : 'Edge, profile and hinge config open in modals'
                  void hintText

                  return (
                    <React.Fragment key={savedLine.id || index}>
                      <tr
                        className={`group transition-colors ${
                          isEditable
                            ? 'bg-[#fafffe] shadow-[inset_3px_0_0_#6b9e61]'
                            : 'hover:bg-[#f5f8f4]'
                        } ${isLineSaving ? 'opacity-60' : ''}`}
                      >

                        {/* Arrows */}
                        <td className={stickyCellClass(0, isEditable)} style={stickyCellStyle(0, isEditable)}>
                          {canMoveLines && (
                            <div className="flex flex-col gap-[1px] items-center">
                              <button
                                type="button"
                                onClick={() => moveLine(index, -1)}
                                disabled={index === 0}
                                className="w-[14px] h-[11px] flex items-center justify-center text-[#c5cdd8] hover:text-[#5a5a52] disabled:opacity-30 text-[9px] leading-none"
                                aria-label={`Move line ${index + 1} up`}
                              >^</button>
                              <button
                                type="button"
                                onClick={() => moveLine(index, 1)}
                                disabled={index === form.lines.length - 1}
                                className="w-[14px] h-[11px] flex items-center justify-center text-[#c5cdd8] hover:text-[#5a5a52] disabled:opacity-30 text-[9px] leading-none"
                                aria-label={`Move line ${index + 1} down`}
                              >v</button>
                            </div>
                          )}
                        </td>

                        {/* # + note indicator */}
                        <td className={stickyCellClass(1, isEditable)} style={stickyCellStyle(1, isEditable)}>
                          <div className="flex justify-center">
                            <span className="text-[10px] font-medium text-[#8b8a81] bg-[#f5f8f4] w-[17px] h-[17px] rounded-[3px] flex items-center justify-center flex-shrink-0">
                              {index + 1}
                            </span>
                          </div>
                        </td>

                        {/* Type */}
                        <td className={td}>
                          {isEditable ? (
                            <QuoteTileCombobox
                              placeholder="Select type"
                              value={displayProductType(line.product_type)}
                              options={quoteProductTypes.map(t => ({ label: t.label, name: t.label, value: t.value, meta: 'Product type' }))}
                              onChange={option => updateProductLine(index, { product_type: option.value || option.name || option.label })}
                            />
                          ) : (
                            <span className={v1}>{displayProductType(line.product_type) || <span className="text-[#c5cdd8]">-</span>}</span>
                          )}
                        </td>

                        {/* Material */}
                        <td className={td}>
                          {isEditable && isHardware ? (
                            <QuoteImageCombobox
                              placeholder="Hardware item"
                              value={line.unit_cost_source_id || ""}
                              displayValue={line.product_name || ""}
                              options={hardwareOptions}
                              onChange={option => updateProductLine(index, { hardware_catalogue_id: option.id || option.value })}
                            />
                          ) : isEditable && isBenchtop ? (
                            <QuoteTileCombobox
                              placeholder="Select material"
                              value={line.unit_cost_source_id || line.material}
                              options={benchtopMaterialOptions}
                              onChange={option => updateProductLine(index, { benchtop_material_id: option.id || option.value })}
                            />
                          ) : isEditable ? (
                            <QuoteTileCombobox
                              placeholder="Select material"
                              value={line.material}
                              options={materialOptions.map(m => ({ label: m, name: m, meta: 'Material' }))}
                              onChange={option => updateProductLine(index, { material: option.name || option.label })}
                            />
                          ) : isHardware ? (
                            <span className={v1}>{line.product_name || <span className="text-[#c5cdd8]">-</span>}</span>
                          ) : (
                            <span className={v1}>{line.material || <span className="text-[#c5cdd8]">-</span>}</span>
                          )}
                        </td>

                        {/* Supplier */}
                        <td className={td}>
                          {isHardware || isBenchtop ? (
                            <span className={naText}>N/A</span>
                          ) : isEditable && !isBaseCabinetEditable ? (
                            <QuoteTileCombobox
                              disabled={!line.material}
                              placeholder="Supplier"
                              value={line.supplier_name || ""}
                              options={supplierOptionsFor(line)}
                              onChange={option => updateProductLine(index, { supplier_name: option.value || option.name || option.label })}
                            />
                          ) : (
                            <span className={v1}>{line.supplier_name || supplierFromSourceLabel(line.unit_cost_source_label) || <span className="text-[#c5cdd8]">-</span>}</span>
                          )}
                        </td>

                        {/* Finish */}
                        <td className={td}>
                          <span className={isHardware || isBenchtop ? naText : v2}>{isHardware || isBenchtop ? "N/A" : line.finish || <span className="text-[#c5cdd8]">-</span>}</span>
                        </td>

                        {/* Colour */}
                        <td className={td}>
                          {isHardware || isBenchtop ? (
                            <span className={naText}>N/A</span>
                          ) : isEditable && !isBaseCabinetEditable ? (
                            <QuoteColourCombobox line={line} onChange={patch => updateProductLine(index, patch)} />
                          ) : (
                            <span className={v3}>
                              {colourSrc && (
                                <img src={colourSrc} alt="" className="w-[10px] h-[10px] rounded-[2px] object-cover border border-[#dbd8cc] inline-block mr-[3px] align-middle" />
                              )}
                              {line.colour || <span className="text-[#c5cdd8]">-</span>}
                            </span>
                          )}
                        </td>

                        {/* Thickness */}
                        <td className={td}>
                          <span className={isHardware || isBenchtop ? naText : v1}>{isHardware || isBenchtop ? "N/A" : line.thickness || <span className="text-[#c5cdd8]">-</span>}</span>
                        </td>

                        {/* H mm */}
                        <td className={td}>
                          {isEditable && !isBaseCabinetEditable ? (
                            <div className="flex items-center h-[22px] border border-[#a8c5a0] rounded-[3px] overflow-hidden bg-white focus-within:border-[#6b9e61]">
                              <span className="px-[3px] h-full flex items-center text-[10px] text-[#8b8a81] bg-[#f5f8f4] border-r border-[#a8c5a0] font-mono flex-shrink-0 select-none">H</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="mm"
                                value={line.height_mm}
                                onChange={e => updateLine(index, 'height_mm', sanitizeIntegerInput(e.target.value))}
                                className="flex-1 h-full px-[3px] text-[10px] font-mono text-[#1a1a18] focus:outline-none bg-transparent border-none min-w-0"
                              />
                            </div>
                          ) : isBaseCabinetEditable ? (
                            <span className={naText}>Via cabinet</span>
                          ) : (
                            <span className="text-[11px] text-[#1a1a18] font-mono block leading-[1.25]">
                              {line.height_mm || <span className="text-[#c5cdd8]">-</span>}
                            </span>
                          )}
                        </td>

                        {/* W mm */}
                        <td className={td}>
                          {isEditable && !isBaseCabinetEditable ? (
                            <div className="flex items-center h-[22px] border border-[#a8c5a0] rounded-[3px] overflow-hidden bg-white focus-within:border-[#6b9e61]">
                              <span className="px-[3px] h-full flex items-center text-[10px] text-[#8b8a81] bg-[#f5f8f4] border-r border-[#a8c5a0] font-mono flex-shrink-0 select-none">W</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="mm"
                                value={line.width_mm}
                                onChange={e => updateLine(index, 'width_mm', sanitizeIntegerInput(e.target.value))}
                                className="flex-1 h-full px-[3px] text-[10px] font-mono text-[#1a1a18] focus:outline-none bg-transparent border-none min-w-0"
                              />
                            </div>
                          ) : isBaseCabinetEditable ? (
                            <span className={naText}>Via cabinet</span>
                          ) : (
                            <span className="text-[11px] text-[#1a1a18] font-mono block leading-[1.25]">
                              {line.width_mm || <span className="text-[#c5cdd8]">-</span>}
                            </span>
                          )}
                        </td>

                        {/* Qty */}
                        <td className={td}>
                          {isEditable ? (
                            <div className="flex items-center gap-[3px] h-[22px]">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={line.qty}
                                onChange={e => updateLine(index, 'qty', sanitizeIntegerInput(e.target.value))}
                                className="flex-1 h-full text-[10px] font-mono text-center border border-[#a8c5a0] rounded-[3px] bg-white focus:outline-none focus:border-[#6b9e61] min-w-0"
                              />
                              <div className="flex flex-col gap-[2px] flex-shrink-0 justify-center">
                                <button
                                  type="button"
                                  onClick={() => updateLine(index, 'qty', String(safeLineQty(line.qty) + 1))}
                                  className="p-0 border-0 bg-transparent leading-none text-[8px] text-[#a8c5a0] hover:text-[#2d5e28] cursor-pointer"
                                >^</button>
                                <button
                                  type="button"
                                  onClick={() => updateLine(index, 'qty', String(Math.max(1, safeLineQty(line.qty) - 1)))}
                                  className="p-0 border-0 bg-transparent leading-none text-[8px] text-[#a8c5a0] hover:text-[#2d5e28] cursor-pointer"
                                >v</button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[12px] font-medium text-[#1a1a18]">{line.qty || 1}</span>
                          )}
                        </td>

                        {/* Unit price */}
                        <td className={td}>
                          {isEditable && !isBaseCabinetEditable ? (
                            <div>
                              <div className="flex h-[22px] items-center overflow-hidden rounded-[3px] border border-[#a8c5a0] bg-white focus-within:border-[#6b9e61]">
                                <span className="flex h-full items-center border-r border-[#a8c5a0] bg-[#f5f8f4] px-[5px] text-[10px] text-[#8b8a81]">$</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  value={line.product_unit_cost_ex_gst}
                                  onChange={e => updateLine(index, 'product_unit_cost_ex_gst', e.target.value)}
                                  className="h-full min-w-0 flex-1 border-0 bg-transparent px-[5px] text-[10px] font-mono text-[#1a1a18] focus:outline-none"
                                />
                              </div>
                              {canResetUnitCost && (
                                <button type="button" onClick={() => resetLineUnitCost(index)} className="mt-[3px] block text-[10px] font-medium text-[#2d5e28] hover:underline">
                                  Reset auto
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#1a1a18] font-mono block leading-[1.25]">{formatMoney(line.product_unit_cost_ex_gst || calculated.product_unit_cost_ex_gst || 0, form.currency)}</span>
                          )}
                        </td>

                        {/* Markup */}
                        <td className={td}>
                          {isEditable && !isBaseCabinetEditable ? (
                            <div className="flex h-[22px] items-center overflow-hidden rounded-[3px] border border-[#a8c5a0] bg-white focus-within:border-[#6b9e61]">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={line.markup_percent}
                                onChange={e => updateLine(index, 'markup_percent', sanitizeNonNegativeDecimalInput(e.target.value))}
                                className="h-full min-w-0 flex-1 border-0 bg-transparent px-[5px] text-[10px] font-mono text-[#1a1a18] focus:outline-none"
                              />
                              <span className="flex h-full items-center border-l border-[#a8c5a0] bg-[#f5f8f4] px-[5px] text-[10px] text-[#8b8a81]">%</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#1a1a18] font-mono block leading-[1.25]">{line.markup_percent ?? businessDefaults.markup_percent}%</span>
                          )}
                        </td>

                        {/* Edge profile */}
                        <td className={td}>
                          {isEditable && showEdges && !isBaseCabinetEditable ? (
                            <QuoteImageCombobox
                              className={quoteStyles.profileNameCombo}
                              disabled={!supplier}
                              placeholder={supplier ? "Edge profile" : "Pick a brand first"}
                              value={line.edge_mould}
                              options={edgeOptions}
                              onChange={option => updateProductLine(index, { edge_mould: option.name || option.label })}
                            />
                          ) : (
                            <span className={showEdges && !isBaseCabinet ? v1 : naText}>{showEdges && !isBaseCabinet ? line.edge_mould || <span className="text-[#c5cdd8]">-</span> : "N/A"}</span>
                          )}
                        </td>

                        {/* Profile type */}
                        <td className={td}>
                          {isEditable && showProfiles && !isBaseCabinetEditable ? (
                            <select
                              className="h-[22px] w-full rounded-[3px] border border-[#a8c5a0] bg-white px-[5px] text-[10px] text-[#1a1a18] focus:outline-none focus:border-[#6b9e61]"
                              value={line.profile_type}
                              disabled={!supplier}
                              onChange={e => updateProductLine(index, { profile_type: e.target.value })}
                            >
                              <option value="">{supplier ? "Select type" : "Pick a brand first"}</option>
                              {profileTypeOptions.map((type) => <option key={type}>{type}</option>)}
                            </select>
                          ) : (
                            <span className={showProfiles && !isBaseCabinet ? v1 : naText}>{showProfiles && !isBaseCabinet ? line.profile_type || <span className="text-[#c5cdd8]">-</span> : "N/A"}</span>
                          )}
                        </td>

                        {/* Front profile */}
                        <td className={td}>
                          {isEditable && showProfiles && !isBaseCabinetEditable ? (
                            <QuoteImageCombobox
                              className={quoteStyles.profileNameCombo}
                              disabled={!supplier || !line.profile_type}
                              placeholder={supplier ? (line.profile_type ? "Front profile" : "Pick type first") : "Pick a brand first"}
                              value={line.profile}
                              options={profileNameOptions}
                              onChange={option => updateProductLine(index, { profile: option.name || option.label })}
                            />
                          ) : (
                            <span className={showProfiles && !isBaseCabinet ? v1 : naText}>{showProfiles && !isBaseCabinet ? line.profile || <span className="text-[#c5cdd8]">-</span> : "N/A"}</span>
                          )}
                        </td>

                        {/* Hinge drill */}
                        <td className={td}>
                          {isEditable && hingesApplicable && !isBaseCabinetEditable ? (
                            <label className="inline-flex h-[22px] items-center gap-2 text-[11px] text-[#1a1a18]">
                              <input
                                type="checkbox"
                                checked={Boolean(line.hinge_holes)}
                                onChange={e => updateProductLine(index, { hinge_holes: e.target.checked })}
                              />
                              Drill
                            </label>
                          ) : (
                            <span className={hingesApplicable && !isBaseCabinet ? v1 : naText}>{hingesApplicable && !isBaseCabinet ? (line.hinge_holes ? "Yes" : "No") : "N/A"}</span>
                          )}
                        </td>

                        {/* Hinge qty */}
                        <td className={td}>
                          {isEditable && hingesApplicable && !isBaseCabinetEditable ? (
                            <select
                              className="h-[22px] w-full rounded-[3px] border border-[#a8c5a0] bg-white px-[5px] text-[10px] text-[#1a1a18] focus:outline-none focus:border-[#6b9e61] disabled:bg-[#f5f8f4] disabled:text-[#8b8a81]"
                              value={line.hinge_qty || ""}
                              onChange={e => updateProductLine(index, { hinge_qty: e.target.value })}
                              disabled={!line.hinge_holes}
                            >
                              <option value="">Select</option>
                              <option>2 hinges</option>
                              <option>3 hinges</option>
                              <option>4 hinges</option>
                            </select>
                          ) : (
                            <span className={hingesApplicable && !isBaseCabinet ? v1 : naText}>{hingesApplicable && !isBaseCabinet ? line.hinge_qty || <span className="text-[#c5cdd8]">-</span> : "N/A"}</span>
                          )}
                        </td>

                        {/* Unit price */}
                        <td className={td}>
                          <span className={isEditable ? 'text-[12px] font-medium font-mono text-[#1a1a18] block' : 'text-[11px] text-[#1a1a18] font-mono block leading-[1.25]'}>
                            {formatMoney(calculated.unit_price_ex_gst, form.currency)}
                          </span>
                        </td>

                        {/* Total */}
                        <td className={td}>
                          <span className={isEditable ? 'text-[14px] font-semibold font-mono text-[#1a1a18] block' : 'text-[12px] font-semibold text-[#1a1a18] font-mono block leading-[1.25]'}>
                            {formatMoney(calculated.line_total_ex_gst, form.currency)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className={stickyCellClass(QUOTE_COL_DEFAULTS.length - 1, isEditable)} style={stickyCellStyle(QUOTE_COL_DEFAULTS.length - 1, isEditable)}>
                          {isEditable ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => runLineAction(saveLine)}
                                disabled={isLineSaving}
                                aria-label={`Save quote line ${index + 1}`}
                                title="Save line"
                                className="inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[5px] border border-[#1c2b1e] bg-[#1c2b1e] text-white transition-colors hover:bg-[#2d3f2f] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <IconCheck size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditableLineIndex(null); setEditableLineDraft(null) }}
                                disabled={isLineSaving}
                                aria-label={`Cancel editing quote line ${index + 1}`}
                                title="Cancel"
                                className="inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[5px] border border-[#dbd8cc] bg-white text-[#8b8a81] transition-colors hover:bg-[#f5f8f4] hover:text-[#1a1a18] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <IconX size={13} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => runLineAction(() => editLine(index))}
                                disabled={isLineSaving || savingLineIndex !== null}
                                aria-label={`Edit quote line ${index + 1}`}
                                title="Edit"
                                className="inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[5px] border border-[#dbd8cc] bg-white text-[#8b8a81] transition-colors hover:bg-[#f5f8f4] hover:text-[#1a1a18] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <IconEdit size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => runLineAction(() => openLineNoteModal(index))}
                                disabled={isLineSaving || savingLineIndex !== null}
                                title={hasLineNote ? [
                                  line.client_note && `Client: ${line.client_note}`,
                                  line.notes && `Internal: ${line.notes}`,
                                ].filter(Boolean).join('\n') : 'No notes attached'}
                                aria-label={hasLineNote ? `View notes for quote line ${index + 1}` : `Add notes for quote line ${index + 1}`}
                                className={`inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[5px] border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                  hasLineNote
                                    ? 'border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28] hover:bg-[#dfeedd]'
                                    : 'border-[#dbd8cc] bg-white text-[#8b8a81] hover:bg-[#f5f8f4] hover:text-[#1a1a18]'
                                }`}
                              >
                                <span className="relative inline-flex">
                                  <IconMessage size={13} />
                                  {hasLineNote && (
                                    <span className="absolute -right-[3px] -top-[3px] h-[5px] w-[5px] rounded-full bg-[#2d5e28] ring-1 ring-white" />
                                  )}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => runLineAction(() => duplicateLine(index))}
                                disabled={isLineSaving || savingLineIndex !== null}
                                aria-label={`Duplicate quote line ${index + 1}`}
                                title="Duplicate"
                                className="inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[5px] border border-[#dbd8cc] bg-white text-[#8b8a81] transition-colors hover:bg-[#f5f8f4] hover:text-[#1a1a18] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <IconCopy size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteLineConfirmIndex(index)}
                                disabled={isLineSaving || savingLineIndex !== null}
                                aria-label={`Delete quote line ${index + 1}`}
                                title="Delete"
                                className="inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[5px] border border-[#f0c7c3] bg-white text-[#b42318] transition-colors hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <IconTrash size={13} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {/* Notes no longer render as inline rows - a note icon in
                          the # cell signals a note and opens the note modal. */}
                    </React.Fragment>
                  )
                })}

                {form.lines.length === 0 && (
                  <tr>
                    <td colSpan={21} className="py-10 text-center">
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

        {/* Mobile card list */}
        <div className="md:hidden flex flex-col gap-2">
          {form.lines.length === 0 && (
            <div className="bg-white border border-[#dbd8cc] rounded-[8px] py-10 text-center">
              <p className="text-[13px] font-medium text-[#1a1a18] mb-1">No line items yet</p>
              <p className="text-[11px] text-[#8b8a81] mb-3">Add your first line to start building this quote.</p>
              <button type="button" onClick={addLine} className="h-[32px] px-4 bg-[#1c2b1e] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#2d3f2f] transition-colors">
                + Add line item
              </button>
            </div>
          )}
          {form.lines.map((savedLine, index) => {
            const isLineSaving = savingLineIndex === index
            const line = savedLine
            const { calculated, colourSrc } = lineViewModel(line)
            const hasLineNote = Boolean(line.notes || line.client_note)

            return (
              <div key={savedLine.id || index} className={`bg-white border border-[#dbd8cc] rounded-[8px] p-3 ${isLineSaving ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-medium text-[#8b8a81] bg-[#f5f8f4] w-[18px] h-[18px] rounded-[3px] flex items-center justify-center flex-shrink-0">{index + 1}</span>
                    <span className="text-[13px] font-semibold text-[#1a1a18] truncate">{displayProductType(line.product_type) || <span className="text-[#c5cdd8]">No type</span>}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => runLineAction(() => openLineNoteModal(index))}
                      disabled={isLineSaving || savingLineIndex !== null}
                      title={hasLineNote ? [
                        line.client_note && `Client: ${line.client_note}`,
                        line.notes && `Internal: ${line.notes}`,
                      ].filter(Boolean).join('\n') : 'No notes attached'}
                      aria-label={hasLineNote ? `View notes for quote line ${index + 1}` : `Add notes for quote line ${index + 1}`}
                      className={`inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[5px] border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        hasLineNote
                          ? 'border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28] hover:bg-[#dfeedd]'
                          : 'border-[#dbd8cc] bg-white text-[#8b8a81] hover:bg-[#f5f8f4] hover:text-[#1a1a18]'
                      }`}
                    >
                      <span className="relative inline-flex">
                        <IconMessage size={13} />
                        {hasLineNote && (
                          <span className="absolute -right-[3px] -top-[3px] h-[5px] w-[5px] rounded-full bg-[#2d5e28] ring-1 ring-white" />
                        )}
                      </span>
                    </button>
                    <ActionMenu label={`Open actions for quote line ${index + 1}`} size="xs" disabled={isLineSaving || savingLineIndex !== null}>
                      <ActionMenuItem icon={<IconEdit size={14} />} onClick={() => runLineAction(() => editLine(index))}>
                        Edit
                      </ActionMenuItem>
                      <ActionMenuItem icon={<IconCopy size={14} />} onClick={() => runLineAction(() => duplicateLine(index))}>
                        Duplicate
                      </ActionMenuItem>
                      <ActionMenuItem icon={<IconTrash size={14} />} variant="danger" onClick={() => setDeleteLineConfirmIndex(index)}>
                        Delete
                      </ActionMenuItem>
                    </ActionMenu>
                  </div>
                </div>
                <div className="flex flex-col gap-[4px] text-[12px] text-[#5a5a52]">
                  {(line.material || line.thickness) && <span>{[line.material, line.thickness].filter(Boolean).join(' - ')}</span>}
                  {(line.finish || line.colour) && (
                    <span className="flex items-center gap-1">
                      {colourSrc && <img src={colourSrc} alt="" className="w-[10px] h-[10px] rounded-[2px] object-cover border border-[#dbd8cc] flex-shrink-0" />}
                      {[line.finish, line.colour].filter(Boolean).join(' - ')}
                    </span>
                  )}
                  {(line.width_mm || line.height_mm) && <span className="font-mono text-[11px]">{line.height_mm || '-'} x {line.width_mm || '-'} mm</span>}
                  <div className="flex items-center justify-between mt-1 pt-1 border-t border-[#f5f5f4]">
                    <span>Qty {line.qty || 1} - {formatMoney(calculated.unit_price_ex_gst, form.currency)} ea</span>
                    <span className="font-semibold text-[#1a1a18] font-mono">{formatMoney(calculated.line_total_ex_gst, form.currency)}</span>
                  </div>
                </div>
                {line.client_note && (
                  <p className="mt-2 text-[11px] text-[#5a5a52] italic border-t border-[#edf4eb] pt-2">Note: {line.client_note}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Adding terms APPENDS their wording to what is already in the box, so
  // anything typed by hand survives and the order the terms were added in is
  // the order they read. The ids are noted so the list can say what is already
  // on this quote; the wording itself is what the customer sees.
  function addSelectedTerms() {
    const chosen = termsLibrary.filter((term) => termsToAdd.includes(term.id));
    if (chosen.length) {
      updateForm("terms", joinTermsHtml([form.terms, ...chosen.map((term) => term.body_html)]));
      updateForm("terms_term_ids", [
        ...(form.terms_term_ids || []),
        ...chosen.map((term) => term.id).filter((id) => !(form.terms_term_ids || []).includes(id)),
      ]);
    }
    setAddTermsOpen(false);
    setTermsToAdd([]);
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
            {/* Terms are formatted text now, not a plain box, and they are
                built from the named terms in Business Defaults. The Always ones
                arrive with a new quote; the rest come in through Add terms.
                Everything stays editable once it is in here: what the quote
                stores is its own copy of the wording, not a pointer at the
                library. */}
            <div className={`${tw.fieldLabel} ${tw.wide}`}>
              <div className="flex items-center justify-between gap-3">
                <span>Terms</span>
                <button
                  type="button"
                  onClick={() => { setTermsToAdd([]); setAddTermsOpen(true); }}
                  className="h-[28px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4]"
                >
                  Add terms
                </button>
              </div>
              <TermsEditor
                value={form.terms}
                onChange={html => updateForm("terms", html)}
                placeholder="Terms marked Always in Business Defaults start here. Use Add terms for the rest."
                height={180}
                ariaLabel="Quote terms"
              />
            </div>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: input cards */}
        <div className="flex flex-col gap-3">
          <div className={tw.card}>
            <div className={tw.cardHeader}><span className={tw.cardTitle}>Labour</span></div>
            <div className={tw.cardBody}>
              <div className={tw.grid2}>
                <label className={tw.fieldLabel}>
                  <span className="flex items-center justify-between gap-2">
                    Labour hours
                    {labourOverridden && (
                      <button
                        type="button"
                        onClick={() => updateForm("labour_hours", "")}
                        className="text-[10px] font-medium text-[#6b9e61] hover:underline"
                      >
                        Reset to calculated
                      </button>
                    )}
                  </span>
                  {/* The box holds the WHOLE figure, not a base that something
                      invisible gets added to. Until somebody types, it shows
                      what the lines work out to; typing pins it, and Reset puts
                      it back. A number you can see but not change is a dead end
                      on the one screen it can be corrected from. */}
                  <input
                    className={tw.fieldInput + " font-mono"}
                    type="number"
                    min="0"
                    step="0.01"
                    value={labourFieldValue}
                    onFocus={() => setFocusedField("labour_hours")}
                    onBlur={() => setFocusedField("")}
                    onChange={e => updateForm("labour_hours", e.target.value)}
                  />
                </label>
                <label className={tw.fieldLabel}>
                  Hourly rate ex GST
                  <div className="flex items-center h-[34px] border border-[#dbd8cc] rounded-[6px] overflow-hidden">
                    <span className="px-3 h-full flex items-center text-[13px] text-[#8b8a81] bg-[#f5f8f4] border-r border-[#dbd8cc]">$</span>
                    <input type="number" min="0" step="0.01" value={form.worker_hourly_rate} onChange={e => updateForm("worker_hourly_rate", e.target.value)} className="flex-1 h-full px-3 text-[13px] text-[#1a1a18] focus:outline-none bg-white font-mono" />
                  </div>
                </label>
              </div>
              {(totals.cabinet_labour_hours > 0 || totals.processing_labour_hours > 0) && (
                <p className="text-[11px] text-[#8b8a81] mt-2 leading-snug">
                  {/* Two separate defaults land here, so the hint names both
                      rather than showing one lump nobody can check: hours per
                      cabinet, and in-house processing time per decorative board
                      door, drawer front or panel. */}
                  The lines work out to <strong className="font-mono">{totals.calculated_labour_hours}h</strong>:
                  {totals.cabinet_labour_hours > 0 && (
                    <> <span className="font-mono">{totals.cabinet_labour_hours}h</span> from cabinets</>
                  )}
                  {totals.cabinet_labour_hours > 0 && totals.processing_labour_hours > 0 ? "," : null}
                  {totals.processing_labour_hours > 0 && (
                    <> <span className="font-mono">{totals.processing_labour_hours}h</span> processing decorative board fronts and panels</>
                  )}
                  {labourOverridden
                    ? <>. You have set it to <strong className="font-mono">{totals.labour_hours}h</strong> instead.</>
                    : <>. Change the box above to charge something else.</>}
                </p>
              )}
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
                  ["Painting cost ex GST", "painting_cost_ex_gst"],
                  ["Glass cost ex GST", "glass_cost_ex_gst"],
                  ["Door removal / disposal ex GST", "removal_cost_ex_gst"],
                ].map(([label, field]) => (
                  <label key={field} className={tw.fieldLabel}>
                    {label}
                    <div className="flex items-center h-[34px] border border-[#dbd8cc] rounded-[6px] overflow-hidden">
                      <span className="px-3 h-full flex items-center text-[13px] text-[#8b8a81] bg-[#f5f8f4] border-r border-[#dbd8cc]">$</span>
                      <input type="number" min="0" step="0.01" value={form[field]} onChange={e => updateForm(field, e.target.value)} className="flex-1 h-full px-3 text-[13px] text-[#1a1a18] focus:outline-none bg-white font-mono" />
                    </div>
                  </label>
                ))}

                {/* ABS edging is worked out from the lines rather than typed:
                    every decorative board piece contributes its perimeter, and
                    that runs at the lineal metre rate in Business Defaults.
                    The box is still editable for a job the sum gets wrong, and
                    an empty box means "follow the lines" — which is why the
                    calculated figure sits in the placeholder rather than being
                    written into the input. */}
                <div>
                  <label className={tw.fieldLabel}>
                    ABS edging ex GST
                    <div className="flex items-center h-[34px] border border-[#dbd8cc] rounded-[6px] overflow-hidden">
                      <span className="px-3 h-full flex items-center text-[13px] text-[#8b8a81] bg-[#f5f8f4] border-r border-[#dbd8cc]">$</span>
                      {/* The calculated cost sits IN the box, not behind it as a
                          placeholder. A greyed out figure you cannot select, edit
                          or clear is not an editable field, and this one opened
                          empty when you clicked into it. */}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={edgingFieldValue}
                        onFocus={() => setFocusedField("edging_cost_override_ex_gst")}
                        onBlur={() => setFocusedField("")}
                        onChange={e => updateForm("edging_cost_override_ex_gst", e.target.value)}
                        className="flex-1 h-full px-3 text-[13px] text-[#1a1a18] focus:outline-none bg-white font-mono"
                      />
                    </div>
                  </label>
                  <p className={tw.muted + " mt-1 leading-snug"}>
                    {totals.edging_rate_per_lm_ex_gst > 0 ? (
                      <>
                        <span className="font-mono">{totals.edging_lineal_metres}lm</span> from the lines at{" "}
                        <span className="font-mono">{formatMoney(totals.edging_rate_per_lm_ex_gst, form.currency)}</span>/lm
                        {" = "}
                        <span className="font-mono">{formatMoney(totals.edging_calculated_cost_ex_gst, form.currency)}</span>.
                      </>
                    ) : (
                      <>
                        <span className="font-mono">{totals.edging_lineal_metres}lm</span> from the lines. Set the rate per lineal
                        metre in Business Defaults and this costs itself.
                      </>
                    )}
                    {String(form.edging_cost_override_ex_gst ?? "") !== "" ? (
                      <>
                        {" "}You have typed over it.{" "}
                        <button
                          type="button"
                          onClick={() => updateForm("edging_cost_override_ex_gst", "")}
                          className="underline text-[#5a5a52] hover:text-[#1a1a18]"
                        >
                          Use the calculated figure
                        </button>
                      </>
                    ) : null}
                  </p>
                </div>
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
            ["Labour", totals.labour_cost_ex_gst],
            ["Travel", totals.travel_cost_ex_gst],
            ["Delivery", totals.delivery_cost_ex_gst],
            ["Consumables", totals.installation_cost_ex_gst],
            ["Painting", totals.painting_cost_ex_gst],
            ["Glass", totals.glass_cost_ex_gst],
            ["Door removal / disposal", totals.removal_cost_ex_gst],
            [`ABS edging (${totals.edging_lineal_metres || 0}lm)`, totals.edging_cost_ex_gst],
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
        desc: "Product lines, per-line markup, and drilling",
        total: totals.material_cost_ex_gst,
        rows: [
          ["Product lines", totals.product_lines_cost_ex_gst],
          ["Line markups", totals.markup_amount_ex_gst],
          [`Hinge drilling (${totals.hinge_drilling_qty || 0})`, totals.hinge_drilling_cost_ex_gst],
        ],
      },
      {
        label: "Labour",
        desc: "Workshop labour from hours and hourly rate",
        total: totals.labour_cost_ex_gst,
        rows: [
          ["Cabinet hours", totals.cabinet_labour_hours || 0],
          ["Processing hours", totals.processing_labour_hours || 0],
          ["Hours typed on lines", totals.line_labour_hours - totals.cabinet_labour_hours || 0],
          ["Calculated hours", totals.calculated_labour_hours || 0],
          [totals.labour_hours_overridden ? "Labour hours (you set this)" : "Labour hours", totals.labour_hours || 0],
          ["Hourly rate", formatMoney(totals.worker_hourly_rate, form.currency)],
          ["Labour total", formatMoney(totals.labour_cost_ex_gst, form.currency)],
        ],
      },
      {
        label: "Logistics and consumables",
        desc: "Travel, delivery, small materials, and specialist quote-level costs",
        total: (totals.travel_cost_ex_gst || 0) + (totals.delivery_cost_ex_gst || 0) + (totals.installation_cost_ex_gst || 0) + (totals.painting_cost_ex_gst || 0) + (totals.glass_cost_ex_gst || 0) + (totals.removal_cost_ex_gst || 0) + (totals.edging_cost_ex_gst || 0),
        rows: [
          ["Travel", totals.travel_cost_ex_gst],
          ["Delivery", totals.delivery_cost_ex_gst],
          ["Consumables", totals.installation_cost_ex_gst],
          ["Painting", totals.painting_cost_ex_gst],
          ["Glass", totals.glass_cost_ex_gst],
          ["Door removal / disposal", totals.removal_cost_ex_gst],
          [`ABS edging (${totals.edging_lineal_metres || 0}lm)`, totals.edging_cost_ex_gst],
        ],
      },
    ];

    return (
      <div>
        {groups.map(group => (
          <details key={group.label} className="border border-[#dbd8cc] rounded-[8px] mb-3 overflow-hidden">
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
          <div className="flex items-center gap-2">
            <button type="button" className={tw.smBtn} onClick={generateQuotePdfAttachment} disabled={isAttachingQuotePdf || isGeneratingCabinetPdf || isUploading}>
              {isAttachingQuotePdf ? "Generating..." : "Generate quote PDF"}
            </button>
            <button type="button" className={tw.smBtn} onClick={generateCabinetDrawingsAttachment} disabled={isGeneratingCabinetPdf || isAttachingQuotePdf || isUploading}>
              {isGeneratingCabinetPdf ? "Generating..." : "Generate cabinet PDF"}
            </button>
          </div>
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
            <div className="flex max-h-[420px] flex-col divide-y divide-[#edf4eb] overflow-y-auto pr-1">
              {form.attachments.map(attachment => (
                <div key={attachment.id} className="flex items-center gap-3 py-3">
                  <div className="w-[32px] h-[32px] rounded-[6px] bg-[#edf4eb] flex items-center justify-center flex-shrink-0 text-[#6b9e61] text-[11px] font-bold">
                    {(attachment.file_type || "FILE").slice(0, 3).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#1a1a18] truncate">{attachment.file_name}</p>
                    <p className={tw.muted}>
                      {attachment.file_type || "File"} - {formatFileSize(attachment.file_size)} - {attachment.created_at ? new Date(attachment.created_at).toLocaleDateString("en-AU") : "-"}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <ActionMenu label={`Open actions for attachment ${attachment.file_name || "attachment"}`} disabled={isUploading}>
                      <ActionMenuItem icon={<IconExternalLink size={14} />} onClick={() => window.open(attachment.file_url, "_blank", "noopener,noreferrer")}>
                        View
                      </ActionMenuItem>
                      <ActionMenuItem icon={<IconTrash size={14} />} variant="danger" onClick={() => setDeleteAttachmentConfirmId(attachment.id)}>
                        Delete
                      </ActionMenuItem>
                    </ActionMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderActiveSection() {
    // Shown above whatever tab is open, because this affects every price on the
    // screen rather than one section.
    const defaultsWarning = businessDefaultsError ? (
      <div className="mb-3 rounded-[8px] border border-[#fca5a5] bg-[#fef2f2] px-4 py-3">
        <p className="text-[13px] font-medium text-[#991b1b]">Your business defaults could not be loaded.</p>
        <p className="mt-[2px] text-[12px] leading-snug text-[#7f1d1d]">
          Markup, hourly rate and hinge drilling on this screen are built-in starting values, not your settings, so the
          totals may be wrong. Reload before saving. {businessDefaultsError}
        </p>
      </div>
    ) : null;

    const section = renderSectionBody();
    return defaultsWarning ? <>{defaultsWarning}{section}</> : section;
  }

  function renderSectionBody() {
    if (activeSection === "items") return renderItems();
    if (activeSection === "cabinets") return renderCabinets();
    if (activeSection === "costs") return renderCosts();
    if (activeSection === "notes") return renderNotes();
    if (activeSection === "totals") return renderTotals();
    if (activeSection === "attachments") return renderAttachments();
    return renderDetails();
  }

  const activeLabel = sections.find((section) => section.key === activeSection)?.label || "Information & Contacts";
  const activeCabinetLine = activeCabinetLineIndex !== null ? form.lines[activeCabinetLineIndex] : null;
  // The modal is a second way into the same two fields, so it reads the same
  // brand-narrowed catalogue the row does. Left on the material-wide lists it
  // would be a way around the rule rather than another door to it.
  const profileModalUsesLibrary = Boolean(profileModal?.supplier_name) && profileLibrary.isReady;
  const profileModalLibraryRows = profileModalUsesLibrary
    ? profilesForSupplier(profileRows, {
        supplier: profileModal.supplier_name,
        thickness: profileModal.thickness,
      })
    : [];
  const profileModalTypes = profileModalUsesLibrary
    ? profileCategoriesForSupplier(profileRows, {
        supplier: profileModal.supplier_name,
        thickness: profileModal.thickness,
      })
    : profileModal
      ? profileTypesForSelection(profileModal.material, profileModal.thickness)
      : [];
  const profileModalOptions = profileModalUsesLibrary
    ? profileModalLibraryRows
        .filter((row) => !profileModal.profile_type || row.category === profileModal.profile_type)
        .map((row) => ({
          name: row.name,
          label: row.name,
          meta: row.category || "Profile",
          src: row.image_url || profileOptionSrc(row.category, row.name),
        }))
    : (profileModal
        ? profileNamesForSelection(profileModal.profile_type, profileModal.material, profileModal.thickness)
        : []
      ).map((profile) => ({
        name: profile,
        label: profile,
        meta: profileModal?.profile_type || "Profile",
        src: profileOptionSrc(profileModal?.profile_type, profile),
      }));
  // Once a quote has become an order it is a record of what was agreed. The
  // only way to change committed work is a variation, which is priced, sent and
  // approved. The server refuses the edit either way; this stops anyone getting
  // as far as typing one.
  //
  // Being sent seals it too, for a different reason: a customer is holding a
  // link, and the version they approve has to be the version they read. That
  // one is not permanent. The override pulls it back to draft and cancels their
  // link, so they can never approve something that has moved.
  const lockState = editability("quote", form.status);
  const isSealed = !form.order_id && lockState === "sealed";
  const isLocked = Boolean(form.order_id) || isSealed;
  const isArchived = form.status === "archived";

  // ARCHIVING A QUOTE, AND PUTTING IT BACK.
  //
  // Its own route rather than a status change, because archiving records the
  // status it came from so restoring is exact: a quote archived while it was
  // rejected comes back rejected, not as a draft. A quote that has become an
  // order cannot be archived at all; the route says so and so does this.
  async function setArchived(archived) {
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        toast({ title: result?.error || "Could not archive that quote.", variant: "error" });
        return;
      }
      toast({
        title: archived
          ? "Archived. It stops counting anywhere until you restore it."
          : `Restored to ${result.quote?.status || "draft"}.`,
      });
      loadQuote();
    } catch (error) {
      toast({ title: error?.message || "Could not archive that quote.", variant: "error" });
    }
  }
  // Re-sending a sealed quote is ordinary: the customer lost the email, or it
  // went to the wrong address. Nothing about the quote changes. Only an accepted
  // one is past sending, and generating its PDF is read-only either way.
  const isAccepted = Boolean(form.order_id);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  // Everything below is the part a person types into. When the quote is locked
  // it all goes read only in one place, so a field added later is covered
  // without anyone having to remember to cover it. See LockedRegion for why a
  // banner over typeable fields is not a control.
  const contentPanel = isLoading ? (
    <AdminLoading steps={["Opening the quote", "Loading the line items", "Almost there"]} label="Loading quote" />
  ) : loadError ? (
    <div className="bg-white border border-[#dbd8cc] rounded-[8px] p-6 text-center">
      <p className="text-[15px] font-semibold text-[#1a1a18]">Quote could not be loaded</p>
      <p className="text-[13px] text-[#6f6d64] mt-2">{loadError}</p>
      <Link href="/admin/quotes" className="inline-flex items-center justify-center h-[34px] px-4 mt-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f]">
        Back to quotes
      </Link>
    </div>
  ) : (
    <>
      {isLocked ? (
        <div
          className={`mb-3 rounded-[6px] border px-3 py-2 text-[12px] leading-[1.5] ${
            isSealed
              ? "border-[#e8d68f] bg-[#fffdf0] text-[#8a6d0b]"
              : "border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28]"
          }`}
        >
          {isSealed ? (
            <>
              <strong className="font-semibold">This quote is with the customer, so it is read only.</strong>{" "}
              They are holding a link to this version and the version they approve has to be the version they read.
              Use <strong className="font-semibold">Edit with override</strong> to pull it back to draft, which cancels
              the link they were sent.
            </>
          ) : (
            <>
              <strong className="font-semibold">This quote has been accepted and is read only.</strong>{" "}
              It is the record of what was agreed. To change the work, raise a variation on the order, which is priced,
              sent to the customer and approved.
              {form.order_id ? (
                <>
                  {" "}
                  <Link href={`/admin/orders/${form.order_id}`} className="underline font-semibold">
                    Open the order
                  </Link>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {renderActiveSection()}
    </>
  );
  return (
    <>
      <div className="flex flex-col md:flex-row min-h-full md:h-full md:min-h-0">

        {/* Desktop left sidebar nav */}
        <aside className="hidden md:flex flex-col w-[220px] flex-shrink-0 border-r border-[#edf4eb] bg-white">
          <div className="px-4 py-4 border-b border-[#edf4eb]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8b8a81] mb-[2px]">Quote</p>
            <p className="text-[15px] font-semibold text-[#1a1a18] truncate">{form.quote_number || "Draft quote"}</p>
            <Link href="/admin/quotes" className="text-[12px] text-[#6b9e61] hover:underline mt-[2px] block">{"<- Quotes"}</Link>
          </div>
          {/* THE ORDER THESE ARE IN IS THE ORDER THE WORK HAPPENS IN.
              Build it, send it, close it, then the things you only ever look at,
              and archiving last because it is the one that takes the quote away.
              It used to open with Generate PDF and bury Save under Accept, which
              put the button pressed a hundred times a day below the one pressed
              once. */}
          <div className="px-3 py-3 border-b border-[#edf4eb] flex flex-col gap-2">

            {/* Building it. */}
            <button type="button" onClick={saveQuote} disabled={isSaving || isLoading || isLocked || Boolean(loadError)} className="h-[32px] flex items-center justify-center px-3 bg-[#1c2b1e] rounded-[6px] text-[12px] font-medium text-white hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors">
              {isSaving ? "Saving..." : "Save"}
            </button>

            {/* Sending it. */}
            <button type="button" onClick={publishQuote} disabled={isSaving || isLoading || isAccepted || Boolean(loadError)} className="h-[32px] flex items-center justify-center px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors">
              {isSealed ? "Send again" : "Publish quote"}
            </button>

            {/* Closing it. The customer said yes on the phone and will never open
                the link; this raises the order exactly as their own acceptance
                would. */}
            {!isAccepted && form.status !== "rejected" ? (
              <button type="button" onClick={() => setAcceptOpen(true)} className="h-[32px] flex items-center justify-center px-3 border border-[#a8c5a0] bg-[#edf4eb] rounded-[6px] text-[12px] font-medium text-[#2d5e28] hover:bg-[#e2ecdf] transition-colors">
                Accept for the customer
              </button>
            ) : null}

            {/* Getting back in. Only ever shown on a quote that is out with the
                customer, and directly under the actions it is the way past. */}
            {isSealed ? (
              <button type="button" onClick={() => setOverrideOpen(true)} className="h-[32px] flex items-center justify-center px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] transition-colors">
                Edit with override
              </button>
            ) : null}

            <div className="h-px bg-[#edf4eb] my-[2px]" />

            {/* Looking at it. Neither changes anything. */}
            {publicUrl ? (
              <a href={publicUrl} target="_blank" rel="noreferrer" className="h-[32px] flex items-center justify-center px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] transition-colors">
                View public quote
              </a>
            ) : null}
            <button type="button" onClick={generateQuotePdf} disabled={isSaving || isLoading || isAccepted || Boolean(loadError) || isGeneratingQuotePdf} className="h-[32px] flex items-center justify-center px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors">
              {isGeneratingQuotePdf ? "Generating..." : "Generate PDF"}
            </button>

            {/* Taking it away. Last, and behind a confirmation. Not offered on a
                quote that has become an order: the order and the financials
                behind it still read from this quote. */}
            {!form.order_id && (
              <>
                <div className="h-px bg-[#edf4eb] my-[2px]" />
                <button
                  type="button"
                  onClick={() => setArchiveOpen(true)}
                  disabled={isLoading || Boolean(loadError)}
                  title={isArchived
                    ? "Put it back the way it was before it was archived."
                    : "Takes it out of the lists, the board and the financials. Nothing is deleted and it can be restored."}
                  className="h-[32px] flex items-center justify-center px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#5a5a52] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors"
                >
                  {isArchived ? "Restore" : "Archive"}
                </button>
              </>
            )}
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
                <Link href="/admin/quotes" className="text-[12px] text-[#6b9e61] hover:underline mt-[2px] block">{"<- Quotes"}</Link>
              </div>
              <div className="px-4 py-3 bg-white border-b border-[#edf4eb] flex flex-wrap gap-2">
                {publicUrl && <a href={publicUrl} target="_blank" rel="noreferrer" className="h-[32px] px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#1a1a18] flex items-center">View public</a>}
                <button type="button" onClick={publishQuote} disabled={isSaving || isLoading || isAccepted || Boolean(loadError)} className="h-[32px] px-3 bg-[#1c2b1e] rounded-[6px] text-[12px] font-medium text-white disabled:opacity-50">{isSealed ? "Re-send" : "Publish"}</button>
                {isSealed ? <button type="button" onClick={() => setOverrideOpen(true)} className="h-[32px] px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#1a1a18]">Override</button> : null}
                <button type="button" onClick={saveQuote} disabled={isSaving || isLoading || isLocked || Boolean(loadError)} className="h-[32px] px-3 border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#1a1a18] disabled:opacity-50">{isSaving ? "Saving..." : "Save"}</button>
              </div>
              {sections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActiveSection(section.key)}
                  className="w-full flex items-center justify-between px-4 py-[14px] text-[14px] font-medium text-[#1a1a18] bg-white border-b border-[#edf4eb] hover:bg-[#f5f8f4] transition-colors"
                >
                  {section.label}
                  <span className="text-[#c5cdd8]">&gt;</span>
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
                  {"<-"}
                </button>
                <span className="text-[15px] font-semibold text-[#1a1a18]">
                  {sections.find((s) => s.key === activeSection)?.label}
                </span>
              </div>
              <div className="p-4 bg-[#f5f8f4]">
                <form onSubmit={saveQuote}>
                  <LockedRegion locked={isLocked && !isLoading && !loadError}>{contentPanel}</LockedRegion>
                  {form.order_id ? <div className="mt-3 px-4 py-3 rounded-[6px] bg-[#edf4eb] border border-[#a8c5a0] text-[13px] text-[#2d5e28]">This quote has been approved and converted to an order, so it can no longer be edited. Raise a variation on the order to change the work.</div> : null}
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Desktop right content panel */}
        <main className="hidden md:flex flex-1 flex-col min-w-0 min-h-0 bg-[#f5f8f4]">
          {/* On the Items tab the panel fills the height and lets the table
              scroll internally (sticky header); other tabs scroll normally so
              the sidebar stays put either way. */}
          <form onSubmit={saveQuote} className={`flex-1 min-h-0 p-6 ${activeSection === 'items' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
            <LockedRegion locked={isLocked && !isLoading && !loadError}>{contentPanel}</LockedRegion>
            {form.order_id ? <div className="mt-3 px-4 py-3 rounded-[6px] bg-[#edf4eb] border border-[#a8c5a0] text-[13px] text-[#2d5e28]">This quote has been approved and converted to an order, so it can no longer be edited. Raise a variation on the order to change the work.</div> : null}
          </form>
        </main>

      </div>

      {publishEmail && (
        <Modal
          open={true}
          onClose={() => setPublishEmail(null)}
          title="Email customer"
          subtitle="Publish quote"
          size="lg"
          footer={
            <>
              <button type="button" className="h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors" onClick={() => setPublishEmail(null)} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className="h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors" onClick={sendPublishedQuote} disabled={isSaving || !form.customer_email}>
                {isSaving ? "Sending..." : "Send quote"}
              </button>
            </>
          }
        >
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
                checked={Boolean(publishEmail.include_price)}
                onChange={(event) => updatePublishEmail("include_price", event.target.checked)}
              />
              Include price in email
            </label>
            <label className={`${styles.checkboxRow} ${styles.fieldWide}`}>
              <input
                type="checkbox"
                checked={Boolean(publishEmail.deposit_required)}
                onChange={(event) => {
                  updatePublishEmail("deposit_required", event.target.checked);
                  updatePublishEmail("deposit_percent", event.target.checked ? 50 : 0);
                }}
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
          {!form.customer_email ? (
            <div className="mx-1 px-3 py-2 bg-[#fffbeb] border border-[#fcd34d] rounded-[6px] text-[12px] text-[#92400e] flex items-center gap-2">
              <span>!</span>
              <span>Add a customer email before sending this quote.</span>
            </div>
          ) : null}
        </Modal>
      )}
      {isCustomerModalOpen && (
        <Modal
          open={true}
          onClose={() => setIsCustomerModalOpen(false)}
          title="Create new customer"
          size="md"
          footer={
            <>
              <button type="button" className="h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors" onClick={() => setIsCustomerModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors" onClick={saveCustomerFromDetails} disabled={isSavingCustomer || !customerForm.name.trim()}>
                {isSavingCustomer ? "Saving..." : "Save customer"}
              </button>
            </>
          }
        >
          <div className={styles.customerModalGrid}>
            <input className={styles.fieldInput} placeholder="Customer name" value={customerForm.name} onChange={(event) => updateCustomerForm("name", event.target.value)} />
            <input className={styles.fieldInput} placeholder="Company name" value={customerForm.company_name} onChange={(event) => updateCustomerForm("company_name", event.target.value)} />
            <input className={styles.fieldInput} placeholder="Email" type="email" value={customerForm.email} onChange={(event) => updateCustomerForm("email", event.target.value)} />
            <input className={styles.fieldInput} placeholder="Phone" value={customerForm.phone} onChange={(event) => updateCustomerForm("phone", event.target.value)} />
            <AddressFields
              value={{ street: customerForm.site_street, suburb: customerForm.site_suburb, postcode: customerForm.site_postcode }}
              onChange={(key, value) => updateCustomerForm(`site_${key}`, value)}
              labelClassName={styles.fieldLabel}
              inputClassName={styles.fieldInput}
              streetClassName={styles.fieldWide}
            />
            <textarea className={`${styles.textareaInput} ${styles.fieldWide}`} placeholder="Notes" value={customerForm.notes} onChange={(event) => updateCustomerForm("notes", event.target.value)} />
          </div>
        </Modal>
      )}
      {/* Archiving takes a quote out of the lists, the board and the financials
          all at once. Reversible, but not something to do by brushing past a
          button. */}
      <ConfirmModal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title={isArchived
          ? `Restore ${form.quote_number || "this quote"}?`
          : `Archive ${form.quote_number || "this quote"}?`}
        description={isArchived
          ? "It goes back to the status it had before it was archived, and starts counting in the lists, the board and the financials again."
          : "It comes out of the lists, the board and the financials. Nothing is deleted and you can restore it from the Archived tab."}
        variant={isArchived ? "default" : "warning"}
        confirmLabel={isArchived ? "Restore it" : "Archive it"}
        cancelLabel="Keep it as it is"
        loading={isArchiving}
        onConfirm={async () => {
          setIsArchiving(true);
          try {
            await setArchived(!isArchived);
          } finally {
            setIsArchiving(false);
            setArchiveOpen(false);
          }
        }}
      />
      <ConfirmModal
        open={deleteLineConfirmIndex !== null}
        onClose={() => setDeleteLineConfirmIndex(null)}
        title="Delete line?"
        description="This quote line will be removed from the quote."
        variant="danger"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleteLineConfirmIndex !== null && savingLineIndex === deleteLineConfirmIndex}
        onConfirm={() => {
          const index = deleteLineConfirmIndex;
          if (index === null) return;
          runLineAction(() => removeLine(index));
        }}
      />
      <ConfirmModal
        open={Boolean(deleteAttachmentConfirmId)}
        onClose={() => setDeleteAttachmentConfirmId(null)}
        title="Delete attachment?"
        description="This file will be removed from the quote attachments."
        variant="danger"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={isUploading}
        onConfirm={() => {
          const attachment = form.attachments.find(item => item.id === deleteAttachmentConfirmId);
          if (attachment) deleteAttachment(attachment);
        }}
      />
      {lineNoteModal && (
        <Modal
          open={true}
          onClose={() => setLineNoteModal(null)}
          title={`Line ${lineNoteModal.lineIndex + 1} notes`}
          subtitle="Client & internal notes"
          size="md"
          footer={
            <>
              <button type="button" className="h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors" onClick={() => setLineNoteModal(null)} disabled={savingLineIndex !== null}>
                Cancel
              </button>
              <button type="button" className="h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors" onClick={saveLineNoteModal} disabled={savingLineIndex !== null}>
                {savingLineIndex === lineNoteModal.lineIndex ? "Saving..." : "Save note"}
              </button>
            </>
          }
        >
          <label className={styles.fieldLabel}>
            Note shown on public quote
            <textarea
              className={styles.textareaInput}
              rows={4}
              value={lineNoteModal.client_note}
              onChange={(event) => updateLineNoteModal(event.target.value)}
              placeholder="Add a short note for the client about this line item."
            />
          </label>
          <label className={styles.fieldLabel} style={{ marginTop: 12 }}>
            Internal note (admin only - production, mitres, hinges, runners)
            <textarea
              className={styles.textareaInput}
              rows={4}
              value={lineNoteModal.notes}
              onChange={(event) => updateLineNoteInternal(event.target.value)}
              placeholder="Fabrication notes. Imported design-tool notes (e.g. mitre and hinge notes) appear here."
            />
          </label>
        </Modal>
      )}
      {profileModal && (
        <Modal
          open={true}
          onClose={() => setProfileModal(null)}
          title="Edit Profile"
          subtitle="Line item profile"
          size="md"
          contentFit
          footer={
            <>
              <button type="button" className="h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors" onClick={() => setProfileModal(null)}>
                Cancel
              </button>
              <button type="button" className="h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors" onClick={saveProfileModal}>
                Save profile
              </button>
            </>
          }
        >
          <div className={quoteStyles.profileConfigForm}>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-[#5a5a52]">Profile type</span>
              <select
                className="h-[36px] w-full border border-[#dbd8cc] rounded-[6px] px-3 text-[13px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61]"
                value={profileModal.profile_type}
                onChange={(event) => updateProfileModal("profile_type", event.target.value)}
              >
                <option value="">Select profile type</option>
                {profileModalTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-[#5a5a52]">Profile name</span>
              <QuoteImageCombobox
                className={quoteStyles.profileNameCombo}
                disabled={!profileModal.profile_type}
                placeholder={profileModal.profile_type ? "Profile name" : "Select profile type first"}
                value={profileModal.profile}
                options={profileModalOptions}
                onChange={(option) => updateProfileModal("profile", option.name || option.label)}
              />
            </label>
          </div>
        </Modal>
      )}
      {hingeModal && (
        <Modal
          open={true}
          onClose={() => setHingeModal(null)}
          title="Edit Hinges"
          subtitle="Line item hinges"
          size="md"
          footer={
            <>
              <button type="button" className="h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors" onClick={() => setHingeModal(null)}>
                Cancel
              </button>
              <button type="button" className="h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors" onClick={saveHingeModal}>
                Save drilling
              </button>
            </>
          }
        >
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
            <label className={styles.fieldLabel}>
              Quantity
              <select
                className={styles.fieldInput}
                value={hingeModal.hinge_qty}
                onChange={(event) => updateHingeModal("hinge_qty", event.target.value)}
                disabled={!hingeModal.hinge_holes}
              >
                <option value="">Please select hinge quantity...</option>
                <option>2 hinges</option>
                <option>3 hinges</option>
                <option>4 hinges</option>
              </select>
            </label>
            <p className={styles.tableMeta}>Leave drilling unticked when no hinge holes are required. Add supplied hinges as separate hardware line items.</p>
          </div>
        </Modal>
      )}
      {editableLineIndex !== null && typeof document !== 'undefined' ? createPortal(
        (() => {
          const idx = editableLineIndex
          const line = editableLineDraft || form.lines[idx] || emptyLineWithDefaults(businessDefaults, defaultsLoaded)
          const { calculated, materialOptions, showEdges, showProfiles, edgeOptions, hingesApplicable, isHardware, isBenchtop, isBaseCabinet } = lineViewModel(line)
          const isBaseCabinetEditable = isBaseCabinet
          const isLineSaving = savingLineIndex === idx
          const canResetUnitCost = !isBaseCabinetEditable && line.unit_cost_mode === 'manual' && Number(line.calculated_unit_cost_ex_gst || 0) > 0
          const mfl = 'text-[10px] font-semibold uppercase tracking-[0.05em] text-[#8b8a81] block mb-[3px]'
          return (
            <div className="fixed inset-0 z-[39] flex flex-col bg-white md:hidden" role="dialog" aria-modal="true" aria-label={`Edit line ${idx + 1}`}>
              {/* Header */}
              <div className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3 flex-shrink-0 border-b border-[#eef0f4] bg-white">
                <button
                  type="button"
                  onClick={() => { setEditableLineIndex(null); setEditableLineDraft(null) }}
                  aria-label="Go back"
                  className="w-[28px] h-[28px] rounded-[6px] flex items-center justify-center text-[#9ba7b8] hover:bg-[#eef0f4] hover:text-[#3d4d5f] transition-colors flex-shrink-0"
                >{"<-"}</button>
                <span className="flex-1 text-center text-[15px] font-semibold text-[#1a1a18]">
                  {isBaseCabinetEditable ? `Base cabinet ${idx + 1}` : `Edit line ${idx + 1}`}
                </span>
                <div className="w-[28px]" aria-hidden="true" />
              </div>
              {/* Scrollable form body */}
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <span className={mfl}>Type</span>
                    <QuoteTileCombobox
                      compact={false}
                      placeholder="Select type"
                      value={displayProductType(line.product_type)}
                      options={quoteProductTypes.map(t => ({ label: t.label, name: t.label, value: t.value, meta: 'Product type' }))}
                      onChange={option => updateProductLine(idx, { product_type: option.value || option.name || option.label })}
                    />
                  </div>
                  <div className="col-span-2">
                    <span className={mfl}>{isHardware ? "Hardware item" : isBenchtop ? "Benchtop material" : "Material"}</span>
                    {isHardware ? (
                      <QuoteImageCombobox
                        placeholder="Select hardware"
                        value={line.unit_cost_source_id || ""}
                        displayValue={line.product_name || ""}
                        options={hardwareOptions}
                        onChange={option => updateProductLine(idx, { hardware_catalogue_id: option.id || option.value })}
                      />
                    ) : isBenchtop ? (
                      <QuoteTileCombobox
                        compact={false}
                        placeholder="Select material"
                        value={line.unit_cost_source_id || line.material}
                        options={benchtopMaterialOptions}
                        onChange={option => updateProductLine(idx, { benchtop_material_id: option.id || option.value })}
                      />
                    ) : (
                      <QuoteTileCombobox
                        compact={false}
                        placeholder="Select material"
                        value={line.material}
                        options={materialOptions.map(m => ({ label: m, name: m, meta: 'Material' }))}
                        onChange={option => updateProductLine(idx, { material: option.name || option.label })}
                      />
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className={mfl}>Supplier</span>
                    <QuoteTileCombobox
                      compact={false}
                      disabled={isHardware || isBenchtop || !line.material || isBaseCabinetEditable}
                      placeholder="Supplier"
                      value={line.supplier_name || ""}
                      options={supplierOptionsFor(line)}
                      onChange={option => updateProductLine(idx, { supplier_name: option.value || option.name || option.label })}
                    />
                  </div>
                  <div className="col-span-2">
                    <span className={mfl}>Finish, colour &amp; thickness</span>
                    <QuoteColourCombobox compact={false} disabled={isHardware || isBenchtop || isBaseCabinetEditable} line={line} onChange={patch => updateProductLine(idx, patch)} />
                  </div>
                  {!isBaseCabinetEditable ? (
                    <>
                      <div>
                        <span className={mfl}>H mm</span>
                        <div className="flex items-center h-[44px] border border-[#a8c5a0] rounded-[6px] overflow-hidden bg-white focus-within:border-[#6b9e61]">
                          <span className="px-3 h-full flex items-center text-[12px] text-[#8b8a81] bg-[#f5f8f4] border-r border-[#a8c5a0] flex-shrink-0 select-none font-mono">H</span>
                          <input type="text" inputMode="numeric" placeholder="mm" value={line.height_mm}
                            onChange={e => updateLine(idx, 'height_mm', sanitizeIntegerInput(e.target.value))}
                            className="flex-1 h-full px-3 text-[14px] font-mono text-[#1a1a18] focus:outline-none bg-transparent border-none min-w-0" />
                        </div>
                      </div>
                      <div>
                        <span className={mfl}>W mm</span>
                        <div className="flex items-center h-[44px] border border-[#a8c5a0] rounded-[6px] overflow-hidden bg-white focus-within:border-[#6b9e61]">
                          <span className="px-3 h-full flex items-center text-[12px] text-[#8b8a81] bg-[#f5f8f4] border-r border-[#a8c5a0] flex-shrink-0 select-none font-mono">W</span>
                          <input type="text" inputMode="numeric" placeholder="mm" value={line.width_mm}
                            onChange={e => updateLine(idx, 'width_mm', sanitizeIntegerInput(e.target.value))}
                            className="flex-1 h-full px-3 text-[14px] font-mono text-[#1a1a18] focus:outline-none bg-transparent border-none min-w-0" />
                        </div>
                      </div>
                      <div>
                        <span className={mfl}>Qty</span>
                        <input type="text" inputMode="numeric" value={line.qty}
                          onChange={e => updateLine(idx, 'qty', sanitizeIntegerInput(e.target.value))}
                          className="w-full h-[44px] text-[14px] font-mono text-center border border-[#a8c5a0] rounded-[6px] bg-white focus:outline-none focus:border-[#6b9e61]" />
                      </div>
                      <div>
                        <span className={mfl}>Unit cost</span>
                        <div className="flex items-center h-[44px] border border-[#a8c5a0] rounded-[6px] overflow-hidden bg-white">
                          <span className="px-3 h-full flex items-center text-[12px] text-[#8b8a81] bg-[#f5f8f4] border-r border-[#a8c5a0] flex-shrink-0 font-mono">$</span>
                          <input type="text" inputMode="decimal" placeholder="0.00" value={line.product_unit_cost_ex_gst}
                            onChange={e => updateLine(idx, 'product_unit_cost_ex_gst', e.target.value)}
                            className="flex-1 h-full px-3 text-[14px] font-mono text-[#1a1a18] focus:outline-none bg-transparent border-none" />
                        </div>
                        {canResetUnitCost && (
                          <button type="button" onClick={() => resetLineUnitCost(idx)} className="text-[11px] text-[#6b9e61] hover:underline mt-[3px] block">
                            Reset to {formatMoney(line.calculated_unit_cost_ex_gst, form.currency)}
                          </button>
                        )}
                      </div>
                      <div>
                        <span className={mfl}>Markup %</span>
                        <div className="flex items-center h-[44px] border border-[#a8c5a0] rounded-[6px] overflow-hidden bg-white focus-within:border-[#6b9e61]">
                          <input type="text" inputMode="decimal" value={line.markup_percent}
                            onChange={e => updateLine(idx, 'markup_percent', sanitizeNonNegativeDecimalInput(e.target.value))}
                            className="flex-1 h-full px-3 text-[14px] font-mono text-[#1a1a18] focus:outline-none bg-transparent border-none min-w-0" />
                          <span className="px-3 h-full flex items-center text-[12px] text-[#8b8a81] bg-[#f5f8f4] border-l border-[#a8c5a0] flex-shrink-0">%</span>
                        </div>
                      </div>
                      <div>
                        <span className={mfl}>Line total</span>
                        <div className="h-[44px] flex items-center px-3 bg-[#f5f8f4] rounded-[6px] border border-[#dbd8cc]">
                          <span className="text-[16px] font-semibold font-mono text-[#1a1a18]">{formatMoney(calculated.line_total_ex_gst, form.currency)}</span>
                        </div>
                      </div>
                      {showEdges && (
                        <div className="col-span-2">
                          <span className={mfl}>Edge profile</span>
                          <QuoteImageCombobox
                            placeholder="Edge profile"
                            value={line.edge_mould}
                            options={edgeOptions}
                            onChange={option => updateLine(idx, 'edge_mould', option.name || option.label)}
                          />
                        </div>
                      )}
                      {showProfiles && (
                        <div className="col-span-2">
                          <span className={mfl}>Profile</span>
                          <button type="button" onClick={() => openProfileModal(idx)}
                            className="inline-flex items-center gap-2 text-[13px] font-medium text-[#2d5e28] border border-[#a8c5a0] rounded-[6px] px-3 h-[44px] bg-white hover:bg-[#edf4eb] transition-colors w-full justify-between"
                          >
                            <span>{hasProfileConfig(line) ? profileConfigLines(line)[0] : 'Configure profile'}</span>
                            <span>open</span>
                          </button>
                        </div>
                      )}
                      {hingesApplicable && (
                        <div className="col-span-2">
                          <span className={mfl}>Hinges</span>
                          <button type="button" onClick={() => openHingeModal(idx)}
                            className="inline-flex items-center gap-2 text-[13px] font-medium text-[#2d5e28] border border-[#a8c5a0] rounded-[6px] px-3 h-[44px] bg-white hover:bg-[#edf4eb] transition-colors w-full justify-between"
                          >
                            <span>{hasHingeConfig(line) ? `Drill: ${line.hinge_holes ? 'yes' : 'no'}` : 'Configure drilling'}</span>
                            <span>open</span>
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="col-span-2 text-[13px] text-[#8b8a81] italic py-2">Dimensions are configured in the Base Cabinets tab.</p>
                  )}
                </div>
              </div>
              {/* Footer */}
              <div className="flex flex-col gap-2 px-4 pt-3 border-t border-[#eef0f4] pb-[max(env(safe-area-inset-bottom),20px)] flex-shrink-0 bg-white">
                <button type="button" onClick={() => runLineAction(saveLine)} disabled={isLineSaving}
                  className="h-[44px] w-full bg-[#2d9692] !text-white text-[14px] font-semibold rounded-[8px] hover:bg-[#268785] disabled:opacity-50 transition-colors"
                >
                  {isLineSaving ? 'Saving...' : 'Save line'}
                </button>
                <button type="button"
                  onClick={() => { setEditableLineIndex(null); setEditableLineDraft(null) }}
                  disabled={isLineSaving}
                  className="h-[44px] w-full bg-[#eef0f4] border border-[#dde1e9] text-[14px] font-medium text-[#3d4d5f] rounded-[8px] hover:bg-[#dde1e9] disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )
        })(),
        document.body
      ) : null}
      {addTermsOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Add terms to this quote"
              onMouseDown={() => setAddTermsOpen(false)}
            >
              <div
                className="flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_24px_48px_rgba(0,0,0,0.18)]"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-[#edf4eb] px-4 py-3">
                  <div>
                    <p className="text-[14px] font-semibold text-[#1a1a18]">Add terms</p>
                    <p className="text-[11px] text-[#8b8a81]">Wording is copied in and stays editable on this quote.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddTermsOpen(false)}
                    aria-label="Close"
                    className="h-[28px] w-[28px] rounded-[6px] border border-[#dbd8cc] bg-white text-[#8b8a81] hover:bg-[#f5f8f4]"
                  >
                    &#10005;
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {termsLibrary.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-[#8b8a81]">
                      There are no terms set up yet. Add them under Settings, Business Defaults, Quote terms.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {termsLibrary.map((term) => {
                        const already = (form.terms_term_ids || []).includes(term.id);
                        const checked = termsToAdd.includes(term.id);
                        const preview = termsHtmlToPlainText(term.body_html);
                        return (
                          <label
                            key={term.id}
                            className={`flex gap-3 rounded-[6px] border px-3 py-[10px] ${
                              already ? "border-[#edf4eb] bg-[#f9faf8]" : "cursor-pointer border-[#dbd8cc] hover:bg-[#f5f8f4]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-[3px]"
                              // Already on the quote: shown ticked and locked,
                              // rather than hidden. Hiding it reads as "that
                              // term is gone" when it is right there in the box.
                              checked={already || checked}
                              disabled={already}
                              onChange={(event) =>
                                setTermsToAdd((current) =>
                                  event.target.checked ? [...current, term.id] : current.filter((id) => id !== term.id)
                                )
                              }
                            />
                            <span className="min-w-0">
                              <span className="block text-[13px] font-medium text-[#1a1a18]">
                                {term.name}
                                {already ? <span className="ml-2 text-[11px] font-normal text-[#8b8a81]">already on this quote</span> : null}
                              </span>
                              <span className="mt-[2px] block text-[11px] leading-snug text-[#8b8a81]">
                                {preview.length > 220 ? `${preview.slice(0, 220)}...` : preview}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-[#edf4eb] px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setAddTermsOpen(false)}
                    className="h-[34px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[13px] text-[#5a5a52] hover:bg-[#f5f8f4]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addSelectedTerms}
                    disabled={termsToAdd.length === 0}
                    className="h-[34px] rounded-[6px] bg-[#1c2b1e] px-3 text-[13px] font-medium text-white disabled:opacity-50"
                  >
                    Add {termsToAdd.length || ""} {termsToAdd.length === 1 ? "term" : "terms"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {activeCabinetLine && isBaseCabinetLine(activeCabinetLine) && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center md:p-5"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cabinet-configurator-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div
                className="bg-white flex flex-col overflow-hidden shadow-[0_24px_48px_rgba(0,0,0,0.18)] w-full h-[100dvh] rounded-none md:w-[70vw] md:max-w-[70vw] md:h-auto md:max-h-[calc(100dvh-36px)] md:rounded-[12px]"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex-1 min-h-0 overflow-hidden" onMouseDown={(event) => event.stopPropagation()}>
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

      <AcceptForCustomerModal
        open={acceptOpen}
        quoteNumber={form.quote_number}
        customerName={form.customer_name}
        onClose={() => setAcceptOpen(false)}
        onAccepted={(result) => {
          setAcceptOpen(false);
          toast({ title: result.message || "Order raised.", variant: "success" });
          // The quote is now permanently read only and an order exists, so the
          // screen it was is no longer the screen it is.
          window.location.reload();
        }}
        onSubmit={async (body) => {
          const response = await fetch(`/api/admin/quotes/${quoteId}/accept`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const result = await response.json();
          if (!response.ok || !result.ok) throw new Error(result.error || "Could not accept this quote.");
          return result;
        }}
      />

      <OverrideModal
        open={overrideOpen}
        kind="quote"
        documentNumber={form.quote_number}
        sentAt={form.sent_at}
        onClose={() => setOverrideOpen(false)}
        onConfirm={async (reason) => {
          const response = await fetch(`/api/admin/quotes/${quoteId}/override`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason }),
          });
          const payload = await response.json();
          if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not override this quote.");
          setOverrideOpen(false);
          // The access code changed, so anything holding the old one is stale.
          // Reloading is simpler than reconciling and cannot be half done.
          window.location.reload();
        }}
      />
    </>
  );
}


