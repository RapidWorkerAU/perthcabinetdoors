"use client";

import React, { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { IconChevronDown, IconSearch, IconSearchOff } from "@tabler/icons-react";
import { COLOUR_SUPPLIERS, colourSelectionPatch, optionsFromColourFamily } from "@/lib/pcd-colour-library";
import { Dropdown } from "@/components/ui/Dropdown";

// These comboboxes are built on the same Radix Popover primitive as
// components/ui/Dropdown, so they behave identically whether they are rendered
// on a plain page or inside a Modal. The previous hand-rolled `createPortal`
// menu rendered as a sibling of the Radix Dialog, which meant the dialog's
// `pointer-events: none` body lock and its focus trap made every option
// unclickable and the search box untypeable — the menu opened but nothing in it
// could be selected, so the field looked disabled.

const colourOptionsCache = new Map();

const TRIGGER_BASE = [
  "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-[6px] border bg-white",
  "pr-[34px] text-left transition-colors duration-150",
].join(" ");

const TRIGGER_SIZE = {
  compact: "h-[30px] rounded-[3px] px-[6px] pr-[24px] text-[10px]",
  full: "h-[44px] px-3 text-[14px]",
};

function optionMetaLabel(option) {
  return [option.finish || option.meta || "", option.thickness || "", option.supplier || ""].filter(Boolean).join(" - ");
}

function optionKey(option, index) {
  return `${option.value || option.label || option.name || "option"}-${option.id || option.src || index}`;
}

function optionMatchesQuery(option, query) {
  return [option.label, option.name, option.finish, option.thickness, option.supplier, option.meta]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(query));
}

/**
 * Searchable combobox with a thumbnail per option (colours, edges, profiles,
 * hardware). Same trigger metrics as QuoteTileCombobox so a form mixing the two
 * lines up.
 */
export const QuoteImageCombobox = memo(function QuoteImageCombobox({
  className = "",
  compact = false,
  disabled = false,
  emptyMessage = "No match",
  placeholder = "Select an option...",
  value,
  displayValue = "",
  options = [],
  onChange,
  contentZIndex = 9999,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);
  const listboxId = useId();

  const selectedOption = options.find((option) =>
    [option.value, option.name, option.label].filter(Boolean).includes(value)
  );

  const cleanedQuery = query.trim().toLowerCase();
  const visibleOptions = useMemo(
    () => (cleanedQuery ? options.filter((option) => optionMatchesQuery(option, cleanedQuery)) : options),
    [options, cleanedQuery]
  );

  const selectedLabel = selectedOption?.label || selectedOption?.name || displayValue || (value ? String(value) : "");

  function handleOpenChange(next) {
    if (disabled) return;
    setOpen(next);
    if (!next) setQuery("");
  }

  function choose(option) {
    onChange(option);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild disabled={disabled}>
        <div
          role="combobox"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          className={[
            TRIGGER_BASE,
            compact ? TRIGGER_SIZE.compact : TRIGGER_SIZE.full,
            open ? "border-[#6b9e61]" : "border-[#dbd8cc]",
            disabled ? "cursor-not-allowed border-[#edf4eb] bg-[#f5f8f4] text-[#8b8a81]" : "text-[#1a1a18]",
            className,
          ].filter(Boolean).join(" ")}
        >
          {selectedOption?.src ? (
            <img
              src={selectedOption.src}
              alt=""
              className="h-[22px] w-[22px] flex-shrink-0 rounded-[4px] border border-[#dbd8cc] bg-white object-contain"
            />
          ) : null}
          <span className={`min-w-0 flex-1 truncate ${selectedLabel ? "" : "text-[#8b8a81]"}`}>
            {selectedLabel || placeholder}
          </span>
          <span className="pointer-events-none absolute right-[10px] top-1/2 -translate-y-1/2 text-[#8b8a81]">
            <IconChevronDown size={16} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
          </span>
        </div>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          data-pcd-dropdown-menu="true"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchRef.current?.focus();
          }}
          style={{
            maxWidth: "min(380px, calc(100vw - 24px))",
            minWidth: "var(--radix-popover-trigger-width)",
            width: "max-content",
            zIndex: contentZIndex,
          }}
          className="overflow-hidden rounded-[6px] border border-[#dbd8cc] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
        >
          <div className="border-b border-[#edf4eb] p-2">
            <div className="relative">
              <IconSearch size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#8b8a81]" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search..."
                className="h-[34px] w-full rounded-[4px] border border-[#dbd8cc] bg-[#f5f8f4] pl-[28px] pr-2 text-[13px] text-[#1a1a18] outline-none transition-colors focus:border-[#6b9e61] focus:bg-white"
              />
            </div>
          </div>

          <div id={listboxId} role="listbox" className="max-h-[280px] overflow-y-auto p-1">
            {visibleOptions.length ? (
              visibleOptions.map((option, index) => {
                const selected = [option.value, option.name, option.label].filter(Boolean).includes(value);
                const meta = optionMetaLabel(option);
                return (
                  <div
                    key={optionKey(option, index)}
                    role="option"
                    aria-selected={selected}
                    tabIndex={0}
                    onClick={() => choose(option)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        choose(option);
                      }
                    }}
                    className={[
                      "flex cursor-pointer items-center gap-[10px] rounded-[4px] px-2 py-[7px] text-left outline-none",
                      "transition-colors duration-100 hover:bg-[#f5f8f4]",
                      selected ? "bg-[#edf4eb]" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-[#c7d8bf] bg-[#eef5ea] text-[10px] font-bold text-[#1c2b1e]">
                      {option.src ? (
                        <img src={option.src} alt="" className="h-full w-full bg-white object-contain" />
                      ) : (
                        String(option.name || option.label || "?").slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <span className="grid min-w-0 gap-[2px]">
                      <strong className={`truncate text-[13px] font-semibold ${selected ? "text-[#2d5e28]" : "text-[#1a1a18]"}`}>
                        {option.name || option.label}
                      </strong>
                      {meta ? <small className="truncate text-[11px] text-[#8b8a81]">{meta}</small> : null}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-5 text-center text-[13px] text-[#8b8a81]">
                <IconSearchOff size={20} className="mx-auto mb-2 block" />
                {emptyMessage}
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
      compact={compact}
      disabled={disabled || !line.material}
      emptyMessage={
        databaseOptions === null
          ? "Loading colours..."
          : `No ${selectedSupplier} colours for ${line.material}. Try another supplier.`
      }
      placeholder={line.material ? "Finish, colour & thickness" : "Select material first"}
      value={selectedValue}
      displayValue={displayValue}
      options={filteredOptions}
      // Shared with the quote editor's copy of this widget, so the two cannot
      // write a line differently. See colourSelectionPatch.
      onChange={(option) => onChange(colourSelectionPatch(option, selectedSupplier))}
    />
  );
});
