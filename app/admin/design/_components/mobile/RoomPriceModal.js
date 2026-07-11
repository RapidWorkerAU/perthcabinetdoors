"use client";

import { useMemo, useState } from "react";
import styles from "../../design.mobile.module.css";
import MobileModal from "./MobileModal";
import { formatMoney } from "@/lib/pcd-quote-utils";
import { cabinetPricing } from "./cabinetPricing";

const MARGIN_KEY = "pcd_mobile_margin_pct";
const TYPE_LABELS = {
  base_cabinet: "Base cabinet", wall_cabinet: "Wall cabinet",
  tall_cabinet: "Tall cabinet", corner_base_cabinet: "Corner cabinet",
};

/**
 * Ephemeral room price calculator across every cabinet in the room. Each
 * cabinet expands to its priced cut list; a margin % applies to the room total
 * for a potential customer price. Saves nothing.
 */
export default function RoomPriceModal({ cabinets, roomItems = [], room = null, onClose }) {
  const priced = useMemo(
    () => cabinets.map((c) => ({ item: c, ...cabinetPricing(c, roomItems, room) })),
    [cabinets, roomItems, room]
  );
  const roomTotal = priced.reduce((s, p) => s + p.total, 0);
  const frontNoRate = priced.some((p) =>
    p.rows.some((r) => (r.material === "door" || r.material === "drawer") && r.rate === 0)
  );

  const [expanded, setExpanded] = useState(() => new Set());
  const [marginPct, setMarginPct] = useState(() => {
    if (typeof window === "undefined") return 30;
    const saved = Number(window.localStorage.getItem(MARGIN_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 30;
  });

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function onMarginChange(v) {
    setMarginPct(v);
    const n = Number(v);
    if (typeof window !== "undefined" && Number.isFinite(n) && n >= 0) {
      window.localStorage.setItem(MARGIN_KEY, String(n));
    }
  }

  const margin = Number(marginPct) || 0;
  const customerPrice = roomTotal * (1 + margin / 100);

  return (
    <MobileModal title="Room price" onClose={onClose}>
      <div className={styles.priceSection}>
        {frontNoRate && (
          <p className={styles.priceWarn}>
            ⚠ A door/drawer front has no $/m² rate — pick a door colour with a
            price per m² set, or those fronts cost $0.
          </p>
        )}

        {priced.map(({ item, rows, total }) => {
          const open = expanded.has(item.id);
          return (
            <div key={item.id} className={styles.priceCabinet}>
              <button type="button" className={styles.cutListToggle} onClick={() => toggle(item.id)}>
                <span>{item.label || TYPE_LABELS[item.item_type] || item.item_type}</span>
                <span className={styles.priceCabinetTotal}>{formatMoney(total)} {open ? "▲" : "▼"}</span>
              </button>
              {open && (
                <div className={styles.cutList}>
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
            </div>
          );
        })}

        <div className={styles.priceCard}>
          <div className={styles.priceLine}>
            <span className={styles.priceLineLabel}><strong>Room material cost (ex GST)</strong></span>
            <span className={styles.priceLineValue}><strong>{formatMoney(roomTotal)}</strong></span>
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
          Material cost only — each piece priced at the same $/m² your quote uses.
          Excludes hardware, labour and GST. For on-the-run pricing; nothing here
          is saved.
        </p>
      </div>
    </MobileModal>
  );
}
