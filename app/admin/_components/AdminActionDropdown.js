"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "../admin-content.module.css";

export const ADMIN_DROPDOWN_OPEN_EVENT = "pcd-admin-dropdown-open";

export function AdminActionDropdown({ children, disabled = false, label = "Open actions" }) {
  const buttonRef = useRef(null);
  const dropdownIdRef = useRef(`admin-action-${Math.random().toString(36).slice(2)}`);
  const menuRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;

    function closeOtherDropdowns(event) {
      if (event.detail !== dropdownIdRef.current) setIsOpen(false);
    }

    function closeOnOutsidePointer(event) {
      const target = event.target;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setIsOpen(false);
    }

    function positionMenu() {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const width = 156;
      const left = Math.min(Math.max(rect.right - width, viewportPadding), window.innerWidth - width - viewportPadding);
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openAbove = spaceBelow < 150 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(132, Math.min(260, (openAbove ? spaceAbove : spaceBelow) - 4));

      setMenuStyle({
        bottom: openAbove ? `${window.innerHeight - rect.top + 4}px` : "auto",
        left: `${left}px`,
        maxHeight: `${maxHeight}px`,
        position: "fixed",
        right: "auto",
        top: openAbove ? "auto" : `${rect.bottom + 4}px`,
        width: `${width}px`,
      });
    }

    positionMenu();
    window.addEventListener(ADMIN_DROPDOWN_OPEN_EVENT, closeOtherDropdowns);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener(ADMIN_DROPDOWN_OPEN_EVENT, closeOtherDropdowns);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [isOpen]);

  function toggleMenu() {
    setIsOpen((current) => {
      if (!current) {
        window.dispatchEvent(new CustomEvent(ADMIN_DROPDOWN_OPEN_EVENT, { detail: dropdownIdRef.current }));
      }
      return !current;
    });
  }

  function closeAfterAction(event) {
    if (event.target.closest("button")) setIsOpen(false);
  }

  return (
    <div className={styles.tableActionMenuWrap} onClick={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.tableActionMenuButton}
        onClick={toggleMenu}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-label={label}
      >
        Actions
      </button>
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className={styles.tableActionMenu}
              ref={menuRef}
              style={menuStyle}
              onClick={(event) => {
                event.stopPropagation();
                closeAfterAction(event);
              }}
            >
              {children}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export function AdminConfirmDeleteAction({
  confirmLabel = "Confirm delete",
  disabled = false,
  label = "Delete",
  onConfirm,
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (isConfirming) {
    return (
      <>
        <span className={styles.tableActionConfirmText}>Delete?</span>
        <button type="button" className={styles.tableActionDangerItem} disabled={disabled} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className={styles.tableActionMenuItem} onClick={() => setIsConfirming(false)}>
          Cancel
        </button>
      </>
    );
  }

  return (
    <button type="button" className={styles.tableActionDangerItem} disabled={disabled} onClick={() => setIsConfirming(true)}>
      {label}
    </button>
  );
}

export function AdminBulkDeleteButton({
  count,
  disabled = false,
  label = "Delete selected",
  onConfirm,
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const isDisabled = disabled || count <= 0;

  if (isConfirming) {
    return (
      <div className={styles.bulkDeleteConfirm}>
        <span>{count} selected</span>
        <button type="button" className={styles.tableActionDangerItem} disabled={isDisabled} onClick={onConfirm}>
          Confirm delete
        </button>
        <button type="button" className={styles.tableActionMenuItem} onClick={() => setIsConfirming(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button type="button" className={styles.bulkDeleteButton} disabled={isDisabled} onClick={() => setIsConfirming(true)}>
      {count > 0 ? `${label} (${count})` : label}
    </button>
  );
}
