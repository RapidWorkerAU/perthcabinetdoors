"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney, PROJECT_LINE_STATUSES, PROJECT_STATUSES } from "../../../../lib/pcd-quote-utils";
import styles from "../../admin-shell.module.css";
import { AdminTablePagination, useAdminTablePagination } from "../../_components/AdminTablePagination";

function formatDate(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function sortedItems(project) {
  return [...(project?.pcd_project_line_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

function titleCaseStatus(status) {
  return String(status || "active")
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function lineStatusClass(status) {
  if (status === "Complete") return styles.statusPillActive;
  if (status === "Issue Follow-Up") return styles.statusPillIssue;
  return styles.statusPillDraft;
}

function projectStatusClass(status) {
  if (status === "complete") return styles.statusPillActive;
  if (status === "cancelled" || status === "on_hold") return styles.statusPillIssue;
  return styles.statusPillDraft;
}

function itemMeta(item) {
  const finish = [item.finish, item.colour, item.profile, item.edge_mould].filter(Boolean).join(" - ");
  const size = item.width_mm || item.height_mm ? `${item.width_mm || "-"} x ${item.height_mm || "-"}mm` : "";
  return [finish, size].filter(Boolean).join(" - ");
}

function setProjectItem(project, itemId, nextItem) {
  return {
    ...project,
    pcd_project_line_items: (project.pcd_project_line_items || []).map((item) =>
      item.id === itemId ? { ...item, ...nextItem } : item
    ),
  };
}

export default function ProjectDetail({ projectId }) {
  const [project, setProject] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [savingItemId, setSavingItemId] = useState("");
  const [feedback, setFeedback] = useState("");

  const items = useMemo(() => sortedItems(project), [project]);
  const itemPagination = useAdminTablePagination(items);
  const progress = useMemo(() => {
    const completeCount = items.filter((item) => item.status === "Complete").length;
    const issueCount = items.filter((item) => item.status === "Issue Follow-Up").length;
    const percent = items.length ? Math.round((completeCount / items.length) * 100) : 0;

    return { completeCount, issueCount, percent };
  }, [items]);

  async function loadProject() {
    setIsLoading(true);
    setFeedback("");

    try {
      const response = await fetch(`/api/admin/projects/${projectId}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not load project.");
        return;
      }

      setProject(payload.project);
    } catch (error) {
      setFeedback(error?.message || "Could not load project.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function updateProjectStatus(status) {
    if (!project || status === project.status) return;

    const previousProject = project;
    setIsSavingProject(true);
    setFeedback("");
    setProject((current) => (current ? { ...current, status } : current));

    try {
      const response = await fetch(`/api/admin/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setProject(previousProject);
        setFeedback(payload.error || "Could not update project status.");
        return;
      }

      setProject(payload.project);
      setFeedback("Project status updated.");
    } catch (error) {
      setProject(previousProject);
      setFeedback(error?.message || "Could not update project status.");
    } finally {
      setIsSavingProject(false);
    }
  }

  async function updateItem(item, changes) {
    if (!project) return;

    const nextItem = { ...item, ...changes };
    const previousProject = project;
    setSavingItemId(item.id);
    setFeedback("");
    setProject((current) => (current ? setProjectItem(current, item.id, nextItem) : current));

    try {
      const response = await fetch(`/api/admin/projects/${projectId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextItem.status || "Not Ordered",
          notes: nextItem.notes || null,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setProject(previousProject);
        setFeedback(payload.error || "Could not update product status.");
        return;
      }

      setProject((current) => (current ? setProjectItem(current, item.id, payload.item) : current));
      setFeedback("Product status updated.");
    } catch (error) {
      setProject(previousProject);
      setFeedback(error?.message || "Could not update product status.");
    } finally {
      setSavingItemId("");
    }
  }

  if (isLoading) {
    return <section className={styles.emptyState}><p>Loading project...</p></section>;
  }

  if (!project) {
    return (
      <section className={styles.emptyState}>
        <p>{feedback || "Project not found."}</p>
      </section>
    );
  }

  return (
    <div className={styles.quoteBuilderShell}>
      <div className={styles.quoteBuilderTopbar}>
        <div>
          <p className={styles.tableMeta}>{project.project_number}</p>
          <div className={styles.quoteBuilderSummaryLine}>
            <strong>{project.customer_name || "No customer selected"}</strong>
            <span>{project.name || "No project name"}</span>
            <span>{progress.completeCount}/{items.length} products complete</span>
          </div>
        </div>
        <div className={styles.editorTopActions}>
          <Link href="/admin/projects" className={styles.secondaryButton}>
            Back to projects
          </Link>
          {project.quote_id ? (
            <Link href={`/admin/quotes/${project.quote_id}`} className={styles.secondaryButton}>
              Source quote
            </Link>
          ) : null}
          <button type="button" className={styles.secondaryButton} onClick={loadProject} disabled={isLoading}>
            Refresh
          </button>
        </div>
      </div>

      <section className={styles.projectTrackerSummary}>
        <div className={styles.projectSummaryCard}>
          <span>Customer</span>
          <strong>{project.customer_name || "-"}</strong>
          <small>{project.customer_email || project.customer_phone || "-"}</small>
        </div>
        <div className={styles.projectSummaryCard}>
          <span>Site</span>
          <strong>{project.site_address || "-"}</strong>
          <small>Accepted {formatDate(project.accepted_at || project.created_at)}</small>
        </div>
        <div className={styles.projectSummaryCard}>
          <span>Total inc GST</span>
          <strong>{formatMoney(project.total_inc_gst, "AUD")}</strong>
          <small>Subtotal {formatMoney(project.subtotal_ex_gst, "AUD")} ex GST</small>
        </div>
        <div className={styles.projectSummaryCard}>
          <span>Project status</span>
          <div className={styles.projectStatusRow}>
            <span className={`${styles.statusPill} ${projectStatusClass(project.status)}`}>
              {titleCaseStatus(project.status)}
            </span>
            <select
              className={styles.projectStatusSelect}
              value={project.status || "active"}
              disabled={isSavingProject}
              onChange={(event) => updateProjectStatus(event.target.value)}
            >
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {titleCaseStatus(status)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className={styles.projectProgressPanel}>
        <div className={styles.projectProgressHeader}>
          <div>
            <p className={styles.tableMeta}>Product progress</p>
            <h2 className={styles.sectionTitle}>{progress.percent}% complete</h2>
          </div>
          <div className={styles.rowActions}>
            <span className={styles.projectListMetric}>{progress.completeCount} complete</span>
            <span className={styles.projectListMetric}>{progress.issueCount} issue follow-up</span>
          </div>
        </div>
        <div className={styles.projectProgressTrackLarge} aria-hidden="true">
          <span className={styles.projectProgressFill} style={{ width: `${progress.percent}%` }} />
        </div>
      </section>

      <section className={styles.productsSection}>
        <div className={styles.productsHeaderBar}>
          <div>
            <p className={styles.tableMeta}>{items.length} quote products</p>
          </div>
          <p className={styles.sectionText}>Update each product as it moves from ordering through install and completion.</p>
        </div>

        <div className={styles.productsTableWrap}>
          <table className={styles.productsTable}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Details</th>
                <th>Qty</th>
                <th>Total ex GST</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {itemPagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className={styles.productNameCell}>{item.title || "Cabinetry item"}</div>
                    <span className={`${styles.statusPill} ${lineStatusClass(item.status)}`}>
                      {item.status || "Not Ordered"}
                    </span>
                  </td>
                  <td>
                    <div>{item.description || "-"}</div>
                    <small className={styles.helperText}>{itemMeta(item) || "-"}</small>
                  </td>
                  <td>{item.qty || 0}</td>
                  <td>{formatMoney(item.line_total_ex_gst, "AUD")}</td>
                  <td>
                    <select
                      className={styles.fieldInput}
                      value={item.status || "Not Ordered"}
                      disabled={savingItemId === item.id}
                      onChange={(event) => updateItem(item, { status: event.target.value })}
                    >
                      {PROJECT_LINE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <textarea
                      className={`${styles.textareaInput} ${styles.projectLineNotes}`}
                      rows={2}
                      value={item.notes || ""}
                      disabled={savingItemId === item.id}
                      onChange={(event) => {
                        const notes = event.target.value;
                        setProject((current) => (current ? setProjectItem(current, item.id, { notes }) : current));
                      }}
                      onBlur={(event) => updateItem(item, { notes: event.target.value })}
                    />
                  </td>
                  <td>{formatDateTime(item.status_updated_at || item.updated_at || item.created_at)}</td>
                </tr>
              ))}

              {!items.length ? (
                <tr>
                  <td colSpan="7" className={styles.emptyCell}>
                    This project does not have any converted quote products yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <AdminTablePagination
            label="quote products"
            page={itemPagination.page}
            pageCount={itemPagination.pageCount}
            totalItems={itemPagination.totalItems}
            onPageChange={itemPagination.setPage}
          />
        </div>
      </section>

      {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
    </div>
  );
}
