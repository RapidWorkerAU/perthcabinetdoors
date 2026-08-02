import * as React from 'react'
import { cn } from '@/lib/utils'

export type StatusPillTone =
  | 'neutral'
  | 'active'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

export interface StatusPillProps {
  tone?: 'auto' | StatusPillTone
  status?: string | null
  children?: React.ReactNode
  size?: 'sm' | 'md'
  showDot?: boolean
  className?: string
}

const TONE_CLASS: Record<StatusPillTone, { pill: string; dot: string }> = {
  neutral: { pill: 'bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]', dot: 'bg-[#8b8a81]' },
  active: { pill: 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]', dot: 'bg-[#6b9e61]' },
  success: { pill: 'bg-[#dcfce7] text-[#14532d] border-[#86efac]', dot: 'bg-[#16a34a]' },
  warning: { pill: 'bg-[#fff8df] text-[#5c4200] border-[#dcbf55]', dot: 'bg-[#dcbf55]' },
  danger: { pill: 'bg-[#fef2f2] text-[#991b1b] border-[#fca5a5]', dot: 'bg-[#b42318]' },
  info: { pill: 'bg-[#e6f1fb] text-[#185fa5] border-[#b9d7f1]', dot: 'bg-[#2f7fc2]' },
}

const SIZE_CLASS: Record<'sm' | 'md', string> = {
  sm: 'px-2 py-[2px] text-[11px]',
  md: 'px-2 py-[3px] text-[11px]',
}

function toneForStatus(status?: string | null): StatusPillTone {
  const value = String(status || '').toLowerCase()
  if (['active', 'approved', 'ready', 'paid', 'sent', 'viewed', 'converted_to_quote'].includes(value)) return 'active'
  if (['complete', 'completed', 'closed', 'success'].includes(value)) return 'success'
  if (['new', 'draft', 'reviewing', 'in_progress', 'waiting_on_customer', 'pending'].includes(value)) return 'warning'
  if (['rejected', 'failed', 'overdue', 'cancelled', 'inactive'].includes(value)) return 'danger'
  if (['imported', 'processing'].includes(value)) return 'info'
  return 'neutral'
}

function labelForStatus(status?: string | null) {
  return String(status || 'Unknown')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

export function StatusPill({
  tone = 'auto',
  status,
  children,
  size = 'md',
  showDot = false,
  className,
}: StatusPillProps) {
  const resolvedTone = tone === 'auto' ? toneForStatus(status) : tone
  const styles = TONE_CLASS[resolvedTone]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] rounded-full border font-semibold whitespace-nowrap',
        SIZE_CLASS[size],
        styles.pill,
        className
      )}
    >
      {showDot && <span className={cn('h-[6px] w-[6px] rounded-full', styles.dot)} />}
      {children ?? labelForStatus(status)}
    </span>
  )
}
