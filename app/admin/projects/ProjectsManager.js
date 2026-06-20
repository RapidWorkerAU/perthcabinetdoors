"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "../../../lib/pcd-quote-utils";
import styles from "../admin-content.module.css";
import { formatAdminLabel } from "../_utils/formatAdminLabel";
import { AdminActionDropdown, AdminBulkDeleteButton, AdminConfirmDeleteAction } from "../_components/AdminActionDropdown";
import { AdminTablePagination, useAdminTablePagination } from "../_components/AdminTablePagination";

function formatDate(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function sortedItems(project) {
  return [...(project?.pcd_project_line_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

function getProjectStatusClass(status) {
  if (status === "complete") return styles.statusPillActive;
  if (status === "cancelled" || status === "on_hold") return styles.statusPillIssue;
  return styles.statusPillDraft;
}

function getProgress(project) {
  const items = sortedItems(project);
  const completeCount = items.filter((item) => item.status === "Complete").length;
  const totalCount = items.length;
  const percent = totalCount ? Math.round((completeCount / totalCount) * 100) : 0;

  return { completeCount, totalCount, percent };
}

export default function ProjectsManager() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);

  const totals = useMemo(() => {
    return projects.reduce(
      (summary, project) => {
        const progress = getProgress(project);
        return {
          active: summary.active + (project.status === "active" ? 1 : 0),
          lineItems: summary.lineItems + progress.totalCount,
          lineItemsComplete: summary.lineItemsComplete + progress.completeCount,
        };
      },
      { active: 0, lineItems: 0, lineItemsComplete: 0 }
    );
  }, [projects]);
  const projectPagination = useAdminTablePagination(projects);

  async function loadProjects() {
    setIsLoading(true);
    setFeedback("");

    try {
      const response = await fetch("/api/admin/projects", { cache: "no-store" });
      const payload = await response.json();
      setSetupRequired(!!payload.setupRequired);
      setProjects(payload.projects || []);

      if (payload.error) {
        setFeedback(payload.error);
      }
    } catch (error) {
      setFeedback(error?.message || "Could not load projects.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function deleteProjects(ids) {
    if (!ids.length) return;
    setIsDeleting(true);
    setFeedback("");

    try {
      for (const id of ids) {
        const response = await fetch(`/api/admin/projects/${id}`, { method: "DELETE" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Could not delete project.");
        }
      }

      setProjects((current) => current.filter((project) => !ids.includes(project.id)));
      setSelectedProjectIds((current) => current.filter((id) => !ids.includes(id)));
      setFeedback(`${ids.length} project${ids.length === 1 ? "" : "s"} deleted.`);
    } catch (error) {
      setFeedback(error?.message || "Could not delete selected projects.");
    } finally {
      setIsDeleting(false);
    }
  }

  function toggleSelectedProject(id) {
    setSelectedProjectIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectedProjectPage(checked) {
    const pageIds = projectPagination.pageItems.map((project) => project.id);
    setSelectedProjectIds((current) => {
      if (!checked) return current.filter((id) => !pageIds.includes(id));
      return Array.from(new Set([...current, ...pageIds]));
    });
  }

  return (
    <section className={styles.productsSection}>
      <div className={`${styles.productsHeaderBar} ${styles.tableToolbar}`}>
        <div className={styles.tableToolbarFilters}>
          <AdminBulkDeleteButton count={selectedProjectIds.length} disabled={isDeleting} onConfirm={() => deleteProjects(selectedProjectIds)} />
        </div>
        <div className={styles.rowActions}>
          <span className={styles.projectListMetric}>{totals.active} active</span>
          <span className={styles.projectListMetric}>
            {totals.lineItemsComplete}/{totals.lineItems} items complete
          </span>
        </div>
      </div>

      {setupRequired ? (
        <div className={styles.inlineNotice}>Install `supabase/quote_project_workflow_setup.sql` before projects can be listed.</div>
      ) : null}
      {feedback ? <div className={styles.inlineNotice}>{feedback}</div> : null}

      <div className={styles.productsTableWrap}>
        <table className={styles.productsTable}>
          <thead>
            <tr>
              <th className={styles.rowSelectCol}>
                <input
                  type="checkbox"
                  checked={projectPagination.pageItems.length > 0 && projectPagination.pageItems.every((project) => selectedProjectIds.includes(project.id))}
                  onChange={(event) => toggleSelectedProjectPage(event.target.checked)}
                  aria-label="Select all visible projects"
                />
              </th>
              <th>Project</th>
              <th>Customer</th>
              <th>Job</th>
              <th>Progress</th>
              <th>Status</th>
              <th>Total</th>
              <th>Accepted</th>
              <th className={styles.actionsCol}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {projectPagination.pageItems.map((project) => {
              const progress = getProgress(project);

              return (
                <tr
                  key={project.id}
                  className={styles.rowClickable}
                  onClick={() => router.push(`/admin/projects/${project.id}`)}
                >
                  <td className={styles.rowSelectCol} onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.includes(project.id)}
                      onChange={() => toggleSelectedProject(project.id)}
                      aria-label={`Select project ${project.project_number || project.id}`}
                    />
                  </td>
                  <td className={styles.productNameCell}>{project.project_number}</td>
                  <td>{project.customer_name || "-"}</td>
                  <td>{project.name || "-"}</td>
                  <td>
                    <div className={styles.projectProgressCell}>
                      <div className={styles.projectProgressTrack} aria-hidden="true">
                        <span className={styles.projectProgressFill} style={{ width: `${progress.percent}%` }} />
                      </div>
                      <span>
                        {progress.completeCount}/{progress.totalCount} complete
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.statusPill} ${getProjectStatusClass(project.status)}`}>
                      {formatAdminLabel(project.status || "active")}
                    </span>
                  </td>
                  <td>{formatMoney(project.total_inc_gst, "AUD")}</td>
                  <td>{formatDate(project.accepted_at || project.created_at)}</td>
                  <td className={styles.actionsCol}>
                    <AdminActionDropdown label={`Open actions for project ${project.project_number || project.id}`}>
                      <button type="button" className={styles.tableActionMenuItem} onClick={() => router.push(`/admin/projects/${project.id}`)}>
                        Open
                      </button>
                      <AdminConfirmDeleteAction disabled={isDeleting} onConfirm={() => deleteProjects([project.id])} />
                    </AdminActionDropdown>
                  </td>
                </tr>
              );
            })}

            {!projects.length && !isLoading ? (
              <tr>
                <td colSpan="9" className={styles.emptyCell}>
                  No projects yet. Approved quotes will create projects automatically.
                </td>
              </tr>
            ) : null}

            {isLoading ? (
              <tr>
                <td colSpan="9" className={styles.emptyCell}>
                  Loading projects...
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <AdminTablePagination
        label="projects"
        page={projectPagination.page}
        pageCount={projectPagination.pageCount}
        totalItems={projectPagination.totalItems}
        onPageChange={projectPagination.setPage}
      />
    </section>
  );
}

