"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";
import { optionsFromColourFamily } from "../../../../lib/pcd-colour-library";
import { calculateQuoteLine, calculateQuoteTotals, DEFAULT_BUSINESS_DEFAULTS, formatMoney, GST_RATE } from "../../../../lib/pcd-quote-utils";
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
} from "../../../request-quote/quote-form-data";
import styles from "../../admin-shell.module.css";
import { AdminTablePagination, useAdminTablePagination } from "../../_components/AdminTablePagination";

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
const quoteProductTypes = [
  ...PRODUCT_TYPES.map((type) => ({ value: type, label: type })),
  { value: BASE_CABINET_TYPE, label: "Base cabinet" },
];

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
  markup_percent: DEFAULT_BUSINESS_DEFAULTS.markup_percent,
  notes: "",
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
  currency: "AUD",
  gst_rate: GST_RATE,
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

function linesFromQuote(quote) {
  return [...(quote?.pcd_quote_line_items || [])]
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((line) => ({
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
      markup_percent: line.markup_percent ?? "",
      notes: line.notes ?? "",
    }));
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
    form.access_code ? `Access code: ${form.access_code}` : "",
    "",
    "Regards,",
    "Perth Cabinet Doors",
  ].filter((line) => line !== "").join("\n");
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

function QuoteImageCombobox({ disabled = false, placeholder, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const [menuStyle, setMenuStyle] = useState({});
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

  return (
    <div className={styles.quoteColourCombo} ref={wrapRef}>
      <input
        disabled={disabled}
        placeholder={placeholder}
        type="text"
        value={query}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setOpen(true);
          onChange({ name: nextQuery, label: nextQuery, finish: "" });
        }}
        onFocus={() => !disabled && setOpen(true)}
      />
      <button
        aria-label="Open options"
        className={styles.quoteColourComboButton}
        disabled={disabled}
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          if (!disabled) setOpen((current) => !current);
        }}
      />
      {open && !disabled && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.quoteColourMenu} style={menuStyle}>
              {visibleOptions.length ? (
                visibleOptions.map((option) => (
                  <button
                    className={styles.quoteColourOption}
                    key={`${option.label}-${option.src}`}
                    type="button"
                    onMouseDown={() => choose(option)}
                  >
                    <span className={styles.quoteOptionThumb}>
                      <img alt="" src={option.src} />
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
}

function QuoteColourCombobox({ disabled = false, line, onChange }) {
  const [databaseOptions, setDatabaseOptions] = useState(null);
  const options = databaseOptions || [];

  useEffect(() => {
    let cancelled = false;

    async function loadDatabaseColours() {
      setDatabaseOptions(null);
      if (!line.material || !line.thickness) return;

      try {
        const response = await fetch(`/api/colour-library?material=${encodeURIComponent(line.material)}&thickness=${encodeURIComponent(line.thickness)}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!cancelled) {
          setDatabaseOptions(payload?.colourFamily?.groups?.length ? optionsFromColourFamily(payload.colourFamily) : []);
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
      onChange={(option) => onChange({ colour: option.name || option.label, finish: option.finish || "" })}
    />
  );
}

export default function QuoteEditor({ quoteId }) {
  const fileInputRef = useRef(null);
  const [activeSection, setActiveSection] = useState("details");
  const [form, setForm] = useState(emptyForm);
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [editableLineIndex, setEditableLineIndex] = useState(null);
  const [activeCabinetLineIndex, setActiveCabinetLineIndex] = useState(null);
  const [hingeModal, setHingeModal] = useState(null);
  const [profileModal, setProfileModal] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingCabinetPdf, setIsGeneratingCabinetPdf] = useState(false);
  const [publishEmail, setPublishEmail] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [businessDefaults, setBusinessDefaults] = useState(DEFAULT_BUSINESS_DEFAULTS);

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

  async function loadBusinessDefaults() {
    try {
      const response = await fetch("/api/admin/business-defaults", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) return;
      const nextDefaults = { ...DEFAULT_BUSINESS_DEFAULTS, ...payload.defaults };
      setBusinessDefaults(nextDefaults);
      setForm((current) => ({
        ...current,
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

  function updateLine(index, field, value) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, [field]: value } : line)),
    }));
  }

  function openHingeModal(index) {
    const line = form.lines[index];
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
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === hingeModal.lineIndex
          ? {
              ...line,
              hinge_holes: Boolean(hingeModal.hinge_holes),
              hinge_supply: Boolean(hingeModal.hinge_supply),
              hinge_qty: hasRequirements ? hingeModal.hinge_qty : "",
            }
          : line
      ),
    }));
    setHingeModal(null);
  }

  function openProfileModal(index) {
    const line = form.lines[index];
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
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === profileModal.lineIndex
          ? {
              ...line,
              profile_type: profileModal.profile_type,
              profile: profileModal.profile,
            }
          : line
      ),
    }));
    setProfileModal(null);
  }

  function updateProductLine(index, patch) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
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

        return next;
      }),
    }));
  }

  async function editLine(index) {
    if (editableLineIndex !== null && editableLineIndex !== index) {
      const saved = await saveQuote();
      if (!saved) return;
    }
    setEditableLineIndex(index);
    setActiveSection("items");
  }

  async function saveLine() {
    const saved = await saveQuote();
    if (saved) {
      setEditableLineIndex(null);
      setActiveCabinetLineIndex(null);
    }
  }

  async function addLine() {
    if (editableLineIndex !== null) {
      const saved = await saveQuote();
      if (!saved) return;
    }
    const nextIndex = form.lines.length;
    setForm((current) => ({ ...current, lines: [...current.lines, emptyLineWithDefaults(businessDefaults)] }));
    setEditableLineIndex(nextIndex);
    setActiveSection("items");
  }

  async function removeLine(index) {
    if (editableLineIndex !== null && editableLineIndex !== index) {
      const saved = await saveQuote();
      if (!saved) return;
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
    setActiveCabinetLineIndex((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  }

  async function saveQuote(eventOrForm) {
    const nextForm = eventOrForm && typeof eventOrForm.preventDefault === "function" ? form : eventOrForm || form;
    if (eventOrForm && typeof eventOrForm.preventDefault === "function") {
      eventOrForm.preventDefault();
    }
    setIsSaving(true);
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextForm),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not save quote.");
        return false;
      }
      setForm(formFromQuote(payload.quote));
      setFeedback("Quote saved.");
      await loadCustomers();
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
    const saved = await saveQuote(nextForm);
    if (saved) {
      setEditableLineIndex(null);
      setActiveCabinetLineIndex(null);
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

  function renderDetails() {
    return (
      <div className={styles.quoteInfoSection}>
        <div className={styles.quoteInfoGrid}>
          <Field label="Quote title">
            <input className={styles.fieldInput} value={form.title} onChange={(event) => updateForm("title", event.target.value)} />
          </Field>
          <Field label="Status">
            <select className={styles.fieldInput} value={form.status} onChange={(event) => updateForm("status", event.target.value)}>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </Field>
          <div className={styles.quoteInfoActionField}>
            <Field label="Customer">
              <select className={styles.fieldInput} value={form.customer_id || ""} onChange={(event) => applyCustomer(event.target.value)}>
                <option value="">Manual / new customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}{customer.email ? ` - ${customer.email}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <button type="button" className={styles.secondaryButton} onClick={openCustomerModal}>
              Create new customer
            </button>
          </div>
          <Field label="Job / order reference">
            <input className={styles.fieldInput} value={form.project_name} onChange={(event) => updateForm("project_name", event.target.value)} />
          </Field>
          <Field label="Contact name">
            <input className={styles.fieldInput} value={form.customer_name} onChange={(event) => updateForm("customer_name", event.target.value)} />
          </Field>
          <Field label="Contact email">
            <input className={styles.fieldInput} type="email" value={form.customer_email} onChange={(event) => updateForm("customer_email", event.target.value)} />
          </Field>
          <Field label="Contact phone">
            <input className={styles.fieldInput} value={form.customer_phone} onChange={(event) => updateForm("customer_phone", event.target.value)} />
          </Field>
          <Field label="Site / delivery address">
            <input className={styles.fieldInput} value={form.site_address} onChange={(event) => updateForm("site_address", event.target.value)} />
          </Field>
        </div>
        <div className={styles.quoteInfoFooter}>
          <button type="submit" className={styles.primaryButton} disabled={isSaving || isLoading}>
            {isSaving ? "Saving..." : "Save information"}
          </button>
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
        <div className={styles.quoteSectionActions}>
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
                      <td><span className={styles.quoteItemRowNum}>{index + 1}</span></td>
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
                      <td>
                        <button
                          type="button"
                          className={styles.rowEditButton}
                          onClick={() => setActiveCabinetLineIndex(index)}
                        >
                          Configure
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.placeholderText}>
            No base cabinets yet. Add a line item with type Base cabinet first.
          </div>
        )}
      </div>
    );
  }

  function renderItems() {
    return (
      <div className={styles.quoteItemsAdminWrap}>
        <div className={styles.quoteSectionActions}>
          <button type="button" className={styles.secondaryButton} onClick={addLine}>+ Add line item</button>
        </div>
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
            <div>Profile config</div>
            <div>Hinge config</div>
            <div>Unit cost</div>
            <div>Markup %</div>
            <div>Unit + markup</div>
            <div>Total ex GST</div>
            <div>Actions</div>
          </div>
          {form.lines.map((line, index) => {
            const isEditable = editableLineIndex === index;
            const calculated = calculateQuoteLine(line, businessDefaults);
            const materialOptions = MATERIALS_BY_TYPE[line.product_type] || MATERIAL_OPTIONS;
            const thicknessOptions = thicknessOptionsForMaterial(line.material);
            const edgeProfiles = edgeProfilesForMaterial(line.material);
            const showEdges = edgeProfiles.length > 0;
            const showProfiles = line.material === "Thermolaminate";
            const edgeOptions = edgeProfiles.map((edge) => ({
              name: edge,
              label: edge,
              meta: "Edge profile",
              src: edgeOptionSrc(edge),
            }));
            const hingesApplicable = line.product_type === "Door";
            const colourSrc = colourSrcForLine(line);
            const isBaseCabinet = isBaseCabinetLine(line);
            const isBaseCabinetEditable = isEditable && isBaseCabinet;
            return (
              <div className={styles.quoteItemBlock} key={line.id || index}>
              <div className={`${styles.quoteItemGrid} ${styles.quoteItemRow} ${isEditable ? styles.quoteItemRowEditing : styles.quoteItemRowLocked}`}>
                <div><span className={styles.quoteItemRowNum}>{index + 1}</span></div>
                {isEditable ? (
                  <>
                    <div className={styles.quoteItemField}>
                      <select value={line.product_type} onChange={(event) => updateProductLine(index, { product_type: event.target.value })}>
                        <option value="" disabled>Type</option>
                        {quoteProductTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </div>
                    <div className={styles.quoteItemField}>
                      <select value={line.material} onChange={(event) => updateProductLine(index, { material: event.target.value })}>
                        <option value="" disabled>Material</option>
                        {materialOptions.map((material) => <option key={material}>{material}</option>)}
                      </select>
                    </div>
                    <div className={styles.quoteItemField}>
                      <select disabled={!line.material || isBaseCabinetEditable} value={line.thickness} onChange={(event) => updateProductLine(index, { thickness: event.target.value })}>
                        <option value="" disabled>{line.material ? "Thickness" : "Select material first"}</option>
                        {thicknessOptions.map((thickness) => <option key={thickness}>{thickness}</option>)}
                      </select>
                    </div>
                    <div className={styles.quoteItemSize}>
                      <input disabled={isBaseCabinetEditable} min="1" type="number" placeholder="W" value={line.width_mm} onChange={(event) => updateLine(index, "width_mm", event.target.value)} />
                      <input disabled={isBaseCabinetEditable} min="1" type="number" placeholder="H" value={line.height_mm} onChange={(event) => updateLine(index, "height_mm", event.target.value)} />
                    </div>
                    <div className={styles.quoteItemField}>
                      <QuoteColourCombobox line={line} onChange={(patch) => updateProductLine(index, patch)} />
                    </div>
                    <div className={styles.quoteItemField}>
                      <input min="1" type="number" value={line.qty} onChange={(event) => updateLine(index, "qty", event.target.value)} />
                    </div>
                    <div className={styles.quoteItemField}>
                      {isBaseCabinetEditable ? <span className={styles.notApplicable}>Configured in cabinet tab</span> : showEdges ? (
                        <QuoteImageCombobox
                          placeholder="Edge"
                          value={line.edge_mould}
                          options={edgeOptions}
                          onChange={(option) => updateLine(index, "edge_mould", option.name || option.label)}
                        />
                      ) : <span className={styles.notApplicable}>N/A</span>}
                    </div>
                    <div className={styles.quoteProfileConfigCell}>
                      {showProfiles && hasProfileConfig(line) ? (
                        <>
                          <span className={styles.quoteProfileSummary}>
                            {profileConfigLines(line).map((detail) => <small key={detail}>{detail}</small>)}
                          </span>
                          <button
                            type="button"
                            className={styles.quoteProfileBareEditButton}
                            onClick={() => openProfileModal(index)}
                            disabled={isBaseCabinetEditable}
                            aria-label={`Edit profile for quote line ${index + 1}`}
                            title="Edit profile"
                          >
                            Edit
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.quoteProfileEditButton}
                          onClick={() => openProfileModal(index)}
                          disabled={isBaseCabinetEditable || !showProfiles}
                        >
                          Edit Profile
                        </button>
                      )}
                    </div>
                    <div className={styles.quoteHingeConfigCell}>
                      {hingesApplicable && hasHingeConfig(line) ? (
                        <>
                          <span className={styles.quoteHingeSummary}>
                            {hingeConfigLines(line).map((detail) => <small key={detail}>{detail}</small>)}
                          </span>
                          <button
                            type="button"
                            className={styles.quoteHingeBareEditButton}
                            onClick={() => openHingeModal(index)}
                            disabled={isBaseCabinetEditable}
                            aria-label={`Edit hinges for quote line ${index + 1}`}
                            title="Edit hinges"
                          >
                            Edit
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.quoteHingeEditButton}
                          onClick={() => openHingeModal(index)}
                          disabled={isBaseCabinetEditable || !hingesApplicable}
                        >
                          Edit Hinges
                        </button>
                      )}
                    </div>
                    <div className={`${styles.quoteItemField} ${styles.quoteMoneyInput}`}>
                      <span>$</span>
                      <input disabled={isBaseCabinetEditable} type="text" inputMode="decimal" placeholder="0.00" value={line.product_unit_cost_ex_gst} onChange={(event) => updateLine(index, "product_unit_cost_ex_gst", event.target.value)} />
                    </div>
                    <div className={`${styles.quoteItemField} ${styles.quoteMarkupInput}`}>
                      <input type="number" min="0" step="0.01" value={line.markup_percent} onChange={(event) => updateLine(index, "markup_percent", event.target.value)} />
                      <span>%</span>
                    </div>
                    <div className={styles.quoteItemTotal}>{formatMoney(calculated.unit_price_ex_gst, form.currency)}</div>
                    <div className={styles.quoteItemTotal}>{formatMoney(calculated.line_total_ex_gst, form.currency)}</div>
                    <div className={styles.quoteItemActions}>
                      <button
                        type="button"
                        className={`${styles.rowEditButton} ${styles.rowIconButton} ${styles.rowSaveIconButton}`}
                        onClick={saveLine}
                        disabled={isSaving}
                        aria-label={`Save quote line ${index + 1}`}
                        title="Save"
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        className={`${styles.rowDeleteButton} ${styles.rowIconButton} ${styles.rowDeleteIconButton}`}
                        onClick={() => removeLine(index)}
                        disabled={isSaving}
                        aria-label={`Delete quote line ${index + 1}`}
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.quoteReadCell}>{lineValue(displayProductType(line.product_type))}</div>
                    <div className={styles.quoteReadCell}>{lineValue(line.material)}</div>
                    <div className={styles.quoteReadCell}>{lineValue(line.thickness)}</div>
                    <div className={styles.quoteReadCell}>{lineValue(quoteLineSizeText(line))}</div>
                    <div className={styles.quoteColourRead}>
                      {colourSrc ? <img alt="" src={colourSrc} /> : null}
                      <span className={styles.quoteColourReadText}>
                        <strong>{lineValue(line.colour)}</strong>
                        {line.finish ? <small>{line.finish}</small> : null}
                      </span>
                    </div>
                    <div className={styles.quoteReadCell}>{line.qty || "1"}</div>
                    <div className={styles.quoteReadCell}>{lineValue(line.edge_mould)}</div>
                    <div className={styles.quoteProfileConfigCell}>
                      {showProfiles && hasProfileConfig(line) ? (
                        <>
                          <span className={styles.quoteProfileSummary}>
                            {profileConfigLines(line).map((detail) => <small key={detail}>{detail}</small>)}
                          </span>
                          <button
                            type="button"
                            className={styles.quoteProfileBareEditButton}
                            onClick={() => openProfileModal(index)}
                            aria-label={`Edit profile for quote line ${index + 1}`}
                            title="Edit profile"
                          >
                            Edit
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.quoteProfileEditButton}
                          onClick={() => openProfileModal(index)}
                          disabled={!showProfiles}
                        >
                          Edit Profile
                        </button>
                      )}
                    </div>
                    <div className={styles.quoteHingeConfigCell}>
                      {hingesApplicable && hasHingeConfig(line) ? (
                        <>
                          <span className={styles.quoteHingeSummary}>
                            {hingeConfigLines(line).map((detail) => <small key={detail}>{detail}</small>)}
                          </span>
                          <button
                            type="button"
                            className={styles.quoteHingeBareEditButton}
                            onClick={() => openHingeModal(index)}
                            aria-label={`Edit hinges for quote line ${index + 1}`}
                            title="Edit hinges"
                          >
                            Edit
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.quoteHingeEditButton}
                          onClick={() => openHingeModal(index)}
                          disabled={!hingesApplicable}
                        >
                          Edit Hinges
                        </button>
                      )}
                    </div>
                    <div className={styles.quoteReadCell}>{formatMoney(line.product_unit_cost_ex_gst || 0, form.currency)}</div>
                    <div className={styles.quoteReadCell}>{line.markup_percent ?? businessDefaults.markup_percent}%</div>
                    <div className={styles.quoteItemTotal}>{formatMoney(calculated.unit_price_ex_gst, form.currency)}</div>
                    <div className={styles.quoteItemTotal}>{formatMoney(calculated.line_total_ex_gst, form.currency)}</div>
                    <div className={styles.quoteItemActions}>
                      <button
                        type="button"
                        className={`${styles.rowEditButton} ${styles.rowIconButton} ${styles.rowEditIconButton}`}
                        onClick={() => editLine(index)}
                        disabled={isSaving}
                        aria-label={`Edit quote line ${index + 1}`}
                        title="Edit"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`${styles.rowDeleteButton} ${styles.rowIconButton} ${styles.rowDeleteIconButton}`}
                        onClick={() => removeLine(index)}
                        disabled={isSaving}
                        aria-label={`Delete quote line ${index + 1}`}
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderNotes() {
    return (
      <div className={styles.quoteNotesGrid}>
        <Field label="Client notes"><textarea className={styles.textareaInput} rows={5} value={form.client_notes} onChange={(event) => updateForm("client_notes", event.target.value)} /></Field>
        <Field label="Internal / quote notes"><textarea className={styles.textareaInput} rows={5} value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} /></Field>
        <Field label="Assumptions"><textarea className={styles.textareaInput} rows={4} value={form.assumptions} onChange={(event) => updateForm("assumptions", event.target.value)} /></Field>
        <Field label="Exclusions"><textarea className={styles.textareaInput} rows={4} value={form.exclusions} onChange={(event) => updateForm("exclusions", event.target.value)} /></Field>
        <Field label="Terms" wide><textarea className={styles.textareaInput} rows={4} value={form.terms} onChange={(event) => updateForm("terms", event.target.value)} /></Field>
      </div>
    );
  }

  function renderCosts() {
    return (
      <div className={styles.quoteCostsLayout}>
        <div className={styles.quoteBuilderGrid}>
          <Field label="Labour hours">
            <input className={styles.fieldInput} type="number" step="0.01" value={form.labour_hours} onChange={(event) => updateForm("labour_hours", event.target.value)} />
          </Field>
          <Field label="Worker hourly rate">
            <input className={styles.fieldInput} type="number" step="0.01" value={form.worker_hourly_rate} onChange={(event) => updateForm("worker_hourly_rate", event.target.value)} />
          </Field>
          <Field label="Travel cost ex GST">
            <input className={styles.fieldInput} type="number" step="0.01" value={form.travel_cost_ex_gst} onChange={(event) => updateForm("travel_cost_ex_gst", event.target.value)} />
          </Field>
          <Field label="Delivery cost ex GST">
            <input className={styles.fieldInput} type="number" step="0.01" value={form.delivery_cost_ex_gst} onChange={(event) => updateForm("delivery_cost_ex_gst", event.target.value)} />
          </Field>
          <Field label="Consumables ex GST">
            <input className={styles.fieldInput} type="number" step="0.01" value={form.installation_cost_ex_gst} onChange={(event) => updateForm("installation_cost_ex_gst", event.target.value)} />
          </Field>
        </div>
        <div className={styles.quoteTotalsPanel}>
          <div><span>Product lines</span><strong>{formatMoney(totals.product_lines_cost_ex_gst, form.currency)}</strong></div>
          <div><span>Hinge hole drilling ({totals.hinge_drilling_qty || 0})</span><strong>{formatMoney(totals.hinge_drilling_cost_ex_gst, form.currency)}</strong></div>
          <div><span>Hinge supply ({totals.hinge_supply_qty || 0})</span><strong>{formatMoney(totals.hinge_supply_cost_ex_gst, form.currency)}</strong></div>
          <div><span>Labour</span><strong>{formatMoney(totals.labour_cost_ex_gst, form.currency)}</strong></div>
          <div><span>Travel</span><strong>{formatMoney(totals.travel_cost_ex_gst, form.currency)}</strong></div>
          <div><span>Delivery</span><strong>{formatMoney(totals.delivery_cost_ex_gst, form.currency)}</strong></div>
          <div><span>Consumables</span><strong>{formatMoney(totals.installation_cost_ex_gst, form.currency)}</strong></div>
          <div className={styles.quoteMarkupProfitRow}><span>Line markups (Profit)</span><strong>{formatMoney(totals.markup_amount_ex_gst, form.currency)}</strong></div>
        </div>
      </div>
    );
  }

  function renderTotals() {
    return (
      <div className={styles.quoteTotalsLayout}>
        <div className={styles.quoteTotalsSummary}>
          <details className={styles.quoteTotalGroup}>
            <summary>
              <span><strong>Products and hardware</strong><small>Product lines, per-line markup, drilling, and hinge supply.</small></span>
              <strong>{formatMoney(totals.material_cost_ex_gst, form.currency)}</strong>
            </summary>
            <div className={styles.quoteTotalGroupBody}>
              <div><span>Product lines</span><strong>{formatMoney(totals.product_lines_cost_ex_gst, form.currency)}</strong></div>
              <div><span>Line markups</span><strong>{formatMoney(totals.markup_amount_ex_gst, form.currency)}</strong></div>
              <div><span>Hinge hole drilling ({totals.hinge_drilling_qty || 0})</span><strong>{formatMoney(totals.hinge_drilling_cost_ex_gst, form.currency)}</strong></div>
              <div><span>Hinge supply ({totals.hinge_supply_qty || 0})</span><strong>{formatMoney(totals.hinge_supply_cost_ex_gst, form.currency)}</strong></div>
            </div>
          </details>
          <details className={styles.quoteTotalGroup}>
            <summary>
              <span><strong>Labour</strong><small>Workshop or job labour calculated from hours and hourly rate.</small></span>
              <strong>{formatMoney(totals.labour_cost_ex_gst, form.currency)}</strong>
            </summary>
            <div className={styles.quoteTotalGroupBody}>
              <div><span>Labour hours</span><strong>{totals.labour_hours || 0}</strong></div>
              <div><span>Hourly rate</span><strong>{formatMoney(totals.worker_hourly_rate, form.currency)}</strong></div>
              <div><span>Labour total</span><strong>{formatMoney(totals.labour_cost_ex_gst, form.currency)}</strong></div>
            </div>
          </details>
          <details className={styles.quoteTotalGroup}>
            <summary>
              <span><strong>Logistics and consumables</strong><small>Travel, delivery, and small materials such as glue or screws.</small></span>
              <strong>{formatMoney(totals.travel_cost_ex_gst + totals.delivery_cost_ex_gst + totals.installation_cost_ex_gst, form.currency)}</strong>
            </summary>
            <div className={styles.quoteTotalGroupBody}>
              <div><span>Travel</span><strong>{formatMoney(totals.travel_cost_ex_gst, form.currency)}</strong></div>
              <div><span>Delivery</span><strong>{formatMoney(totals.delivery_cost_ex_gst, form.currency)}</strong></div>
              <div><span>Consumables</span><strong>{formatMoney(totals.installation_cost_ex_gst, form.currency)}</strong></div>
            </div>
          </details>
          <div className={styles.quoteGrandTotalPanel}>
            <div><span>Subtotal ex GST</span><strong>{formatMoney(totals.subtotal_ex_gst, form.currency)}</strong></div>
            <div><span>GST</span><strong>{formatMoney(totals.gst_amount, form.currency)}</strong></div>
            <div><span>Total inc GST</span><strong>{formatMoney(totals.total_inc_gst, form.currency)}</strong></div>
          </div>
        </div>
        <div className={styles.quoteBuilderGrid}>
          <Field label="Currency"><input className={styles.fieldInput} value={form.currency} onChange={(event) => updateForm("currency", event.target.value.toUpperCase())} /></Field>
          <Field label="GST rate"><input className={styles.fieldInput} type="number" step="0.01" value={form.gst_rate} onChange={(event) => updateForm("gst_rate", event.target.value)} /></Field>
        </div>
      </div>
    );
  }

  function renderAttachments() {
    return (
      <div className={styles.quoteAttachmentsSection}>
        <div className={styles.quoteSectionActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={generateCabinetDrawingsAttachment}
            disabled={isGeneratingCabinetPdf || isUploading}
          >
            {isGeneratingCabinetPdf ? "Generating cabinet PDF..." : "Generate cabinet PDF"}
          </button>
        </div>
        <label className={styles.fieldLabel}>
          Upload attachments
          <div className={styles.attachmentUploadRow}>
            <input ref={fileInputRef} className={styles.fieldInput} type="file" multiple onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))} />
            <button type="button" className={styles.primaryButton} onClick={uploadAttachments} disabled={isUploading}>
              {isUploading ? "Uploading..." : "Upload attachments"}
            </button>
          </div>
        </label>
        <div className={styles.productsTableWrap}>
          <table className={`${styles.productsTable} ${styles.quoteAttachmentsTable}`}>
            <thead><tr><th>File</th><th>Type</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr></thead>
            <tbody>
              {attachmentPagination.pageItems.map((attachment) => (
                <tr key={attachment.id}>
                  <td>{attachment.file_name}</td>
                  <td>{attachment.file_type || "File"}</td>
                  <td>{formatFileSize(attachment.file_size)}</td>
                  <td>{attachment.created_at ? new Date(attachment.created_at).toLocaleString("en-AU") : "-"}</td>
                  <td className={styles.rowActions}>
                    <a className={styles.rowEditButton} href={attachment.file_url} target="_blank" rel="noreferrer">View</a>
                    <button
                      type="button"
                      className={`${styles.rowDeleteButton} ${styles.rowIconButton} ${styles.rowDeleteIconButton}`}
                      onClick={() => deleteAttachment(attachment)}
                      aria-label={`Delete ${attachment.file_name}`}
                      title="Delete"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!form.attachments.length ? <tr><td colSpan="5" className={styles.emptyCell}>No attachments yet.</td></tr> : null}
            </tbody>
          </table>
          <AdminTablePagination
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

  return (
    <>
      <form className={styles.quoteBuilderFrame} onSubmit={saveQuote}>
        <section className={styles.quoteBuilderPanel}>
          <header className={styles.quoteBuilderPanelHeader}>
            <div className={styles.quoteBuilderHeaderTop}>
              <div>
                <p className={styles.tableMeta}>Quote section</p>
                <h1>{activeLabel}</h1>
                <p className={styles.helperText}>
                  <Link href="/admin/quotes">Quotes</Link> / {form.quote_number || "Draft quote"}
                </p>
              </div>
              <div className={styles.editorTopActions}>
                {publicUrl ? <a className={styles.secondaryButton} href={publicUrl} target="_blank" rel="noreferrer">View public quote</a> : null}
                <button type="button" className={styles.primaryButton} onClick={publishQuote} disabled={isSaving || isLoading}>
                  Publish quote
                </button>
                <button type="submit" className={styles.secondaryButton} disabled={isSaving || isLoading}>
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
            <nav className={styles.quoteBuilderTabs} aria-label="Quote builder sections">
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
            {isLoading ? <div className={styles.placeholderText}>Loading quote...</div> : renderActiveSection()}
            {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
            {form.order_id ? <div className={styles.inlineNotice}>This quote has been approved and converted to an order.</div> : null}
          </div>
        </section>
      </form>
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
      {profileModal && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="profile-config-title">
              <div className={`${styles.customerModal} ${styles.profileConfigModal}`}>
                <div className={styles.customerModalHeader}>
                  <span className={styles.customerModalIcon}>PR</span>
                  <div>
                    <p className={styles.tableMeta}>Line item profile</p>
                    <h2 id="profile-config-title">Edit Profile</h2>
                  </div>
                </div>
                <div className={styles.customerModalBody}>
                  <div className={styles.profileConfigForm}>
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
              <div className={`${styles.customerModal} ${styles.hingeConfigModal}`}>
                <div className={styles.customerModalHeader}>
                  <span className={styles.customerModalIcon}>HN</span>
                  <div>
                    <p className={styles.tableMeta}>Line item hinges</p>
                    <h2 id="hinge-config-title">Edit Hinges</h2>
                  </div>
                </div>
                <div className={styles.customerModalBody}>
                  <div className={styles.hingeConfigForm}>
                    <label className={styles.hingeConfigToggle}>
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
                    <label className={styles.hingeConfigToggle}>
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
                        <option value="">Per door</option>
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
