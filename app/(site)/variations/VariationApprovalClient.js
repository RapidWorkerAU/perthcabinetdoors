"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatMoney, toNumber } from "../../../lib/pcd-quote-utils";
import styles from "../quotes/quote-public.module.css";

function sortedLines(variation) {
  return [...(variation?.pcd_order_variation_lines || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

function titleCase(value) {
  return String(value || "draft").replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function actionLabel(value) {
  if (value === "add") return "Add";
  if (value === "change") return "Change";
  if (value === "remove") return "Remove";
  if (value === "price_adjustment") return "Adjustment";
  return titleCase(value);
}

function itemTitle(item) {
  return item?.title || item?.product_type || "Variation item";
}

function itemDetails(item) {
  return [
    item?.material,
    item?.colour || item?.finish,
    item?.thickness,
    item?.profile_type,
    item?.profile,
    item?.edge_mould,
  ].filter(Boolean);
}

function sizeText(item) {
  const width = toNumber(item?.width_mm);
  const height = toNumber(item?.height_mm);
  if (width > 0 && height > 0) return `${width}mm x ${height}mm`;
  if (width > 0) return `${width}mm wide`;
  if (height > 0) return `${height}mm high`;
  return "";
}

function specRows(item, currency, totalField = "line_total_ex_gst") {
  const rows = itemDetails(item);
  const size = sizeText(item);
  if (size) rows.push(size);
  rows.push(`Qty ${item?.qty || 1}`);
  rows.push(`${formatMoney(item?.[totalField], currency)} ex GST`);
  return rows;
}

function ChangeSpec({ label, item, fallback, currency, totalField }) {
  return (
    <div className={styles.variationChangeSpec}>
      <span>{label}</span>
      {item ? (
        <>
          <strong>{itemTitle(item)}</strong>
          {specRows(item, currency, totalField).map((row, index) => (
            <small key={`${label}-${index}`}>{row}</small>
          ))}
        </>
      ) : (
        <strong>{fallback}</strong>
      )}
    </div>
  );
}

function proposedItemFromLine(line) {
  return {
    title: line.title,
    product_type: line.product_type,
    material: line.material,
    colour: line.colour,
    finish: line.finish,
    thickness: line.thickness,
    profile_type: line.profile_type,
    profile: line.profile,
    edge_mould: line.edge_mould,
    width_mm: line.width_mm,
    height_mm: line.height_mm,
    qty: line.qty,
    proposed_line_total_ex_gst: line.proposed_line_total_ex_gst,
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: "We could not read the server response. Please refresh and try again." };
  }
}

export default function VariationApprovalClient() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") || "";
  const [variation, setVariation] = useState(null);
  const [clientName, setClientName] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const lines = useMemo(() => sortedLines(variation), [variation]);
  const isLocked = ["approved", "approved_pending_payment", "applied", "rejected", "cancelled"].includes(variation?.status);
  const topup = toNumber(variation?.deposit_topup_required);

  useEffect(() => {
    async function loadVariation() {
      if (!code) {
        setMessage("Missing access code.");
        setIsLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/variation-workflow/get?code=${encodeURIComponent(code)}`, { cache: "no-store" });
        const payload = await readJsonResponse(response);
        if (!response.ok || !payload.ok) {
          setMessage(payload.error || "We could not load this variation.");
          return;
        }
        setVariation(payload.variation);
      } catch (error) {
        setMessage(error?.message || "We could not load this variation.");
      } finally {
        setIsLoading(false);
      }
    }
    loadVariation();
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
    if (action === "approved" && !acknowledged) {
      setMessage("Please acknowledge the variation and payment requirement before approving.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/variation-workflow/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action, client_name: clientName.trim(), note: note.trim() || null }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "We could not record your response.");
        return;
      }
      if (payload.requiresPayment && payload.checkoutUrl) {
        window.location.href = payload.checkoutUrl;
        return;
      }
      setVariation((current) => ({ ...current, status: action === "approved" ? "applied" : "rejected" }));
      setMessage(action === "approved" ? "Variation approved. Your order has been updated." : "Variation rejected. Perth Cabinet Doors has received your response.");
    } catch (error) {
      setMessage(error?.message || "We could not record your response.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>Order Variation</div>
        <div className={styles.panelBody}>Loading variation...</div>
      </section>
    );
  }

  if (!variation) {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>Order Variation</div>
        <div className={styles.panelBody}>{message || "Variation not found."}</div>
      </section>
    );
  }

  const order = variation.pcd_orders || {};

  return (
    <div className={styles.quoteViewCard}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>Variation Summary</div>
        <div className={styles.panelBody}>
          <div className={styles.quoteViewSummaryGrid}>
            <div className={styles.summaryItem}><span>Order</span><strong>{order.order_number || "-"}</strong></div>
            <div className={styles.summaryItem}><span>Variation</span><strong>{variation.variation_number}</strong></div>
            <div className={styles.summaryItem}><span>Status</span><strong>{titleCase(variation.status)}</strong></div>
            <div className={styles.summaryItem}><span>Customer</span><strong>{variation.customer_name || order.customer_name || "-"}</strong></div>
            <div className={styles.summaryItem}><span>Email</span><strong>{variation.customer_email || order.customer_email || "-"}</strong></div>
            <div className={styles.summaryItem}><span>Site address</span><strong>{variation.site_address || order.site_address || "-"}</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>Variation Changes</div>
        <div className={styles.panelBody}>
          <p className={styles.variationScopeNotice}>
            <strong>Only the items listed below are changing.</strong>
            The rest of your order {order.order_number ? `(${order.order_number}) ` : ""}stays exactly as it was
            confirmed - same items, same finishes, same prices. Nothing that is not shown on this page is
            affected by this variation.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Action</th>
                  <th>Current</th>
                  <th>Proposed</th>
                  <th>Variation ex GST</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.id || index}>
                    <td>{index + 1}</td>
                    <td>{actionLabel(line.action)}</td>
                    <td>
                      <ChangeSpec
                        label="Changed from"
                        item={line.action === "add" || line.action === "price_adjustment" ? null : line.original_order_item}
                        fallback={line.action === "add" ? "New item" : "Original item"}
                        currency={variation.currency}
                      />
                    </td>
                    <td>
                      <ChangeSpec
                        label="Changed to"
                        item={line.action === "remove" ? null : proposedItemFromLine(line)}
                        fallback={line.action === "remove" ? "Removed from order" : "Adjustment"}
                        currency={variation.currency}
                        totalField="proposed_line_total_ex_gst"
                      />
                    </td>
                    <td>{formatMoney(line.line_total_ex_gst, variation.currency)}</td>
                    <td>{line.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className={styles.quoteViewTwoColumn}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>Totals</div>
          <div className={styles.panelBody}>
            <div className={`${styles.totals} ${styles.publicTotalsBreakdown}`}>
              <div className={styles.publicTotalFocus}>
                <div className={styles.totalRow}><span>Variation ex GST</span><strong>{formatMoney(variation.subtotal_ex_gst, variation.currency)}</strong></div>
                <div className={styles.totalRow}><span>GST</span><strong>{formatMoney(variation.gst_amount, variation.currency)}</strong></div>
                <div className={`${styles.totalRow} ${styles.totalRowGrand}`}><span>Variation inc GST</span><strong>{formatMoney(variation.total_inc_gst, variation.currency)}</strong></div>
                <div className={styles.totalRow}><span>Revised order total</span><strong>{formatMoney(variation.revised_order_total_inc_gst, variation.currency)}</strong></div>
                {topup > 0 ? <div className={styles.totalRow}><span>Deposit top-up required</span><strong>{formatMoney(topup, variation.currency)}</strong></div> : null}
              </div>
            </div>
            <p className={styles.variationScopeFootnote}>
              The variation amount covers only the changed items above. The revised order total is your original
              order total with that amount applied - everything else on the order is unchanged.
            </p>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>Your Response</div>
          <div className={styles.panelBody}>
            {isLocked ? (
              <p className={styles.message}>
                This variation has been {titleCase(variation.status)}. Perth Cabinet Doors has received your response.
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
                <label className={styles.publicPaymentAck}>
                  <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
                  <span>
                    {topup > 0
                      ? `I approve the changed items listed above and acknowledge that a deposit top-up of ${formatMoney(topup, variation.currency)} is required before they are applied to my order. The rest of my order is unchanged.`
                      : "I approve the changed items listed above and acknowledge that they will update my order. The rest of my order is unchanged."}
                  </span>
                </label>
                {message ? <p className={styles.message}>{message}</p> : null}
                <div className={styles.actions}>
                  <button type="button" className={styles.button} onClick={() => submitAction("approved")} disabled={isSubmitting}>
                    Approve variation
                  </button>
                  <button type="button" className={styles.buttonDanger} onClick={() => submitAction("rejected")} disabled={isSubmitting}>
                    Reject variation
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {variation.notes || variation.terms ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>Variation Notes</div>
          <div className={styles.panelBody}>
            <div className={styles.formStack}>
              {variation.notes ? <p className={styles.noteText}><strong>Notes:</strong> {variation.notes}</p> : null}
              {variation.terms ? <p className={styles.noteText}><strong>Terms:</strong> {variation.terms}</p> : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
