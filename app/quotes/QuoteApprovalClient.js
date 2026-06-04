"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatMoney, toNumber } from "../../lib/pcd-quote-utils";
import { colourOptionsForMaterial } from "../request-quote/quote-form-data";
import styles from "./quote-public.module.css";

function sortedLines(quote) {
  return [...(quote?.pcd_quote_line_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

function sortedAttachments(quote) {
  return [...(quote?.pcd_quote_attachments || [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function lineValue(value) {
  return value || "N/A";
}

function quoteLineSizeText(line) {
  const width = line.width_mm ? `${line.width_mm}` : "";
  const height = line.height_mm ? `${line.height_mm}` : "";
  return width || height ? `${width || "-"} x ${height || "-"}` : "";
}

function assetSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function colourSrcForLine(line) {
  const options = colourOptionsForMaterial(line.material);
  return options.find((option) => option.name === line.colour || option.label === line.colour)?.src || "";
}

function edgeOptionSrc(label) {
  return label ? `/images/edges/${assetSlug(label)}.png` : "";
}

function profileOptionSrc(profileType, label) {
  return profileType && label ? `/images/profiles/${assetSlug(profileType)}/${assetSlug(label)}.jpg` : "";
}

function SelectionTile({ src, label, onPreview }) {
  if (src) {
    return (
      <button
        type="button"
        className={`${styles.publicSelectionTile} ${styles.publicSelectionTileButton}`}
        onClick={() => onPreview({ src, label: lineValue(label) })}
      >
        <img alt="" src={src} onError={(event) => { event.currentTarget.style.display = "none"; }} />
        <span>{lineValue(label)}</span>
      </button>
    );
  }

  return (
    <span className={styles.publicSelectionTile}>
      <span>{lineValue(label)}</span>
    </span>
  );
}

export default function QuoteApprovalClient() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") || "";
  const [quote, setQuote] = useState(null);
  const [clientName, setClientName] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAttachmentsOpen, setIsAttachmentsOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  const lines = useMemo(() => sortedLines(quote), [quote]);
  const attachments = useMemo(() => sortedAttachments(quote), [quote]);
  const isLocked = quote?.status === "approved" || quote?.status === "rejected";
  const productLineTotal = useMemo(() => {
    const lineSum = lines.reduce((sum, line) => sum + toNumber(line.line_total_ex_gst), 0);
    return lineSum || toNumber(quote?.material_cost_ex_gst);
  }, [lines, quote?.material_cost_ex_gst]);
  const labourCost = toNumber(quote?.labour_cost_ex_gst) ||
    toNumber(quote?.labour_hours) * toNumber(quote?.worker_hourly_rate);
  const costSummaryRows = [
    { label: "Product line items", description: "Items listed in the quote table above.", amount: productLineTotal, always: true },
    {
      label: quote?.labour_hours ? `Labour (${toNumber(quote.labour_hours)} hrs)` : "Labour",
      description: "Workshop and job labour required for this quote.",
      amount: labourCost,
    },
    { label: "Travel", description: "Travel allowance for the job.", amount: toNumber(quote?.travel_cost_ex_gst) },
    { label: "Delivery", description: "Delivery allowance for the supplied items.", amount: toNumber(quote?.delivery_cost_ex_gst) },
    { label: "Consumables", description: "Small job materials such as glue, screws, and sundries.", amount: toNumber(quote?.installation_cost_ex_gst) },
  ].filter((row) => row.always || row.amount > 0);

  useEffect(() => {
    async function loadQuote() {
      if (!code) {
        setMessage("Missing access code.");
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/quote-workflow/get?code=${encodeURIComponent(code)}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          setMessage(payload.error || "We could not load this quote.");
          return;
        }
        setQuote(payload.quote);
      } catch (error) {
        setMessage(error?.message || "We could not load this quote.");
      } finally {
        setIsLoading(false);
      }
    }

    loadQuote();
  }, [code]);

  async function submitAction(action) {
    setMessage("");
    if (!clientName.trim()) {
      setMessage("Please enter your name first.");
      return;
    }
    if (action === "rejected" && !note.trim()) {
      setMessage("Please include a rejection note.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/quote-workflow/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action, client_name: clientName.trim(), note: note.trim() || null }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "We could not record your response.");
        return;
      }
      setQuote((current) => ({ ...current, status: action }));
      setMessage(action === "approved" ? "Quote approved. Your order has been created." : "Quote rejected. Your response has been recorded.");
    } catch (error) {
      setMessage(error?.message || "We could not record your response.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>Quote</div>
        <div className={styles.panelBody}>Loading quote...</div>
      </section>
    );
  }

  if (!quote) {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>Quote</div>
        <div className={styles.panelBody}>{message || "Quote not found."}</div>
      </section>
    );
  }

  return (
    <div className={styles.quoteViewCard}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>Quote Summary</div>
        <div className={styles.panelBody}>
          <div className={styles.quoteViewSummaryGrid}>
            <div className={styles.summaryItem}><span>Quote title</span><strong>{quote.title || "Cabinetry Quote"}</strong></div>
            <div className={styles.summaryItem}><span>Status</span><strong>{quote.status}</strong></div>
            <div className={styles.summaryItem}><span>Quote number</span><strong>{quote.quote_number}</strong></div>
            <div className={styles.summaryItem}><span>Customer</span><strong>{quote.customer_name || "-"}</strong></div>
            <div className={styles.summaryItem}><span>Email</span><strong>{quote.customer_email || "-"}</strong></div>
            <div className={styles.summaryItem}><span>Mobile</span><strong>{quote.customer_phone || "-"}</strong></div>
            <div className={styles.summaryItem}><span>Site address</span><strong>{quote.site_address || "-"}</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>Quote Items</div>
        <div className={styles.panelBody}>
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.quoteItemsPublicTable}`}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Type</th>
                  <th>Material</th>
                  <th>W x H (mm)</th>
                  <th>Colour</th>
                  <th>Qty</th>
                  <th>Edge profile</th>
                  <th>Profile type</th>
                  <th>Profile name</th>
                  <th>Drill holes?</th>
                  <th>Hinge supply?</th>
                  <th>Hinge qty</th>
                  <th>Unit cost</th>
                  <th>Total ex GST</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const showProfiles = line.material === "Thermolaminate" && line.product_type !== "Panel" && line.product_type !== "Table top";
                  const hingesApplicable = line.product_type === "Door";
                  const colourSrc = colourSrcForLine(line);
                  const edgeSrc = edgeOptionSrc(line.edge_mould);
                  const profileSrc = showProfiles ? profileOptionSrc(line.profile_type, line.profile) : "";
                  return (
                    <tr key={line.id}>
                      <td><span className={styles.quoteItemNumber}>{index + 1}</span></td>
                      <td>{lineValue(line.product_type || line.product_name)}</td>
                      <td>{lineValue(line.material)}</td>
                      <td>{lineValue(quoteLineSizeText(line))}</td>
                      <td><SelectionTile src={colourSrc} label={line.colour} onPreview={setPreviewImage} /></td>
                      <td>{line.qty || "1"}</td>
                      <td><SelectionTile src={edgeSrc} label={line.edge_mould} onPreview={setPreviewImage} /></td>
                      <td>{showProfiles ? lineValue(line.profile_type) : "N/A"}</td>
                      <td>{showProfiles ? <SelectionTile src={profileSrc} label={line.profile} onPreview={setPreviewImage} /> : "N/A"}</td>
                      <td>{hingesApplicable ? line.hinge_holes ? "Yes" : "No" : "N/A"}</td>
                      <td>{hingesApplicable ? line.hinge_supply ? "Yes" : "No" : "N/A"}</td>
                      <td>{hingesApplicable && (line.hinge_supply || line.hinge_holes) ? lineValue(line.hinge_qty) : "N/A"}</td>
                      <td>{formatMoney(line.unit_price_ex_gst, quote.currency)}</td>
                      <td>{formatMoney(line.line_total_ex_gst, quote.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className={styles.quoteViewTwoColumn}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>Quote Totals</div>
          <div className={styles.panelBody}>
            <div className={`${styles.totals} ${styles.publicTotalsBreakdown}`}>
              {costSummaryRows.map((row) => (
                <div className={styles.publicCostRow} key={row.label}>
                  <span>
                    <strong>{row.label}</strong>
                    <small>{row.description}</small>
                  </span>
                  <strong>{formatMoney(row.amount, quote.currency)}</strong>
                </div>
              ))}
              <div className={styles.publicTotalFocus}>
                <div className={styles.totalRow}><span>Subtotal ex GST</span><strong>{formatMoney(quote.subtotal_ex_gst, quote.currency)}</strong></div>
                <div className={styles.totalRow}><span>GST</span><strong>{formatMoney(quote.gst_amount, quote.currency)}</strong></div>
                <div className={`${styles.totalRow} ${styles.totalRowGrand}`}><span>Total inc GST</span><strong>{formatMoney(quote.total_inc_gst, quote.currency)}</strong></div>
              </div>
            </div>
            {attachments.length ? (
              <button type="button" className={styles.attachmentModalButton} onClick={() => setIsAttachmentsOpen(true)}>
                Attachments ({attachments.length})
              </button>
            ) : null}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>Your Response</div>
          <div className={styles.panelBody}>
            {isLocked ? (
              <p className={styles.message}>
                This quote has been {quote.status}. {quote.status === "approved" ? "An order has been created for Perth Cabinet Doors to track your line items." : "Perth Cabinet Doors has received your response."}
              </p>
            ) : (
              <div className={styles.formStack}>
                <label className={styles.label}>
                  Your name
                  <input className={styles.input} value={clientName} onChange={(event) => setClientName(event.target.value)} />
                </label>
                <label className={styles.label}>
                  Note
                  <textarea className={styles.textarea} value={note} onChange={(event) => setNote(event.target.value)} />
                </label>
                {message ? <p className={styles.message}>{message}</p> : null}
                <div className={styles.actions}>
                  <button type="button" className={styles.button} onClick={() => submitAction("approved")} disabled={isSubmitting}>
                    Approve quote
                  </button>
                  <button type="button" className={styles.buttonDanger} onClick={() => submitAction("rejected")} disabled={isSubmitting}>
                    Reject quote
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {quote.client_notes || quote.assumptions || quote.exclusions || quote.terms ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>Quote Notes</div>
          <div className={styles.panelBody}>
            <div className={styles.formStack}>
              {quote.client_notes ? <p className={styles.noteText}><strong>Notes:</strong> {quote.client_notes}</p> : null}
              {quote.assumptions ? <p className={styles.noteText}><strong>Assumptions:</strong> {quote.assumptions}</p> : null}
              {quote.exclusions ? <p className={styles.noteText}><strong>Exclusions:</strong> {quote.exclusions}</p> : null}
              {quote.terms ? <p className={styles.noteText}><strong>Terms:</strong> {quote.terms}</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {isAttachmentsOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="quote-attachments-title">
          <div className={styles.attachmentModal}>
            <div className={styles.attachmentModalHeader}>
              <div>
                <span>Quote files</span>
                <h2 id="quote-attachments-title">Quote Attachments</h2>
                <p>Download or open the files shared with this quote.</p>
              </div>
            </div>
            <div className={styles.attachmentModalBody}>
              <table className={styles.attachmentModalTable}>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attachments.map((attachment) => (
                    <tr key={attachment.id}>
                      <td>{attachment.file_name}</td>
                      <td>{attachment.file_type || "File"}</td>
                      <td>{attachment.file_size ? `${(Number(attachment.file_size) / 1024 / 1024).toFixed(1)} MB` : "-"}</td>
                      <td>{attachment.created_at ? new Date(attachment.created_at).toLocaleString("en-AU") : "-"}</td>
                      <td>
                        <a className={styles.buttonSecondary} href={attachment.file_url} target="_blank" rel="noreferrer">
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.attachmentModalFooter}>
              <button type="button" className={styles.buttonSecondary} onClick={() => setIsAttachmentsOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewImage ? (
        <div
          className={styles.imagePreviewOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={`${previewImage.label} preview`}
          onClick={() => setPreviewImage(null)}
        >
          <div className={styles.imagePreviewModal} onClick={(event) => event.stopPropagation()}>
            <button type="button" className={styles.imagePreviewClose} onClick={() => setPreviewImage(null)}>
              Close
            </button>
            <img src={previewImage.src} alt={previewImage.label} />
            <p>{previewImage.label}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

