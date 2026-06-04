"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../admin-shell.module.css";

const STATUSES = ["new", "reviewing", "waiting_on_customer", "converted_to_quote", "closed"];

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export default function QuoteRequestsManager() {
  const router = useRouter();
  const [quoteRequests, setQuoteRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

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

  useEffect(() => {
    loadQuoteRequests();
  }, []);

  return (
    <section className={styles.productsSection}>
      <div className={styles.productsHeaderBar}>
        <p className={styles.tableMeta}>{isLoading ? "Loading quote requests" : `${quoteRequests.length} quote requests`}</p>
        <button type="button" className={styles.secondaryButton} onClick={loadQuoteRequests}>Refresh</button>
      </div>
      {feedback ? <div className={styles.inlineNotice}>{feedback}</div> : null}
      <div className={styles.productsTableWrap}>
        <table className={styles.productsTable}>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Source</th>
              <th>Product</th>
              <th>Items</th>
              <th>Status</th>
              <th>Received</th>
              <th className={styles.actionsCol}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {quoteRequests.map((request) => (
              <tr key={request.id}>
                <td className={styles.productNameCell}>{request.customer_name || "-"}</td>
                <td>{request.source}</td>
                <td>{request.product_name || request.cabinet_brand || "-"}</td>
                <td>{request.pcd_quote_request_line_items?.length || 0}</td>
                <td>
                  <select className={styles.statusSelect} value={request.status} onChange={(event) => updateStatus(request.id, event.target.value)}>
                    {STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </td>
                <td>{formatDate(request.created_at)}</td>
                <td>
                  {request.converted_quote_id ? (
                    <button type="button" className={styles.rowEditButton} onClick={() => router.push(`/admin/quotes/${request.converted_quote_id}`)}>Open quote</button>
                  ) : (
                    <button type="button" className={styles.rowEditButton} onClick={() => convertToQuote(request.id)}>Convert</button>
                  )}
                </td>
              </tr>
            ))}
            {!quoteRequests.length && !isLoading ? <tr><td className={styles.emptyCell} colSpan="7">No quote requests yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

