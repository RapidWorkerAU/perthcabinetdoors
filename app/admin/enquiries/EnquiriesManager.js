"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../admin-shell.module.css";
import { formatAdminLabel } from "../_utils/formatAdminLabel";
import { AdminTablePagination, useAdminTablePagination } from "../_components/AdminTablePagination";

const STATUSES = ["new", "in_progress", "responded", "closed", "not_required"];
const FILTERS = ["all", ...STATUSES];

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export default function EnquiriesManager() {
  const [enquiries, setEnquiries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const statusCounts = useMemo(() => {
    return enquiries.reduce(
      (counts, enquiry) => {
        const status = enquiry.status || "new";
        counts.all += 1;
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      },
      { all: 0 }
    );
  }, [enquiries]);

  const visibleEnquiries = useMemo(() => {
    if (statusFilter === "all") {
      return enquiries;
    }
    return enquiries.filter((enquiry) => (enquiry.status || "new") === statusFilter);
  }, [enquiries, statusFilter]);
  const enquiryPagination = useAdminTablePagination(visibleEnquiries, statusFilter);

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
        <p className={styles.tableMeta}>{isLoading ? "Loading enquiries" : `${visibleEnquiries.length} of ${enquiries.length} enquiries`}</p>
        <div className={styles.statusFilterBar} aria-label="Filter enquiries by status">
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
            {enquiryPagination.pageItems.map((enquiry) => (
              <tr key={enquiry.id}>
                <td className={styles.productNameCell}>{enquiry.customer_name || "-"}</td>
                <td>{enquiry.customer_email || enquiry.customer_phone || "-"}</td>
                <td>{enquiry.postcode || "-"}</td>
                <td>{enquiry.topic || "-"}</td>
                <td>{enquiry.message || "-"}</td>
                <td>
                  <select className={styles.statusSelect} value={enquiry.status} onChange={(event) => updateStatus(enquiry.id, event.target.value)}>
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {formatAdminLabel(status)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{formatDate(enquiry.created_at)}</td>
              </tr>
            ))}
            {!visibleEnquiries.length && !isLoading ? <tr><td className={styles.emptyCell} colSpan="7">No enquiries match this filter.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <AdminTablePagination
        label="enquiries"
        page={enquiryPagination.page}
        pageCount={enquiryPagination.pageCount}
        totalItems={enquiryPagination.totalItems}
        onPageChange={enquiryPagination.setPage}
      />
    </section>
  );
}
