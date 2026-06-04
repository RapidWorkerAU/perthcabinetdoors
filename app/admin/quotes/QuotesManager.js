"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateQuoteLine, calculateQuoteTotals, formatMoney, GST_RATE } from "../../../lib/pcd-quote-utils";
import styles from "../admin-shell.module.css";

const emptyLine = {
  product_name: "",
  description: "",
  width_mm: "",
  height_mm: "",
  finish: "",
  colour: "",
  profile: "",
  edge_mould: "",
  qty: 1,
  product_unit_cost_ex_gst: "",
  labour_hours: "",
  worker_hourly_rate: 85,
  travel_cost_ex_gst: "",
  delivery_cost_ex_gst: "",
  installation_cost_ex_gst: "",
  other_cost_ex_gst: "",
  markup_percent: 25,
  notes: "",
};

const emptyForm = {
  id: "",
  quote_number: "",
  access_code: "",
  status: "draft",
  title: "Cabinetry Quote",
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  site_address: "",
  project_name: "",
  currency: "AUD",
  gst_rate: GST_RATE,
  notes: "",
  terms: "Prices are valid for 14 days. Final measurements and site conditions may affect the final invoice.",
  lines: [{ ...emptyLine }],
};

function linesFromQuote(quote) {
  return [...(quote?.pcd_quote_line_items || [])]
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((line) => ({
      ...emptyLine,
      ...line,
      width_mm: line.width_mm ?? "",
      height_mm: line.height_mm ?? "",
    }));
}

function formFromQuote(quote) {
  return {
    ...emptyForm,
    ...quote,
    customer_name: quote.customer_name || "",
    customer_email: quote.customer_email || "",
    customer_phone: quote.customer_phone || "",
    site_address: quote.site_address || "",
    project_name: quote.project_name || "",
    notes: quote.notes || "",
    terms: quote.terms || emptyForm.terms,
    lines: linesFromQuote(quote).length ? linesFromQuote(quote) : [{ ...emptyLine }],
  };
}

export default function QuotesManager() {
  const [quotes, setQuotes] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);

  const totals = useMemo(() => calculateQuoteTotals(form.lines, form.gst_rate), [form.lines, form.gst_rate]);
  const selectedQuote = quotes.find((quote) => quote.id === form.id);
  const publicUrl =
    typeof window !== "undefined" && form.access_code
      ? `${window.location.origin}/quotes/view?code=${form.access_code}`
      : "";

  async function loadQuotes() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/quotes", { cache: "no-store" });
      const payload = await response.json();
      setSetupRequired(!!payload.setupRequired);
      setQuotes(payload.quotes || []);
      if (!form.id && payload.quotes?.[0]) {
        setForm(formFromQuote(payload.quotes[0]));
      }
      if (payload.error) {
        setFeedback(payload.error);
      }
    } catch (error) {
      setFeedback(error?.message || "Could not load quotes.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateLine(index, field, value) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, [field]: value } : line)),
    }));
  }

  function addLine() {
    setForm((current) => ({ ...current, lines: [...current.lines, { ...emptyLine }] }));
  }

  function removeLine(index) {
    setForm((current) => ({
      ...current,
      lines: current.lines.length > 1 ? current.lines.filter((_, lineIndex) => lineIndex !== index) : current.lines,
    }));
  }

  async function saveQuote(event) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback("");

    const endpoint = form.id ? `/api/admin/quotes/${form.id}` : "/api/admin/quotes";
    const method = form.id ? "PUT" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not save quote.");
        return;
      }
      setForm(formFromQuote(payload.quote));
      setFeedback("Quote saved.");
      await loadQuotes();
    } catch (error) {
      setFeedback(error?.message || "Could not save quote.");
    } finally {
      setIsSaving(false);
    }
  }

  async function sendQuote() {
    if (!form.id) {
      setFeedback("Save the quote before sending it.");
      return;
    }

    setIsSaving(true);
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/quotes/${form.id}/send`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not send quote.");
        return;
      }
      setFeedback(payload.emailSent ? "Quote sent to customer." : `Quote marked as sent. Resend is not configured, so use: ${payload.viewUrl}`);
      await loadQuotes();
    } catch (error) {
      setFeedback(error?.message || "Could not send quote.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.workflowLayout}>
      <aside className={styles.workflowList}>
        <div className={styles.workflowListHeader}>
          <span className={styles.tableMeta}>{isLoading ? "Loading quotes" : `${quotes.length} quotes`}</span>
          <button type="button" className={styles.primaryButton} onClick={() => setForm({ ...emptyForm, lines: [{ ...emptyLine }] })}>
            New quote
          </button>
        </div>
        {setupRequired ? (
          <div className={styles.noticeBox}>Install the quote/order Supabase SQL before saving quotes.</div>
        ) : null}
        <div className={styles.workflowListItems}>
          {quotes.map((quote) => (
            <button
              key={quote.id}
              type="button"
              className={`${styles.workflowListItem} ${quote.id === form.id ? styles.workflowListItemActive : ""}`}
              onClick={() => setForm(formFromQuote(quote))}
            >
              <strong>{quote.quote_number}</strong>
              <span>{quote.customer_name || "No customer"} · {quote.status}</span>
              <span>{formatMoney(quote.total_inc_gst, quote.currency || "AUD")}</span>
            </button>
          ))}
          {!quotes.length && !isLoading ? <p className={styles.placeholderText}>No quotes yet.</p> : null}
        </div>
      </aside>

      <form className={styles.workflowEditor} onSubmit={saveQuote}>
        <div className={styles.workflowToolbar}>
          <div>
            <p className={styles.editorSubtitle}>
              {form.quote_number ? `${form.quote_number} · ${form.status}` : "Draft quote"}
            </p>
            {publicUrl ? <p className={styles.helperText}>{publicUrl}</p> : null}
          </div>
          <div className={styles.editorTopActions}>
            <button type="button" className={styles.secondaryButton} onClick={sendQuote} disabled={isSaving || !form.id}>
              Send
            </button>
            <button type="submit" className={styles.primaryButton} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save quote"}
            </button>
          </div>
        </div>

        <section className={styles.workflowSection}>
          <div className={styles.formGrid}>
            <label className={styles.fieldLabel}>
              Quote title
              <input className={styles.fieldInput} value={form.title} onChange={(event) => updateForm("title", event.target.value)} />
            </label>
            <label className={styles.fieldLabel}>
              Job / order reference
              <input className={styles.fieldInput} value={form.project_name} onChange={(event) => updateForm("project_name", event.target.value)} />
            </label>
            <label className={styles.fieldLabel}>
              Customer name
              <input className={styles.fieldInput} value={form.customer_name} onChange={(event) => updateForm("customer_name", event.target.value)} />
            </label>
            <label className={styles.fieldLabel}>
              Customer email
              <input className={styles.fieldInput} type="email" value={form.customer_email} onChange={(event) => updateForm("customer_email", event.target.value)} />
            </label>
            <label className={styles.fieldLabel}>
              Phone
              <input className={styles.fieldInput} value={form.customer_phone} onChange={(event) => updateForm("customer_phone", event.target.value)} />
            </label>
            <label className={styles.fieldLabel}>
              Site / delivery address
              <input className={styles.fieldInput} value={form.site_address} onChange={(event) => updateForm("site_address", event.target.value)} />
            </label>
          </div>
        </section>

        <section className={styles.workflowSection}>
          <div className={styles.sectionHeaderRow}>
            <p className={styles.sectionText}>Line items include product costs, labour, travel, delivery, install, other costs, and markup.</p>
            <button type="button" className={styles.secondaryButton} onClick={addLine}>
              Add line
            </button>
          </div>

          <div className={styles.quoteLines}>
            {form.lines.map((line, index) => {
              const calculated = calculateQuoteLine(line);
              return (
                <div key={index} className={styles.quoteLine}>
                  <div className={styles.quoteLineTop}>
                    <strong>Line {index + 1}</strong>
                    <button type="button" className={styles.rowDeleteButton} onClick={() => removeLine(index)}>
                      Remove
                    </button>
                  </div>
                  <div className={styles.quoteLineGrid}>
                    <input className={styles.fieldInput} placeholder="Product name" value={line.product_name} onChange={(event) => updateLine(index, "product_name", event.target.value)} />
                    <input className={styles.fieldInput} placeholder="Description" value={line.description} onChange={(event) => updateLine(index, "description", event.target.value)} />
                    <input className={styles.fieldInput} placeholder="Finish" value={line.finish} onChange={(event) => updateLine(index, "finish", event.target.value)} />
                    <input className={styles.fieldInput} placeholder="Colour" value={line.colour} onChange={(event) => updateLine(index, "colour", event.target.value)} />
                    <input className={styles.fieldInput} placeholder="Profile" value={line.profile} onChange={(event) => updateLine(index, "profile", event.target.value)} />
                    <input className={styles.fieldInput} placeholder="Edge" value={line.edge_mould} onChange={(event) => updateLine(index, "edge_mould", event.target.value)} />
                    <input className={styles.fieldInput} type="number" placeholder="Width mm" value={line.width_mm} onChange={(event) => updateLine(index, "width_mm", event.target.value)} />
                    <input className={styles.fieldInput} type="number" placeholder="Height mm" value={line.height_mm} onChange={(event) => updateLine(index, "height_mm", event.target.value)} />
                    <input className={styles.fieldInput} type="number" placeholder="Qty" value={line.qty} onChange={(event) => updateLine(index, "qty", event.target.value)} />
                    <input className={styles.fieldInput} type="number" placeholder="Product unit cost ex GST" value={line.product_unit_cost_ex_gst} onChange={(event) => updateLine(index, "product_unit_cost_ex_gst", event.target.value)} />
                    <input className={styles.fieldInput} type="number" placeholder="Labour hours" value={line.labour_hours} onChange={(event) => updateLine(index, "labour_hours", event.target.value)} />
                    <input className={styles.fieldInput} type="number" placeholder="Worker hourly rate" value={line.worker_hourly_rate} onChange={(event) => updateLine(index, "worker_hourly_rate", event.target.value)} />
                    <input className={styles.fieldInput} type="number" placeholder="Travel cost" value={line.travel_cost_ex_gst} onChange={(event) => updateLine(index, "travel_cost_ex_gst", event.target.value)} />
                    <input className={styles.fieldInput} type="number" placeholder="Delivery cost" value={line.delivery_cost_ex_gst} onChange={(event) => updateLine(index, "delivery_cost_ex_gst", event.target.value)} />
                    <input className={styles.fieldInput} type="number" placeholder="Install cost" value={line.installation_cost_ex_gst} onChange={(event) => updateLine(index, "installation_cost_ex_gst", event.target.value)} />
                    <input className={styles.fieldInput} type="number" placeholder="Other cost" value={line.other_cost_ex_gst} onChange={(event) => updateLine(index, "other_cost_ex_gst", event.target.value)} />
                    <input className={styles.fieldInput} type="number" placeholder="Markup %" value={line.markup_percent} onChange={(event) => updateLine(index, "markup_percent", event.target.value)} />
                    <div className={styles.calculatedCell}>{formatMoney(calculated.line_total_ex_gst, form.currency)} ex GST</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className={styles.workflowTotals}>
          <div><span>Materials</span><strong>{formatMoney(totals.material_cost_ex_gst, form.currency)}</strong></div>
          <div><span>Labour</span><strong>{formatMoney(totals.labour_cost_ex_gst, form.currency)}</strong></div>
          <div><span>Subtotal ex GST</span><strong>{formatMoney(totals.subtotal_ex_gst, form.currency)}</strong></div>
          <div><span>GST</span><strong>{formatMoney(totals.gst_amount, form.currency)}</strong></div>
          <div><span>Total inc GST</span><strong>{formatMoney(totals.total_inc_gst, form.currency)}</strong></div>
        </section>

        <section className={styles.workflowSection}>
          <label className={styles.fieldLabel}>
            Notes
            <textarea className={styles.textareaInput} rows={4} value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            Terms
            <textarea className={styles.textareaInput} rows={4} value={form.terms} onChange={(event) => updateForm("terms", event.target.value)} />
          </label>
        </section>

        {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
        {selectedQuote?.order_id ? <p className={styles.noticeBox}>Approved quote has been converted to an order.</p> : null}
      </form>
    </div>
  );
}
