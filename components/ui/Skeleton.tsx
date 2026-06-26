'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SkeletonProps {
  /** Additional classes — use to set width and height. */
  className?: string
  /** Border-radius preset. */
  rounded?: 'none' | 'sm' | 'md' | 'full'
}

const ROUNDED: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  none: 'rounded-none',
  sm:   'rounded-[4px]',
  md:   'rounded-[6px]',
  full: 'rounded-full',
}

/** Generic pulsing loading placeholder. Width and height must be provided via className. */
export function Skeleton({ className, rounded = 'md' }: SkeletonProps) {
  return (
    <span className={cn('animate-pulse bg-[#eef0f4] block', ROUNDED[rounded], className)} />
  )
}

export interface SkeletonTextProps {
  /** Inline width override, e.g. "60%" or "120px". Defaults to 100%. */
  width?: string
  className?: string
}

/** Simulates a single line of text. */
export function SkeletonText({ width, className }: SkeletonTextProps) {
  return (
    <span
      className={cn('h-[14px] w-full rounded-[4px] bg-[#eef0f4] animate-pulse block', className)}
      style={width ? { width } : undefined}
    />
  )
}

export interface SkeletonTableRowProps {
  className?: string
}

/** Simulates one table row with four columns. */
export function SkeletonTableRow({ className }: SkeletonTableRowProps) {
  return (
    <div className={cn('flex items-center gap-4 px-4 py-3 border-b border-[#eef0f4]', className)}>
      <SkeletonText width="120px" />
      <SkeletonText width="40%" />
      <SkeletonText width="80px" />
      <SkeletonText width="60px" />
    </div>
  )
}

export interface SkeletonCardProps {
  className?: string
}

/** Simulates a content card with title and body text. */
export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div className={cn('bg-white border border-[#dde1e9] rounded-[8px] p-4 flex flex-col gap-3', className)}>
      <SkeletonText width="40%" />
      <SkeletonText />
      <SkeletonText />
      <SkeletonText width="30%" />
    </div>
  )
}
