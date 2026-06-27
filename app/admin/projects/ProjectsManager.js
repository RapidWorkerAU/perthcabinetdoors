"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "../../../lib/pcd-quote-utils";
import styles from "../admin-content.module.css";
import { formatAdminLabel } from "../_utils/formatAdminLabel";
import { AdminActionDropdown, AdminBulkDeleteButton, AdminConfirmDeleteAction } from "../_components/AdminActionDropdown";
import { AdminPagination, useAdminPagination } from "../_components/AdminPagination";
import { useToast } from "@/components/ui/Toast";

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


function getProgress(project) {
  const items = sortedItems(project);
  const completeCount = items.filter((item) => item.status === "Complete").length;
  const totalCount = items.length;
  const percent = totalCount ? Math.round((completeCount / totalCount) * 100) : 0;

  return { completeCount, totalCount, percent };
}

export default function ProjectsManager() {
  const router = useRouter();
  const { toast } = useToast();
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
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
  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(projects);

  async function loadProjects() {
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/projects", { cache: "no-store" });
      const payload = await response.json();
      setSetupRequired(!!payload.setupRequired);
      setProjects(payload.projects || []);

      if (payload.error) {
        toast({ title: payload.error, variant: "error" });
      }
    } catch (error) {
      toast({ title: error?.message || "Could not load projects.", variant: "error" });
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
      toast({ title: `${ids.length} project${ids.length === 1 ? "" : "s"} deleted.`, variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not delete selected projects.", variant: "error" });
    } finally {
      setIsDeleting(false);
    }
  }

  function toggleSelectedProject(id) {
    setSelectedProjectIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectedProjectPage(checked) {
    const pageIds = pageItems.map((project) => project.id);
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

      <div className="bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                <th className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52] w-[40px]">
                  <input
                    type="checkbox"
                    checked={pageItems.length > 0 && pageItems.every((project) => selectedProjectIds.includes(project.id))}
                    onChange={(event) => toggleSelectedProjectPage(event.target.checked)}
                    aria-label="Select all visible projects"
                  />
                </th>
                {['Project', 'Customer', 'Job', 'Progress', 'Status', 'Total', 'Accepted', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((project) => {
                const progress = getProgress(project);
                const statusPill = project.status === "complete"
                  ? "bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]"
                  : (project.status === "cancelled" || project.status === "on_hold")
                  ? "bg-[#fef2f2] text-[#b91c1c] border-[#fca5a5]"
                  : "bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]";

                return (
                  <tr
                    key={project.id}
                    className="border-b border-[#edf4eb] hover:bg-[#f5f8f4] transition-colors last:border-b-0 cursor-pointer"
                    onClick={() => router.push(`/admin/projects/${project.id}`)}
                  >
                    <td className="px-4 py-[11px]" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedProjectIds.includes(project.id)}
                        onChange={() => toggleSelectedProject(project.id)}
                        aria-label={`Select project ${project.project_number || project.id}`}
                      />
                    </td>
                    <td className="px-4 py-[11px] font-medium text-[#1a1a18]">{project.project_number}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{project.customer_name || "-"}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{project.name || "-"}</td>
                    <td className="px-4 py-[11px]">
                      <div className="flex items-center gap-2">
                        <div className="w-[80px] h-[8px] rounded-full bg-[#eeecea] overflow-hidden flex-shrink-0" aria-hidden="true">
                          <span className="block h-full bg-[#1a2e20] rounded-full" style={{ width: `${progress.percent}%` }} />
                        </div>
                        <span className="text-[12px] text-[#5a5a52] whitespace-nowrap">{progress.completeCount}/{progress.totalCount} complete</span>
                      </div>
                    </td>
                    <td className="px-4 py-[11px]">
                      <span className={`inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border ${statusPill}`}>
                        {formatAdminLabel(project.status || "active")}
                      </span>
                    </td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{formatMoney(project.total_inc_gst, "AUD")}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{formatDate(project.accepted_at || project.created_at)}</td>
                    <td className="px-4 py-[11px]">
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
                  <td colSpan="9" className="px-4 py-[20px] text-center text-[#8b8a81] text-[13px]">
                    No projects yet. Approved quotes will create projects automatically.
                  </td>
                </tr>
              ) : null}

              {isLoading ? (
                <tr>
                  <td colSpan="9" className="px-4 py-[20px] text-center text-[#8b8a81] text-[13px]">
                    Loading projects...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <AdminPagination
          label="projects"
          page={page}
          pageCount={pageCount}
          totalItems={totalItems}
          onPageChange={setPage}
        />
      </div>
    </section>
  );
}

