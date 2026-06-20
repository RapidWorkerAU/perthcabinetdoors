"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../admin-content.module.css";
import { formatAdminLabel } from "../_utils/formatAdminLabel";
import { AdminActionDropdown, AdminBulkDeleteButton, AdminConfirmDeleteAction } from "../_components/AdminActionDropdown";
import { AdminTablePagination, useAdminTablePagination } from "../_components/AdminTablePagination";

const STATUSES = ["new", "reviewing", "waiting_on_customer", "converted_to_quote", "closed"];
const FILTERS = ["all", ...STATUSES];

function isStatusLocked(request) {
  return (request?.status || "new") === "converted_to_quote";
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function cleanValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function sizeText(line) {
  if (!line.width_mm && !line.height_mm) return "-";
  return `${line.width_mm || "-"} x ${line.height_mm || "-"} mm`;
}

export default function QuoteRequestsManager() {
  const router = useRouter();
  const [quoteRequests, setQuoteRequests] = useState([]);
  const [previewRequest, setPreviewRequest] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [statusFilter, setStatusFilter] = useState("new");
  const [selectedQuoteRequestIds, setSelectedQuoteRequestIds] = useState([]);

  const statusCounts = useMemo(() => {
    return quoteRequests.reduce(
      (counts, request) => {
        const status = request.status || "new";
        counts.all += 1;
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      },
      { all: 0 }
    );
  }, [quoteRequests]);

  const visibleQuoteRequests = useMemo(() => {
    if (statusFilter === "all") {
      return quoteRequests;
    }
    return quoteRequests.filter((request) => (request.status || "new") === statusFilter);
  }, [quoteRequests, statusFilter]);

  const quoteRequestPagination = useAdminTablePagination(visibleQuoteRequests, statusFilter);

  async function loadQuoteRequests() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/quote-requests", { cache: "no-store" });
      const payload = await response.json();
      setQuoteRequests(payload.quoteRequests || []);
      if (payload.error) setFeedback(payload.error);
    } finally {
      setIsLoading(false);
    }
  }

  async function updateStatus(id, status) {
    const response = await fetch(`/api/admin/quote-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json();
    if (response.ok && payload.ok) {
      setQuoteRequests((current) => current.map((item) => (item.id === id ? payload.quoteRequest : item)));
      setPreviewRequest((current) => (current?.id === id ? payload.quoteRequest : current));
    } else {
      setFeedback(payload.error || "Could not update quote request.");
    }
  }

  async function convertToQuote(id) {
    const response = await fetch("/api/admin/quote-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "convert_to_quote", id }),
    });
    const payload = await response.json();
    if (response.ok && payload.ok) {
      router.push(`/admin/quotes/${payload.quoteId}`);
    } else {
      setFeedback(payload.error || "Could not convert quote request.");
    }
  }

  async function deleteQuoteRequests(ids) {
    if (!ids.length) return;
    setIsDeleting(true);
    setFeedback("");

    try {
      for (const id of ids) {
        const response = await fetch(`/api/admin/quote-requests/${id}`, { method: "DELETE" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Could not delete quote request.");
        }
      }

      setQuoteRequests((current) => current.filter((request) => !ids.includes(request.id)));
      setSelectedQuoteRequestIds((current) => current.filter((id) => !ids.includes(id)));
      setPreviewRequest((current) => (current && ids.includes(current.id) ? null : current));
      setFeedback(`${ids.length} quote request${ids.length === 1 ? "" : "s"} deleted.`);
    } catch (error) {
      setFeedback(error?.message || "Could not delete selected quote requests.");
    } finally {
      setIsDeleting(false);
    }
  }

  function toggleSelectedQuoteRequest(id) {
    setSelectedQuoteRequestIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectedQuoteRequestPage(checked) {
    const pageIds = quoteRequestPagination.pageItems.map((request) => request.id);
    setSelectedQuoteRequestIds((current) => {
      if (!checked) return current.filter((id) => !pageIds.includes(id));
      return Array.from(new Set([...current, ...pageIds]));
    });
  }

  useEffect(() => {
    loadQuoteRequests();
  }, []);

  return (
    <section className={styles.productsSection}>
      <div className={`${styles.productsHeaderBar} ${styles.tableToolbar}`}>
        <div className={styles.tableToolbarFilters}>
          <AdminBulkDeleteButton count={selectedQuoteRequestIds.length} disabled={isDeleting} onConfirm={() => deleteQuoteRequests(selectedQuoteRequestIds)} />
        </div>
        <div className={styles.statusFilterBar} aria-label="Filter quote requests by status">
          {FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              className={`${styles.statusFilterButton} ${statusFilter === status ? styles.statusFilterButtonActive : ""}`}
              onClick={() => setStatusFilter(status)}
            >
              <span>{status === "all" ? "All" : formatAdminLabel(status)}</span>
              <small>{statusCounts[status] || 0}</small>
            </button>
          ))}
        </div>
      </div>
      {feedback ? <div className={styles.inlineNotice}>{feedback}</div> : null}
      <div className={styles.productsTableWrap}>
        <table className={styles.productsTable}>
          <thead>
            <tr>
              <th className={styles.rowSelectCol}>
                <input
                  type="checkbox"
                  checked={quoteRequestPagination.pageItems.length > 0 && quoteRequestPagination.pageItems.every((request) => selectedQuoteRequestIds.includes(request.id))}
                  onChange={(event) => toggleSelectedQuoteRequestPage(event.target.checked)}
                  aria-label="Select all visible quote requests"
                />
              </th>
              <th>Customer</th>
              <th>Suburb</th>
              <th>Source</th>
              <th>Items</th>
              <th>Status</th>
              <th>Received</th>
              <th className={styles.actionsCol}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {quoteRequestPagination.pageItems.map((request) => (
              <tr key={request.id}>
                <td className={styles.rowSelectCol}>
                  <input
                    type="checkbox"
                    checked={selectedQuoteRequestIds.includes(request.id)}
                    onChange={() => toggleSelectedQuoteRequest(request.id)}
                    aria-label={`Select quote request from ${request.customer_name || "customer"}`}
                  />
                </td>
                <td className={styles.productNameCell}>{request.customer_name || "-"}</td>
                <td>{request.delivery_suburb || "-"}</td>
                <td>{formatAdminLabel(request.source || "-")}</td>
                <td>{request.pcd_quote_request_line_items?.length || 0}</td>
                <td>
                  <select
                    className={styles.statusSelect}
                    value={request.status || "new"}
                    onChange={(event) => updateStatus(request.id, event.target.value)}
                    disabled={isStatusLocked(request)}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {formatAdminLabel(status)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{formatDate(request.created_at)}</td>
                <td className={styles.actionsCol}>
                  <AdminActionDropdown label={`Open actions for quote request from ${request.customer_name || "customer"}`}>
                    <button type="button" className={styles.tableActionMenuItem} onClick={() => setPreviewRequest(request)}>
                      Preview
                    </button>
                    {request.converted_quote_id ? (
                      <button type="button" className={styles.tableActionMenuItem} onClick={() => router.push(`/admin/quotes/${request.converted_quote_id}`)}>
                        Open quote
                      </button>
                    ) : (
                      <button type="button" className={styles.tableActionMenuItem} onClick={() => convertToQuote(request.id)}>Convert</button>
                    )}
                    <AdminConfirmDeleteAction disabled={isDeleting} onConfirm={() => deleteQuoteRequests([request.id])} />
                  </AdminActionDropdown>
                </td>
              </tr>
            ))}
            {!visibleQuoteRequests.length && !isLoading ? <tr><td className={styles.emptyCell} colSpan="8">No quote requests match this filter.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className={styles.mobileRecordList} aria-label="Quote requests">
        {quoteRequestPagination.pageItems.map((request) => (
          <article className={styles.mobileRecordCard} key={request.id}>
            <div className={styles.mobileRecordMain}>
              <span className={styles.mobileRecordEyebrow}>Quote request</span>
              <strong>{request.customer_name || "Unnamed customer"}</strong>
              <span>{request.delivery_suburb || "No suburb supplied"}</span>
            </div>
            <dl className={styles.mobileRecordDetails}>
              <div><dt>Source</dt><dd>{formatAdminLabel(request.source || "-")}</dd></div>
              <div><dt>Items</dt><dd>{request.pcd_quote_request_line_items?.length || 0}</dd></div>
              <div><dt>Received</dt><dd>{formatDate(request.created_at)}</dd></div>
            </dl>
            <label className={styles.mobileRecordSelect}>
              <span>Status</span>
              <select className={styles.statusSelect} value={request.status || "new"} onChange={(event) => updateStatus(request.id, event.target.value)} disabled={isStatusLocked(request)}>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{formatAdminLabel(status)}</option>
                ))}
              </select>
            </label>
            <div className={styles.mobileRecordActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setPreviewRequest(request)}>Preview</button>
              {request.converted_quote_id ? (
                <button type="button" className={styles.primaryButton} onClick={() => router.push(`/admin/quotes/${request.converted_quote_id}`)}>Open quote</button>
              ) : (
                <button type="button" className={styles.primaryButton} onClick={() => convertToQuote(request.id)}>Convert</button>
              )}
            </div>
          </article>
        ))}
        {!visibleQuoteRequests.length && !isLoading ? <div className={styles.mobileEmptyState}>No quote requests match this filter.</div> : null}
      </div>
      <AdminTablePagination
        label="quote requests"
        page={quoteRequestPagination.page}
        pageCount={quoteRequestPagination.pageCount}
        totalItems={quoteRequestPagination.totalItems}
        onPageChange={quoteRequestPagination.setPage}
      />
      {previewRequest ? (
        <QuoteRequestPreviewModal
          request={previewRequest}
          onClose={() => setPreviewRequest(null)}
          onConvert={convertToQuote}
          onOpenQuote={(quoteId) => router.push(`/admin/quotes/${quoteId}`)}
          onUpdateStatus={updateStatus}
        />
      ) : null}
    </section>
  );
}

function QuoteRequestPreviewModal({ request, onClose, onConvert, onOpenQuote, onUpdateStatus }) {
  const lineItems = [...(request.pcd_quote_request_line_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="quote-request-preview-title" onMouseDown={onClose}>
      <div className={styles.quoteRequestPreviewModal} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.quoteRequestPreviewHeader}>
          <div>
            <p className={styles.tableMeta}>Quote request preview</p>
            <h2 id="quote-request-preview-title">{request.customer_name || "Unnamed customer"}</h2>
            <span>{formatDate(request.created_at)} - {formatAdminLabel(request.status || "new")}</span>
          </div>
          <button type="button" className={styles.modalCloseButton} onClick={onClose}>Close</button>
        </div>

        <div className={styles.quoteRequestPreviewBody}>
          <section className={styles.quoteRequestPreviewCard}>
            <h3>Order details</h3>
            <dl className={styles.quoteRequestDetailGrid}>
              <div><dt>Name</dt><dd>{cleanValue(request.customer_name)}</dd></div>
              <div><dt>Email</dt><dd>{cleanValue(request.customer_email)}</dd></div>
              <div><dt>Phone</dt><dd>{cleanValue(request.customer_phone)}</dd></div>
              <div><dt>Suburb</dt><dd>{cleanValue(request.delivery_suburb)}</dd></div>
              <div><dt>Cabinet brand</dt><dd>{cleanValue(request.cabinet_brand)}</dd></div>
              <div><dt>Source</dt><dd>{request.source ? formatAdminLabel(request.source) : "-"}</dd></div>
              <div>
                <dt>Status</dt>
                <dd>
                  <select
                    className={styles.statusSelect}
                    value={request.status || "new"}
                    onChange={(event) => onUpdateStatus(request.id, event.target.value)}
                    disabled={isStatusLocked(request)}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {formatAdminLabel(status)}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.quoteRequestPreviewCard}>
            <h3>Request notes</h3>
            <p className={styles.quoteRequestNotes}>{request.notes || "No notes supplied."}</p>
          </section>

          <section className={styles.quoteItemsAdminWrap}>
            <h3 className={styles.quoteRequestPreviewSectionTitle}>Line items</h3>
            <div className={styles.quoteItemsScroller}>
              <div className={`${styles.quoteRequestPreviewGrid} ${styles.quoteItemHead}`}>
                <div>#</div>
                <div>Type</div>
                <div>Material</div>
                <div>Thickness</div>
                <div>W x H</div>
                <div>Finish</div>
                <div>Colour</div>
                <div>Qty</div>
                <div>Edge</div>
                <div>Profile</div>
                <div>Hinges</div>
              </div>
              {lineItems.map((line, index) => (
                <div className={`${styles.quoteRequestPreviewGrid} ${styles.quoteItemRow} ${styles.quoteItemRowLocked}`} key={line.id || index}>
                  <div><span className={styles.quoteItemRowNum}>{index + 1}</span></div>
                  <div className={styles.quoteReadCell}>{cleanValue(line.product_type || line.product_name)}</div>
                  <div className={styles.quoteReadCell}>{cleanValue(line.material)}</div>
                  <div className={styles.quoteReadCell}>{cleanValue(line.thickness)}</div>
                  <div className={styles.quoteReadCell}>{sizeText(line)}</div>
                  <div className={styles.quoteReadCell}>{cleanValue(line.finish)}</div>
                  <div className={styles.quoteReadCell}>{cleanValue(line.colour)}</div>
                  <div className={styles.quoteReadCell}>{line.qty || 1}</div>
                  <div className={styles.quoteReadCell}>{cleanValue(line.edge_mould)}</div>
                  <div className={styles.quoteReadCell}>{[line.profile_type, line.profile].filter(Boolean).join(" / ") || "-"}</div>
                  <div className={styles.quoteRequestHingeCell}>
                    <span><strong>{line.hinge_holes ? "✓" : "×"}</strong> Drill holes</span>
                    <span><strong>{line.hinge_supply ? "✓" : "×"}</strong> Supply hinges</span>
                    {line.hinge_qty ? <small>Qty {line.hinge_qty}</small> : null}
                  </div>
                </div>
              ))}
              {!lineItems.length ? <div className={styles.emptyCell}>No line items were submitted with this request.</div> : null}
            </div>
          </section>
        </div>

        <div className={styles.quoteRequestPreviewFooter}>
          {request.converted_quote_id ? (
            <button
              type="button"
              className={`${styles.secondaryButton} ${styles.rowIconButton} ${styles.rowOpenIconButton}`}
              onClick={() => onOpenQuote(request.converted_quote_id)}
              aria-label={`Open quote for ${request.customer_name || "quote request"}`}
              title="Open quote"
            >
              Open quote
            </button>
          ) : (
            <button type="button" className={styles.secondaryButton} onClick={() => onConvert(request.id)}>Convert to quote</button>
          )}
        </div>
      </div>
    </div>
  );
}

