'use client'

import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { IconDotsVertical } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { IconButton } from '@/components/ui/IconButton'

export interface ActionMenuProps {
  label: string
  disabled?: boolean
  align?: 'start' | 'center' | 'end'
  children: React.ReactNode
}

export interface ActionMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'danger'
  icon?: React.ReactNode
}

export function ActionMenu({
  label,
  disabled = false,
  align = 'end',
  children,
}: ActionMenuProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <IconButton label={label} size="sm" variant="ghost" disabled={disabled}>
          <IconDotsVertical size={16} />
        </IconButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 min-w-[168px] overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white p-1 shadow-[0_16px_40px_rgba(26,26,24,0.14)]"
          onClick={event => {
            if ((event.target as HTMLElement).closest('button')) setOpen(false)
          }}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function ActionMenuItem({
  variant = 'default',
  icon,
  className,
  children,
  ...props
}: ActionMenuItemProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-9 w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'danger'
          ? 'text-[#b42318] hover:bg-[#fef2f2]'
          : 'text-[#1a1a18] hover:bg-[#f5f8f4]',
        className
      )}
      {...props}
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}
