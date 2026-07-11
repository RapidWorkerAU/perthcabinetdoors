"use client";

import { useMemo, useState } from "react";
import styles from "../../design.mobile.module.css";
import MobileModal from "./MobileModal";
import { calculateCabinetTotals } from "@/lib/pcd-cabinet-utils";
import { formatMoney } from "@/lib/pcd-quote-utils";

const MARGIN_KEY = "pcd_mobile_margin_pct";

/**
 * Ephemeral cabinet price calculator. Shows the cut-list material cost (from
 * the same engine used at quote/import time) and lets you apply a margin % to
 * get a potential customer price. Saves nothing — the margin is remembered in
 * localStorage only for convenience, never written to the project.
 */
export default function CabinetPriceModal({ item, onClose }) {
  const totals = useMemo(
    () => calculateCabinetTotals({
      ...item,
      // Design items encode corner via item_type; the costing engine wants a
      // boolean. Mobile never creates corners, but this keeps a desktop-made
      // one priced correctly if it's ever opened here.
      is_corner: item?.item_type === "corner_base_cabinet",
    }),
    [item]
  );

  const materialCost = totals.calculated_material_cost_ex_gst || 0;
  const cutList = totals.cut_list || [];

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
                <span className={styles.cutDim}>{Math.round(p.width_mm)} × {Math.round(p.height_mm)}</span>
                {p.qty > 1 && <span className={styles.cutQty}>×{p.qty}</span>}
                <span className={styles.cutName}>{p.label}</span>
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
          Cut-list material cost only — excludes hardware, labour and GST. For
          on-the-run pricing; nothing here is saved.
        </p>
      </div>
    </MobileModal>
  );
}
