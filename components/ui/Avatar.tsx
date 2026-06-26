'use client'

import * as React from 'react'
import { IconUser } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export interface AvatarProps {
  /** Image URL. Falls back to initials or icon on load error. */
  src?: string
  /** Full name — used to derive initials (first + last initial). */
  name?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZE_CLASS: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-[12px]',
  lg: 'w-10 h-10 text-[13px]',
  xl: 'w-12 h-12 text-[15px]',
}

const ICON_SIZE: Record<NonNullable<AvatarProps['size']>, number> = {
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** User avatar. Shows image if provided, falls back to initials, then to a generic icon. */
export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const [imgError, setImgError] = React.useState(false)

  React.useEffect(() => { setImgError(false) }, [src])

  const showImage    = Boolean(src) && !imgError
  const showInitials = !showImage && Boolean(name)

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden font-medium',
        SIZE_CLASS[size],
        showImage    ? '' :
        showInitials ? 'bg-[#daefee] text-[#1c5f5d]' :
                       'bg-[#eef0f4] text-[#9ba7b8]',
        className,
      )}
    >
      {showImage && (
        <img
          src={src}
          alt={name ?? 'Avatar'}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      )}
      {showInitials && (
        <span aria-hidden="true">{getInitials(name!)}</span>
      )}
      {!showImage && !showInitials && (
        <IconUser size={ICON_SIZE[size]} />
      )}
    </div>
  )
}
