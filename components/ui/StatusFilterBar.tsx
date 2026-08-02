'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface StatusFilterOption {
  value: string
  label: string
  count?: number
}

export interface StatusFilterBarProps {
  options: StatusFilterOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function StatusFilterBar({ options, value, onChange, className }: StatusFilterBarProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)} role="group" aria-label="Status filter">
      {options.map(option => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex min-h-[32px] items-center gap-2 rounded-full border px-3 py-[6px] text-[12px] font-medium transition-colors',
              active
                ? 'border-[#1c2b1e] bg-[#1c2b1e] text-white'
                : 'border-[#dbd8cc] bg-white text-[#5a5a52] hover:bg-[#f5f8f4]'
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-[6px] py-[1px] text-[11px] font-semibold',
                  active ? 'bg-white/20 text-white' : 'bg-[#edf4eb] text-[#2d5e28]'
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
