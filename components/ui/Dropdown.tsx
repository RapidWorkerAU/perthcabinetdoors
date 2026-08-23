'use client'

import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import * as Checkbox from '@radix-ui/react-checkbox'
import {
  IconChevronDown,
  IconX,
  IconSearch,
  IconSearchOff,
  IconCheck,
  IconAlertCircle,
} from '@tabler/icons-react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import useIsMobile from '@/hooks/useIsMobile'

/**
 * Dropdown — searchable single-select or multi-select dropdown built on
 * Radix UI Popover for accessible panel positioning.
 *
 * Scroll is auto-enabled at 8+ options (max-h-[200px], min-h-[148px]).
 * Search is auto-enabled at 16+ options regardless of the searchable prop.
 *
 * ON A PHONE THIS IS A BOTTOM SHEET, not a panel floating beside the trigger.
 * A panel anchored to a control halfway down a small screen has nowhere to go:
 * it flips above or below depending on room, the keyboard opens over it when
 * you type in the search box, and the page scrolls itself to keep up. The
 * result is a list that jumps around while you are trying to read it.
 *
 * A sheet anchored to the bottom edge does none of that: it is always in the
 * same place, always sized the same, and it sits above the keyboard. It also
 * always shows the search box, whatever `searchable` says, because on a phone
 * scrolling a list is the expensive way to find something and typing two
 * letters is the cheap one.
 *
 * @prop label            - Label rendered above the trigger.
 * @prop helper           - Small grey helper text below.
 * @prop error            - Red error message below. Replaces helper when present.
 * @prop optional         - Renders "(optional)" inline with the label.
 * @prop placeholder      - Shown when no option is selected. Default: "Select an option...".
 * @prop options          - Array of { value, label, group? }. Options with the same group
 *                          string are rendered under a shared group header.
 * @prop value            - Controlled value. String for single, string[] for multi.
 * @prop onChange         - Called with the new value on every selection change.
 * @prop multiple         - Enables multi-select mode. Default: false.
 * @prop searchable       - Manually force search on/off. Auto-enabled at 16+ options
 *                          regardless of this prop.
 * @prop searchPlaceholder - Placeholder for the search input. Default: "Search...".
 * @prop clearable        - Shows an ✕ button to clear the selection. Default: true.
 * @prop selectAll        - Shows a "Select all" row in multi mode. Default: false.
 * @prop disabled         - Disables the trigger and prevents opening.
 * @prop containerClassName - className on the outer wrapper div.
 * @prop maxDisplay       - Max number of pills shown in multi mode before "+N more". Default: 3.
 * @prop display          - Multi mode only. "pills" (default) lists each choice as a
 *                          removable pill. "count" shows "N selected" instead, for a
 *                          narrow trigger where four pills would wrap and push the
 *                          layout around.
 * @prop autoWidth        - When true, panel expands to fit content width
 *                          (min: trigger width, max: 320px). Use for inline table cell
 *                          dropdowns. Default: false.
 */

export interface DropdownOption {
  value: string
  label: string
  group?: string
}

export interface DropdownProps {
  label?:             string
  helper?:            string
  error?:             string
  optional?:          boolean
  placeholder?:       string
  options?:           DropdownOption[]
  value?:             string | string[]
  onChange?:          (value: string | string[]) => void
  multiple?:          boolean
  searchable?:        boolean
  searchPlaceholder?: string
  clearable?:         boolean
  selectAll?:         boolean
  disabled?:          boolean
  containerClassName?: string
  triggerClassName?:   string
  maxDisplay?:        number
  display?:           'pills' | 'count'
  autoWidth?:         boolean
  /** Overrides the panel's z-index. Needed when rendered inside a high z-index
   *  modal so the panel isn't hidden behind it. Default: the built-in z-[60]. */
  contentZIndex?:     number
}

export const Dropdown = React.forwardRef<HTMLDivElement, DropdownProps>(
  (
    {
      label,
      helper,
      error,
      optional = false,
      placeholder = 'Select an option...',
      options = [],
      value,
      onChange,
      multiple = false,
      searchable = true,
      searchPlaceholder = 'Search...',
      clearable = true,
      selectAll = false,
      disabled = false,
      containerClassName,
      triggerClassName,
      maxDisplay = 3,
      display = 'pills',
      autoWidth = false,
      contentZIndex,
    },
    ref
  ) => {
    const [open, setOpen]           = React.useState(false)
    const [searchQuery, setSearchQuery] = React.useState('')
    const searchRef = React.useRef<HTMLInputElement>(null)
    const sheetSearchRef = React.useRef<HTMLInputElement>(null)
    const listboxId = React.useId()

    // ── How this instance behaves ───────────────────────────────────────────
    const optionCount = options.length
    // The sheet is for phones and small tablets. 768 is the same edge the
    // admin screens use for their md: layouts, so a dropdown becomes a sheet at
    // exactly the width the page around it becomes a single column.
    const isMobile = useIsMobile(768)
    // Auto-enable search at 16+ options regardless of prop, and always on a
    // phone, where scrolling to find a row costs far more than typing.
    const isSearchable = searchable || optionCount >= 16 || isMobile
    // Options list is scrollable at 8+ options. The sheet sizes itself instead.
    const isScrollable = optionCount >= 8

    // ── Derived values ──────────────────────────────────────────────────────

    const selectedValues: string[] = multiple
      ? Array.isArray(value) ? value : []
      : []

    const singleValue: string = !multiple && typeof value === 'string' ? value : ''

    const hasValue = multiple ? selectedValues.length > 0 : singleValue !== ''

    const filteredOptions = React.useMemo(() => {
      if (!searchQuery.trim()) return options
      const q = searchQuery.toLowerCase()
      return options.filter(opt => opt.label.toLowerCase().includes(q))
    }, [options, searchQuery])

    // Ordered unique group names (preserving first-appearance order)
    const groupNames = React.useMemo(
      () => [...new Set(filteredOptions.filter(o => o.group).map(o => o.group!))],
      [filteredOptions]
    )
    const ungrouped = filteredOptions.filter(o => !o.group)

    // Multi select-all state
    const allFilteredSelected =
      filteredOptions.length > 0 &&
      filteredOptions.every(o => selectedValues.includes(o.value))
    const someFilteredSelected = filteredOptions.some(o => selectedValues.includes(o.value))

    // Pills for multi trigger
    const selectedOptions = options.filter(o => selectedValues.includes(o.value))
    const displayedPills  = selectedOptions.slice(0, maxDisplay)
    const overflowCount   = selectedOptions.length - displayedPills.length

    // ── Handlers ────────────────────────────────────────────────────────────

    function handleSelect(optionValue: string) {
      if (multiple) {
        const next = selectedValues.includes(optionValue)
          ? selectedValues.filter(v => v !== optionValue)
          : [...selectedValues, optionValue]
        onChange?.(next)
      } else {
        onChange?.(optionValue)
        setOpen(false)
      }
    }

    function handleSelectAll() {
      if (allFilteredSelected) {
        onChange?.(selectedValues.filter(v => !filteredOptions.find(o => o.value === v)))
      } else {
        const toAdd = filteredOptions.map(o => o.value)
        onChange?.([...new Set([...selectedValues, ...toAdd])])
      }
    }

    function handleClear(e: React.MouseEvent) {
      e.stopPropagation()
      onChange?.(multiple ? [] : '')
    }

    function handleRemovePill(pillValue: string, e: React.MouseEvent) {
      e.stopPropagation()
      onChange?.(selectedValues.filter(v => v !== pillValue))
    }

    function handleOpenChange(next: boolean) {
      setOpen(next)
      if (!next) setSearchQuery('')
    }

    // THE PAGE BEHIND THE SHEET MUST NOT SCROLL. Without this, dragging the
    // options list at either end scrolls the page underneath instead, which is
    // the exact "screen jumps around" this sheet exists to stop.
    // Focus the search box when the sheet opens, the same as the popover does.
    React.useEffect(() => {
      if (!isMobile || !open || !isSearchable) return
      const timer = window.setTimeout(() => sheetSearchRef.current?.focus(), 60)
      return () => window.clearTimeout(timer)
    }, [isMobile, open, isSearchable])

    React.useEffect(() => {
      if (!isMobile || !open) return
      const previous = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = previous
      }
    }, [isMobile, open])

    // Escape closes it, the same key that closes the popover on a desktop.
    React.useEffect(() => {
      if (!isMobile || !open) return
      function onKey(event: KeyboardEvent) {
        if (event.key === 'Escape') handleOpenChange(false)
      }
      document.addEventListener('keydown', onKey)
      return () => document.removeEventListener('keydown', onKey)
    }, [isMobile, open])

    // ── Subcomponents ────────────────────────────────────────────────────────

    function RadioIndicator({ selected }: { selected: boolean }) {
      return (
        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#dbd8cc]">
          {selected && <span className="h-2 w-2 rounded-full bg-[#6b9e61]" />}
        </span>
      )
    }

    function CheckboxIndicator({ checked, partial = false }: { checked: boolean; partial?: boolean }) {
      // Radix takes the string "indeterminate" as a third state, which is what
      // renders the dash rather than the tick.
      const state: boolean | 'indeterminate' = checked ? true : partial ? 'indeterminate' : false
      return (
        <Checkbox.Root
          checked={state}
          className={cn(
            'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors',
            checked || partial ? 'bg-[#6b9e61] border-[#6b9e61]' : 'bg-white border-[#dbd8cc]'
          )}
          onCheckedChange={() => {}}
          tabIndex={-1}
          aria-hidden
        >
          <Checkbox.Indicator className="flex items-center justify-center">
            {checked ? (
              <IconCheck size={10} className="text-white" />
            ) : (
              <span className="block h-[2px] w-[8px] rounded-full bg-white" />
            )}
          </Checkbox.Indicator>
        </Checkbox.Root>
      )
    }

    function OptionRow({ opt, sheet = false }: { opt: DropdownOption; sheet?: boolean }) {
      const selected = multiple
        ? selectedValues.includes(opt.value)
        : singleValue === opt.value

      return (
        <div
          role="option"
          aria-selected={selected}
          tabIndex={0}
          onClick={() => handleSelect(opt.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSelect(opt.value) }}
          className={cn(
            'flex cursor-pointer items-center gap-[10px] px-3 text-[#1a1a18]',
            'outline-none transition-colors duration-100',
            'hover:bg-[#f5f8f4]',
            sheet ? 'min-h-[44px] py-[11px] text-[16px]' : 'py-[9px] text-[14px]',
            selected && 'bg-[#edf4eb] text-[#2d5e28]'
          )}
        >
          {multiple
            ? <CheckboxIndicator checked={selected} />
            : <RadioIndicator selected={selected} />
          }
          {opt.label}
        </div>
      )
    }

    // ── Trigger content ──────────────────────────────────────────────────────

    const triggerBorderClass = error
      ? 'border-[#b42318]'
      : open
      ? 'border-[#6b9e61]'
      : 'border-[#dbd8cc]'

    const singleLabel = options.find(o => o.value === singleValue)?.label


    // ── The panel body, shared by both presentations ────────────────────────

    function renderBody({ sheet }: { sheet: boolean }) {
      return (
        <>
          {/* Search input */}
          {isSearchable && (
            <div className={cn('border-b border-[#edf4eb]', sheet ? 'p-3' : 'p-2')}>
              <div className="relative">
                <IconSearch
                  size={sheet ? 16 : 14}
                  className={cn(
                    'pointer-events-none absolute top-1/2 -translate-y-1/2 text-[#8b8a81]',
                    sheet ? 'left-3' : 'left-2'
                  )}
                />
                <input
                  ref={sheet ? sheetSearchRef : searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className={cn(
                    'w-full rounded-[6px] border border-[#dbd8cc] bg-[#f5f8f4]',
                    'text-[#1a1a18] outline-none',
                    'focus:border-[#6b9e61] focus:bg-white transition-colors',
                    // 16px on the sheet is not a style choice: iOS zooms the whole
                    // page in on any focused input below it, and the zoom is what
                    // makes the screen jump.
                    sheet ? 'h-[42px] pl-[36px] pr-3 text-[16px]' : 'h-[34px] pl-[28px] pr-2 text-[13px]'
                  )}
                />
              </div>
            </div>
          )}

          {/* Select all row */}
          {multiple && selectAll && (
            <div
              role="option"
              aria-selected={allFilteredSelected}
              aria-checked={allFilteredSelected ? true : someFilteredSelected ? 'mixed' : false}
              tabIndex={0}
              onClick={handleSelectAll}
              onKeyDown={e => { if (e.key === 'Enter') handleSelectAll() }}
              className={cn(
                'flex cursor-pointer items-center gap-[10px] border-b border-[#edf4eb] px-3 font-medium text-[#5a5a52] outline-none hover:bg-[#f5f8f4]',
                sheet ? 'py-3 text-[15px]' : 'py-2 text-[13px]'
              )}
            >
              <CheckboxIndicator
                checked={allFilteredSelected}
                partial={!allFilteredSelected && someFilteredSelected}
              />
              Select all
            </div>
          )}

          {/* Options list */}
          <div
            id={sheet ? undefined : listboxId}
            role="listbox"
            aria-multiselectable={multiple || undefined}
            className={cn(
              'overflow-y-auto overscroll-contain',
              // The sheet gets the room left over once the handle, the search box
              // and the footer have taken theirs, so the list is the part that
              // grows and the frame stays put.
              sheet ? 'flex-1 min-h-0' : isScrollable ? 'max-h-[200px] min-h-[148px]' : ''
            )}
          >
            {filteredOptions.length === 0 ? (
              <div className={cn('text-center text-[#8b8a81]', sheet ? 'px-3 py-10 text-[15px]' : 'px-3 py-5 text-[13px]')}>
                <IconSearchOff size={sheet ? 24 : 20} className="mx-auto mb-2 block" />
                {searchQuery ? <>No results for &ldquo;{searchQuery}&rdquo;</> : 'Nothing to choose from'}
              </div>
            ) : (
              <>
                {/* Ungrouped options first */}
                {ungrouped.map(opt => <OptionRow key={opt.value} opt={opt} sheet={sheet} />)}

                {/* Grouped options */}
                {groupNames.map(group => (
                  <div key={group}>
                    <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">
                      {group}
                    </div>
                    {filteredOptions
                      .filter(o => o.group === group)
                      .map(opt => <OptionRow key={opt.value} opt={opt} sheet={sheet} />)}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Multi footer */}
          {multiple && selectedValues.length > 0 && (
            <div className={cn(
              'flex items-center justify-between border-t border-[#edf4eb] px-3 text-[#5a5a52]',
              sheet ? 'py-3 text-[14px]' : 'py-2 text-[12px]'
            )}>
              <span>{selectedValues.length} selected</span>
              <button
                type="button"
                onClick={() => onChange?.([])}
                className="font-medium text-[#2d5e28] hover:text-[#1c2b1e] transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </>
      )
    }

    // ── Render ───────────────────────────────────────────────────────────────

    return (
      <div className={cn('flex flex-col gap-[5px]', containerClassName)} ref={ref}>

        {/* Label */}
        {label && (
          <div className="flex items-center gap-1">
            <span className="text-[13px] font-medium text-[#1a1a18]">{label}</span>
            {optional && (
              <span className="text-[11px] font-normal text-[#8b8a81]">(optional)</span>
            )}
          </div>
        )}

        {/* Popover */}
        <Popover.Root open={open} onOpenChange={handleOpenChange}>

          {/* Trigger */}
          <Popover.Trigger asChild disabled={disabled}>
            <div
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-haspopup="listbox"
              aria-disabled={disabled}
              className={cn(
                'relative w-full cursor-pointer select-none rounded-[6px] border bg-white',
                'transition-colors duration-150',
                multiple
                  ? 'flex min-h-[40px] flex-wrap items-center gap-1 py-[6px] pl-[8px] pr-[36px]'
                  : 'flex h-[40px] items-center px-3 pr-[64px] text-[14px]',
                triggerBorderClass,
                disabled && 'cursor-not-allowed border-[#edf4eb] bg-[#f5f8f4] text-[#8b8a81]',
                triggerClassName
              )}
            >
              {/* Multi: a count instead of pills, where the trigger is narrow */}
              {multiple && display === 'count' && (
                <span className={cn('text-[14px]', selectedOptions.length ? 'text-[#1a1a18]' : 'text-[#8b8a81]')}>
                  {selectedOptions.length === 0
                    ? placeholder
                    : `${selectedOptions.length} of ${options.length} selected`}
                </span>
              )}

              {/* Multi: pills */}
              {multiple && display === 'pills' && (
                <>
                  {selectedOptions.length === 0 && (
                    <span className="text-[14px] text-[#8b8a81]">{placeholder}</span>
                  )}
                  {displayedPills.map(opt => (
                    <span
                      key={opt.value}
                      className="inline-flex items-center gap-1 rounded-full bg-[#edf4eb] px-2 py-[3px] text-[12px] font-medium text-[#2d5e28]"
                    >
                      {opt.label}
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={e => handleRemovePill(opt.value, e)}
                        className="ml-[2px] text-[#5a5a52] hover:text-[#1a1a18] transition-colors"
                        aria-label={`Remove ${opt.label}`}
                      >
                        <IconX size={11} />
                      </button>
                    </span>
                  ))}
                  {overflowCount > 0 && (
                    <span className="text-[12px] text-[#5a5a52]">+{overflowCount} more</span>
                  )}
                </>
              )}

              {/* Single: label or placeholder */}
              {!multiple && (
                <span className={singleLabel ? 'text-[#1a1a18]' : 'text-[#8b8a81]'}>
                  {singleLabel ?? placeholder}
                </span>
              )}

              {/* Clear button */}
              {clearable && hasValue && !disabled && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={handleClear}
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2 text-[#8b8a81] hover:text-[#1a1a18] transition-colors',
                    multiple ? 'right-[28px]' : 'right-[30px]'
                  )}
                  aria-label="Clear selection"
                >
                  <IconX size={14} />
                </button>
              )}

              {/* Chevron */}
              <span className="pointer-events-none absolute right-[10px] top-1/2 -translate-y-1/2 text-[#8b8a81]">
                <IconChevronDown
                  size={16}
                  className={cn('transition-transform duration-150', open && 'rotate-180')}
                />
              </span>
            </div>
          </Popover.Trigger>

          {/* Panel: a sheet on a phone, a popover on a desktop. Never both. */}
          {isMobile && open && typeof document !== 'undefined'
            ? createPortal(
                <div className="fixed inset-0 z-[70] flex flex-col justify-end">
                  {/* Tapping away closes it, the same as clicking outside the popover. */}
                  <div
                    className="absolute inset-0 bg-black/35"
                    onClick={() => handleOpenChange(false)}
                    aria-hidden
                  />
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={label || placeholder}
                    // 85vh, not a fixed height: a two-option list should not open
                    // a sheet most of the way up the screen, and a long one should
                    // not run off the top.
                    className={cn(
                      'relative flex max-h-[85vh] w-full flex-col overflow-hidden',
                      'rounded-t-[16px] border-t border-[#dbd8cc] bg-white',
                      'shadow-[0_-8px_32px_rgba(0,0,0,0.18)]'
                    )}
                    // The keyboard sits over the bottom of the screen, so the
                    // sheet keeps clear of it and of the home indicator below.
                    style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-[#edf4eb] px-4 py-3">
                      <span className="truncate text-[15px] font-semibold text-[#1a1a18]">
                        {label || placeholder}
                      </span>
                      {/* A named way out. Tapping the backdrop works, but it is not
                          visible, and on a full-width sheet there is little of it. */}
                      <button
                        type="button"
                        onClick={() => handleOpenChange(false)}
                        aria-label="Close"
                        className="flex h-[32px] w-[32px] flex-shrink-0 items-center justify-center rounded-full text-[#5a5a52] hover:bg-[#f5f8f4]"
                      >
                        <IconX size={18} />
                      </button>
                    </div>
                    {renderBody({ sheet: true })}
                  </div>
                </div>,
                document.body
              )
            : null}

          {!isMobile && (
          <Popover.Portal>
            <Popover.Content
              data-pcd-dropdown-menu="true"
              sideOffset={8}
              align="start"
              onOpenAutoFocus={e => {
                e.preventDefault()
                if (isSearchable) searchRef.current?.focus()
              }}
              style={{
                ...(autoWidth
                  ? { minWidth: 'var(--radix-popover-trigger-width)', width: 'max-content', maxWidth: '320px' }
                  : { width: 'var(--radix-popover-trigger-width)' }),
                ...(contentZIndex != null ? { zIndex: contentZIndex } : {}),
              }}
              className={cn(
                'z-[60] overflow-hidden rounded-[6px] border border-[#dbd8cc] bg-white',
                'shadow-[0_4px_16px_rgba(0,0,0,0.08)]'
              )}
            >

              {renderBody({ sheet: false })}

            </Popover.Content>
          </Popover.Portal>
          )}
        </Popover.Root>

        {/* Below: error or helper */}
        {(error || helper) && (
          <div>
            {error ? (
              <p className="flex items-center gap-1 text-[12px] text-[#b42318]">
                <IconAlertCircle size={13} className="flex-shrink-0" />
                <span>{error}</span>
              </p>
            ) : (
              <p className="text-[12px] text-[#5a5a52]">{helper}</p>
            )}
          </div>
        )}

      </div>
    )
  }
)

Dropdown.displayName = 'Dropdown'
