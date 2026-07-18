"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconFolderOpen, IconTrash } from "@tabler/icons-react";
import { useToast } from "@/components/ui/Toast";
import { DataTable } from "@/components/ui/DataTable";
import { formatAdminLabel } from "../_utils/formatAdminLabel";

const tw = {
  primaryBtn: "h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors",
  secondaryBtn: "h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors",
  fieldLabel: "flex flex-col gap-1 text-[11px] font-medium text-[#5a5a52]",
  fieldInput: "h-[34px] w-full border border-[#dbd8cc] rounded-[6px] px-3 text-[13px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61]",
};

function statusPillClass(status) {
  if (status === "ready") return "bg-[#edf4eb] text-[#2d5e28]";
  if (status === "imported") return "bg-[#e6f1fb] text-[#185fa5]";
  return "bg-[#f1efe8] text-[#5a5a52]";
}

export default function ProjectsList() {
  const { toast } = useToast();
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/design/projects");
      const data = await res.json();
      if (data.ok) setProjects(data.projects || []);
      else if (data.error) toast({ title: data.error, variant: "error" });
    } catch (error) {
      toast({ title: error?.message || "Could not load design projects.", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) {
      toast({ title: "Project name is required.", variant: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/design/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not create project.");
      setProjects((current) => [data.project, ...current]);
      setAdding(false);
      setNewName("");
    } catch (error) {
      toast({ title: error?.message || "Could not create project.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(project) {
    if (typeof window !== "undefined" && !window.confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/design/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete project.");
      setProjects((current) => current.filter((item) => item.id !== project.id));
      toast({ title: `"${project.name}" deleted.`, variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not delete project.", variant: "error" });
    }
  }

  const columns = [
    { key: "name", label: "Project" },
    {
      key: "status", label: "Status",
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-[2px] rounded-full text-[11px] font-medium ${statusPillClass(row.status)}`}>
          {formatAdminLabel(row.status || "draft")}
        </span>
      ),
    },
    {
      key: "rooms", label: "Rooms",
      render: (row) => {
        const count = row.pcd_design_rooms?.length ?? 0;
        return `${count} room${count !== 1 ? "s" : ""}`;
      },
    },
  ];

  const rowMenuItems = () => [
    { label: "Open designer", icon: <IconFolderOpen size={14} />, action: "open" },
    { label: "Delete", icon: <IconTrash size={14} />, action: "delete", variant: "danger" },
  ];

  function handleRowAction(action, row) {
    if (action === "open") router.push(`/admin/design/${row.id}`);
    else if (action === "delete") handleDelete(row);
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1a18]">Design Projects</h1>
          <p className="text-[13px] text-[#5a5a52] mt-[2px]">Plan rooms and cabinets, then import them into a quote.</p>
        </div>
        {!adding && (
          <button type="button" className={tw.primaryBtn} onClick={() => setAdding(true)}>
            + New Project
          </button>
        )}
      </div>

      {adding && (
        <div
          className="mb-4 bg-white border border-[#dbd8cc] rounded-[8px] p-4 flex items-end gap-3 flex-wrap"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !busy) handleCreate();
            if (event.key === "Escape") setAdding(false);
          }}
        >
          <label className={`${tw.fieldLabel} flex-1 min-w-[200px] uppercase tracking-[0.03em]`}>
            Project name
            <input
              className={tw.fieldInput}
              placeholder="e.g. Smith Kitchen Reno"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              autoFocus
            />
          </label>
          <div className="flex gap-2 flex-shrink-0 pb-[1px]">
            <button type="button" className={tw.primaryBtn} onClick={handleCreate} disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </button>
            <button type="button" className={tw.secondaryBtn} onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={projects}
        loading={loading}
        searchPlaceholder="Search projects…"
        emptyTitle="No design projects yet"
        emptyDescription="Create a project to plan rooms and cabinets."
        rowMenuItems={rowMenuItems}
        onRowAction={handleRowAction}
        onRowClick={(row) => router.push(`/admin/design/${row.id}`)}
      />
    </div>
  );
}
