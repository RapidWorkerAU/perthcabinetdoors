"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import styles from "../design.module.css";

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet"];

const TYPE_LABELS = {
  base_cabinet: "Base Cabinet",
  wall_cabinet: "Wall Cabinet",
  tall_cabinet: "Tall Cabinet",
  corner_base_cabinet: "Corner Base Cabinet",
  door: "Door",
  drawer_front: "Drawer Front",
  panel: "Panel",
};

function itemLabel(item) {
  return item.label || TYPE_LABELS[item.item_type] || item.item_type;
}

function doorCountForItem(item) {
  const cfg = item.door_config || {};
  return Math.max(1, cfg.columns || 1) * Math.max(1, cfg.rows || 1);
}

function defaultSelections(items) {
  const map = {};
  for (const item of items) {
    map[item.id] = CABINET_TYPES.includes(item.item_type)
      ? { cabinet: true, doors: true }
      : { include: true };
  }
  return map;
}

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
  // Obstructions are spatial-only (walls, nib walls, recesses) — never
  // manufactured or quoted, so they never appear in the import list at all.
  const items = useMemo(() => allItems.filter((i) => i.item_type !== "obstruction"), [allItems]);
  const [quotes, setQuotes]       = useState([]);
  const [search, setSearch]       = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading]     = useState(true);
  const [busy, setBusy]           = useState(false);
  const [result, setResult]       = useState(null);
  const [warnings, setWarnings]   = useState(null);
  const [error, setError]         = useState("");
  const [selections, setSelections] = useState(() => defaultSelections(items));

  const roomGroups = useMemo(() => groupByRoom(items, rooms), [items, rooms]);

  const selectedCount = items.filter((item) => {
    const sel = selections[item.id];
    if (!sel) return false;
    return CABINET_TYPES.includes(item.item_type) ? sel.cabinet || sel.doors : sel.include;
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

  const filtered = quotes.filter((q) => {
    const term = search.toLowerCase();
    return (
      !term ||
      (q.customer_name || "").toLowerCase().includes(term) ||
      String(q.quote_number || "").includes(term)
    );
  });

  const selectedQuote = quotes.find((q) => q.id === selectedId) || null;

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

  function doorsOnly() {
    setSelections((current) => {
      const next = { ...current };
      for (const item of items) {
        if (CABINET_TYPES.includes(item.item_type)) {
          next[item.id] = { cabinet: false, doors: item.front_type === "doors" };
        }
      }
      return next;
    });
  }

  async function handleImport(force = false) {
    if (!selectedId) { setError("Please select a quote."); return; }
    setBusy(true); setError("");
    try {
      const res  = await fetch(`/api/admin/design/projects/${projectId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: selectedId, force, selections }),
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
                <strong>{result.created} item{result.created !== 1 ? "s" : ""} imported</strong> into the selected quote.
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
              <div className={styles.importError}>
                <strong>{warnings.length} item{warnings.length !== 1 ? "s" : ""} not fully configured.</strong>
                <p style={{ margin: "6px 0 0" }}>
                  These items are missing a material/colour selection. You can go back and configure them, or import
                  anyway and fill in the blanks in the quote editor.
                </p>
              </div>
              <ul style={{ margin: "10px 0 0", padding: "0 0 0 18px", fontSize: 13, color: "var(--dt-text, #1c1c1a)" }}>
                {warnings.map((w, i) => (
                  <li key={`${w.itemId}-${i}`}>{w.label}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <label className={styles.modalFieldLabel}>
                Search quotes
                <input
                  className={styles.modalSearchInput}
                  placeholder="Search by name, number…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </label>

              <label className={styles.modalFieldLabel}>
                Select quote
                <select
                  className={styles.quoteSelect}
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  size={Math.min(filtered.length + 1, 6)}
                >
                  <option value="">— Choose a quote —</option>
                  {loading ? (
                    <option disabled>Loading…</option>
                  ) : filtered.length === 0 ? (
                    <option disabled>No quotes found</option>
                  ) : (
                    filtered.map((q) => (
                      <option key={q.id} value={q.id}>{quoteLabel(q)}</option>
                    ))
                  )}
                </select>
              </label>

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
                      Doors/drawers only
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
                          <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
                            {isCabinet ? (
                              <>
                                <label style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--dt-text-soft, #5f5e5a)", cursor: "pointer" }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(sel.cabinet)}
                                    onChange={(e) => setCabinetPart(item.id, "cabinet", e.target.checked)}
                                  />
                                  Cabinet
                                </label>
                                {item.front_type === "doors" && (
                                  <label style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--dt-text-soft, #5f5e5a)", cursor: "pointer" }}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(sel.doors)}
                                      onChange={(e) => setCabinetPart(item.id, "doors", e.target.checked)}
                                    />
                                    Doors ({doorCountForItem(item)})
                                  </label>
                                )}
                              </>
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
            onClick={warnings ? () => setWarnings(null) : onClose}
          >
            {result ? "Close" : warnings ? "Go back and configure" : "Cancel"}
          </button>
          {!result && (
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
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
