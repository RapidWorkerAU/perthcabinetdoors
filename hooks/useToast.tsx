'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Toast, type ToastVariant } from '@/components/ui/Toast'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ToastOptions {
  title:        string
  description?: string
  variant?:     ToastVariant
  duration?:    number
  action?:      { label: string; onClick: () => void }
}

interface ToastItem {
  id:           string
  title:        string
  description?: string
  variant:      ToastVariant
  duration:     number
  action?:      { label: string; onClick: () => void }
}

// ── Reducer ────────────────────────────────────────────────────────────────────

type Action =
  | { type: 'ADD';     payload: ToastItem }
  | { type: 'DISMISS'; payload: string }

function reducer(state: ToastItem[], action: Action): ToastItem[] {
  switch (action.type) {
    case 'ADD': {
      const next = [...state, action.payload]
      // Max 3 visible — drop the oldest when a 4th arrives
      return next.length > 3 ? next.slice(next.length - 3) : next
    }
    case 'DISMISS':
      return state.filter(t => t.id !== action.payload)
    default:
      return state
  }
}

// ── Context ────────────────────────────────────────────────────────────────────

const DispatchContext = React.createContext<React.Dispatch<Action> | null>(null)

// ── Provider ───────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, dispatch] = React.useReducer(reducer, [])
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  return (
    <DispatchContext.Provider value={dispatch}>
      {children}
      {mounted && createPortal(
        <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 items-end pointer-events-none">
          {toasts.map(t => (
            <Toast
              key={t.id}
              {...t}
              onDismiss={(id) => dispatch({ type: 'DISMISS', payload: id })}
            />
          ))}
        </div>,
        document.body,
      )}
    </DispatchContext.Provider>
  )
}

// ── useToast ───────────────────────────────────────────────────────────────────

export function useToast() {
  const dispatch = React.useContext(DispatchContext)
  if (!dispatch) throw new Error('useToast must be used inside <ToastProvider>')

  const toast = React.useCallback((options: ToastOptions) => {
    const variant  = options.variant ?? 'neutral'
    // Error toasts never auto-dismiss regardless of what is passed
    const duration = variant === 'error' ? 0 : (options.duration ?? 4000)

    dispatch({
      type: 'ADD',
      payload: {
        id:          Math.random().toString(36).slice(2, 9),
        title:       options.title,
        description: options.description,
        variant,
        duration,
        action:      options.action,
      },
    })
  }, [dispatch])

  return { toast }
}
