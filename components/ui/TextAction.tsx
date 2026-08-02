'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'success' | 'danger' | 'muted'
  iconLeft?: React.ReactNode
}

const VARIANT_CLASS: Record<NonNullable<TextActionProps['variant']>, string> = {
  default: 'text-[#1c2b1e] hover:text-[#2d5e28]',
  success: 'text-[#2d5e28] hover:text-[#1c2b1e]',
  danger: 'text-[#b42318] hover:text-[#8f1c13]',
  muted: 'text-[#5a5a52] hover:text-[#1a1a18]',
}

export const TextAction = React.forwardRef<HTMLButtonElement, TextActionProps>(
  ({ variant = 'default', iconLeft, className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex items-center gap-1 text-[12px] font-medium underline-offset-2 transition-colors hover:underline',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:no-underline',
        VARIANT_CLASS[variant],
        className
      )}
      {...props}
    >
      {iconLeft}
      {children}
    </button>
  )
)

TextAction.displayName = 'TextAction'
