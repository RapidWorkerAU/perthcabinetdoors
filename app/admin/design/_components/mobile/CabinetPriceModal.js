"use client";

import { useMemo, useState } from "react";
import styles from "../../design.mobile.module.css";
import MobileModal from "./MobileModal";
import { formatMoney } from "@/lib/pcd-quote-utils";
import { cabinetPricing } from "./cabinetPricing";

const MARGIN_KEY = "pcd_mobile_margin_pct";

/**
 * Ephemeral cabinet price calculator. Shows every cut-list piece with its own
 * material cost (carcass, shelves, doors/drawer fronts and finished panels —
 * each at the same rate the quote uses), category subtotals, then a margin %
 * for a potential customer price. Saves nothing.
 */
export default function CabinetPriceModal({ item, roomItems = [], room = null, onClose }) {
  const { rows, categories, total } = useMemo(
    () => cabinetPricing(item, roomItems, room),
    [item, roomItems, room]
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
  const customerPrice = total * (1 + margin / 100);

  // Surface the common gotcha: a front with no per-sqm rate set on its colour.
  const frontNoRate = rows.some((r) => (r.material === "door" || r.material === "drawer") && r.rate === 0);

  return (
    <MobileModal title="Cabinet price" onClose={onClose}>
      <div className={styles.priceSection}>
        {frontNoRate && (
          <p className={styles.priceWarn}>
            ⚠ A door/drawer front has no $/m² rate — pick a door colour that has a
            price per m² set, or the fronts will cost $0.
          </p>
        )}

        <button type="button" className={styles.cutListToggle} onClick={() => setShowCutList((s) => !s)}>
          <span>Cut list ({rows.length} {rows.length === 1 ? "piece" : "pieces"})</span>
          <span>{showCutList ? "▲" : "▼"}</span>
        </button>
        {showCutList && (
          <div className={styles.cutList}>
            {rows.length === 0 && (
              <div className={styles.cutRow}><span className={styles.cutName}>Set dimensions to see the cut list</span></div>
            )}
            {rows.map((p, i) => (
              <div key={i} className={styles.cutRow}>
                <span className={styles.cutDim}>
                  {Math.round(p.dim1)} <span className={styles.cutQty}>({p.axis1})</span>
                  {" × "}
                  {Math.round(p.dim2)} <span className={styles.cutQty}>({p.axis2})</span>
                </span>
                <span className={styles.cutName}>{p.name}</span>
                <span className={styles.cutCost}>{formatMoney(p.cost)}</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.priceCard}>
          {categories.map((c) => (
            <div className={styles.priceLine} key={c.name}>
              <span className={styles.priceLineLabel}>{c.name}</span>
              <span className={styles.priceLineValue}>{formatMoney(c.cost)}</span>
            </div>
          ))}
          <div className={styles.priceLine}>
            <span className={styles.priceLineLabel}><strong>Material cost (ex GST)</strong></span>
            <span className={styles.priceLineValue}><strong>{formatMoney(total)}</strong></span>
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
          Material cost only — each piece priced at the same $/m² your quote uses
          (doors at the door-style rate, carcass/shelves/panels at their rates).
          Excludes hardware, labour and GST. For on-the-run pricing; nothing here
          is saved.
        </p>
      </div>
    </MobileModal>
  );
}
