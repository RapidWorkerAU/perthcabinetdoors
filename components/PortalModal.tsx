"use client";

import { ReactNode } from "react";
import styles from "./PortalModal.module.css";
import { Modal } from "@/components/ui/Modal";

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
  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || ariaLabel}
      subtitle={description}
      size="xl"
      layout="form"
      className={[styles.dialog, styles[size]].filter(Boolean).join(" ")}
      footer={footer}
    >
      <div className={styles.body}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        {children}
      </div>
    </Modal>
  );
}
