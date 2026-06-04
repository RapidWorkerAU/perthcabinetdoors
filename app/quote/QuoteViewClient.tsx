"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import PortalModal from "@/components/PortalModal";
import modalStyles from "@/components/PortalModal.module.css";
import { getQuoteFileTypeLabel } from "@/lib/quote/fileTypeLabel";
import type { QuotePublicPayload, QuoteMilestone } from "@/lib/quote/types";

type ActionState = {
  clientName: string;
  note: string;
};

const formatFileSize = (value: number | null | undefined) => {
  if (!value || value <= 0) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const formatMoney = (value: number | null | undefined, currency = "AUD") => {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
};

export default function QuoteViewClient() {
  const [payload, setPayload] = useState<QuotePublicPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDeliverableId, setOpenDeliverableId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [actionState, setActionState] = useState<ActionState>({ clientName: "", note: "" });
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<"approved" | "rejected" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/quote/get", { cache: "no-store" });
        if (!response.ok) {
          const message = await response.text();
          setError(message || "We could not load the quote.");
          return;
        }
        const data = (await response.json()) as QuotePublicPayload;
        setPayload(data);

        const viewKey = `quote_viewed_${data.quote.quote_number ?? "unknown"}`;
        if (!localStorage.getItem(viewKey)) {
          await fetch("/api/quote/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "viewed" }),
          });
          localStorage.setItem(viewKey, "1");
        }
      } catch {
        setError("We could not load the quote.");
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(max-width: 720px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  const milestonesByDeliverable = useMemo(() => {
    const map: Record<string, QuoteMilestone[]> = {};
    if (!payload) return map;
    payload.milestones.forEach((item) => {
      if (!map[item.deliverable_id]) {
        map[item.deliverable_id] = [];
      }
      map[item.deliverable_id].push(item);
    });
    return map;
  }, [payload]);

  const handleAction = async (action: "noted" | "approved" | "rejected") => {
    setActionMessage(null);
    if (!actionState.clientName.trim()) {
      setActionMessage("Please enter your name first.");
      return;
    }
    if (action === "rejected" && !actionState.note.trim()) {
      setActionMessage("Please include a rejection note.");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch("/api/quote/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          client_name: actionState.clientName.trim(),
          note: actionState.note.trim() || null,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        setActionMessage(message || "We could not record your response.");
        return;
      }
      setActionMessage("Thanks - your response has been recorded.");
      setActionState((prev) => ({ ...prev, note: "" }));
      if (action === "approved" || action === "rejected") {
        setActionResult(action);
      }
    } catch {
      setActionMessage("We could not record your response.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="qb-panel">
        <div className="qb-panel-header">Quote</div>
        <div className="qb-panel-body text-sm text-slate-700">{error}</div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="qb-panel">
        <div className="qb-panel-header">Quote</div>
        <div className="qb-panel-body text-sm text-slate-700">Loading your quote...</div>
      </div>
    );
  }

  const currency = payload.quote.currency ?? "AUD";
  const activeDeliverable = openDeliverableId
    ? payload.deliverables.find((item) => item.id === openDeliverableId) ?? null
    : null;
  const activeMilestones = activeDeliverable
    ? milestonesByDeliverable[activeDeliverable.id] ?? []
    : [];
  const resolvedAction =
    actionResult ?? payload.latest_action?.action ?? (payload.quote.status as string | null);
  const actionMeta =
    actionResult
      ? {
          action: actionResult,
          client_name: actionState.clientName.trim() || "Client",
          created_at: new Date().toISOString(),
          note: actionState.note || null,
        }
      : payload.latest_action ?? null;
  const fallbackAction =
    payload.quote.status === "approved"
      ? "approved"
      : payload.quote.status === "rejected"
        ? "rejected"
        : null;
  const summaryStatusRaw =
    resolvedAction === "approved" || resolvedAction === "rejected"
      ? resolvedAction
      : payload.quote.status ?? "draft";
  const summaryStatus =
    summaryStatusRaw?.charAt(0).toUpperCase() + summaryStatusRaw?.slice(1);
  const isLocked =
    payload.quote.status === "approved" ||
    payload.quote.status === "rejected" ||
    resolvedAction === "approved" ||
    resolvedAction === "rejected";
  const deliverableSummary = payload.deliverables.reduce(
    (summary, deliverable) => {
      const isFixed = deliverable.pricing_mode === "fixed_price";
      const quantity = isFixed ? 1 : deliverable.total_hours ?? 0;
      const unitPrice = isFixed
        ? deliverable.fixed_price_ex_gst ?? 0
        : deliverable.default_client_rate ?? 0;
      const total = deliverable.subtotal_ex_gst ?? unitPrice * quantity;
      return {
        quantity: summary.quantity + quantity,
        total: summary.total + total,
      };
    },
    { quantity: 0, total: 0 }
  );
  const proposalSections = [
    { label: "Client notes", value: payload.version.client_notes },
    { label: "Assumptions", value: payload.version.assumptions },
    { label: "Exclusions", value: payload.version.exclusions },
    { label: "Terms", value: payload.version.terms },
  ].filter((section) => section.value?.trim());

  return (
    <div className="space-y-6">
      <div className="qb-panel">
        <div className="qb-panel-header">Quote Summary</div>
        <div className="qb-panel-body qb-grid">
          <div className="qb-field">
            <label>Proposal title</label>
            <div className="qb-input qb-input--static">{payload.quote.title ?? "-"}</div>
          </div>
          <div className="qb-field">
            <label>Status</label>
            <div className="qb-input qb-input--static">{summaryStatus}</div>
          </div>
          <div className="qb-field">
            <label>Quote number</label>
            <div className="qb-input qb-input--static">{payload.quote.quote_number ?? "-"}</div>
          </div>
          <div className="qb-field">
            <label>Version</label>
            <div className="qb-input qb-input--static">Version {payload.version.version_number}</div>
          </div>
        </div>
      </div>

      <div className="qb-panel">
        <div className="qb-panel-header">Quote Items</div>
        <div className="qb-panel-body">
          <table className="qb-table qb-table--nested qb-table--quote-view">
            <colgroup>
              <col style={{ width: "40px" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "34%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "120px" }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>Product name</th>
                <th>Description</th>
                <th>Unit</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {payload.deliverables.map((deliverable) => {
                const isFixed = deliverable.pricing_mode === "fixed_price";
                const unitLabel = isFixed ? "Fixed" : "Hours";
                const quantity = isFixed ? 1 : deliverable.total_hours ?? 0;
                const unitPrice = isFixed
                  ? deliverable.fixed_price_ex_gst ?? 0
                  : deliverable.default_client_rate ?? 0;
                const total = deliverable.subtotal_ex_gst ?? unitPrice * quantity;
                const milestones = milestonesByDeliverable[deliverable.id] ?? [];
                const isOpen = openDeliverableId === deliverable.id;
                return (
                  <Fragment key={deliverable.id}>
                    <tr className={isOpen ? "qb-deliverable-row is-open" : "qb-deliverable-row"}>
                      <td data-label="">
                        <button
                          type="button"
                          className="qb-toggle-btn"
                          onClick={() =>
                            setOpenDeliverableId((prev) =>
                              prev === deliverable.id ? null : deliverable.id
                            )
                          }
                          aria-expanded={isOpen}
                          aria-label="Toggle milestone breakdown"
                        >
                          {isOpen ? "–" : "+"}
                        </button>
                      </td>
                      <td data-label="Product name">
                        <div className="qb-input qb-input--static">
                          {deliverable.deliverable_title ?? "-"}
                        </div>
                      </td>
                      <td data-label="Description">
                        <div className="qb-input qb-input--static">
                          {deliverable.deliverable_description ?? "-"}
                        </div>
                        {milestones.length > 0 && (
                          <button
                            type="button"
                            className="qb-btn qb-btn--outline qb-mobile-breakdown"
                            onClick={() => setOpenDeliverableId(deliverable.id)}
                          >
                            View milestones
                          </button>
                        )}
                      </td>
                      <td data-label="Unit" data-mobile-slot="meta">
                        <div className="qb-input qb-input--static">{unitLabel}</div>
                      </td>
                      <td data-label="Quantity" data-mobile-slot="meta">
                        <div className="qb-input qb-input--static">{quantity}</div>
                      </td>
                      <td data-label="Unit price" data-mobile-slot="meta">
                        <div className="qb-input qb-input--static">
                          {formatMoney(unitPrice, currency)}
                        </div>
                      </td>
                      <td data-label="Total" data-mobile-slot="meta">
                        <div className="qb-input qb-input--static">
                          {formatMoney(total, currency)}
                        </div>
                      </td>
                    </tr>
                    {milestones.length > 0 && isOpen && (
                      <tr className="qb-nested-block">
                        <td colSpan={7}>
                          <table className="qb-table qb-table--nested qb-table--milestones">
                            <colgroup>
                              <col style={{ width: "40px" }} />
                              <col style={{ width: "18%" }} />
                              <col style={{ width: "34%" }} />
                              <col style={{ width: "8%" }} />
                              <col style={{ width: "8%" }} />
                              <col style={{ width: "10%" }} />
                              <col style={{ width: "120px" }} />
                            </colgroup>
                            <thead>
                              <tr>
                                <th></th>
                                <th>Milestone</th>
                                <th>Description</th>
                                <th>Unit</th>
                                <th>Qty/Hrs</th>
                                <th>Unit price</th>
                                <th>Line total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {milestones.map((milestone) => {
                                const isHours = (milestone.pricing_unit ?? "hours") === "hours";
                                const qty = isHours
                                  ? milestone.estimated_hours ?? 0
                                  : milestone.quantity ?? 0;
                                const lineTotal =
                                  milestone.client_amount_ex_gst ?? unitPrice * qty;
                                return (
                                  <tr key={milestone.id} className="qb-nested-row">
                                    <td></td>
                                    <td>
                                      <div className="qb-input qb-input--static qb-milestone-title">
                                        {milestone.milestone_title ?? "-"}
                                      </div>
                                    </td>
                                    <td>
                                      <div className="qb-input qb-input--static">
                                        {milestone.milestone_description ?? "-"}
                                      </div>
                                    </td>
                                    <td>
                                      <div className="qb-input qb-input--static">
                                        {isHours ? "Hours" : "Each"}
                                      </div>
                                    </td>
                                    <td>
                                      <div className="qb-input qb-input--static">{qty}</div>
                                    </td>
                                    <td>
                                      <div className="qb-input qb-input--static">
                                        {formatMoney(unitPrice, currency)}
                                      </div>
                                    </td>
                                    <td>
                                      <div className="qb-input qb-input--static">
                                        {formatMoney(lineTotal, currency)}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              <tr className="qb-table-summary-spacer">
                <td colSpan={7}></td>
              </tr>
              <tr className="qb-table-summary">
                <td></td>
                <td>Total</td>
                <td></td>
                <td></td>
                <td>{deliverableSummary.quantity}</td>
                <td></td>
                <td>{formatMoney(deliverableSummary.total, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="qb-split">
        <div className="qb-panel">
          <div className="qb-panel-header">Quote Totals</div>
          <div className="qb-panel-body">
            <div className="qb-total-box">
              <div className="qb-total-row">
                <span>Subtotal (ex GST)</span>
                <strong>{formatMoney(payload.version.subtotal_ex_gst, currency)}</strong>
              </div>
              <div className="qb-total-row">
                <span>GST</span>
                <strong>{formatMoney(payload.version.gst_amount, currency)}</strong>
              </div>
              <div className="qb-total-row">
                <span>Total</span>
                <strong>{formatMoney(payload.version.total_inc_gst, currency)}</strong>
              </div>
            </div>
            {payload.attachments.length > 0 && (
              <div className="qb-footer-actions qb-footer-actions--left">
                <button
                  type="button"
                  className="qb-attachment-link"
                  onClick={() => setShowAttachmentModal(true)}
                >
                  <img src="/icons/file.svg" alt="" aria-hidden="true" className="qb-attachment-icon" />
                  <span>
                    Attachments ({payload.attachments.length})
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="qb-panel">
          <div className="qb-panel-header">Your response</div>
          <div className="qb-panel-body">
            {isLocked ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Quote {(actionMeta?.action ?? fallbackAction) === "approved" ? "approved" : "rejected"}
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    {(actionMeta?.action ?? fallbackAction) === "approved"
                      ? "A member of the HSES team will be in touch to plan the project schedule."
                      : "A member of the HSES team will reach out to understand future improvement opportunities."}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {actionMeta?.client_name ?? "Client"} ·{" "}
                    {actionMeta?.created_at
                      ? new Date(actionMeta.created_at).toLocaleString()
                      : "-"}
                  </p>
                </div>
                {actionMeta?.note && (
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                    <strong className="text-slate-700">Notes:</strong> {actionMeta.note}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Your name
                  <input
                    className="qb-input"
                    value={actionState.clientName}
                    onChange={(event) =>
                      setActionState((prev) => ({ ...prev, clientName: event.target.value }))
                    }
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Note (optional)
                  <textarea
                    className="qb-textarea"
                    rows={4}
                    value={actionState.note}
                    onChange={(event) =>
                      setActionState((prev) => ({ ...prev, note: event.target.value }))
                    }
                  />
                </label>
                {actionMessage && (
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {actionMessage}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                    type="button"
                    onClick={() => handleAction("approved")}
                    disabled={isSubmitting}
                  >
                    Approve
                  </button>
                  <button
                    className="rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                    type="button"
                    onClick={() => handleAction("rejected")}
                    disabled={isSubmitting}
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {proposalSections.length > 0 && (
        <div className="qb-panel">
          <div className="qb-panel-header">Proposal Notes</div>
          <div className="qb-panel-body space-y-4">
            {proposalSections.map((section) => (
              <div key={section.label} className="qb-field">
                <label>{section.label}</label>
                <div className="qb-input qb-input--static whitespace-pre-wrap">
                  {section.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeDeliverable && isMobile && (
        <div className="qb-modal">
          <div className="qb-modal-backdrop" onClick={() => setOpenDeliverableId(null)}></div>
          <div className="qb-modal-dialog">
            <div className="qb-modal-header">
              <div>
                <div className="qb-modal-title">
                  {activeDeliverable.deliverable_title ?? "Deliverable"}
                </div>
                <div className="qb-modal-sub">Milestone breakdown</div>
              </div>
              <button
                type="button"
                className="qb-btn qb-btn--outline"
                onClick={() => setOpenDeliverableId(null)}
              >
                Close
              </button>
            </div>
            <div className="qb-modal-body">
              <table className="qb-table qb-table--nested qb-table--modal">
                <colgroup>
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Milestone</th>
                    <th>Description</th>
                    <th>Unit</th>
                    <th>Qty/Hrs</th>
                    <th>Unit price</th>
                    <th>Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMilestones.map((milestone) => {
                    const isHours = (milestone.pricing_unit ?? "hours") === "hours";
                    const qty = isHours ? milestone.estimated_hours ?? 0 : milestone.quantity ?? 0;
                    const unitPrice =
                      activeDeliverable.pricing_mode === "fixed_price"
                        ? activeDeliverable.fixed_price_ex_gst ?? 0
                        : activeDeliverable.default_client_rate ?? 0;
                    const lineTotal = milestone.client_amount_ex_gst ?? unitPrice * qty;
                    return (
                      <tr key={milestone.id} className="qb-nested-row qb-nested-row--breakdown">
                        <td data-label="Milestone">
                          <div className="qb-input qb-input--static qb-milestone-title">
                            {milestone.milestone_title ?? "-"}
                          </div>
                        </td>
                        <td data-label="Description">
                          <div className="qb-input qb-input--static">
                            {milestone.milestone_description ?? "-"}
                          </div>
                        </td>
                        <td data-label="Unit">
                          <div className="qb-input qb-input--static">
                            {isHours ? "Hours" : "Each"}
                          </div>
                        </td>
                        <td data-label="Qty/Hrs">
                          <div className="qb-input qb-input--static">{qty}</div>
                        </td>
                        <td data-label="Unit price">
                          <div className="qb-input qb-input--static">
                            {formatMoney(unitPrice, currency)}
                          </div>
                        </td>
                        <td data-label="Line total">
                          <div className="qb-input qb-input--static">
                            {formatMoney(lineTotal, currency)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <PortalModal
        open={showAttachmentModal}
        ariaLabel="Quote attachments"
        eyebrow="Quote Files"
        title="Quote Attachments"
        description="Download or open the files shared with this quote."
        onClose={() => setShowAttachmentModal(false)}
        size="xl"
        footer={
          <button
            type="button"
            className={modalStyles.secondaryButton}
            onClick={() => setShowAttachmentModal(false)}
          >
            Close
          </button>
        }
      >
        <table className="qb-table qb-table--modal qb-table--attachments">
          <colgroup>
            <col style={{ width: "30%" }} />
            <col style={{ width: "30%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "15%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>File</th>
              <th>Type</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payload.attachments.map((attachment) => (
              <tr key={attachment.id}>
                <td data-label="File">{attachment.file_name}</td>
                <td data-label="Type">
                  {getQuoteFileTypeLabel(attachment.content_type, attachment.file_name)}
                </td>
                <td data-label="Size">{formatFileSize(attachment.file_size)}</td>
                <td data-label="Uploaded">
                  {new Date(attachment.created_at).toLocaleString()}
                </td>
                <td data-label="Action">
                  <a
                    className="qb-btn"
                    href={attachment.public_url}
                    target="_blank"
                    rel="noreferrer"
                    download={attachment.file_name}
                  >
                    Download
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </PortalModal>

    </div>
  );
}
