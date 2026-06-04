"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";
import { optionsFromColourFamily } from "../../../../lib/pcd-colour-library";
import { calculateQuoteLine, calculateQuoteTotals, formatMoney, GST_RATE } from "../../../../lib/pcd-quote-utils";
import {
  EDGE_PROFILES,
  MATERIALS_BY_TYPE,
  PRODUCT_TYPES,
  PROFILE_NAMES_BY_TYPE,
  PROFILE_TYPES,
  colourOptionsForMaterial,
} from "../../../request-quote/quote-form-data";
import styles from "../../admin-shell.module.css";

const sections = [
  { key: "details", label: "Information & Contacts" },
  { key: "items", label: "Quote Items" },
  { key: "costs", label: "Costs & Markup" },
  { key: "totals", label: "Quote Totals" },
  { key: "notes", label: "Notes" },
  { key: "attachments", label: "Attachments" },
];

const emptyLine = {
  product_type: "",
  product_name: "",
  material: "",
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
  markup_percent: 40,
  notes: "",
};

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
  worker_hourly_rate: 85,
  travel_cost_ex_gst: "",
  delivery_cost_ex_gst: "",
  installation_cost_ex_gst: "",
  other_cost_ex_gst: 0,
  markup_percent: 0,
  markup_amount_ex_gst: 0,
  notes: "",
  client_notes: "",
  assumptions: "",
  exclusions: "",
  terms: "Prices are valid for 14 days. Final measurements and site conditions may affect the final invoice.",
  lines: [{ ...emptyLine }],
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
      product_type: line.product_type ?? "",
      material: line.material ?? "",
      width_mm: line.width_mm ?? "",
      height_mm: line.height_mm ?? "",
      profile_type: line.profile_type ?? "",
      hinge_holes: Boolean(line.hinge_holes),
      hinge_supply: Boolean(line.hinge_supply),
      hinge_qty: line.hinge_qty ?? "",
      product_unit_cost_ex_gst: line.product_unit_cost_ex_gst ?? "",
      markup_percent: line.markup_percent ?? 40,
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
    worker_hourly_rate: quote.worker_hourly_rate ?? 85,
    travel_cost_ex_gst: quote.travel_cost_ex_gst ?? "",
    delivery_cost_ex_gst: quote.delivery_cost_ex_gst ?? "",
    installation_cost_ex_gst: quote.installation_cost_ex_gst ?? "",
    other_cost_ex_gst: 0,
    markup_percent: quote.markup_percent ?? 0,
    markup_amount_ex_gst: quote.markup_amount_ex_gst ?? 0,
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

function colourSrcForLine(line) {
  const options = colourOptionsForMaterial(line.material);
  return options.find((option) => option.name === line.colour || option.label === line.colour)?.src || "";
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
      setMenuStyle({
        left: `${rect.left}px`,
        top: `${rect.bottom + 4}px`,
        width: `${Math.max(rect.width, 320)}px`,
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
                      <small>{option.finish || option.meta || ""}</small>
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
  const fallbackOptions = useMemo(() => colourOptionsForMaterial(line.material), [line.material]);
  const options = databaseOptions?.length ? databaseOptions : fallbackOptions;

  useEffect(() => {
    let cancelled = false;

    async function loadDatabaseColours() {
      setDatabaseOptions(null);
      if (!line.material) return;

      try {
        const response = await fetch(`/api/colour-library?material=${encodeURIComponent(line.material)}`);
        const payload = await response.json();
        if (!cancelled && payload?.colourFamily?.groups?.length) {
          setDatabaseOptions(optionsFromColourFamily(payload.colourFamily));
        }
      } catch (error) {
        if (!cancelled) setDatabaseOptions(null);
      }
    }

    loadDatabaseColours();
    return () => {
      cancelled = true;
    };
  }, [line.material]);

  return (
    <QuoteImageCombobox
      disabled={disabled || !line.material}
      placeholder={line.material ? "Colour" : "Select material first"}
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [feedback, setFeedback] = useState("");

  const totals = useMemo(
    () => calculateQuoteTotals(form.lines, form.gst_rate, form),
    [
      form.lines,
      form.gst_rate,
      form.labour_hours,
      form.worker_hourly_rate,
      form.travel_cost_ex_gst,
      form.delivery_cost_ex_gst,
      form.installation_cost_ex_gst,
    ]
  );
  const publicUrl =
    typeof window !== "undefined" && form.access_code
      ? `${window.location.origin}/quotes/view?code=${form.access_code}`
      : "";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

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

  function updateProductLine(index, patch) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const next = { ...line, ...patch };

        if (Object.prototype.hasOwnProperty.call(patch, "product_type")) {
          next.product_name = patch.product_type || "";
          next.material = "";
          next.finish = "";
          next.colour = "";
          next.profile_type = "";
          next.profile = "";
          next.edge_mould = "";
          if (patch.product_type !== "Door") {
            next.hinge_holes = false;
            next.hinge_supply = false;
            next.hinge_qty = "";
          }
        }

        if (Object.prototype.hasOwnProperty.call(patch, "material")) {
          next.finish = "";
          next.colour = "";
          if (patch.material !== "Thermolaminate") {
            next.profile_type = "";
            next.profile = "";
          }
        }

        if (Object.prototype.hasOwnProperty.call(patch, "profile_type")) {
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
    if (saved) setEditableLineIndex(null);
  }

  async function addLine() {
    if (editableLineIndex !== null) {
      const saved = await saveQuote();
      if (!saved) return;
    }
    const nextIndex = form.lines.length;
    setForm((current) => ({ ...current, lines: [...current.lines, { ...emptyLine }] }));
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
  }

  async function saveQuote(event) {
    event?.preventDefault();
    setIsSaving(true);
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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

  async function publishQuote() {
    setIsSaving(true);
    setFeedback("");
    try {
      const saved = await saveQuote();
      if (!saved) return;
      const response = await fetch(`/api/admin/quotes/${quoteId}/send`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not publish quote.");
        return;
      }
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
            <div>Actions</div>
          </div>
          {form.lines.map((line, index) => {
            const isEditable = editableLineIndex === index;
            const calculated = calculateQuoteLine(line);
            const materialOptions = MATERIALS_BY_TYPE[line.product_type] || [];
            const showProfiles = line.material === "Thermolaminate" && line.product_type !== "Panel" && line.product_type !== "Table top";
            const profileNames = PROFILE_NAMES_BY_TYPE[line.profile_type] || [];
            const edgeOptions = EDGE_PROFILES.map((edge) => ({
              name: edge,
              label: edge,
              meta: "Edge profile",
              src: edgeOptionSrc(edge),
            }));
            const profileOptions = profileNames.map((profile) => ({
              name: profile,
              label: profile,
              meta: line.profile_type || "Profile",
              src: profileOptionSrc(line.profile_type, profile),
            }));
            const hingesApplicable = line.product_type === "Door";
            const colourSrc = colourSrcForLine(line);
            return (
              <div className={`${styles.quoteItemGrid} ${styles.quoteItemRow} ${isEditable ? styles.quoteItemRowEditing : styles.quoteItemRowLocked}`} key={index}>
                <div><span className={styles.quoteItemRowNum}>{index + 1}</span></div>
                {isEditable ? (
                  <>
                    <div className={styles.quoteItemField}>
                      <select value={line.product_type} onChange={(event) => updateProductLine(index, { product_type: event.target.value })}>
                        <option value="" disabled>Type</option>
                        {PRODUCT_TYPES.map((type) => <option key={type}>{type}</option>)}
                      </select>
                    </div>
                    <div className={styles.quoteItemField}>
                      <select disabled={!line.product_type} value={line.material} onChange={(event) => updateProductLine(index, { material: event.target.value })}>
                        <option value="" disabled>{line.product_type ? "Material" : "Select type first"}</option>
                        {materialOptions.map((material) => <option key={material}>{material}</option>)}
                      </select>
                    </div>
                    <div className={styles.quoteItemSize}>
                      <input min="1" type="number" placeholder="W" value={line.width_mm} onChange={(event) => updateLine(index, "width_mm", event.target.value)} />
                      <input min="1" type="number" placeholder="H" value={line.height_mm} onChange={(event) => updateLine(index, "height_mm", event.target.value)} />
                    </div>
                    <div className={styles.quoteItemField}>
                      <QuoteColourCombobox line={line} onChange={(patch) => updateProductLine(index, patch)} />
                    </div>
                    <div className={styles.quoteItemField}>
                      <input min="1" type="number" value={line.qty} onChange={(event) => updateLine(index, "qty", event.target.value)} />
                    </div>
                    <div className={styles.quoteItemField}>
                      <QuoteImageCombobox
                        placeholder="Edge"
                        value={line.edge_mould}
                        options={edgeOptions}
                        onChange={(option) => updateLine(index, "edge_mould", option.name || option.label)}
                      />
                    </div>
                    <div className={styles.quoteItemField}>
                      {showProfiles ? (
                        <select value={line.profile_type} onChange={(event) => updateProductLine(index, { profile_type: event.target.value })}>
                          <option value="">Profile type</option>
                          {PROFILE_TYPES.map((type) => <option key={type}>{type}</option>)}
                        </select>
                      ) : <span className={styles.notApplicable}>N/A</span>}
                    </div>
                    <div className={styles.quoteItemField}>
                      {showProfiles ? (
                        <QuoteImageCombobox
                          disabled={!line.profile_type}
                          placeholder={line.profile_type ? "Profile name" : "Select profile type first"}
                          value={line.profile}
                          options={profileOptions}
                          onChange={(option) => updateLine(index, "profile", option.name || option.label)}
                        />
                      ) : <span className={styles.notApplicable}>N/A</span>}
                    </div>
                    <div className={styles.quoteItemCheckCell}>
                      {hingesApplicable ? (
                        <label className={styles.quoteItemCheck}><input checked={line.hinge_holes} type="checkbox" onChange={(event) => updateProductLine(index, { hinge_holes: event.target.checked })} /> Yes</label>
                      ) : <span className={styles.notApplicable}>N/A</span>}
                    </div>
                    <div className={styles.quoteItemCheckCell}>
                      {hingesApplicable ? (
                        <label className={styles.quoteItemCheck}><input checked={line.hinge_supply} type="checkbox" onChange={(event) => updateProductLine(index, { hinge_supply: event.target.checked })} /> Yes</label>
                      ) : <span className={styles.notApplicable}>N/A</span>}
                    </div>
                    <div className={styles.quoteItemField}>
                      {hingesApplicable && (line.hinge_supply || line.hinge_holes) ? (
                        <select value={line.hinge_qty} onChange={(event) => updateLine(index, "hinge_qty", event.target.value)}>
                          <option value="">Per door</option>
                          <option>2 hinges</option>
                          <option>3 hinges</option>
                          <option>4 hinges</option>
                        </select>
                      ) : <span className={styles.notApplicable}>N/A</span>}
                    </div>
                    <div className={`${styles.quoteItemField} ${styles.quoteMoneyInput}`}>
                      <span>$</span>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={line.product_unit_cost_ex_gst} onChange={(event) => updateLine(index, "product_unit_cost_ex_gst", event.target.value)} />
                    </div>
                    <div className={`${styles.quoteItemField} ${styles.quoteMarkupInput}`}>
                      <input type="number" min="0" step="0.01" value={line.markup_percent} onChange={(event) => updateLine(index, "markup_percent", event.target.value)} />
                      <span>%</span>
                    </div>
                    <div className={styles.quoteItemTotal}>{formatMoney(calculated.unit_price_ex_gst, form.currency)}</div>
                    <div className={styles.quoteItemTotal}>{formatMoney(calculated.line_total_ex_gst, form.currency)}</div>
                    <div className={styles.quoteItemActions}>
                      <button type="button" className={styles.rowEditButton} onClick={saveLine} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                      <button type="button" className={styles.rowDeleteButton} onClick={() => removeLine(index)} disabled={isSaving}>Delete</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.quoteReadCell}>{lineValue(line.product_type)}</div>
                    <div className={styles.quoteReadCell}>{lineValue(line.material)}</div>
                    <div className={styles.quoteReadCell}>{lineValue(quoteLineSizeText(line))}</div>
                    <div className={styles.quoteColourRead}>{colourSrc ? <img alt="" src={colourSrc} /> : null}<span>{lineValue(line.colour)}</span></div>
                    <div className={styles.quoteReadCell}>{line.qty || "1"}</div>
                    <div className={styles.quoteReadCell}>{lineValue(line.edge_mould)}</div>
                    <div className={styles.quoteReadCell}>{showProfiles ? lineValue(line.profile_type) : "N/A"}</div>
                    <div className={styles.quoteReadCell}>{showProfiles ? lineValue(line.profile) : "N/A"}</div>
                    <div className={styles.quoteReadCell}>{hingesApplicable ? line.hinge_holes ? "Yes" : "No" : "N/A"}</div>
                    <div className={styles.quoteReadCell}>{hingesApplicable ? line.hinge_supply ? "Yes" : "No" : "N/A"}</div>
                    <div className={styles.quoteReadCell}>{hingesApplicable && (line.hinge_supply || line.hinge_holes) ? lineValue(line.hinge_qty) : "N/A"}</div>
                    <div className={styles.quoteReadCell}>{formatMoney(line.product_unit_cost_ex_gst || 0, form.currency)}</div>
                    <div className={styles.quoteReadCell}>{line.markup_percent ?? 40}%</div>
                    <div className={styles.quoteItemTotal}>{formatMoney(calculated.unit_price_ex_gst, form.currency)}</div>
                    <div className={styles.quoteItemTotal}>{formatMoney(calculated.line_total_ex_gst, form.currency)}</div>
                    <div className={styles.quoteItemActions}>
                      <button type="button" className={styles.rowEditButton} onClick={() => editLine(index)} disabled={isSaving}>Edit</button>
                      <button type="button" className={styles.rowDeleteButton} onClick={() => removeLine(index)} disabled={isSaving}>Delete</button>
                    </div>
                  </>
                )}
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
          <div><span>Product lines incl. markup</span><strong>{formatMoney(totals.material_cost_ex_gst, form.currency)}</strong></div>
          <div><span>Line markups</span><strong>{formatMoney(totals.markup_amount_ex_gst, form.currency)}</strong></div>
          <div><span>Hinge hole drilling ({totals.hinge_drilling_qty || 0})</span><strong>{formatMoney(totals.hinge_drilling_cost_ex_gst, form.currency)}</strong></div>
          <div><span>Hinge supply ({totals.hinge_supply_qty || 0})</span><strong>{formatMoney(totals.hinge_supply_cost_ex_gst, form.currency)}</strong></div>
          <div><span>Labour</span><strong>{formatMoney(totals.labour_cost_ex_gst, form.currency)}</strong></div>
          <div><span>Travel</span><strong>{formatMoney(totals.travel_cost_ex_gst, form.currency)}</strong></div>
          <div><span>Delivery</span><strong>{formatMoney(totals.delivery_cost_ex_gst, form.currency)}</strong></div>
          <div><span>Consumables</span><strong>{formatMoney(totals.installation_cost_ex_gst, form.currency)}</strong></div>
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
              <span><strong>Products and hardware</strong><small>Line item sell prices, per-line markup, drilling, and hinge supply.</small></span>
              <strong>{formatMoney(totals.material_cost_ex_gst, form.currency)}</strong>
            </summary>
            <div className={styles.quoteTotalGroupBody}>
              <div><span>Product lines incl. markup</span><strong>{formatMoney(totals.material_cost_ex_gst, form.currency)}</strong></div>
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
        <label className={styles.fieldLabel}>
          Upload attachments
          <div className={styles.attachmentUploadRow}>
            <input ref={fileInputRef} className={styles.fieldInput} type="file" multiple onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))} />
            <button type="button" className={styles.primaryButton} onClick={uploadAttachments} disabled={isUploading}>
              {isUploading ? "Uploading..." : "Upload attachments"}
            </button>
          </div>
        </label>
        <table className={`${styles.productsTable} ${styles.quoteAttachmentsTable}`}>
          <thead><tr><th>File</th><th>Type</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr></thead>
          <tbody>
            {form.attachments.map((attachment) => (
              <tr key={attachment.id}>
                <td>{attachment.file_name}</td>
                <td>{attachment.file_type || "File"}</td>
                <td>{formatFileSize(attachment.file_size)}</td>
                <td>{attachment.created_at ? new Date(attachment.created_at).toLocaleString("en-AU") : "-"}</td>
                <td className={styles.rowActions}>
                  <a className={styles.rowEditButton} href={attachment.file_url} target="_blank" rel="noreferrer">View</a>
                  <button type="button" className={styles.rowDeleteButton} onClick={() => deleteAttachment(attachment)}>Delete</button>
                </td>
              </tr>
            ))}
            {!form.attachments.length ? <tr><td colSpan="5" className={styles.emptyCell}>No attachments yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    );
  }

  function renderActiveSection() {
    if (activeSection === "items") return renderItems();
    if (activeSection === "costs") return renderCosts();
    if (activeSection === "notes") return renderNotes();
    if (activeSection === "totals") return renderTotals();
    if (activeSection === "attachments") return renderAttachments();
    return renderDetails();
  }

  const activeLabel = sections.find((section) => section.key === activeSection)?.label || "Information & Contacts";

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
    </>
  );
}
