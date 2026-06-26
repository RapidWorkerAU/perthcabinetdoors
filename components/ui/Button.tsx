'use client'

import * as React from 'react'
import { cva } from 'class-variance-authority'
import { IconCheck } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

/**
 * Button — primary interactive element used across the HSES app.
 *
 * @prop variant      - Visual style of the button.
 *                      'primary'   — teal fill, white text (default)
 *                      'secondary' — teal border + text, transparent background
 *                      'ghost'     — no border, no background, teal text
 *                      'neutral'   — light grey fill, dark text, subtle border
 *                      'danger'    — red fill, white text
 *
 * @prop size         - Controls height, horizontal padding, and font size.
 *                      'sm' — 32px height, 12px padding, 13px text
 *                      'md' — 40px height, 18px padding, 14px text (default)
 *                      'lg' — 48px height, 24px padding, 15px text
 *
 * @prop loading      - When true: replaces content with a spinner and loadingText,
 *                      and disables the button. Default: false.
 *
 * @prop loadingText  - Text shown next to the spinner during the loading state.
 *                      Default: 'Loading...'.
 *
 * @prop success      - When true: overrides the button to a green success state
 *                      showing a check icon and successText, and disables the button.
 *                      Default: false.
 *
 * @prop successText  - Text shown next to the check icon during the success state.
 *                      Default: 'Done'.
 *
 * @prop iconLeft     - Optional React node (icon) rendered to the left of the label.
 *
 * @prop iconRight    - Optional React node (icon) rendered to the right of the label.
 *
 * @prop iconOnly     - When true: renders a square button (width = height). The
 *                      label is hidden. Pair with `tooltip` for accessibility.
 *                      Default: false.
 *
 * @prop tooltip      - Short text shown in a floating tooltip on hover. Intended
 *                      for iconOnly buttons. Renders a dark pill above the button
 *                      with a downward arrow.
 */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-[6px] font-medium rounded-[6px] transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70',
  {
    variants: {
      variant: {
        primary:
          'bg-[#2d9692] text-white hover:bg-[#237775]',
        secondary:
          'bg-transparent border-[1.5px] border-[#2d9692] text-[#2d9692] hover:bg-[#f0f8f7]',
        ghost:
          'bg-transparent text-[#2d9692] hover:bg-[#f0f8f7]',
        neutral:
          'bg-[#eef0f4] text-[#3d4d5f] border-[0.5px] border-[#dde1e9] hover:bg-[#dde1e9]',
        danger:
          'bg-[#ef4444] text-white hover:bg-[#dc2626]',
      },
      size: {
        sm: 'h-8 text-[13px]',
        md: 'h-10 text-[14px]',
        lg: 'h-12 text-[15px]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size:    'md',
    },
  }
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:     'primary' | 'secondary' | 'ghost' | 'neutral' | 'danger'
  size?:        'sm' | 'md' | 'lg'
  loading?:     boolean
  loadingText?: string
  success?:     boolean
  successText?: string
  iconLeft?:    React.ReactNode
  iconRight?:   React.ReactNode
  iconOnly?:    boolean
  tooltip?:     string
}

const PADDING: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'px-3',
  md: 'px-[18px]',
  lg: 'px-6',
}

const ICON_ONLY_SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-8 p-0',
  md: 'w-10 p-0',
  lg: 'w-12 p-0',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingText = 'Loading...',
      success = false,
      successText = 'Done',
      iconLeft,
      iconRight,
      iconOnly = false,
      tooltip,
      className,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled    = disabled || loading || success
    const sizeKey       = size ?? 'md'
    const spacingClass  = iconOnly ? ICON_ONLY_SIZE[sizeKey] : PADDING[sizeKey]
    const isWhiteSpinner = variant === 'primary' || variant === 'danger'

    const button = (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          buttonVariants({ variant, size }),
          spacingClass,
          success && 'bg-[#16a34a] hover:bg-[#16a34a] text-white',
          loading && 'opacity-80',
          className
        )}
        {...props}
      >
        {loading ? (
          <>
            <span
              className={cn(
                'inline-block h-[14px] w-[14px] flex-shrink-0 animate-spin rounded-full border-2',
                isWhiteSpinner
                  ? 'border-white/30 border-t-white'
                  : 'border-[#2d9692]/30 border-t-[#2d9692]'
              )}
            />
            {!iconOnly && loadingText}
          </>
        ) : success ? (
          <>
            <IconCheck size={14} strokeWidth={2.5} />
            {!iconOnly && successText}
          </>
        ) : (
          <>
            {iconLeft}
            {children}
            {iconRight}
          </>
        )}
      </button>
    )

    if (!tooltip) return button

    return (
      <span className="relative inline-flex group">
        {button}
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <div className="whitespace-nowrap rounded-[4px] bg-[#1a2533] px-2 py-1 text-[11px] text-white">
            {tooltip}
          </div>
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[4px] border-t-[4px] border-x-transparent border-t-[#1a2533]" />
        </div>
      </span>
    )
  }
)

Button.displayName = 'Button'
