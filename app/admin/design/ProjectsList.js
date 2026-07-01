"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
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
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

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
    try {
      const res = await fetch(`/api/admin/design/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete project.");
      setProjects((current) => current.filter((item) => item.id !== project.id));
      toast({ title: `"${project.name}" deleted.`, variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not delete project.", variant: "error" });
    } finally {
      setConfirmDeleteId(null);
    }
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

      <div className="bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
              {["Project", "Status", "Rooms", ""].map((col) => (
                <th key={col} className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="py-12 text-center text-[13px] text-[#8b8a81]">Loading projects…</td></tr>
            )}
            {!loading && !projects.length && (
              <tr><td colSpan={4} className="py-12 text-center text-[13px] text-[#8b8a81]">No design projects yet.</td></tr>
            )}
            {projects.map((project) => {
              const roomCount = project.pcd_design_rooms?.length ?? 0;
              const isConfirming = confirmDeleteId === project.id;
              return (
                <tr key={project.id} className="border-b border-[#edf4eb] hover:bg-[#f5f8f4] transition-colors last:border-b-0">
                  <td className="px-4 py-[11px] font-medium text-[#1a1a18]">{project.name}</td>
                  <td className="px-4 py-[11px]">
                    <span className={`inline-flex items-center px-2 py-[2px] rounded-full text-[11px] font-medium ${statusPillClass(project.status)}`}>
                      {formatAdminLabel(project.status || "draft")}
                    </span>
                  </td>
                  <td className="px-4 py-[11px] text-[#1a1a18]">{roomCount} room{roomCount !== 1 ? "s" : ""}</td>
                  <td className="px-4 py-[11px] text-right">
                    <div className="flex items-center justify-end gap-3">
                      {isConfirming ? (
                        <>
                          <span className="text-[12px] text-[#5a5a52]">Delete?</span>
                          <button type="button" className="text-[12px] font-medium text-[#b42318] hover:underline" onClick={() => handleDelete(project)}>
                            Confirm
                          </button>
                          <button type="button" className="text-[12px] font-medium text-[#5a5a52] hover:underline" onClick={() => setConfirmDeleteId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="text-[12px] font-medium text-[#b42318] hover:underline" onClick={() => setConfirmDeleteId(project.id)}>
                            Delete
                          </button>
                          <Link href={`/admin/design/${project.id}`} className="text-[12px] font-medium text-[#6b9e61] hover:underline">
                            Open
                          </Link>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
