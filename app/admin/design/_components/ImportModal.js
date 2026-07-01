"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import styles from "../design.module.css";

export default function ImportModal({ projectId, itemCount, onClose }) {
  const [quotes, setQuotes]       = useState([]);
  const [search, setSearch]       = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading]     = useState(true);
  const [busy, setBusy]           = useState(false);
  const [result, setResult]       = useState(null);
  const [warnings, setWarnings]   = useState(null);
  const [error, setError]         = useState("");

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

  async function handleImport(force = false) {
    if (!selectedId) { setError("Please select a quote."); return; }
    setBusy(true); setError("");
    try {
      const res  = await fetch(`/api/admin/design/projects/${projectId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: selectedId, force }),
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
                {warnings.map((w) => (
                  <li key={w.itemId}>{w.label}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className={styles.modalSummary}>
                <div className={styles.modalSummaryRow}>
                  <span className={styles.modalSummaryLabel}>Items to import</span>
                  <span className={styles.modalSummaryValue}>{itemCount}</span>
                </div>
              </div>

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
                  size={Math.min(filtered.length + 1, 8)}
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
              disabled={busy || !selectedId}
            >
              {busy
                ? "Importing…"
                : warnings
                ? "Import all items anyway"
                : `Import ${itemCount} items`}
            </button>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
