"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../admin-content.module.css";
import { formatAdminLabel } from "../_utils/formatAdminLabel";
import { AdminActionDropdown, AdminBulkDeleteButton, AdminConfirmDeleteAction } from "../_components/AdminActionDropdown";
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
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [statusFilter, setStatusFilter] = useState("new");
  const [selectedIds, setSelectedIds] = useState([]);

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
    if (statusFilter === "all") return enquiries;
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

  useEffect(() => {
    loadEnquiries();
  }, []);

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

  async function deleteEnquiries(ids) {
    if (!ids.length) return;
    setIsSaving(true);
    setFeedback("");
    try {
      for (const id of ids) {
        const response = await fetch(`/api/admin/enquiries/${id}`, { method: "DELETE" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not delete enquiry.");
      }
      setEnquiries((current) => current.filter((item) => !ids.includes(item.id)));
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      setFeedback(`${ids.length} enquir${ids.length === 1 ? "y" : "ies"} deleted.`);
    } catch (error) {
      setFeedback(error?.message || "Could not delete selected enquiries.");
    } finally {
      setIsSaving(false);
    }
  }

  function toggleSelected(id) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectedPage(checked) {
    const pageIds = enquiryPagination.pageItems.map((e) => e.id);
    setSelectedIds((current) => {
      if (!checked) return current.filter((id) => !pageIds.includes(id));
      return Array.from(new Set([...current, ...pageIds]));
    });
  }

  return (
    <section className={styles.productsSection}>
      <div className={`${styles.productsHeaderBar} ${styles.tableToolbar}`}>
        <div className={styles.tableToolbarFilters}>
          <AdminBulkDeleteButton count={selectedIds.length} disabled={isSaving} onConfirm={() => deleteEnquiries(selectedIds)} />
        </div>
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
      </div>

      {feedback ? <div className={styles.inlineNotice}>{feedback}</div> : null}

      <div className={styles.productsTableWrap}>
        <table className={styles.productsTable}>
          <thead>
            <tr>
              <th className={styles.rowSelectCol}>
                <input
                  type="checkbox"
                  checked={enquiryPagination.pageItems.length > 0 && enquiryPagination.pageItems.every((e) => selectedIds.includes(e.id))}
                  onChange={(event) => toggleSelectedPage(event.target.checked)}
                  aria-label="Select all visible enquiries"
                />
              </th>
              <th>Customer</th>
              <th>Contact</th>
              <th>Postcode</th>
              <th>Topic</th>
              <th>Message</th>
              <th>Status</th>
              <th>Received</th>
              <th className={styles.actionsCol}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {enquiryPagination.pageItems.map((enquiry) => (
              <tr key={enquiry.id}>
                <td className={styles.rowSelectCol}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(enquiry.id)}
                    onChange={() => toggleSelected(enquiry.id)}
                    aria-label={`Select enquiry from ${enquiry.customer_name || "customer"}`}
                  />
                </td>
                <td className={styles.productNameCell}>{enquiry.customer_name || "-"}</td>
                <td>{enquiry.customer_email || enquiry.customer_phone || "-"}</td>
                <td>{enquiry.postcode || "-"}</td>
                <td>{enquiry.topic || "-"}</td>
                <td>{enquiry.message || "-"}</td>
                <td>
                  <select className={styles.statusSelect} value={enquiry.status} onChange={(event) => updateStatus(enquiry.id, event.target.value)}>
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>{formatAdminLabel(status)}</option>
                    ))}
                  </select>
                </td>
                <td>{formatDate(enquiry.created_at)}</td>
                <td className={styles.actionsCol}>
                  <AdminActionDropdown label={`Open actions for enquiry from ${enquiry.customer_name || "customer"}`}>
                    <AdminConfirmDeleteAction disabled={isSaving} onConfirm={() => deleteEnquiries([enquiry.id])} />
                  </AdminActionDropdown>
                </td>
              </tr>
            ))}
            {!visibleEnquiries.length && !isLoading ? (
              <tr><td className={styles.emptyCell} colSpan="9">No enquiries match this filter.</td></tr>
            ) : null}
            {isLoading ? (
              <tr><td className={styles.emptyCell} colSpan="9">Loading enquiries...</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className={styles.mobileRecordList} aria-label="Enquiries">
        {enquiryPagination.pageItems.map((enquiry) => (
          <article className={styles.mobileRecordCard} key={enquiry.id}>
            <div className={styles.mobileRecordMain}>
              <span className={styles.mobileRecordEyebrow}>Enquiry</span>
              <strong>{enquiry.customer_name || "Unnamed customer"}</strong>
              <span>{enquiry.customer_email || enquiry.customer_phone || "No contact supplied"}</span>
            </div>
            <dl className={styles.mobileRecordDetails}>
              <div><dt>Postcode</dt><dd>{enquiry.postcode || "-"}</dd></div>
              <div><dt>Topic</dt><dd>{enquiry.topic || "-"}</dd></div>
              <div><dt>Received</dt><dd>{formatDate(enquiry.created_at)}</dd></div>
            </dl>
            <p className={styles.mobileRecordMessage}>{enquiry.message || "No message supplied."}</p>
            <label className={styles.mobileRecordSelect}>
              <span>Status</span>
              <select className={styles.statusSelect} value={enquiry.status} onChange={(event) => updateStatus(enquiry.id, event.target.value)}>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{formatAdminLabel(status)}</option>
                ))}
              </select>
            </label>
          </article>
        ))}
        {!visibleEnquiries.length && !isLoading ? <div className={styles.mobileEmptyState}>No enquiries match this filter.</div> : null}
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
