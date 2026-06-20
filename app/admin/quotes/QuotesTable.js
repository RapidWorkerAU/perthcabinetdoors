"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "../../../lib/pcd-quote-utils";
import styles from "../admin-content.module.css";
import { formatAdminLabel } from "../_utils/formatAdminLabel";
import { AdminActionDropdown, AdminBulkDeleteButton, AdminConfirmDeleteAction } from "../_components/AdminActionDropdown";
import { AdminTablePagination, useAdminTablePagination } from "../_components/AdminTablePagination";

const STATUSES = ["draft", "sent", "viewed", "approved", "rejected"];
const FILTERS = ["all", ...STATUSES];

function formatDate(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getStatusClass(status) {
  if (status === "approved") return styles.statusPillActive;
  if (status === "rejected") return styles.statusPillIssue;
  return styles.statusPillDraft;
}

function suburbFromAddress(value) {
  const text = String(value || "").trim();
  if (!text) return "-";
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || text;
}

function quoteCustomerSuburb(quote) {
  return suburbFromAddress(quote?.pcd_customers?.site_address || quote?.site_address);
}

export default function QuotesTable() {
  const router = useRouter();
  const [quotes, setQuotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [duplicatingQuoteId, setDuplicatingQuoteId] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const [statusFilter, setStatusFilter] = useState("draft");
  const [selectedQuoteIds, setSelectedQuoteIds] = useState([]);

  const statusCounts = useMemo(() => {
    return quotes.reduce(
      (counts, quote) => {
        const status = quote.status || "draft";
        counts.all += 1;
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      },
      { all: 0 }
    );
  }, [quotes]);

  const visibleQuotes = useMemo(() => {
    if (statusFilter === "all") return quotes;
    return quotes.filter((quote) => (quote.status || "draft") === statusFilter);
  }, [quotes, statusFilter]);

  const quotePagination = useAdminTablePagination(visibleQuotes, statusFilter);

  async function loadQuotes() {
    setIsLoading(true);
    setFeedback("");

    try {
      const response = await fetch("/api/admin/quotes", { cache: "no-store" });
      const payload = await response.json();
      setSetupRequired(!!payload.setupRequired);
      setQuotes(payload.quotes || []);

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
  }, []);

  async function createQuote() {
    setIsCreating(true);
    setFeedback("");

    try {
      const response = await fetch("/api/admin/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Cabinetry Quote",
          currency: "AUD",
          gst_rate: 0.1,
          terms:
            "Prices are valid for 14 days. Final measurements and site conditions may affect the final invoice.",
          lines: [],
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok || !payload.quote?.id) {
        setFeedback(payload.error || "Could not create quote.");
        return;
      }

      router.push(`/admin/quotes/${payload.quote.id}`);
    } catch (error) {
      setFeedback(error?.message || "Could not create quote.");
    } finally {
      setIsCreating(false);
    }
  }

  async function duplicateQuote(quoteId) {
    setDuplicatingQuoteId(quoteId);
    setFeedback("");

    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}/duplicate`, { method: "POST" });
      const payload = await response.json();

      if (!response.ok || !payload.ok || !payload.quote?.id) {
        setFeedback(payload.error || "Could not duplicate quote.");
        return;
      }

      router.push(`/admin/quotes/${payload.quote.id}`);
    } catch (error) {
      setFeedback(error?.message || "Could not duplicate quote.");
    } finally {
      setDuplicatingQuoteId("");
    }
  }

  async function deleteQuotes(ids) {
    if (!ids.length) return;
    setIsDeleting(true);
    setFeedback("");

    try {
      for (const id of ids) {
        const response = await fetch(`/api/admin/quotes/${id}`, { method: "DELETE" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Could not delete quote.");
        }
      }

      setQuotes((current) => current.filter((quote) => !ids.includes(quote.id)));
      setSelectedQuoteIds((current) => current.filter((id) => !ids.includes(id)));
      setFeedback(`${ids.length} quote${ids.length === 1 ? "" : "s"} deleted.`);
    } catch (error) {
      setFeedback(error?.message || "Could not delete selected quotes.");
    } finally {
      setIsDeleting(false);
    }
  }

  function toggleSelectedQuote(id) {
    setSelectedQuoteIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectedQuotePage(checked) {
    const pageIds = quotePagination.pageItems.map((quote) => quote.id);
    setSelectedQuoteIds((current) => {
      if (!checked) return current.filter((id) => !pageIds.includes(id));
      return Array.from(new Set([...current, ...pageIds]));
    });
  }

  return (
    <section className={styles.productsSection}>
      <div className={`${styles.productsHeaderBar} ${styles.tableToolbar}`}>
        <div className={styles.tableToolbarFilters}>
          <AdminBulkDeleteButton count={selectedQuoteIds.length} disabled={isDeleting} onConfirm={() => deleteQuotes(selectedQuoteIds)} />
        </div>
        <div className={styles.statusFilterBar} aria-label="Filter quotes by status">
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
        <div className={styles.rowActions}>
          <button type="button" className={styles.primaryButton} onClick={createQuote} disabled={isCreating}>
            {isCreating ? "Creating..." : "New quote"}
          </button>
        </div>
      </div>

      {setupRequired ? (
        <div className={styles.inlineNotice}>Install `supabase/quote_project_workflow_setup.sql` before saving quotes.</div>
      ) : null}
      {feedback ? <div className={styles.inlineNotice}>{feedback}</div> : null}

      <div className={styles.productsTableWrap}>
        <table className={styles.productsTable}>
          <thead>
            <tr>
              <th className={styles.rowSelectCol}>
                <input
                  type="checkbox"
                  checked={quotePagination.pageItems.length > 0 && quotePagination.pageItems.every((quote) => selectedQuoteIds.includes(quote.id))}
                  onChange={(event) => toggleSelectedQuotePage(event.target.checked)}
                  aria-label="Select all visible quotes"
                />
              </th>
              <th>Quote</th>
              <th>Access code</th>
              <th>Customer</th>
              <th>Suburb</th>
              <th>Status</th>
              <th>Total</th>
              <th>Updated</th>
              <th className={styles.actionsCol}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {quotePagination.pageItems.map((quote) => (
              <tr
                key={quote.id}
                className={styles.rowClickable}
                onClick={() => router.push(`/admin/quotes/${quote.id}`)}
              >
                <td className={styles.rowSelectCol} onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedQuoteIds.includes(quote.id)}
                    onChange={() => toggleSelectedQuote(quote.id)}
                    aria-label={`Select quote ${quote.quote_number || quote.id}`}
                  />
                </td>
                <td className={styles.productNameCell}>{quote.quote_number}</td>
                <td>
                  <code className={styles.accessCodeCell}>{quote.access_code || "-"}</code>
                </td>
                <td>{quote.customer_name || "-"}</td>
                <td>{quoteCustomerSuburb(quote)}</td>
                <td>
                  <span className={`${styles.statusPill} ${getStatusClass(quote.status)}`}>
                    {(quote.status || "draft").replace(/^./, (char) => char.toUpperCase())}
                  </span>
                </td>
                <td>{formatMoney(quote.total_inc_gst, quote.currency || "AUD")}</td>
                <td>{formatDate(quote.updated_at || quote.created_at)}</td>
                <td className={styles.actionsCol}>
                  <AdminActionDropdown disabled={duplicatingQuoteId === quote.id} label={`Open actions for quote ${quote.quote_number || quote.id}`}>
                    <button type="button" className={styles.tableActionMenuItem} onClick={() => router.push(`/admin/quotes/${quote.id}`)}>
                      Open
                    </button>
                    {quote.access_code ? (
                      <a
                        className={styles.tableActionMenuItem}
                        href={`/quotes/view?code=${encodeURIComponent(quote.access_code)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className={styles.tableActionMenuItem}
                      disabled={duplicatingQuoteId === quote.id}
                      onClick={() => duplicateQuote(quote.id)}
                    >
                      {duplicatingQuoteId === quote.id ? "Duplicating..." : "Duplicate"}
                    </button>
                    <AdminConfirmDeleteAction disabled={isDeleting || duplicatingQuoteId === quote.id} onConfirm={() => deleteQuotes([quote.id])} />
                  </AdminActionDropdown>
                </td>
              </tr>
            ))}

            {!visibleQuotes.length && !isLoading ? (
              <tr>
                <td colSpan="9" className={styles.emptyCell}>
                  No quotes match this filter.
                </td>
              </tr>
            ) : null}

            {isLoading ? (
              <tr>
                <td colSpan="9" className={styles.emptyCell}>
                  Loading quotes...
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className={styles.mobileRecordList} aria-label="Quotes">
        {quotePagination.pageItems.map((quote) => (
          <article className={styles.mobileRecordCard} key={quote.id}>
            <button type="button" className={styles.mobileRecordMain} onClick={() => router.push(`/admin/quotes/${quote.id}`)}>
              <span className={styles.mobileRecordEyebrow}>Quote</span>
              <strong>{quote.quote_number || "Draft quote"}</strong>
              <span>{quote.customer_name || "No customer"}</span>
            </button>
            <dl className={styles.mobileRecordDetails}>
              <div><dt>Access</dt><dd><code className={styles.accessCodeCell}>{quote.access_code || "-"}</code></dd></div>
              <div><dt>Suburb</dt><dd>{quoteCustomerSuburb(quote)}</dd></div>
              <div><dt>Status</dt><dd><span className={`${styles.statusPill} ${getStatusClass(quote.status)}`}>{(quote.status || "draft").replace(/^./, (char) => char.toUpperCase())}</span></dd></div>
              <div><dt>Total</dt><dd>{formatMoney(quote.total_inc_gst, quote.currency || "AUD")}</dd></div>
              <div><dt>Updated</dt><dd>{formatDate(quote.updated_at || quote.created_at)}</dd></div>
            </dl>
            <div className={styles.mobileRecordActions}>
              <button type="button" className={styles.primaryButton} onClick={() => router.push(`/admin/quotes/${quote.id}`)}>Open</button>
              {quote.access_code ? (
                <a className={styles.secondaryButton} href={`/quotes/view?code=${encodeURIComponent(quote.access_code)}`} target="_blank" rel="noreferrer">View</a>
              ) : null}
              <button type="button" className={styles.secondaryButton} disabled={duplicatingQuoteId === quote.id} onClick={() => duplicateQuote(quote.id)}>
                {duplicatingQuoteId === quote.id ? "Duplicating..." : "Duplicate"}
              </button>
            </div>
          </article>
        ))}
        {!visibleQuotes.length && !isLoading ? <div className={styles.mobileEmptyState}>No quotes match this filter.</div> : null}
        {isLoading ? <div className={styles.mobileEmptyState}>Loading quotes...</div> : null}
      </div>
      <AdminTablePagination
        label="quotes"
        page={quotePagination.page}
        pageCount={quotePagination.pageCount}
        totalItems={quotePagination.totalItems}
        onPageChange={quotePagination.setPage}
      />
    </section>
  );
}

