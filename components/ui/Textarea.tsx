'use client'

import * as React from 'react'
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

/**
 * Textarea — multi-line text input with label, messages, and character count.
 *
 * @prop label              - Label text rendered above the textarea.
 * @prop helper             - Small grey helper text below. Shown when no error/success.
 * @prop error              - Red error message below. Takes priority over helper.
 * @prop successMessage     - Green success message below. Takes priority over helper.
 * @prop optional           - Renders "(optional)" tag inline with the label.
 * @prop rows               - Number of visible text rows. Default: 4.
 * @prop resize             - CSS resize behaviour: 'none' | 'vertical' | 'both'. Default: 'vertical'.
 * @prop showCount          - Shows "x / maxLength" counter below right. Requires maxLength.
 * @prop containerClassName - className applied to the outer wrapper div.
 */

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?:              string
  helper?:             string
  error?:              string
  successMessage?:     string
  optional?:           boolean
  rows?:               number
  resize?:             'none' | 'vertical' | 'both'
  showCount?:          boolean
  containerClassName?: string
}

const resizeClass: Record<'none' | 'vertical' | 'both', string> = {
  none:     'resize-none',
  vertical: 'resize-y',
  both:     'resize',
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      helper,
      error,
      successMessage,
      optional = false,
      rows = 4,
      resize = 'vertical',
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

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      if (!isControlled) setUncontrolledValue(e.target.value)
      onChange?.(e)
    }

    const hasBelow =
      !!(error || successMessage || helper) ||
      (showCount && maxLength !== undefined)

    return (
      <div className={cn('flex flex-col gap-[5px]', containerClassName)}>

        {/* Label row */}
        {label && (
          <div className="flex items-center gap-1">
            <label className="text-[13px] font-medium text-[#1a1a18]">{label}</label>
            {optional && (
              <span className="text-[11px] font-normal text-[#8b8a81]">(optional)</span>
            )}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={ref}
          rows={rows}
          disabled={disabled}
          value={isControlled ? (value as string) : undefined}
          defaultValue={!isControlled ? defaultValue : undefined}
          onChange={handleChange}
          maxLength={maxLength}
          className={cn(
            'w-full border border-[#dbd8cc] rounded-[6px] bg-white px-3 py-[10px]',
            'text-[14px] text-[#1a1a18] leading-relaxed outline-none transition-colors duration-150',
            'placeholder:text-[#8b8a81]',
            'hover:border-[#8b8a81]',
            'focus:border-[#6b9e61]',
            resizeClass[resize],
            disabled && 'bg-[#f5f8f4] text-[#8b8a81] cursor-not-allowed border-[#edf4eb] hover:border-[#edf4eb] focus:border-[#edf4eb]',
            error && 'border-[#b42318] hover:border-[#b42318] focus:border-[#b42318]',
            !error && successMessage && 'border-[#16a34a] hover:border-[#16a34a] focus:border-[#16a34a]',
            className
          )}
          {...props}
        />

        {/* Below row: message + character count */}
        {hasBelow && (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {error ? (
                <p className="flex items-center gap-1 text-[12px] text-[#b42318]">
                  <IconAlertCircle size={13} className="flex-shrink-0" />
                  <span>{error}</span>
                </p>
              ) : successMessage ? (
                <p className="flex items-center gap-1 text-[12px] text-[#16a34a]">
                  <IconCircleCheck size={13} className="flex-shrink-0" />
                  <span>{successMessage}</span>
                </p>
              ) : helper ? (
                <p className="text-[12px] text-[#5a5a52]">{helper}</p>
              ) : null}
            </div>

            {showCount && maxLength !== undefined && (
              <p className="flex-shrink-0 text-right text-[11px] text-[#8b8a81]">
                {currentLength} / {maxLength}
              </p>
            )}
          </div>
        )}

      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
