"use client";

import React, { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COLOUR_SUPPLIERS, optionsFromColourFamily } from "@/lib/pcd-colour-library";
import { Dropdown } from "@/components/ui/Dropdown";
import styles from "@/app/admin/admin-content.module.css";
import quoteStyles from "@/app/admin/quotes/[id]/quote-editor.module.css";

const colourOptionsCache = new Map();
const ADMIN_DROPDOWN_OPEN_EVENT = "pcd-admin-dropdown-open";

function optionMetaLabel(option) {
  return [option.finish || option.meta || "", option.thickness || "", option.supplier || ""].filter(Boolean).join(" - ");
}

export const QuoteImageCombobox = memo(function QuoteImageCombobox({ className = "", disabled = false, placeholder, value, displayValue = "", options, onChange, disablePortal = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState({});
  const searchRef = useRef(null);
  const dropdownIdRef = useRef(`quote-combobox-${Math.random().toString(36).slice(2)}`);
  const menuRef = useRef(null);
  const wrapRef = useRef(null);
  const cleanedQuery = query.trim().toLowerCase();
  const selectedOption = options.find((option) => [option.value, option.name, option.label].filter(Boolean).includes(value));
  const visibleOptions =
    cleanedQuery.length >= 3
      ? options.filter((option) =>
          [option.label, option.name, option.finish, option.thickness, option.supplier, option.meta]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(cleanedQuery))
        )
      : options;

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function closeOtherDropdowns(event) {
      if (event.detail !== dropdownIdRef.current) setOpen(false);
    }

    function closeOnOutsidePointer(event) {
      const target = event.target;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    window.addEventListener(ADMIN_DROPDOWN_OPEN_EVENT, closeOtherDropdowns);
    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener(ADMIN_DROPDOWN_OPEN_EVENT, closeOtherDropdowns);
      document.removeEventListener("mousedown", closeOnOutsidePointer);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !wrapRef.current) return;

    function positionMenu() {
      const rect = wrapRef.current.getBoundingClientRect();
      const viewportPadding = 12;

      if (disablePortal) {
        const gap = 8;
        const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
        const spaceAbove = rect.top - viewportPadding;
        const openAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
        const availableHeight = openAbove ? spaceAbove : spaceBelow;
        const maxHeight = Math.max(160, Math.min(360, availableHeight - 4));
        setMenuStyle({
          bottom: openAbove ? `calc(100% + ${gap}px)` : "auto",
          left: 0,
          maxHeight: `${maxHeight}px`,
          minWidth: "320px",
          position: "absolute",
          top: openAbove ? "auto" : `calc(100% + ${gap}px)`,
          width: "100%",
          zIndex: 9999,
        });
        return;
      }

      const preferredWidth = Math.max(rect.width, 320);
      const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2);
      const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - width - viewportPadding);
      const gap = 8;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(160, Math.min(360, availableHeight - 4));
      setMenuStyle({
        bottom: openAbove ? `${window.innerHeight - rect.top + gap}px` : "auto",
        left: `${left}px`,
        maxHeight: `${maxHeight}px`,
        position: "fixed",
        top: openAbove ? "auto" : `${rect.bottom + gap}px`,
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
  }, [open, disablePortal]);

  function choose(option) {
    onChange(option);
    setOpen(false);
    setQuery("");
  }

  function openMenu() {
    if (disabled) return;
    window.dispatchEvent(new CustomEvent(ADMIN_DROPDOWN_OPEN_EVENT, { detail: dropdownIdRef.current }));
    setOpen(true);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  return (
    <div className={`${styles.quoteColourCombo} ${quoteStyles.quoteColourCombo} ${className}`} ref={wrapRef}>
      <button
        disabled={disabled}
        type="button"
        onClick={() => open ? setOpen(false) : openMenu()}
        className="flex min-w-0 flex-1 items-center gap-2 bg-transparent text-left text-[inherit] text-[#1a1a18] outline-none disabled:cursor-not-allowed disabled:text-[#8b8a81]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedOption?.src ? (
          <img src={selectedOption.src} alt="" className="h-4 w-4 flex-shrink-0 rounded-[3px] border border-[#dbd8cc] object-cover" />
        ) : null}
        <span className={`min-w-0 flex-1 truncate ${value ? "" : "text-[#8b8a81]"}`}>
          {selectedOption?.label || selectedOption?.name || displayValue || value || placeholder}
        </span>
      </button>
      <button
        aria-label="Open options"
        className={quoteStyles.quoteColourComboButton}
        disabled={disabled}
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          if (disabled) return;
          if (open) {
            setOpen(false);
          } else {
            openMenu();
          }
        }}
      />
      {open && !disabled && typeof document !== "undefined"
        ? (() => {
            const menu = (
              <div className={styles.quoteColourMenu} ref={menuRef} style={menuStyle}>
                <div className="border-b border-[#edf4eb] p-2">
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search..."
                    className="h-[32px] w-full rounded-[4px] border border-[#dbd8cc] bg-[#f5f8f4] px-3 text-[13px] text-[#1a1a18] outline-none transition-colors focus:border-[#6b9e61] focus:bg-white"
                  />
                </div>
                {visibleOptions.length ? (
                  visibleOptions.map((option, index) => (
                    <button
                      className={styles.quoteColourOption}
                      key={`${option.value || option.label || option.name || "option"}-${option.id || option.src || index}`}
                      type="button"
                      onClick={() => choose(option)}
                    >
                      <span className={styles.quoteOptionThumb}>
                        {option.src ? <img alt="" src={option.src} /> : <span>{String(option.name || option.label || "?").slice(0, 2).toUpperCase()}</span>}
                      </span>
                      <span>
                        <strong>{option.name || option.label}</strong>
                        <small>{optionMetaLabel(option)}</small>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className={styles.quoteColourEmpty}>No match</div>
                )}
              </div>
            );
            return disablePortal ? menu : createPortal(menu, document.body);
          })()
        : null}
    </div>
  );
});

export const QuoteTileCombobox = memo(function QuoteTileCombobox({ compact = true, disabled = false, placeholder, value, options, onChange }) {
  const normalizedOptions = options.map((option) => {
    const item = typeof option === "string" ? { label: option, name: option } : option;
    return {
      ...item,
      value: item.value || item.name || item.label || "",
      label: item.label || item.name || item.value || "",
    };
  });
  const selected = normalizedOptions.find((option) =>
    [option.value, option.name, option.label].filter(Boolean).includes(value)
  );

  return (
    <Dropdown
      disabled={disabled}
      placeholder={placeholder}
      options={normalizedOptions.map((option) => ({ value: option.value, label: option.label, group: option.group }))}
      value={selected?.value || ""}
      onChange={(nextValue) => {
        const selectedOption = normalizedOptions.find((option) => option.value === nextValue);
        if (selectedOption) onChange(selectedOption);
      }}
      clearable={false}
      searchable
      autoWidth
      contentZIndex={9999}
      triggerClassName={compact
        ? "!h-[30px] !min-h-0 !rounded-[3px] !px-[6px] !pr-[24px] !text-[10px]"
        : "!h-[44px] !rounded-[6px] !px-3 !pr-[34px] !text-[14px]"
      }
    />
  );
});

export const QuoteColourCombobox = memo(function QuoteColourCombobox({ compact = true, disabled = false, line, onChange }) {
  const [databaseOptions, setDatabaseOptions] = useState(null);
  const options = databaseOptions || [];
  const selectedSupplier = COLOUR_SUPPLIERS.includes(line.supplier_name) ? line.supplier_name : COLOUR_SUPPLIERS[0];
  const filteredOptions = options.filter((option) => (option.supplier || COLOUR_SUPPLIERS[0]) === selectedSupplier);
  const selectedValue = [selectedSupplier, line.finish, line.colour, line.thickness].filter(Boolean).join("::");
  const displayValue = [line.colour, line.thickness].filter(Boolean).join(" - ");

  useEffect(() => {
    let cancelled = false;

    async function loadDatabaseColours() {
      setDatabaseOptions(null);
      if (!line.material) return;
      const cacheKey = `${line.material}::all`;
      if (colourOptionsCache.has(cacheKey)) {
        setDatabaseOptions(colourOptionsCache.get(cacheKey));
        return;
      }

      try {
        const response = await fetch(`/api/colour-library?material=${encodeURIComponent(line.material)}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!cancelled) {
          const options = payload?.colourFamily?.groups?.length ? optionsFromColourFamily(payload.colourFamily) : [];
          colourOptionsCache.set(cacheKey, options);
          setDatabaseOptions(options);
        }
      } catch {
        if (!cancelled) setDatabaseOptions([]);
      }
    }

    loadDatabaseColours();
    return () => {
      cancelled = true;
    };
  }, [line.material]);

  return (
    <QuoteImageCombobox
      disabled={disabled || !line.material}
      placeholder={line.material ? "Finish, colour & thickness" : "Select material first"}
      value={selectedValue}
      displayValue={displayValue}
      options={filteredOptions}
      onChange={(option) =>
        onChange({
          supplier_name: option.supplier || selectedSupplier,
          thickness: option.thickness || "",
          colour: option.name || option.label,
          finish: option.finish || "",
          unit_cost_source_id: option.id || null,
          unit_cost_source_label: [option.supplier || selectedSupplier, option.label || option.name].filter(Boolean).join(" - "),
          unit_cost_per_sqm_ex_gst: Number(option.costPerSqmExGst || 0),
        })
      }
    />
  );
});
