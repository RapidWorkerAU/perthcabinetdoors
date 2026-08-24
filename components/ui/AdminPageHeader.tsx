import * as React from 'react'
import { cn } from '@/lib/utils'

export interface AdminPageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}

export function AdminPageHeader({ title, subtitle, actions, className }: AdminPageHeaderProps) {
  return (
    // Wrapping, because a header with several actions on it has nowhere to put
    // them on a phone and would otherwise crush the title to make room.
    <div className={cn('mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
      <div className="min-w-0">
        <h1 className="text-[20px] font-bold leading-tight text-[#1a1a18]">{title}</h1>
        {subtitle && <p className="mt-[2px] text-[13px] text-[#5a5a52]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
