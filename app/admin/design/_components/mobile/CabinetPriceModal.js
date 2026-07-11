"use client";

import { useMemo, useState } from "react";
import styles from "../../design.mobile.module.css";
import MobileModal from "./MobileModal";
import { formatMoney } from "@/lib/pcd-quote-utils";
import { cabinetCutList, cabinetMaterialCost } from "./cabinetPricing";

const MARGIN_KEY = "pcd_mobile_margin_pct";

/**
 * Ephemeral cabinet price calculator. Shows the full cut list (carcass, shelves
 * AND doors/drawer fronts + finished panels — the same pieces the desktop panel
 * lists) with the material cost, then applies a margin % for a potential
 * customer price. Saves nothing — the margin is remembered in localStorage only
 * for convenience.
 */
export default function CabinetPriceModal({ item, roomItems = [], room = null, onClose }) {
  const cutList = useMemo(() => cabinetCutList(item, roomItems, room), [item, roomItems, room]);
  const materialCost = useMemo(
    () => cabinetMaterialCost(item, roomItems, room, cutList),
    [item, roomItems, room, cutList]
  );

  const [showCutList, setShowCutList] = useState(true);
  const [marginPct, setMarginPct] = useState(() => {
    if (typeof window === "undefined") return 30;
    const saved = Number(window.localStorage.getItem(MARGIN_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 30;
  });

  function onMarginChange(v) {
    setMarginPct(v);
    const n = Number(v);
    if (typeof window !== "undefined" && Number.isFinite(n) && n >= 0) {
      window.localStorage.setItem(MARGIN_KEY, String(n));
    }
  }

  const margin = Number(marginPct) || 0;
  const customerPrice = materialCost * (1 + margin / 100);

  return (
    <MobileModal title="Cabinet price" onClose={onClose}>
      <div className={styles.priceSection}>
        <button type="button" className={styles.cutListToggle} onClick={() => setShowCutList((s) => !s)}>
          <span>Cut list ({cutList.length} {cutList.length === 1 ? "piece" : "pieces"})</span>
          <span>{showCutList ? "▲" : "▼"}</span>
        </button>
        {showCutList && (
          <div className={styles.cutList}>
            {cutList.length === 0 && (
              <div className={styles.cutRow}><span className={styles.cutName}>Set dimensions to see the cut list</span></div>
            )}
            {cutList.map((p, i) => (
              <div key={i} className={styles.cutRow}>
                <span className={styles.cutDim}>
                  {Math.round(p.dim1)} <span className={styles.cutQty}>({p.axis1})</span>
                  {" × "}
                  {Math.round(p.dim2)} <span className={styles.cutQty}>({p.axis2})</span>
                </span>
                <span className={styles.cutName}>{p.name}</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.priceCard}>
          <div className={styles.priceLine}>
            <span className={styles.priceLineLabel}>Material cost (ex GST)</span>
            <span className={styles.priceLineValue}>{formatMoney(materialCost)}</span>
          </div>
          <div className={styles.marginField}>
            <label htmlFor="mobile-margin">Margin %</label>
            <input
              id="mobile-margin"
              className={styles.marginInput}
              type="number"
              inputMode="decimal"
              min="0"
              value={marginPct}
              onChange={(e) => onMarginChange(e.target.value)}
            />
          </div>
          <div className={`${styles.priceLine} ${styles.priceLineTotal}`}>
            <span className={styles.priceLineLabel}>Potential customer price</span>
            <span className={styles.priceLineValue}>{formatMoney(customerPrice)}</span>
          </div>
        </div>

        <p className={styles.priceNote}>
          Cut-list material cost (carcass, shelves, doors/fronts and finished
          panels) — excludes hardware, labour and GST. For on-the-run pricing;
          nothing here is saved.
        </p>
      </div>
    </MobileModal>
  );
}
