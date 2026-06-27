'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import {
  IconCircleCheck,
  IconAlertCircle,
  IconAlertTriangle,
  IconInfoCircle,
  IconBell,
  IconX,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral'

export interface ToastProps {
  id:           string
  title:        string
  description?: string
  variant?:     ToastVariant
  duration?:    number
  action?:      { label: string; onClick: () => void }
  onDismiss:    (id: string) => void
}

// ── Context ────────────────────────────────────────────────────────────────────

export interface ToastOptions {
  title:        string
  description?: string
  variant?:     ToastVariant
  duration?:    number
  action?:      { label: string; onClick: () => void }
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => void
}

const ToastContext = React.createContext<ToastContextValue>({ toast: () => {} })

export function useToast(): ToastContextValue {
  return React.useContext(ToastContext)
}

// ── Provider ───────────────────────────────────────────────────────────────────

interface ToastItem extends ToastOptions {
  id: string
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts,  setToasts]  = React.useState<ToastItem[]>([])
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => { setMounted(true) }, [])

  function toast(opts: ToastOptions) {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { ...opts, id }])
  }

  function dismiss(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {mounted && toasts.length > 0 && createPortal(
        <div className="fixed top-4 left-4 z-[9999] flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
            <Toast key={t.id} {...t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

// ── Style maps ─────────────────────────────────────────────────────────────────

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: 'bg-[#f0fdf5] border-[#bbf7d2] text-[#14532d]',
  error:   'bg-[#fef2f2] border-[#fecaca] text-[#7f1d1d]',
  warning: 'bg-[#fffbeb] border-[#fde68a] text-[#78350f]',
  info:    'bg-[#f0f8f7] border-[#b5dfdd] text-[#1c5f5d]',
  neutral: 'bg-white border-[#dde1e9] text-[#1a2533]',
}

const PROGRESS_COLOR: Record<ToastVariant, string> = {
  success: 'bg-[#16a34a]',
  error:   '',
  warning: 'bg-[#d97706]',
  info:    'bg-[#2d9692]',
  neutral: 'bg-[#9ba7b8]',
}

// ── Icon ───────────────────────────────────────────────────────────────────────

function ToastIcon({ variant }: { variant: ToastVariant }): React.ReactElement {
  const cls = 'mt-[1px] flex-shrink-0'
  if (variant === 'success') return <IconCircleCheck   size={18} className={cls} />
  if (variant === 'error')   return <IconAlertCircle   size={18} className={cls} />
  if (variant === 'warning') return <IconAlertTriangle size={18} className={cls} />
  if (variant === 'info')    return <IconInfoCircle    size={18} className={cls} />
  /* neutral */              return <IconBell          size={18} className={cn(cls, 'text-[#6e7e92]')} />
}

// ── Toast ──────────────────────────────────────────────────────────────────────

export function Toast({
  id,
  title,
  description,
  variant  = 'neutral',
  duration = 4000,
  action,
  onDismiss,
}: ToastProps) {
  const [dismissing, setDismissing] = React.useState(false)
  // Ref prevents double-dismiss if auto-timer and close button fire together
  const dismissed = React.useRef(false)

  function triggerDismiss() {
    if (dismissed.current) return
    dismissed.current = true
    setDismissing(true)
    setTimeout(() => onDismiss(id), 150)
  }

  // Inject the progress bar keyframe once into document.head
  React.useEffect(() => {
    if (!duration) return
    const KEY_ID = '__hses_toast_shrink'
    if (document.getElementById(KEY_ID)) return
    const el = document.createElement('style')
    el.id = KEY_ID
    el.textContent = '@keyframes toast-shrink{from{width:100%}to{width:0%}}'
    document.head.appendChild(el)
  }, [duration])

  // Auto-dismiss after duration ms (skipped when duration === 0)
  React.useEffect(() => {
    if (!duration) return
    const t = setTimeout(triggerDismiss, duration)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-[10px] px-[14px] py-[12px]',
        'rounded-[6px] border w-[360px] max-w-[calc(100vw-32px)]',
        'shadow-[0_2px_8px_rgba(0,0,0,0.08)] relative overflow-hidden',
        VARIANT_CLASS[variant],
        !dismissing && 'animate-in slide-in-from-right-4 fade-in-0 duration-200',
        dismissing  && 'animate-out slide-out-to-right-4 fade-out-0 duration-150',
      )}
    >
      {/* Icon */}
      <ToastIcon variant={variant} />

      {/* Body */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold leading-snug">{title}</p>
        {description && (
          <p className="text-[12px] mt-[2px] leading-relaxed opacity-85">{description}</p>
        )}
        {action && (
          <span
            role="button"
            tabIndex={0}
            onClick={action.onClick}
            onKeyDown={e => { if (e.key === 'Enter') action.onClick() }}
            className="text-[12px] font-semibold mt-[6px] cursor-pointer underline underline-offset-2 block"
          >
            {action.label}
          </span>
        )}
      </div>

      {/* Close button */}
      <button
        type="button"
        onClick={triggerDismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 w-[20px] h-[20px] flex items-center justify-center rounded-[4px] opacity-50 hover:opacity-100 hover:bg-black/5 transition-opacity cursor-pointer border-none bg-transparent"
      >
        <IconX size={13} />
      </button>

      {/* Progress bar — only when duration > 0 and variant has a colour */}
      {duration > 0 && PROGRESS_COLOR[variant] && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px]">
          <div
            className={cn('h-full', PROGRESS_COLOR[variant])}
            style={{
              animationName:           'toast-shrink',
              animationDuration:       `${duration}ms`,
              animationTimingFunction: 'linear',
              animationFillMode:       'forwards',
            }}
          />
        </div>
      )}
    </div>
  )
}
