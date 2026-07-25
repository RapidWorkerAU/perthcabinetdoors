"use client";

// A dark window used for both cut-list views (one cabinet, or a whole room).
// Dark to match the rest of the design tool — the cut-list rows are styled
// light-on-dark, the same as they look in the left rail.

import { useEffect } from "react";
import styles from "../design.module.css";

export default function CutListModal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className={styles.modalBackdrop} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 1101, background: "#1e2328", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12, boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          width: 560, maxWidth: "calc(100vw - 48px)", maxHeight: "85vh",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</p>
            {subtitle && <p style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 6, color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 14, flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "6px 0 12px" }}>
          {children}
        </div>
      </div>
    </>
  );
}
