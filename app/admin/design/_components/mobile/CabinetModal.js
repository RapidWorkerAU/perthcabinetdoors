"use client";

import { useEffect } from "react";
import styles from "../../design.mobile.module.css";
import DesignRightPanel from "../DesignRightPanel";

// Mobile is restricted to these cabinet types — no corner, no standalone
// panels/scribes/obstructions (see the plan). Passed straight to the shared
// add form via DesignRightPanel's allowedTypes prop.
const MOBILE_CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet"];

/**
 * Full-screen cabinet configurator. Reuses the exact desktop DesignRightPanel
 * (in fullWidth mode) so the captured fields — and therefore the saved row —
 * are identical to desktop. No mobile-specific data shape.
 */
export default function CabinetModal({
  item,
  roomItems,
  room,
  materialDefaults,
  isAddingItem,
  onAdd,
  onCancelAdd,
  onItemChange,
  onDeleteItem,
  onSelectItem,
  onClose,
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const title = isAddingItem
    ? "Add cabinet"
    : (item?.label || "Cabinet");

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{title}</span>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Done">×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <DesignRightPanel
            fullWidth
            allowedTypes={MOBILE_CABINET_TYPES}
            item={item}
            allItems={roomItems}
            room={room}
            materialDefaults={materialDefaults}
            isAddingItem={isAddingItem}
            isOverlapping={false}
            onAdd={onAdd}
            onCancelAdd={onCancelAdd}
            onItemChange={onItemChange}
            onDeleteItem={onDeleteItem}
            onDuplicateItem={() => {}}
            onSelectItem={onSelectItem}
          />
        </div>
      </div>
    </div>
  );
}
