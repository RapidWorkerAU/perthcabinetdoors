"use client";

import { useEffect, useState } from "react";
import styles from "../admin-shell.module.css";

const STATUSES = ["new", "in_progress", "responded", "closed", "not_required"];

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export default function EnquiriesManager() {
  const [enquiries, setEnquiries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  async function loadEnquiries() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/enquiries", { cache: "no-store" });
      const payload = await response.json();
      setEnquiries(payload.enquiries || []);
      if (payload.error) setFeedback(payload.error);
    } finally {
      setIsLoading(false);
    }
  }

  async function updateStatus(id, status) {
    const response = await fetch(`/api/admin/enquiries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json();
    if (response.ok && payload.ok) {
      setEnquiries((current) => current.map((item) => (item.id === id ? payload.enquiry : item)));
    } else {
      setFeedback(payload.error || "Could not update enquiry.");
    }
  }

  useEffect(() => {
    loadEnquiries();
  }, []);

  return (
    <section className={styles.productsSection}>
      <div className={styles.productsHeaderBar}>
        <p className={styles.tableMeta}>{isLoading ? "Loading enquiries" : `${enquiries.length} enquiries`}</p>
        <button type="button" className={styles.secondaryButton} onClick={loadEnquiries}>Refresh</button>
      </div>
      {feedback ? <div className={styles.inlineNotice}>{feedback}</div> : null}
      <div className={styles.productsTableWrap}>
        <table className={styles.productsTable}>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Contact</th>
              <th>Postcode</th>
              <th>Topic</th>
              <th>Message</th>
              <th>Status</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {enquiries.map((enquiry) => (
              <tr key={enquiry.id}>
                <td className={styles.productNameCell}>{enquiry.customer_name || "-"}</td>
                <td>{enquiry.customer_email || enquiry.customer_phone || "-"}</td>
                <td>{enquiry.postcode || "-"}</td>
                <td>{enquiry.topic || "-"}</td>
                <td>{enquiry.message || "-"}</td>
                <td>
                  <select className={styles.statusSelect} value={enquiry.status} onChange={(event) => updateStatus(enquiry.id, event.target.value)}>
                    {STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </td>
                <td>{formatDate(enquiry.created_at)}</td>
              </tr>
            ))}
            {!enquiries.length && !isLoading ? <tr><td className={styles.emptyCell} colSpan="7">No enquiries yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

