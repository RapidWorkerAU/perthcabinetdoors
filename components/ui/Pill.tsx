import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Pill — compact status and risk-rating badge used in tables, record headers,
 * and detail views.
 *
 * @prop variant  - Required. Controls colour scheme.
 *                  Status variants (dot shown by default):
 *                    'open' | 'in-progress' | 'under-review' | 'overdue' | 'closed'
 *                  Risk variants (no dot by default):
 *                    'risk-low' | 'risk-medium' | 'risk-high' | 'risk-critical'
 *
 * @prop size     - Controls padding and font size.
 *                  'sm' | 'md' (default) | 'lg'
 *
 * @prop showDot  - Renders a coloured dot before the label.
 *                  Defaults to true for status variants, false for risk variants.
 *                  Pass explicitly to override.
 *
 * @prop children - The label text displayed inside the pill.
 */

export type PillVariant =
  | 'open'
  | 'in-progress'
  | 'under-review'
  | 'overdue'
  | 'closed'
  | 'risk-low'
  | 'risk-medium'
  | 'risk-high'
  | 'risk-critical'

export interface PillProps {
  variant:   PillVariant
  size?:     'sm' | 'md' | 'lg'
  showDot?:  boolean
  children:  React.ReactNode
}

const VARIANT_STYLES: Record<PillVariant, { pill: string; dot: string }> = {
  'open':          { pill: 'bg-[#daefee] text-[#1c5f5d]',                           dot: 'bg-[#2d9692]' },
  'in-progress':   { pill: 'bg-[#fef3c7] text-[#92400e]',                           dot: 'bg-[#f59e0b]' },
  'under-review':  { pill: 'bg-[#e0e7ff] text-[#3730a3]',                           dot: 'bg-[#6366f1]' },
  'overdue':       { pill: 'bg-[#fee2e2] text-[#991b1b]',                           dot: 'bg-[#ef4444]' },
  'closed':        { pill: 'bg-[#eef0f4] text-[#3d4d5f]',                           dot: 'bg-[#6e7e92]'  },
  'risk-low':      { pill: 'bg-[#dcfce9] text-[#14532d]',                           dot: '' },
  'risk-medium':   { pill: 'bg-[#fef3c7] text-[#78350f]',                           dot: '' },
  'risk-high':     { pill: 'bg-[#fee2e2] text-[#7f1d1d]',                           dot: '' },
  'risk-critical': { pill: 'bg-[#fce7e7] text-[#7c0a02] border border-[#fca5a5]',  dot: '' },
}

const SIZE_STYLES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'px-2 py-[2px] text-[11px]',
  md: 'px-[10px] py-[3px] text-[12px]',
  lg: 'px-3 py-1 text-[13px]',
}

export function Pill({ variant, size = 'md', showDot, children }: PillProps) {
  const isRiskVariant = variant.startsWith('risk-')
  const dot = showDot !== undefined ? showDot : !isRiskVariant
  const styles = VARIANT_STYLES[variant]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] font-medium rounded-full whitespace-nowrap',
        SIZE_STYLES[size],
        styles.pill
      )}
    >
      {dot && styles.dot && (
        <span className={cn('w-[6px] h-[6px] rounded-full flex-shrink-0', styles.dot)} />
      )}
      {children}
    </span>
  )
}
