"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../design.module.css";
import { Dropdown } from "@/components/ui/Dropdown";

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet", "blind_corner_cabinet"];

const TYPE_LABELS = {
  base_cabinet: "Base Cabinet",
  wall_cabinet: "Wall Cabinet",
  tall_cabinet: "Tall Cabinet",
  corner_base_cabinet: "Corner Base Cabinet",
  blind_corner_cabinet: "Blind Corner Cabinet",
  door: "Door",
  drawer_front: "Drawer Front",
  panel: "Panel",
  scribe: "Scribe",
};

function itemLabel(item) {
  return item.label || TYPE_LABELS[item.item_type] || item.item_type;
}


// Door vs drawer-front piece counts, split so each front gets its own toggle.
// A mixed cabinet contributes to both from its sections; a corner is one
// bi-fold door per wall it touches.
function frontCounts(item) {
  if (item.item_type === "corner_base_cabinet") return { doors: item.secondary_wall ? 2 : 1, drawers: 0 };
  const ft = item.front_type;
  if (ft === "doors") {
    const cfg = item.door_config || {};
    return { doors: Math.max(1, cfg.columns || 1) * Math.max(1, cfg.rows || 1), drawers: 0 };
  }
  if (ft === "drawers") {
    const h = item.drawer_config?.heights_mm;
    return { doors: 0, drawers: Array.isArray(h) && h.length ? h.length : 1 };
  }
  if (ft === "mixed") {
    const sections = Array.isArray(item.section_config?.sections) ? item.section_config.sections : [];
    let doors = 0, drawers = 0;
    for (const s of sections) {
      if (s.type === "doors") { const cfg = s.door || {}; doors += Math.max(1, cfg.columns || 1) * Math.max(1, cfg.rows || 1); }
      else if (s.type === "drawers") { const h = s.drawer?.heights_mm; drawers += Array.isArray(h) && h.length ? h.length : 1; }
    }
    return { doors, drawers };
  }
  return { doors: 0, drawers: 0 };
}

function hasFinishedPanels(item) {
  return Boolean(item.end_panel_left || item.end_panel_right || item.has_back_panel ||
    item.has_bottom_panel || item.back_panel_wall1 || item.back_panel_wall2);
}

// The individually-importable parts of a cabinet, in display order. Only the
// parts actually turned on for this cabinet appear — so the checkboxes always
// match what the cabinet really has.
function importableParts(item) {
  const parts = [{ key: "cabinet", label: "Cabinet" }];
  const { doors, drawers } = frontCounts(item);
  if (doors > 0)   parts.push({ key: "doors",   label: `Doors (${doors})` });
  if (drawers > 0) parts.push({ key: "drawers", label: `Drawer fronts (${drawers})` });
  if (item.has_kickboard && item.item_type !== "wall_cabinet") parts.push({ key: "kickboard", label: "Kickboard" });
  if (item.has_filler_panel && (item.item_type === "wall_cabinet" || item.item_type === "tall_cabinet")) parts.push({ key: "filler", label: "Filler panel" });
  if (hasFinishedPanels(item)) parts.push({ key: "panels", label: "Finished panels" });
  return parts;
}

function defaultSelections(items) {
  const map = {};
  for (const item of items) {
    if (CABINET_TYPES.includes(item.item_type)) {
      const sel = {};
      for (const p of importableParts(item)) sel[p.key] = true;
      map[item.id] = sel;
    } else {
      map[item.id] = { include: true };
    }
  }
  return map;
}

const DEFAULT_TERMS =
  "Prices are valid for 14 days. Final measurements and site conditions may affect the final invoice.";

const EMPTY_CREATE_FORM = {
  customer_name:  "",
  title:          "Cabinetry Quote",
  customer_email: "",
  customer_phone: "",
  site_address:   "",
  project_name:   "",
  notes:          "",
};

function groupByRoom(items, rooms) {
  const roomNameById = new Map((rooms || []).map((r) => [r.id, r.name]));
  const order = [];
  const groups = new Map();
  for (const item of items) {
    const key = item.room_id || "__none__";
    if (!groups.has(key)) {
      groups.set(key, { key, name: item.room_id ? roomNameById.get(item.room_id) || "Room" : "Unassigned", items: [] });
      order.push(key);
    }
    groups.get(key).items.push(item);
  }
  return order.map((key) => groups.get(key));
}

export default function ImportModal({ projectId, items: allItems, rooms, onClose }) {
  const router = useRouter();
  // Obstructions are spatial-only (walls, nib walls, recesses) — never
  // manufactured or quoted, so they never appear in the import list at all.
  const items = useMemo(() => allItems.filter((i) => i.item_type !== "obstruction"), [allItems]);
  const [quotes, setQuotes]       = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading]     = useState(true);
  const [busy, setBusy]           = useState(false);
  const [result, setResult]       = useState(null);
  const [warnings, setWarnings]   = useState(null);
  const [error, setError]         = useState("");
  const [selections, setSelections] = useState(() => defaultSelections(items));
  const [mode, setMode]           = useState("pick");
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [createdQuote, setCreatedQuote] = useState(null);

  const roomGroups = useMemo(() => groupByRoom(items, rooms), [items, rooms]);

  const selectedCount = items.filter((item) => {
    const sel = selections[item.id];
    if (!sel) return false;
    return CABINET_TYPES.includes(item.item_type)
      ? Object.values(sel).some(Boolean)
      : sel.include;
  }).length;

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res  = await fetch("/api/admin/quotes");
        const data = await res.json();
        if (data.ok) setQuotes(data.quotes || []);
      } catch { /* swallow */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const selectedQuote = quotes.find((q) => q.id === selectedId) || null;
  const quoteOptions = useMemo(() => quotes.map((q) => ({ value: q.id, label: quoteLabel(q) })), [quotes]);

  const createValid = Boolean(
    createForm.customer_name.trim() &&
    createForm.title.trim() &&
    (createForm.customer_email.trim() || createForm.customer_phone.trim())
  );

  function setCabinetPart(itemId, part, value) {
    setSelections((current) => ({
      ...current,
      [itemId]: { ...current[itemId], [part]: value },
    }));
  }

  function setStandaloneInclude(itemId, value) {
    setSelections((current) => ({
      ...current,
      [itemId]: { include: value },
    }));
  }

  function selectAll() {
    setSelections(defaultSelections(items));
  }

  // "Doors, drawers & panels" — every visible front or finished panel: doors,
  // drawer fronts, a cabinet's finished panels, and standalone finish panels —
  // but not the carcass, kickboards, fillers or scribes.
  function doorsOnly() {
    setSelections((current) => {
      const next = { ...current };
      for (const item of items) {
        if (CABINET_TYPES.includes(item.item_type)) {
          const sel = {};
          for (const p of importableParts(item)) {
            sel[p.key] = p.key === "doors" || p.key === "drawers" || p.key === "panels";
          }
          next[item.id] = sel;
        } else {
          // Standalone finish panels come in; scribes and other standalones don't.
          next[item.id] = { include: item.item_type === "panel" };
        }
      }
      return next;
    });
  }

  function updateCreateForm(field, value) {
    setCreateForm((current) => ({ ...current, [field]: value }));
  }

  function openCreate() {
    setError("");
    setMode("create");
  }

  function backToPick() {
    setError("");
    setMode("pick");
  }

  // Quote id is passed explicitly so create-then-import can run in one go without
  // waiting for the selectedId state update to land.
  async function handleImport(force = false, quoteId = selectedId) {
    if (!quoteId) { setError("Please select a quote."); return; }
    setBusy(true); setError("");
    try {
      const res  = await fetch(`/api/admin/design/projects/${projectId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: quoteId, force, selections }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Import failed.");
      if (data.needsConfirmation) {
        setWarnings(data.warnings || []);
        return;
      }
      setWarnings(null);
      setResult(data.results);
    } catch (err) {
      setError(err?.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateAndImport() {
    const name  = createForm.customer_name.trim();
    const title = createForm.title.trim();
    const email = createForm.customer_email.trim();
    const phone = createForm.customer_phone.trim();
    if (!name)  { setError("Customer name is required."); return; }
    if (!title) { setError("Quote title is required."); return; }
    if (!email && !phone) { setError("Enter a customer email or phone number."); return; }

    setBusy(true); setError("");
    let quote;
    try {
      // quote_number and access_code are generated server-side; customer_name/email
      // are enough for the server to find-or-create the linked pcd_customers row.
      const res = await fetch("/api/admin/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          currency: "AUD",
          gst_rate: 0.1,
          terms: DEFAULT_TERMS,
          customer_name:  name,
          customer_email: email || null,
          customer_phone: phone || null,
          site_address:   createForm.site_address.trim() || null,
          project_name:   createForm.project_name.trim() || null,
          notes:          createForm.notes.trim() || null,
          lines: [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.quote?.id) throw new Error(data.error || "Could not create quote.");
      quote = data.quote;
    } catch (err) {
      setError(err?.message || "Could not create quote.");
      return;
    } finally {
      setBusy(false);
    }

    // Drop back to "pick" once the quote exists so backing out of the warnings step
    // can't resubmit the create form and make a second quote.
    setQuotes((current) => [quote, ...current]);
    setSelectedId(quote.id);
    setCreatedQuote(quote);
    setMode("pick");
    await handleImport(false, quote.id);
  }

  function quoteLabel(q) {
    const num  = q.quote_number ? `#${q.quote_number}` : "";
    const name = q.customer_name || "Untitled";
    return [num, name].filter(Boolean).join(" — ");
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className={styles.modalBackdrop} onClick={onClose} />
      <div className={styles.modalBox} role="dialog" aria-modal="true" aria-label="Import to Quote">
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Import to Quote</h2>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          {result ? (
            <>
              <div className={styles.importSuccess}>
                <strong>{result.created} item{result.created !== 1 ? "s" : ""} imported</strong>{" "}
                {createdQuote ? (
                  <>into your new quote <strong>{quoteLabel(createdQuote)}</strong>.</>
                ) : (
                  "into the selected quote."
                )}
                {result.deleted > 0 && (
                  <p style={{ marginTop: 6 }}>
                    {result.deleted} previously imported line{result.deleted !== 1 ? "s were" : " was"} replaced.
                  </p>
                )}
                {result.failed > 0 && (
                  <p style={{ marginTop: 6 }}>
                    {result.failed} item{result.failed !== 1 ? "s" : ""} failed:{" "}
                    {result.errors?.join("; ")}
                  </p>
                )}
              </div>
              <p style={{ fontSize: 13, color: "var(--dt-text-soft, #5f5e5a)", margin: 0 }}>
                You can now open the quote to review the imported line items.
              </p>
            </>
          ) : warnings ? (
            <>
              {/* Warnings are no longer only "missing material" — a cabinet
                  with qty > 1 whose panels are shared across a continuous run
                  is flagged here too, since that can't be multiplied without
                  inventing material. Each label says what its own problem is. */}
              <div className={styles.importError}>
                <strong>{warnings.length} item{warnings.length !== 1 ? "s" : ""} need{warnings.length === 1 ? "s" : ""} attention.</strong>
                <p style={{ margin: "6px 0 0" }}>
                  You can go back and fix these, or import anyway and adjust in the quote editor.
                </p>
              </div>
              <ul style={{ margin: "10px 0 0", padding: "0 0 0 18px", fontSize: 13, color: "var(--dt-text, #1c1c1a)" }}>
                {warnings.map((w, i) => (
                  <li key={`${w.itemId}-${i}`}>{w.label}</li>
                ))}
              </ul>
            </>
          ) : mode === "create" ? (
            <>
              <div className={styles.fieldGroup}>
                <div className={styles.fieldRow}>
                  <label className={styles.modalFieldLabel}>
                    Customer name *
                    <input
                      className={styles.fieldInput}
                      value={createForm.customer_name}
                      onChange={(e) => updateCreateForm("customer_name", e.target.value)}
                      autoFocus
                    />
                  </label>
                  <label className={styles.modalFieldLabel}>
                    Quote title *
                    <input
                      className={styles.fieldInput}
                      value={createForm.title}
                      onChange={(e) => updateCreateForm("title", e.target.value)}
                    />
                  </label>
                </div>

                <div className={styles.fieldRow}>
                  <label className={styles.modalFieldLabel}>
                    Customer email
                    <input
                      className={styles.fieldInput}
                      type="email"
                      value={createForm.customer_email}
                      onChange={(e) => updateCreateForm("customer_email", e.target.value)}
                    />
                  </label>
                  <label className={styles.modalFieldLabel}>
                    Customer phone
                    <input
                      className={styles.fieldInput}
                      value={createForm.customer_phone}
                      onChange={(e) => updateCreateForm("customer_phone", e.target.value)}
                    />
                  </label>
                </div>
                <p style={{ margin: "-4px 0 0", fontSize: 12, color: "var(--dt-text-soft, #5f5e5a)" }}>
                  Enter at least one of customer email or phone.
                </p>

                <div className={styles.fieldRow}>
                  <label className={styles.modalFieldLabel}>
                    Site address
                    <input
                      className={styles.fieldInput}
                      value={createForm.site_address}
                      onChange={(e) => updateCreateForm("site_address", e.target.value)}
                    />
                  </label>
                  <label className={styles.modalFieldLabel}>
                    Project name
                    <input
                      className={styles.fieldInput}
                      value={createForm.project_name}
                      onChange={(e) => updateCreateForm("project_name", e.target.value)}
                    />
                  </label>
                </div>

                <label className={styles.modalFieldLabel}>
                  Notes
                  <textarea
                    className={styles.fieldTextarea}
                    value={createForm.notes}
                    onChange={(e) => updateCreateForm("notes", e.target.value)}
                  />
                </label>
              </div>

              <p style={{ fontSize: 13, color: "var(--dt-text-soft, #5f5e5a)", margin: 0 }}>
                {selectedCount} of {items.length} item{items.length !== 1 ? "s" : ""} will be imported once the quote is
                created. Go back to change the selection.
              </p>

              {error && <p className={styles.importError}>{error}</p>}
            </>
          ) : (
            <>
              {/* Not wrapped in .modalFieldLabel — that class's uppercase / bold /
                  letter-spacing cascade into the Dropdown and make its text look
                  oversized. The label span carries that styling on its own. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--dt-text-muted, #888780)" }}>
                    Select quote
                  </span>
                  <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={openCreate}>
                    Create a new quote
                  </button>
                </div>
                <Dropdown
                  options={quoteOptions}
                  value={selectedId}
                  onChange={(val) => setSelectedId(Array.isArray(val) ? val[0] || "" : val)}
                  placeholder={loading ? "Loading quotes…" : "Choose a quote"}
                  searchPlaceholder="Search by name, number…"
                  searchable
                  disabled={loading}
                  contentZIndex={1200}
                />
              </div>

              {!loading && quotes.length === 0 && (
                <div className={styles.modalSummary}>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--dt-text-soft, #5f5e5a)" }}>
                    You don’t have any quotes yet. Create one now and this design will be imported straight into it.
                  </p>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    style={{ marginTop: 10 }}
                    onClick={openCreate}
                  >
                    Create a new quote
                  </button>
                </div>
              )}

              {selectedQuote && (
                <div className={styles.modalSummary}>
                  <div className={styles.modalSummaryRow}>
                    <span className={styles.modalSummaryLabel}>Quote</span>
                    <span className={styles.modalSummaryValue}>{selectedQuote.status || "—"}</span>
                  </div>
                </div>
              )}

              <div className={styles.modalFieldLabel} style={{ marginTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span>What to import ({selectedCount} of {items.length} items selected)</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={selectAll}>
                      Select all
                    </button>
                    <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={doorsOnly}>
                      Doors, drawers &amp; panels
                    </button>
                  </div>
                </div>
              </div>

              <div
                style={{
                  border: "1px solid var(--dt-border-soft, rgba(0,0,0,0.08))",
                  borderRadius: "var(--dt-radius-md, 8px)",
                  padding: "10px 12px",
                  maxHeight: 240,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {roomGroups.map((group) => (
                  <div key={group.key}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--dt-text-muted, #888780)",
                        marginBottom: 6,
                      }}
                    >
                      {group.name}
                    </div>
                    {group.items.map((item) => {
                      const isCabinet = CABINET_TYPES.includes(item.item_type);
                      const sel = selections[item.id] || {};
                      return (
                        <div
                          key={item.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "6px 0",
                            borderTop: "1px solid var(--dt-border-soft, rgba(0,0,0,0.08))",
                            fontSize: 13,
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              color: "var(--dt-text, #1c1c1a)",
                            }}
                          >
                            {itemLabel(item)}
                          </span>
                          <div style={{ display: "flex", gap: "6px 12px", flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0, maxWidth: "65%" }}>
                            {isCabinet ? (
                              // One checkbox per part the cabinet actually has —
                              // cabinet, doors, drawer fronts, kickboard, filler,
                              // finished panels — so it's a full per-item choice.
                              importableParts(item).map((p) => (
                                <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--dt-text-soft, #5f5e5a)", cursor: "pointer", whiteSpace: "nowrap" }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(sel[p.key])}
                                    onChange={(e) => setCabinetPart(item.id, p.key, e.target.checked)}
                                  />
                                  {p.label}
                                </label>
                              ))
                            ) : (
                              <label style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--dt-text-soft, #5f5e5a)", cursor: "pointer" }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(sel.include)}
                                  onChange={(e) => setStandaloneInclude(item.id, e.target.checked)}
                                />
                                Include
                              </label>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {error && <p className={styles.importError}>{error}</p>}
            </>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={warnings ? () => setWarnings(null) : mode === "create" ? backToPick : onClose}
          >
            {result
              ? "Close"
              : warnings
              ? "Go back and configure"
              : mode === "create"
              ? "Back to quote list"
              : "Cancel"}
          </button>
          {result && (createdQuote?.id || selectedId) && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => router.push(`/admin/quotes/${createdQuote?.id || selectedId}`)}
            >
              Go to quote
            </button>
          )}
          {!result && (
            mode === "create" && !warnings ? (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleCreateAndImport}
                disabled={busy || !createValid || selectedCount === 0}
              >
                {busy
                  ? "Creating…"
                  : `Create quote & import ${selectedCount} item${selectedCount !== 1 ? "s" : ""}`}
              </button>
            ) : (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => handleImport(Boolean(warnings))}
                disabled={busy || !selectedId || (!warnings && selectedCount === 0)}
              >
                {busy
                  ? "Importing…"
                  : warnings
                  ? "Import all items anyway"
                  : `Import ${selectedCount} item${selectedCount !== 1 ? "s" : ""}`}
              </button>
            )
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
