"use client";

import { useEffect } from "react";
import styles from "../../design.mobile.module.css";
import DesignRightPanel from "../DesignRightPanel";

// Mobile now supports the full item set (matching desktop): base/wall/tall/
// corner cabinets plus standalone panels, scribes and obstructions. Passing
// undefined lets DesignRightPanel use its default ADDABLE_TYPES list.
const MOBILE_ITEM_TYPES = undefined;

const TYPE_LABELS = {
  base_cabinet: "Base cabinet", wall_cabinet: "Wall cabinet", tall_cabinet: "Tall cabinet",
  corner_base_cabinet: "Corner cabinet", panel: "Panel", scribe: "Scribe", obstruction: "Obstruction",
};

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
  currentWall,
  onClose,
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const title = isAddingItem
    ? "Add item"
    : (item?.label || TYPE_LABELS[item?.item_type] || "Item");

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
            allowedTypes={MOBILE_ITEM_TYPES}
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
            currentWall={currentWall}
          />
        </div>
      </div>
    </div>
  );
}
