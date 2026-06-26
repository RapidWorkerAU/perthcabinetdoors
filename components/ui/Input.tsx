'use client'

import * as React from 'react'
import { IconAlertCircle, IconCircleCheck, IconX } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

/**
 * Input — single-line text input with label, messages, icon slots,
 * prefix/suffix blocks, clear button, and character count.
 *
 * @prop label              - Label text rendered above the input.
 * @prop helper             - Small grey helper text below the input.
 * @prop error              - Red error message below. Replaces helper when present.
 * @prop successMessage     - Green success message below. Replaces helper when present.
 * @prop optional           - Renders "(optional)" tag inline with the label.
 * @prop iconLeft           - React node inside the left edge of the input.
 * @prop iconRight          - React node inside the right edge of the input.
 * @prop clearable          - Shows an ✕ button on the right when the input has a value.
 * @prop onClear            - Called when the clear button is clicked.
 * @prop prefix             - Text block attached left (e.g. "https://").
 * @prop suffix             - Text block attached right (e.g. "employees").
 * @prop showCount          - Shows "x / maxLength" counter below right. Requires maxLength.
 * @prop containerClassName - className applied to the outer wrapper div.
 */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?:              string
  helper?:             string
  error?:              string
  successMessage?:     string
  optional?:           boolean
  iconLeft?:           React.ReactNode
  iconRight?:          React.ReactNode
  clearable?:          boolean
  onClear?:            () => void
  prefix?:             string
  suffix?:             string
  showCount?:          boolean
  containerClassName?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helper,
      error,
      successMessage,
      optional = false,
      iconLeft,
      iconRight,
      clearable = false,
      onClear,
      prefix,
      suffix,
      showCount = false,
      containerClassName,
      className,
      disabled,
      value,
      defaultValue,
      onChange,
      maxLength,
      ...props
    },
    ref
  ) => {
    const isControlled = value !== undefined

    const [uncontrolledValue, setUncontrolledValue] = React.useState(
      defaultValue !== undefined ? String(defaultValue) : ''
    )

    const currentLength = isControlled
      ? String(value).length
      : uncontrolledValue.length

    const showClearButton =
      clearable &&
      (isControlled ? String(value).length > 0 : uncontrolledValue.length > 0)

    const hasRightAddon = !!(iconRight || showClearButton)

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      if (!isControlled) setUncontrolledValue(e.target.value)
      onChange?.(e)
    }

    // Border colour applied to prefix/suffix blocks — mirrors the input border state
    const addonBorder = error
      ? 'border-[#ef4444]'
      : successMessage
      ? 'border-[#16a34a]'
      : 'border-[#dde1e9] group-focus-within:border-[#2d9692]'

    const hasBelow =
      !!(error || successMessage || helper) ||
      (showCount && maxLength !== undefined)

    return (
      <div className={cn('flex flex-col gap-[5px]', containerClassName)}>

        {/* Label row */}
        {label && (
          <div className="flex items-center gap-1">
            <label className="text-[13px] font-medium text-[#1a2533]">{label}</label>
            {optional && (
              <span className="text-[11px] font-normal text-[#9ba7b8]">(optional)</span>
            )}
          </div>
        )}

        {/* Input row — group enables focus-within border sync on prefix/suffix */}
        <div className="group flex">

          {prefix && (
            <div
              className={cn(
                'flex items-center px-3 text-[13px] text-[#6e7e92]',
                'bg-[#f7f8fa] border border-r-0 rounded-l-[6px] transition-colors duration-150',
                addonBorder
              )}
            >
              {prefix}
            </div>
          )}

          <div className="relative flex-1">
            {iconLeft && (
              <span className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[#9ba7b8]">
                {iconLeft}
              </span>
            )}

            <input
              ref={ref}
              disabled={disabled}
              value={isControlled ? (value as string) : undefined}
              defaultValue={!isControlled ? defaultValue : undefined}
              onChange={handleChange}
              maxLength={maxLength}
              className={cn(
                'h-[40px] w-full border border-[#dde1e9] bg-white px-3',
                'text-[14px] text-[#1a2533] outline-none transition-colors duration-150',
                'placeholder:text-[#9ba7b8]',
                'hover:border-[#9ba7b8]',
                'focus:border-[#2d9692]',
                // Radius — adjusted when prefix/suffix present
                !prefix && !suffix && 'rounded-[6px]',
                prefix && !suffix  && 'rounded-r-[6px] rounded-l-none',
                !prefix && suffix  && 'rounded-l-[6px] rounded-r-none',
                prefix && suffix   && 'rounded-none',
                // Icon padding
                iconLeft     && 'pl-9',
                hasRightAddon && 'pr-9',
                // Disabled
                disabled && 'bg-[#f7f8fa] text-[#9ba7b8] cursor-not-allowed border-[#eef0f4] hover:border-[#eef0f4] focus:border-[#eef0f4]',
                // Error
                error && 'border-[#ef4444] hover:border-[#ef4444] focus:border-[#ef4444]',
                // Success (only when no error)
                !error && successMessage && 'border-[#16a34a] hover:border-[#16a34a] focus:border-[#16a34a]',
                className
              )}
              {...props}
            />

            {showClearButton ? (
              <button
                type="button"
                onClick={onClear}
                tabIndex={-1}
                className="absolute right-[10px] top-1/2 -translate-y-1/2 text-[#9ba7b8] hover:text-[#3d4d5f] transition-colors duration-150"
              >
                <IconX size={15} />
              </button>
            ) : iconRight ? (
              <span className="pointer-events-none absolute right-[10px] top-1/2 -translate-y-1/2 text-[#9ba7b8]">
                {iconRight}
              </span>
            ) : null}
          </div>

          {suffix && (
            <div
              className={cn(
                'flex items-center px-3 text-[13px] text-[#6e7e92]',
                'bg-[#f7f8fa] border border-l-0 rounded-r-[6px] transition-colors duration-150',
                addonBorder
              )}
            >
              {suffix}
            </div>
          )}
        </div>

        {/* Below row: message + character count */}
        {hasBelow && (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {error ? (
                <p className="flex items-center gap-1 text-[12px] text-[#ef4444]">
                  <IconAlertCircle size={13} className="flex-shrink-0" />
                  <span>{error}</span>
                </p>
              ) : successMessage ? (
                <p className="flex items-center gap-1 text-[12px] text-[#16a34a]">
                  <IconCircleCheck size={13} className="flex-shrink-0" />
                  <span>{successMessage}</span>
                </p>
              ) : helper ? (
                <p className="text-[12px] text-[#6e7e92]">{helper}</p>
              ) : null}
            </div>

            {showCount && maxLength !== undefined && (
              <p className="flex-shrink-0 text-right text-[11px] text-[#9ba7b8]">
                {currentLength} / {maxLength}
              </p>
            )}
          </div>
        )}

      </div>
    )
  }
)

Input.displayName = 'Input'
