"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "../../../lib/pcd-quote-utils";
import styles from "../admin-shell.module.css";

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
  const [feedback, setFeedback] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);

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

  return (
    <section className={styles.productsSection}>
      <div className={styles.productsHeaderBar}>
        <div>
          <p className={styles.tableMeta}>{isLoading ? "Loading projects" : `${projects.length} projects`}</p>
        </div>
        <div className={styles.rowActions}>
          <span className={styles.projectListMetric}>{totals.active} active</span>
          <span className={styles.projectListMetric}>
            {totals.lineItemsComplete}/{totals.lineItems} items complete
          </span>
          <button type="button" className={styles.secondaryButton} onClick={loadProjects} disabled={isLoading}>
            Refresh
          </button>
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
            {projects.map((project) => {
              const progress = getProgress(project);

              return (
                <tr
                  key={project.id}
                  className={styles.rowClickable}
                  onClick={() => router.push(`/admin/projects/${project.id}`)}
                >
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
                      {(project.status || "active").replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase())}
                    </span>
                  </td>
                  <td>{formatMoney(project.total_inc_gst, "AUD")}</td>
                  <td>{formatDate(project.accepted_at || project.created_at)}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.rowEditButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/admin/projects/${project.id}`);
                        }}
                      >
                        Open
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!projects.length && !isLoading ? (
              <tr>
                <td colSpan="8" className={styles.emptyCell}>
                  No projects yet. Approved quotes will create projects automatically.
                </td>
              </tr>
            ) : null}

            {isLoading ? (
              <tr>
                <td colSpan="8" className={styles.emptyCell}>
                  Loading projects...
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
