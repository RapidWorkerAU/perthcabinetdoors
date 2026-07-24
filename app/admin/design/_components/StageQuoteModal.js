"use client";

// The Stage Quote modal — the in-design-tool way to turn a design into a quote.
// A two-pane box: on the LEFT a Room ▸ Cabinet ▸ Part selection tree (tick what
// to include — everything starts on); on the RIGHT a live, priced preview of
// exactly those lines with a running total. Nothing is written until Commit.
// The preview and the commit both go through the same import handler (the
// preview is a dry-run of it), so what you see is what you get.

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../design.module.css";
import { formatMoney } from "../../../../lib/pcd-quote-utils";

// Part = the six per-cabinet selection categories the import handler tags lines
// with (plus "include" for a standalone item). Kept in a fixed order so a
// cabinet's leaves always read the same way.
const PART_ORDER = ["cabinet", "doors", "drawers", "kickboard", "filler", "panels"];
const PART_LABELS = {
  cabinet: "Carcass & shelves",
  doors: "Doors",
  drawers: "Drawers",
  kickboard: "Kickboard",
  filler: "Filler panel",
  panels: "End / back / benchtop panels",
  include: "Include",
};

// ── Right-pane table styling (mirrors the cut-list columns) ──
const card = { background: "#fff", border: "1px solid #e6e2d8", borderRadius: 10, marginBottom: 14, overflow: "hidden" };
const th = { textAlign: "left", fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: "#8a8780", padding: "7px 10px", borderBottom: "1px solid #e6e2d8", whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid #f2efe7", fontSize: 12, color: "#1c1c1a", verticalAlign: "top" };
const tdNum = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const btn = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d8d3c8", background: "#fff", cursor: "pointer", font: "inherit", fontSize: 13 };
const btnPrimary = { ...btn, background: "#2f5d8f", color: "#fff", borderColor: "#2f5d8f", fontWeight: 600 };

const dash = (v) => (v === "" || v === null || v === undefined ? "—" : v);
const dims = (l) => (l.width_mm || l.height_mm ? `${l.width_mm || "—"} × ${l.height_mm || "—"}` : "—");
const finishOf = (l) => [l.colour, l.finish].filter(Boolean).join(" · ") || "—";

// Distinct parts a cabinet actually produces, in canonical order — derived from
// its lines in the first (everything-on) preview so the tree is complete.
function partsFromLines(lines) {
  const present = new Set(lines.map((l) => l.part));
  return PART_ORDER.filter((p) => present.has(p));
}

// Preferred: the server's complete item tree (every importable item, including
// duplicates whose lines merge under another in the priced view). Falls back to
// deriving from the merged groups only for an older response without `tree`.
function normalizeServerTree(tree) {
  return (tree || []).map((g) => ({
    room: g.room,
    nodes: (g.items || []).map((n) => ({
      itemId: n.itemId,
      label: n.label,
      isCabinet: !!n.isCabinet,
      parts: n.parts || [],
    })),
  }));
}

function buildTree(groups) {
  return (groups || []).map((g) => ({
    room: g.room,
    nodes: (g.cabinets || []).map((c) => ({
      itemId: c.itemId,
      label: c.label,
      isCabinet: !!c.isCabinet,
      parts: c.isCabinet ? partsFromLines(c.lines || []) : [],
    })),
  }));
}

function initSelections(tree) {
  const sel = {};
  for (const room of tree) {
    for (const node of room.nodes) {
      sel[node.itemId] = node.isCabinet
        ? Object.fromEntries(node.parts.map((p) => [p, true]))
        : { include: true };
    }
  }
  return sel;
}

const nodeFullyOn = (node, sel) =>
  node.isCabinet ? node.parts.every((p) => sel[node.itemId]?.[p]) : !!sel[node.itemId]?.include;
const nodeAnyOn = (node, sel) =>
  node.isCabinet ? node.parts.some((p) => sel[node.itemId]?.[p]) : !!sel[node.itemId]?.include;

// A checkbox that can also show the "some but not all" indeterminate state.
function TriCheckbox({ checked, indeterminate, onChange, ...rest }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !checked && indeterminate; }, [checked, indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} {...rest} />;
}

export default function StageQuoteModal({ projectId, onClose }) {
  const [treeReady, setTreeReady] = useState(false);
  const [tree, setTree] = useState([]);
  const [selections, setSelections] = useState({});

  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [groups, setGroups] = useState([]);
  const [totals, setTotals] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [warningsOpen, setWarningsOpen] = useState(false); // collapsed by default each time the modal opens
  const [lineCount, setLineCount] = useState(0);

  // Commit bar
  const [quotes, setQuotes] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitWarnings, setCommitWarnings] = useState(null);
  const [commitError, setCommitError] = useState("");
  const [done, setDone] = useState(null); // { quoteId, created, deleted }

  const reqIdRef = useRef(0);
  const skipNextRef = useRef(false);

  // Esc closes.
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const postPreview = useCallback(async (sel) => {
    const res = await fetch(`/api/admin/design/projects/${projectId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sel ? { preview: true, selections: sel } : { preview: true }),
    });
    return res.json();
  }, [projectId]);

  // First load: everything on → builds the tree AND shows the full preview.
  const loadInitial = useCallback(async () => {
    setInitLoading(true); setInitError("");
    try {
      const data = await postPreview(null);
      if (!data.ok) { setInitError(data.error || "Could not build the preview."); return; }
      const t = data.tree ? normalizeServerTree(data.tree) : buildTree(data.groups);
      skipNextRef.current = true; // the effect below fires when selections init — that state == this load, so don't re-fetch
      setTree(t);
      setSelections(initSelections(t));
      setProjectName(data.project || "");
      setGroups(data.groups || []);
      setTotals(data.totals || {});
      setWarnings(data.warnings || []);
      setLineCount(data.line_count || 0);
      setTreeReady(true);
    } catch {
      setInitError("Could not build the preview.");
    } finally { setInitLoading(false); }
  }, [postPreview]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  // Quotes list for the commit dropdown.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/quotes");
        const data = await res.json();
        if (data.ok) setQuotes(data.quotes || []);
      } catch { /* non-fatal */ }
    })();
  }, []);

  // Live re-price whenever the selection changes (debounced). A request id
  // guards against a slow earlier response overwriting a newer one.
  useEffect(() => {
    if (!treeReady) return;
    if (skipNextRef.current) { skipNextRef.current = false; return; }
    const handle = setTimeout(async () => {
      const id = ++reqIdRef.current;
      setRefreshing(true);
      try {
        const data = await postPreview(selections);
        if (id !== reqIdRef.current) return; // superseded
        if (data.ok) {
          setGroups(data.groups || []);
          setTotals(data.totals || {});
          setWarnings(data.warnings || []);
          setLineCount(data.line_count || 0);
        }
      } catch { /* keep the last good preview */ }
      finally { if (id === reqIdRef.current) setRefreshing(false); }
    }, 300);
    return () => clearTimeout(handle);
  }, [selections, treeReady, postPreview]);

  // ── Selection mutators ──
  const setNode = useCallback((node, value) => {
    setSelections((prev) => ({
      ...prev,
      [node.itemId]: node.isCabinet
        ? Object.fromEntries(node.parts.map((p) => [p, value]))
        : { include: value },
    }));
  }, []);

  const setPart = useCallback((node, part, value) => {
    setSelections((prev) => ({ ...prev, [node.itemId]: { ...prev[node.itemId], [part]: value } }));
  }, []);

  const setRoom = useCallback((room, value) => {
    setSelections((prev) => {
      const next = { ...prev };
      for (const node of room.nodes) {
        next[node.itemId] = node.isCabinet
          ? Object.fromEntries(node.parts.map((p) => [p, value]))
          : { include: value };
      }
      return next;
    });
  }, []);

  // ── Commit ──
  async function runImport(quoteId, force) {
    const res = await fetch(`/api/admin/design/projects/${projectId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quote_id: quoteId, force, selections }),
    });
    return res.json();
  }

  async function commit(quoteId = selectedId, force = false) {
    if (!quoteId) { setCommitError("Choose a quote to commit to, or create one."); return; }
    setCommitting(true); setCommitError("");
    try {
      const data = await runImport(quoteId, force);
      if (data.needsConfirmation) { setCommitWarnings({ quoteId, warnings: data.warnings }); return; }
      if (!data.ok) { setCommitError(data.error || "Commit failed."); return; }
      setCommitWarnings(null);
      // The commit responds with { ok, results: { created, deleted, failed } }.
      const r = data.results || {};
      setDone({ quoteId, created: r.created || 0, deleted: r.deleted || 0, failed: r.failed || 0 });
    } catch {
      setCommitError("Commit failed.");
    } finally { setCommitting(false); }
  }

  async function createAndCommit() {
    const title = newTitle.trim();
    if (!title) { setCommitError("Enter a name for the new quote."); return; }
    setCreating(true); setCommitError("");
    try {
      const res = await fetch("/api/admin/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, lines: [] }),
      });
      const data = await res.json();
      if (!data.ok || !data.quote?.id) { setCommitError(data.error || "Could not create quote."); return; }
      await commit(data.quote.id, false);
    } catch {
      setCommitError("Could not create quote.");
    } finally { setCreating(false); }
  }

  if (typeof document === "undefined") return null;

  const t = totals || {};

  return createPortal(
    <>
      <div className={styles.modalBackdrop} onClick={onClose} />
      <div className={`${styles.modalBox} ${styles.stageModalBox}`} role="dialog" aria-modal="true" aria-label="Stage quote">
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            Stage quote{projectName ? ` — ${projectName}` : ""}
            {refreshing && <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 500, color: "#8a8780" }}>updating…</span>}
          </h2>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {initLoading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a8780" }}>
            Building the quote preview…
          </div>
        ) : initError ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: "#b44230", margin: 0 }}>{initError}</p>
            <button type="button" style={btn} onClick={loadInitial}>Retry</button>
          </div>
        ) : done ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1c1c1a" }}>
              {done.created} line{done.created === 1 ? "" : "s"} committed to the quote.
            </div>
            {done.deleted > 0 && (
              <div style={{ fontSize: 12.5, color: "#7a5a2a" }}>
                {done.deleted} previously imported line{done.deleted === 1 ? " was" : "s were"} replaced.
              </div>
            )}
            {done.failed > 0 && (
              <div style={{ fontSize: 12.5, color: "#b44230" }}>
                {done.failed} line{done.failed === 1 ? "" : "s"} failed to save — check the quote.
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <a href={`/admin/quotes/${done.quoteId}`} target="_blank" rel="noreferrer" style={{ ...btnPrimary, textDecoration: "none" }}>
                Open quote ↗
              </a>
              <button type="button" style={btn} onClick={onClose}>Back to design</button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.stageBody}>
              {/* ── LEFT: selection tree ── */}
              <div className={styles.stagePaneSelect}>
                <p style={{ fontSize: 11.5, color: "#6b6a63", margin: "2px 4px 12px", lineHeight: 1.45 }}>
                  Tick what to put on the quote. Everything starts on — untick a room, a cabinet, or a single part.
                </p>
                {tree.map((room) => {
                  const anyOn = room.nodes.some((n) => nodeAnyOn(n, selections));
                  const allOn = room.nodes.length > 0 && room.nodes.every((n) => nodeFullyOn(n, selections));
                  return (
                    <div key={room.room} style={{ marginBottom: 10 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 4px", fontSize: 13, fontWeight: 700, color: "#1c1c1a", cursor: "pointer" }}>
                        <TriCheckbox checked={allOn} indeterminate={anyOn} onChange={(e) => setRoom(room, e.target.checked)} />
                        {room.room}
                      </label>
                      <div style={{ paddingLeft: 8 }}>
                        {room.nodes.map((node) => {
                          const full = nodeFullyOn(node, selections);
                          const any = nodeAnyOn(node, selections);
                          return (
                            <div key={node.itemId} style={{ marginTop: 4 }}>
                              <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 4px", fontSize: 12.5, fontWeight: 600, color: "#33322e", cursor: "pointer" }}>
                                <TriCheckbox checked={full} indeterminate={any} onChange={(e) => setNode(node, e.target.checked)} />
                                {node.label}
                              </label>
                              {node.isCabinet && node.parts.length > 0 && (
                                <div style={{ paddingLeft: 24 }}>
                                  {node.parts.map((part) => (
                                    <label key={part} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px", fontSize: 11.5, color: "#5f5e58", cursor: "pointer" }}>
                                      <input type="checkbox" checked={!!selections[node.itemId]?.[part]} onChange={(e) => setPart(node, part, e.target.checked)} />
                                      {PART_LABELS[part] || part}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {room.nodes.length === 0 && (
                          <p style={{ fontSize: 11, color: "#a8a49a", margin: "2px 4px" }}>Nothing quotable in this room.</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {tree.length === 0 && <p style={{ fontSize: 12, color: "#a8a49a" }}>Nothing to quote yet.</p>}
              </div>

              {/* ── RIGHT: live priced preview ── */}
              <div className={styles.stagePanePreview}>
                <p style={{ fontSize: 12, color: "#6b6a63", margin: "0 0 12px", lineHeight: 1.5 }}>
                  {lineCount} line{lineCount === 1 ? "" : "s"} — priced with the current colours, rates and business defaults. Nothing is saved until you commit.
                </p>

                {warnings.length > 0 && (
                  <div style={{ ...card, border: "1px solid #e7d3b0", background: "#fdf7ec" }}>
                    <button
                      type="button"
                      onClick={() => setWarningsOpen((o) => !o)}
                      aria-expanded={warningsOpen}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: "none", border: "none", cursor: "pointer", font: "inherit", textAlign: "left" }}
                    >
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#8a5a12", transition: "transform 150ms ease", transform: warningsOpen ? "rotate(90deg)" : "none" }}>▸</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#8a5a12" }}>
                        {warnings.length} thing{warnings.length === 1 ? "" : "s"} to check before committing
                      </span>
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "#a98a4a" }}>{warningsOpen ? "Hide" : "Show"}</span>
                    </button>
                    {warningsOpen && (
                      <ul style={{ margin: 0, padding: "0 14px 10px 32px", fontSize: 11.5, color: "#7a5a2a", lineHeight: 1.5 }}>
                        {warnings.map((w, i) => <li key={i}>{w.label}</li>)}
                      </ul>
                    )}
                  </div>
                )}

                {groups.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#a8a49a", padding: "24px 0", textAlign: "center" }}>
                    Nothing selected — tick something on the left to build the quote.
                  </p>
                ) : (
                  groups.map((group) => (
                    <div key={group.room} style={card}>
                      <div style={{ padding: "9px 12px", background: "#f7f5ef", borderBottom: "1px solid #e6e2d8", fontSize: 12.5, fontWeight: 700, color: "#1c1c1a" }}>
                        {group.room}
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                          <thead>
                            <tr>
                              <th style={th}>Part</th>
                              <th style={th}>Material</th>
                              <th style={th}>Thick</th>
                              <th style={th}>Finish / colour</th>
                              <th style={{ ...th, textAlign: "right" }}>W × H</th>
                              <th style={{ ...th, textAlign: "right" }}>Qty</th>
                              <th style={{ ...th, textAlign: "right" }}>Unit</th>
                              <th style={{ ...th, textAlign: "right" }}>Markup</th>
                              <th style={{ ...th, textAlign: "right" }}>Line</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.cabinets.map((cab) => <CabinetRows key={cab.itemId} cab={cab} />)}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}

                {/* Totals */}
                <div style={{ ...card, padding: "12px 16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 5, columnGap: 24, maxWidth: 380, marginLeft: "auto", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: "#6b6a63" }}>Materials ex GST</span><span style={{ textAlign: "right" }}>{formatMoney(t.material_cost_ex_gst)}</span>
                    <span style={{ color: "#6b6a63" }}>Labour ({t.labour_hours || 0}h × {formatMoney(t.worker_hourly_rate)})</span><span style={{ textAlign: "right" }}>{formatMoney(t.labour_cost_ex_gst)}</span>
                    <span style={{ color: "#6b6a63" }}>Subtotal ex GST</span><span style={{ textAlign: "right" }}>{formatMoney(t.subtotal_ex_gst)}</span>
                    <span style={{ color: "#6b6a63" }}>GST</span><span style={{ textAlign: "right" }}>{formatMoney(t.gst_amount)}</span>
                    <span style={{ fontWeight: 700 }}>Total inc GST</span><span style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(t.total_inc_gst)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Commit bar (footer) ── */}
            <div className={styles.modalFooter} style={{ flexWrap: "wrap", justifyContent: "flex-start" }}>
              {commitWarnings ? (
                <div style={{ width: "100%" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#8a5a12", marginBottom: 6 }}>Confirm before committing</div>
                  <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 12, color: "#7a5a2a", lineHeight: 1.5 }}>
                    {commitWarnings.warnings.map((w, i) => <li key={i}>{w.label}</li>)}
                  </ul>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" style={btnPrimary} disabled={committing} onClick={() => commit(commitWarnings.quoteId, true)}>
                      {committing ? "Committing…" : "Commit anyway"}
                    </button>
                    <button type="button" style={btn} onClick={() => setCommitWarnings(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap", width: "100%" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "#6b6a63" }}>
                    Commit to an existing quote
                    <select style={{ ...btn, minWidth: 220, cursor: "pointer" }} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                      <option value="">— choose a quote —</option>
                      {quotes.map((q) => (
                        <option key={q.id} value={q.id}>{[q.quote_number ? `#${q.quote_number}` : "", q.customer_name || q.title || "Untitled"].filter(Boolean).join(" — ")}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" style={btnPrimary} disabled={committing || !selectedId || lineCount === 0} onClick={() => commit()}>
                    {committing ? "Committing…" : "Commit to quote"}
                  </button>
                  <span style={{ color: "#b0aca2", padding: "0 2px 8px" }}>or</span>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "#6b6a63" }}>
                    Create a new quote
                    <input style={{ ...btn, minWidth: 200 }} placeholder="Quote name" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                  </label>
                  <button type="button" style={btn} disabled={creating || !newTitle.trim() || lineCount === 0} onClick={createAndCommit}>
                    {creating ? "Creating…" : "Create & commit"}
                  </button>
                  {commitError && <span style={{ fontSize: 12, color: "#b44230", flexBasis: "100%" }}>{commitError}</span>}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  );
}

// One cabinet's rows: a header row (label + subtotal) then a read-only row per part.
function CabinetRows({ cab }) {
  const subtotal = cab.lines.reduce((s, l) => s + (Number(l.material_cost_ex_gst) || 0), 0);
  return (
    <>
      <tr>
        <td colSpan={8} style={{ ...td, fontWeight: 600, background: "#faf9f4", borderBottom: "1px solid #ece8de" }}>{cab.label}</td>
        <td style={{ ...tdNum, fontWeight: 600, background: "#faf9f4", borderBottom: "1px solid #ece8de" }}>{formatMoney(subtotal)}</td>
      </tr>
      {cab.lines.map((l, i) => (
        <tr key={i}>
          <td style={{ ...td, paddingLeft: 20 }}>{dash(l.product_name || l.description)}</td>
          <td style={td}>{dash(l.material)}</td>
          <td style={td}>{dash(l.thickness)}</td>
          <td style={td}>{finishOf(l)}</td>
          <td style={tdNum}>{dims(l)}</td>
          <td style={tdNum}>{l.qty}</td>
          <td style={tdNum}>{formatMoney(l.product_unit_cost_ex_gst)}</td>
          <td style={tdNum}>{formatMoney(l.markup_amount_ex_gst)}</td>
          <td style={tdNum}>{formatMoney(l.material_cost_ex_gst)}</td>
        </tr>
      ))}
    </>
  );
}
