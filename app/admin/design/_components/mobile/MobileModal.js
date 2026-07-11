"use client";

import { useEffect } from "react";
import styles from "../../design.mobile.module.css";

/**
 * Full-screen slide-up modal shell for the mobile design tool. Locks body
 * scroll while open and gives every modal a consistent header + close button.
 */
export default function MobileModal({ title, onClose, children, headerRight }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{title}</span>
          {headerRight}
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={styles.modalBody}>
          {children}
        </div>
      </div>
    </div>
  );
}
