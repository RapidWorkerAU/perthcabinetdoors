'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  variant?: 'ghost' | 'neutral' | 'primary' | 'danger'
  tooltip?: string
  children: React.ReactNode
}

const SIZE_CLASS: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: 'h-[26px] w-[26px]',
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
}

const VARIANT_CLASS: Record<NonNullable<IconButtonProps['variant']>, string> = {
  ghost: 'bg-transparent text-[#8b8a81] hover:bg-[#edf4eb] hover:text-[#1a1a18]',
  neutral: 'border border-[#dbd8cc] bg-white text-[#5a5a52] hover:bg-[#f5f8f4] hover:text-[#1a1a18]',
  primary: 'border border-[#1c2b1e] bg-[#1c2b1e] text-white hover:bg-[#2d3f2f]',
  danger: 'border border-[#f0c7c3] bg-white text-[#b42318] hover:bg-[#fef2f2]',
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, size = 'md', variant = 'ghost', tooltip, className, children, ...props }, ref) => {
    const button = (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          'inline-flex flex-shrink-0 items-center justify-center rounded-[6px] transition-colors duration-150',
          'disabled:cursor-not-allowed disabled:opacity-50',
          SIZE_CLASS[size],
          VARIANT_CLASS[variant],
          className
        )}
        {...props}
      >
        {children}
      </button>
    )

    if (!tooltip) return button

    return (
      <span className="group relative inline-flex">
        {button}
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-[4px] bg-[#1a1a18] px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
          {tooltip}
        </span>
      </span>
    )
  }
)

IconButton.displayName = 'IconButton'
