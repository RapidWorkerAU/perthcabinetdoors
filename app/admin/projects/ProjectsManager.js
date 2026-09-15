"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "../../../lib/pcd-quote-utils";
import styles from "../admin-content.module.css";
import { formatAdminLabel } from "../_utils/formatAdminLabel";
import { AdminPagination, useAdminPagination } from "../_components/AdminPagination";
import { ActionMenu, ActionMenuItem } from "@/components/ui/ActionMenu";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { ConfirmModal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import AdminLoading from "@/components/admin/AdminLoading";
import { tableStyles as t } from "@/components/ui/table-styles";
import { cn } from "@/lib/utils";

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
  const [confirmDeleteIds, setConfirmDeleteIds] = useState([]);

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

  const loadProjects = useCallback(async () => {
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
  }, [toast]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

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
      setConfirmDeleteIds([]);
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

  function statusPill(project) {
    const tone = project.status === "complete"
      ? "bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]"
      : (project.status === "cancelled" || project.status === "on_hold")
      ? "bg-[#fef2f2] text-[#b91c1c] border-[#fca5a5]"
      : "bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]";
    return (
      <span className={`inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border ${tone}`}>
        {formatAdminLabel(project.status || "active")}
      </span>
    );
  }

  function progressBar(project) {
    const progress = getProgress(project);
    return (
      <div className="flex items-center gap-2">
        <div className="w-[80px] h-[8px] rounded-full bg-[#eeecea] overflow-hidden flex-shrink-0" aria-hidden="true">
          <span className="block h-full bg-[#1a2e20] rounded-full" style={{ width: `${progress.percent}%` }} />
        </div>
        <span className="text-[12px] text-[#5a5a52] whitespace-nowrap">{progress.completeCount}/{progress.totalCount} complete</span>
      </div>
    );
  }

  // One menu for the table and the phone card, so they cannot offer different things.
  function actionMenu(project) {
    return (
      <ActionMenu label={`Open actions for project ${project.project_number || project.id}`}>
        <ActionMenuItem variant="danger" disabled={isDeleting} onClick={() => setConfirmDeleteIds([project.id])}>
          Delete
        </ActionMenuItem>
      </ActionMenu>
    );
  }

  function selectBox(project) {
    return (
      <input
        type="checkbox"
        checked={selectedProjectIds.includes(project.id)}
        onChange={() => toggleSelectedProject(project.id)}
        aria-label={`Select project ${project.project_number || project.id}`}
        className={t.checkbox}
      />
    );
  }

  const emptyMessage = "No projects yet. Approved quotes will create projects automatically.";
  const showEmpty = !projects.length && !isLoading;

  // First load owns the whole content area. A refresh with projects already on
  // screen leaves them there rather than blanking the page.
  if (isLoading && !projects.length) {
    return <AdminLoading steps={["Loading your projects", "Almost there"]} label="Loading projects" />;
  }

  return (
    <section className={styles.productsSection}>
      <div className={`${styles.productsHeaderBar} ${styles.tableToolbar}`}>
        <div className={styles.tableToolbarFilters}>
          {selectedProjectIds.length > 0 ? (
            <BulkActionBar
              selectedCount={selectedProjectIds.length}
              noun="project"
              variant="inline"
              onClear={() => setSelectedProjectIds([])}
              onDelete={() => setConfirmDeleteIds(selectedProjectIds)}
              deleting={isDeleting}
            />
          ) : null}
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

      {/* Built from the shared tokens rather than AdminDataTable, because the
          totals sit in this page's own toolbar above the card. */}
      <div className={cn(t.card, t.desktopOnly)}>
        <div className={t.sideScroll}>
          <table className={t.tableWide}>
            <thead>
              <tr>
                <th className={cn(t.th, "w-[40px]")}>
                  <input
                    type="checkbox"
                    checked={pageItems.length > 0 && pageItems.every((project) => selectedProjectIds.includes(project.id))}
                    onChange={(event) => toggleSelectedProjectPage(event.target.checked)}
                    aria-label="Select all visible projects"
                    className={t.checkbox}
                  />
                </th>
                {['Project', 'Customer', 'Job', 'Progress', 'Status', 'Total', 'Accepted', 'Actions'].map(h => (
                  <th key={h} className={t.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className={t.body}>
              {pageItems.map((project) => (
                <tr
                  key={project.id}
                  className={t.rowClickable}
                  onClick={() => router.push(`/admin/projects/${project.id}`)}
                >
                  <td className={t.td} onClick={(event) => event.stopPropagation()}>
                    {selectBox(project)}
                  </td>
                  <td className={cn(t.td, "font-medium")}>{project.project_number}</td>
                  <td className={t.td}>{project.customer_name || "-"}</td>
                  <td className={t.td}>{project.name || "-"}</td>
                  <td className={t.td}>{progressBar(project)}</td>
                  <td className={t.td}>{statusPill(project)}</td>
                  <td className={cn(t.td, t.num)}>{formatMoney(project.total_inc_gst, "AUD")}</td>
                  <td className={t.td}>{formatDate(project.accepted_at || project.created_at)}</td>
                  <td className={t.td} onClick={(event) => event.stopPropagation()}>
                    {actionMenu(project)}
                  </td>
                </tr>
              ))}

              {showEmpty ? (
                <tr>
                  <td colSpan="9" className={t.empty}>{emptyMessage}</td>
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

      {/* Below md the rows become cards. The project number opens the project, as the row does. */}
      <div className={t.mobileList}>
        {showEmpty ? <div className={cn(t.card, t.empty)}>{emptyMessage}</div> : null}
        {pageItems.map((project) => (
          <article key={project.id} className={t.mobileCard}>
            <div className="flex items-start gap-3">
              {selectBox(project)}
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => router.push(`/admin/projects/${project.id}`)}
                  className="text-left text-[14px] font-semibold text-[#1a1a18]"
                >
                  {project.project_number}
                </button>
                <p className="text-[12px] text-[#5a5a52]">{project.customer_name || "-"}</p>
              </div>
              {statusPill(project)}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
              <div className="col-span-2">
                <dt className="text-[#8b8a81]">Job</dt>
                <dd className="text-[#1a1a18]">{project.name || "-"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[#8b8a81]">Progress</dt>
                <dd>{progressBar(project)}</dd>
              </div>
              <div>
                <dt className="text-[#8b8a81]">Total</dt>
                <dd className={cn(t.num, "text-[#1a1a18]")}>{formatMoney(project.total_inc_gst, "AUD")}</dd>
              </div>
              <div>
                <dt className="text-[#8b8a81]">Accepted</dt>
                <dd className="text-[#1a1a18]">{formatDate(project.accepted_at || project.created_at)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex items-center justify-end border-t border-[#edf4eb] pt-3">
              {actionMenu(project)}
            </div>
          </article>
        ))}
        {projects.length ? (
          <AdminPagination
            label="projects"
            page={page}
            pageCount={pageCount}
            totalItems={totalItems}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      <ConfirmModal
        open={confirmDeleteIds.length > 0}
        onClose={() => setConfirmDeleteIds([])}
        title={confirmDeleteIds.length === 1 ? "Delete project?" : "Delete projects?"}
        description={
          confirmDeleteIds.length === 1
            ? "This project will be permanently removed."
            : `${confirmDeleteIds.length} projects will be permanently removed.`
        }
        variant="danger"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => deleteProjects(confirmDeleteIds)}
        loading={isDeleting}
      />
    </section>
  );
}

