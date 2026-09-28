"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../contact/contact.module.css";

/**
 * A DROPDOWN WITH A PICTURE BESIDE EACH ANSWER, for a list too long for tabs
 * where the answers are told apart on sight: door profiles and edge profiles.
 *
 * Shared by the quote builder and the shop's product pages, because the two
 * are one configurator. The menu is placed against the window rather than the
 * field, so a card with its overflow hidden cannot clip it.
 *
 * options  [{ value, label, image? }]. An image that will not load is dropped
 *          and the option is shown as words alone.
 */
export default function ImageSelect({ disabled = false, placeholder, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const wrapRef = useRef(null);
  const selected = options.find((option) => option.value === value) || null;

  useEffect(() => {
    if (!open || !wrapRef.current) return;

    function positionMenu() {
      const rect = wrapRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const preferredWidth = Math.max(rect.width, 320);
      const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2);
      const left = Math.min(
        Math.max(rect.left, viewportPadding),
        window.innerWidth - width - viewportPadding,
      );
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(160, Math.min(420, availableHeight - 4));

      setMenuStyle({
        left: `${left}px`,
        maxHeight: `${maxHeight}px`,
        top: `${openAbove ? rect.top - maxHeight - 4 : rect.bottom + 4}px`,
        width: `${width}px`,
      });
    }

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);

    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  function choose(option) {
    onChange(option.value);
    setOpen(false);
  }

  return (
    <div className={styles.imageSelect} ref={wrapRef}>
      <button
        className={styles.imageSelectControl}
        disabled={disabled}
        type="button"
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onClick={() => !disabled && setOpen((current) => !current)}
      >
        <span>{selected?.label || placeholder}</span>
      </button>
      {open && !disabled ? (
        <div className={styles.imageSelectMenu} style={menuStyle}>
          {options.length ? options.map((option) => (
            <button className={styles.imageSelectOption} key={option.value} type="button" onMouseDown={() => choose(option)}>
              {option.image ? <img alt="" src={option.image} onError={(event) => { event.currentTarget.parentElement?.classList.add(styles.imageSelectOptionNoImage); event.currentTarget.remove(); }} /> : null}
              <span>{option.label}</span>
            </button>
          )) : (
            <div className={styles.colourEmpty}>No options available</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
