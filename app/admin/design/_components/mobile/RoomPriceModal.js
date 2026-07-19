"use client";

import { useMemo, useState } from "react";
import styles from "../../design.mobile.module.css";
import MobileModal from "./MobileModal";
import { formatMoney } from "@/lib/pcd-quote-utils";
import { itemPricing, categoryFor, PRICE_CATEGORIES } from "./cabinetPricing";

const MARGIN_KEY = "pcd_mobile_margin_pct";
const TYPE_LABELS = {
  base_cabinet: "Base cabinet", wall_cabinet: "Wall cabinet",
  tall_cabinet: "Tall cabinet", corner_base_cabinet: "Corner cabinet",
  blind_corner_cabinet: "Blind corner cabinet", panel: "Panel", scribe: "Scribe",
  floating_shelf: "Floating shelf",
};

/**
 * Ephemeral room price calculator across every cabinet in the room. Each
 * cabinet expands to its priced cut list, grouped by cost category (Carcass,
 * Doors, Drawer fronts, …). Categories can be toggled out of the cost per
 * cabinet, or across the whole room via the "Producing" chips — so a
 * door-replacement job can drop every carcass in one tap and still re-include
 * the odd base cabinet it's actually building. A margin % applies to the room
 * total for a potential customer price. Nothing here is saved.
 */
export default function RoomPriceModal({ items, roomItems = [], room = null, excludedByItem = {}, onExcludedChange, onClose }) {
  // Price each item (cabinet or standalone panel/scribe), then group its pieces
  // by category (in display order).
  const priced = useMemo(
    () => items.map((c) => {
      const { rows } = itemPricing(c, roomItems, room);
      const groups = new Map();
      for (const r of rows) {
        const cat = categoryFor(r.material);
        if (!groups.has(cat)) groups.set(cat, { name: cat, cost: 0, rows: [] });
        const g = groups.get(cat);
        g.cost += r.cost;
        g.rows.push(r);
      }
      const ordered = PRICE_CATEGORIES.filter((n) => groups.has(n)).map((n) => groups.get(n));
      return { item: c, groups: ordered };
    }),
    [items, roomItems, room]
  );

  const isExcluded = (itemId, cat) => (excludedByItem[itemId] || []).includes(cat);
  const itemTotal = (p) => p.groups.reduce((s, g) => (isExcluded(p.item.id, g.name) ? s : s + g.cost), 0);
  const roomTotal = priced.reduce((s, p) => s + itemTotal(p), 0);

  // Warn when a sellable face (door, drawer front, standalone panel or scribe)
  // has no $/m² rate — it silently costs $0 otherwise.
  const RATE_CATS = new Set(["Doors", "Drawer fronts", "Finished panels", "Scribes", "Floating shelves"]);
  const frontNoRate = priced.some((p) =>
    p.groups.some((g) => RATE_CATS.has(g.name) && g.rows.some((r) => r.rate === 0))
  );

  // Categories that actually appear somewhere in the room, for the room-wide
  // "Producing" chips. Each chip is on (all producing), off (all excluded) or
  // mixed (some excluded) — tapping unifies: off → include all, otherwise
  // exclude all.
  const roomCategories = PRICE_CATEGORIES.filter((cat) => priced.some((p) => p.groups.some((g) => g.name === cat)));

  function catRoomState(cat) {
    const have = priced.filter((p) => p.groups.some((g) => g.name === cat));
    const out = have.filter((p) => isExcluded(p.item.id, cat)).length;
    if (out === 0) return "in";
    if (out === have.length) return "out";
    return "mixed";
  }

  function setCategoryForAll(cat, exclude) {
    const next = { ...excludedByItem };
    for (const p of priced) {
      if (!p.groups.some((g) => g.name === cat)) continue;
      const cur = new Set(next[p.item.id] || []);
      if (exclude) cur.add(cat); else cur.delete(cat);
      next[p.item.id] = [...cur];
    }
    onExcludedChange?.(next);
  }

  function toggleCategory(itemId, cat) {
    const cur = new Set(excludedByItem[itemId] || []);
    if (cur.has(cat)) cur.delete(cat); else cur.add(cat);
    onExcludedChange?.({ ...excludedByItem, [itemId]: [...cur] });
  }

  const [expanded, setExpanded] = useState(() => new Set());
  const [marginPct, setMarginPct] = useState(() => {
    if (typeof window === "undefined") return 30;
    const saved = Number(window.localStorage.getItem(MARGIN_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 30;
  });

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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

  const anyExcluded = Object.values(excludedByItem).some((arr) => arr && arr.length > 0);
  const margin = Number(marginPct) || 0;
  const customerPrice = roomTotal * (1 + margin / 100);

  return (
    <MobileModal title="Room price" onClose={onClose}>
      <div className={styles.priceSection}>
        {frontNoRate && (
          <p className={styles.priceWarn}>
            ⚠ A door, drawer front, panel or scribe has no $/m² rate — set a
            price per m² for it, or that piece costs $0.
          </p>
        )}

        {/* Room-wide scope — tap a category to include/exclude it everywhere. */}
        {roomCategories.length > 0 && (
          <div className={styles.priceScope}>
            <span className={styles.priceScopeLabel}>Producing (tap to toggle for the whole room)</span>
            <div className={styles.priceScopeChips}>
              {roomCategories.map((cat) => {
                const st = catRoomState(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`${styles.scopeChip} ${st === "out" ? styles.scopeChipOut : ""} ${st === "mixed" ? styles.scopeChipMixed : ""}`}
                    onClick={() => setCategoryForAll(cat, st !== "out")}
                    aria-pressed={st !== "out"}
                  >
                    <span className={styles.scopeChipMark}>{st === "out" ? "○" : st === "mixed" ? "◐" : "●"}</span>
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {priced.map((p) => {
          const open = expanded.has(p.item.id);
          const total = itemTotal(p);
          const cutCount = p.groups.filter((g) => isExcluded(p.item.id, g.name)).length;
          return (
            <div key={p.item.id} className={styles.priceCabinet}>
              <button type="button" className={styles.cutListToggle} onClick={() => toggle(p.item.id)}>
                <span>
                  {p.item.label || TYPE_LABELS[p.item.item_type] || p.item.item_type}
                  {cutCount > 0 && <span className={styles.priceScopeBadge}>{cutCount} excluded</span>}
                </span>
                <span className={styles.priceCabinetTotal}>{formatMoney(total)} {open ? "▲" : "▼"}</span>
              </button>
              {open && (
                <div className={styles.cutList}>
                  {p.groups.map((g) => {
                    const off = isExcluded(p.item.id, g.name);
                    return (
                      <div key={g.name} className={styles.catBlock}>
                        <button
                          type="button"
                          className={`${styles.catRow} ${off ? styles.catRowOff : ""}`}
                          onClick={() => toggleCategory(p.item.id, g.name)}
                          aria-pressed={!off}
                        >
                          <span className={styles.catMark}>{off ? "○" : "●"}</span>
                          <span className={styles.catName}>{g.name}</span>
                          <span className={styles.catCost}>{off ? "excluded" : formatMoney(g.cost)}</span>
                        </button>
                        {!off && g.rows.map((r, i) => (
                          <div key={i} className={styles.cutRow}>
                            <span className={styles.cutDim}>
                              {Math.round(r.dim1)} <span className={styles.cutQty}>({r.axis1})</span>
                              {" × "}
                              {Math.round(r.dim2)} <span className={styles.cutQty}>({r.axis2})</span>
                            </span>
                            <span className={styles.cutName}>{r.name}</span>
                            <span className={styles.cutCost}>{formatMoney(r.cost)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className={styles.priceCard}>
          <div className={styles.priceLine}>
            <span className={styles.priceLineLabel}>
              <strong>Room material cost (ex GST)</strong>
              {anyExcluded && <span className={styles.priceScopeBadge}>scoped</span>}
            </span>
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
          Excludes hardware, labour and GST. Category toggles are for on-the-run
          pricing; nothing here is saved.
        </p>
      </div>
    </MobileModal>
  );
}
