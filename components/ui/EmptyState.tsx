'use client'

import * as React from 'react'
import { IconInbox } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  /** Main heading. */
  title: string
  /** Supporting text below the title. */
  description?: string
  /** Icon rendered in the circle above the title. Defaults to IconInbox. */
  icon?: React.ReactNode
  /** Button or element rendered below the description. */
  action?: React.ReactNode
  /** Layout density. */
  size?: 'sm' | 'md'
}

/** Shown when a record list has no data. */
export function EmptyState({ title, description, icon, action, size = 'md' }: EmptyStateProps) {
  const isMd = size === 'md'
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center',
      isMd ? 'py-12 px-6' : 'py-8 px-4',
    )}>
      <div className={cn(
        'rounded-full bg-[#eef0f4] flex items-center justify-center text-[#9ba7b8]',
        isMd ? 'w-[56px] h-[56px] mb-4' : 'w-[44px] h-[44px] mb-3',
      )}>
        {icon ?? (isMd ? <IconInbox size={24} /> : <IconInbox size={20} />)}
      </div>
      <p className={cn(
        'font-semibold text-[#1a2533] mb-1',
        isMd ? 'text-[15px]' : 'text-[14px]',
      )}>
        {title}
      </p>
      {description && (
        <p className="text-[13px] text-[#6e7e92] leading-relaxed max-w-[320px]">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
