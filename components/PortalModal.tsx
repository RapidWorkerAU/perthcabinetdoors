"use client";

import { ReactNode, useEffect } from "react";
import styles from "./PortalModal.module.css";

type PortalModalProps = {
  open: boolean;
  ariaLabel: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: "md" | "lg" | "xl";
};

export default function PortalModal({
  open,
  ariaLabel,
  eyebrow,
  title,
  description,
  children,
  footer,
  onClose,
  size = "md",
}: PortalModalProps) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <button className={styles.backdrop} type="button" aria-label="Close" onClick={onClose} />
      <section className={`${styles.dialog} ${styles[size]}`}>
        <header className={styles.header}>
          <div>
            {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
            {title ? <h2>{title}</h2> : null}
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </section>
    </div>
  );
}
