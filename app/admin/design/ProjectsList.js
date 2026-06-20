"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./design.module.css";

function statusClass(status) {
  if (status === "ready") return styles.statusPillReady;
  if (status === "imported") return styles.statusPillImported;
  return styles.statusPillDraft;
}

export default function ProjectsList() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/design/projects");
      const data = await res.json();
      if (data.ok) setProjects(data.projects || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) { setFeedback("Project name is required."); return; }
    setBusy(true); setFeedback("");
    try {
      const res = await fetch("/api/admin/design/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not create project.");
      setProjects((p) => [data.project, ...p]);
      setAdding(false);
      setNewName("");
    } catch (err) {
      setFeedback(err?.message || "Could not create project.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(project) {
    if (!window.confirm(`Delete project "${project.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/design/projects/${project.id}`, { method: "DELETE" });
      if (res.ok) setProjects((p) => p.filter((x) => x.id !== project.id));
    } catch { /* swallow */ }
  }

  return (
    <div className={styles.listPage}>
      <div className={styles.listHeader}>
        <h2 className={styles.listHeading}>
          Design Projects {!loading && projects.length > 0 && `(${projects.length})`}
        </h2>
        {!adding && (
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => { setAdding(true); setFeedback(""); }}>
            + New Project
          </button>
        )}
      </div>

      {adding && (
        <div
          className={styles.newProjectForm}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) handleCreate(); if (e.key === "Escape") setAdding(false); }}
        >
          <label className={styles.newProjectField}>
            Project name
            <input
              className={styles.newProjectInput}
              placeholder="e.g. Smith Kitchen Reno"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </label>
          <div className={styles.newProjectActions}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleCreate} disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </button>
          </div>
          {feedback && <p className={styles.feedback}>{feedback}</p>}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#888", fontSize: 13 }}>Loading projects…</p>
      ) : projects.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No design projects yet.</p>
          {!adding && (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setAdding(true)}>
              Create your first project
            </button>
          )}
        </div>
      ) : (
        <div className={styles.projectGrid}>
          {projects.map((project) => {
            const roomCount = project.pcd_design_rooms?.length ?? 0;
            return (
              <div key={project.id} className={styles.projectCard}>
                <div className={styles.projectCardBody}>
                  <p className={styles.projectCardName}>{project.name}</p>
                  <div className={styles.projectCardMeta}>
                    <span className={`${styles.statusPill} ${statusClass(project.status)}`}>
                      {project.status}
                    </span>
                    <span>{roomCount} room{roomCount !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className={styles.projectCardFooter}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                    onClick={() => handleDelete(project)}
                  >
                    Delete
                  </button>
                  <Link
                    href={`/admin/design/${project.id}`}
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                  >
                    Open
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
