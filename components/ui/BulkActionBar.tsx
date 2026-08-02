'use client'

import * as React from 'react'
import { IconX } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'

export interface BulkActionBarProps {
  selectedCount: number
  noun?: string
  variant?: 'solid' | 'inline'
  onClear?: () => void
  onDelete?: () => void
  deleting?: boolean
  actions?: React.ReactNode
  className?: string
}

export function BulkActionBar({
  selectedCount,
  noun = 'record',
  variant = 'solid',
  onClear,
  onDelete,
  deleting = false,
  actions,
  className,
}: BulkActionBarProps) {
  if (selectedCount <= 0) return null

  const label = `${selectedCount} ${noun}${selectedCount === 1 ? '' : 's'} selected`

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3',
        variant === 'solid'
          ? 'rounded-[8px] border border-[#1c2b1e] bg-[#1c2b1e] px-3 py-2 text-white'
          : 'rounded-[6px] border border-transparent bg-transparent px-0 py-0 text-[#5a5a52]',
        className
      )}
    >
      <span className="text-[13px] font-medium">{label}</span>
      <div className="flex items-center gap-2">
        {actions}
        {onDelete && (
          <Button variant="danger" size="sm" onClick={onDelete} loading={deleting} loadingText="Deleting...">
            Delete
          </Button>
        )}
        {onClear && (
          <IconButton
            label="Clear selection"
            size="sm"
            variant="ghost"
            className={variant === 'solid'
              ? 'text-white/70 hover:bg-white/10 hover:text-white'
              : 'text-[#8b8a81] hover:bg-[#edf4eb] hover:text-[#1a1a18]'
            }
            onClick={onClear}
          >
            <IconX size={15} />
          </IconButton>
        )}
      </div>
    </div>
  )
}
