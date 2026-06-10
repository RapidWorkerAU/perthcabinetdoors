"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "../../../lib/pcd-quote-utils";
import styles from "../admin-shell.module.css";
import { AdminTablePagination, useAdminTablePagination } from "../_components/AdminTablePagination";

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
  const [feedback, setFeedback] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const quotePagination = useAdminTablePagination(quotes);

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

  return (
    <section className={styles.productsSection}>
      <div className={styles.productsHeaderBar}>
        <div>
          <p className={styles.tableMeta}>{isLoading ? "Loading quotes" : `${quotes.length} quotes`}</p>
        </div>
        <div className={styles.rowActions}>
          <button type="button" className={styles.secondaryButton} onClick={loadQuotes} disabled={isLoading}>
            Refresh
          </button>
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
                <td>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={`${styles.rowEditButton} ${styles.rowIconButton} ${styles.rowOpenIconButton}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        router.push(`/admin/quotes/${quote.id}`);
                      }}
                      aria-label={`Open quote ${quote.quote_number || quote.id}`}
                      title="Open quote"
                    >
                      Open
                    </button>
                    {quote.access_code ? (
                      <a
                        className={`${styles.rowEditButton} ${styles.rowIconButton} ${styles.rowViewIconButton}`}
                        href={`/quotes/view?code=${encodeURIComponent(quote.access_code)}`}
                        onClick={(event) => event.stopPropagation()}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`View public quote ${quote.quote_number || quote.id}`}
                        title="View public quote"
                      >
                        View
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className={`${styles.rowEditButton} ${styles.rowIconButton} ${styles.rowDuplicateIconButton}`}
                      disabled={duplicatingQuoteId === quote.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        duplicateQuote(quote.id);
                      }}
                      aria-label={`Duplicate quote ${quote.quote_number || quote.id}`}
                      title={duplicatingQuoteId === quote.id ? "Duplicating quote" : "Duplicate quote"}
                    >
                      {duplicatingQuoteId === quote.id ? "Duplicating..." : "Duplicate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!quotes.length && !isLoading ? (
              <tr>
                <td colSpan="8" className={styles.emptyCell}>
                  No quotes yet. Create a quote to open the quote builder.
                </td>
              </tr>
            ) : null}

            {isLoading ? (
              <tr>
                <td colSpan="8" className={styles.emptyCell}>
                  Loading quotes...
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
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
