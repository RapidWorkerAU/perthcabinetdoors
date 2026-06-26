'use client'

import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  IconX,
  IconArrowLeft,
  IconTrash,
  IconAlertTriangle,
  IconHelp,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

// ─────────────────────────────────────────────────────────────────────────────
// MODAL
// Two layout modes controlled by a single boolean: contentFit.
//
// contentFit = false (default) — FORM MODAL
//   Mobile:  fixed inset-0, full screen, body scrolls between sticky header/footer
//   Desktop: centred overlay, max-h-[90vh], body scrolls between sticky header/footer
//
// contentFit = true — CONFIRM MODAL
//   Mobile:  bottom sheet, anchored to bottom, height wraps content (no top-0)
//   Desktop: centred overlay, NO max-h, height wraps content
// ─────────────────────────────────────────────────────────────────────────────

export interface ModalProps {
  open:             boolean
  onClose:          () => void
  title:            string
  subtitle?:        string
  size?:            'sm' | 'md' | 'lg'
  hideCloseButton?: boolean
  contentFit?:      boolean
  footer?:          React.ReactNode
  children?:        React.ReactNode
  className?:       string
}

const SIZE_CLASS: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'md:max-w-[380px]',
  md: 'md:max-w-[480px]',
  lg: 'md:max-w-[560px]',
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  hideCloseButton = false,
  contentFit = false,
  footer,
  children,
  className,
}: ModalProps) {
  const hideHeader = !title && hideCloseButton

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <Dialog.Portal>

        {/* ── Overlay ───────────────────────────────────────────────────── */}
        <Dialog.Overlay className={cn(
          'fixed inset-0 z-40 bg-[rgba(15,22,31,0.3)]',
          'duration-200',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        )} />

        {/* ── Panel ─────────────────────────────────────────────────────── */}
        {/*
          FORM MODAL positioning:
            mobile  → fixed inset-0 (all four edges), full screen
            desktop → fixed centred, max-h-[90vh], flex col so body scrolls

          CONFIRM MODAL positioning:
            mobile  → fixed bottom-0 + inset-x-0 only, NO top-0, height wraps content
            desktop → fixed centred, NO max-h, height wraps content

          The key rule: never put flex-1 on the body when the panel has no
          fixed height to fill. On desktop contentFit panels, h-auto means
          the panel wraps content — flex-1 on the body would expand infinitely.
          flex-1 is ONLY used on the body when the panel has a constrained
          height (full-screen mobile or max-h desktop form modal).
        */}
        <Dialog.Content
          className={cn(
            'fixed z-50 w-full bg-white border border-[#dde1e9]',
            'duration-200',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',

            // FORM MODAL — mobile: full screen
            !contentFit && 'inset-0 rounded-none flex flex-col',
            !contentFit && 'md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
            !contentFit && 'md:rounded-[8px] md:max-h-[90vh] md:flex md:flex-col',

            // CONFIRM MODAL — mobile: bottom sheet, wraps content
            contentFit && 'inset-x-0 bottom-0 rounded-t-[16px] rounded-b-none',
            contentFit && 'md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
            contentFit && 'md:rounded-[8px]',

            SIZE_CLASS[size],
            className,
          )}
        >

          {/* ── Desktop header ──────────────────────────────────────────── */}
          {!hideHeader && (
            <div className="hidden md:flex items-start justify-between px-6 pt-5 pb-4 flex-shrink-0 border-b border-[#eef0f4]">
              <div>
                <Dialog.Title className="text-[16px] font-semibold text-[#1a2533] leading-snug">
                  {title}
                </Dialog.Title>
                {subtitle && (
                  <Dialog.Description className="text-[13px] text-[#6e7e92] mt-[3px]">
                    {subtitle}
                  </Dialog.Description>
                )}
              </div>
              {!hideCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="w-[28px] h-[28px] rounded-[6px] flex items-center justify-center text-[#9ba7b8] hover:bg-[#eef0f4] hover:text-[#3d4d5f] transition-colors flex-shrink-0 -mt-[2px]"
                >
                  <IconX size={15} />
                </button>
              )}
            </div>
          )}

          {/* ── Mobile header ───────────────────────────────────────────── */}
          {!hideHeader && (
            <div className="flex md:hidden items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0 border-b border-[#eef0f4]">
              <button
                type="button"
                onClick={onClose}
                aria-label="Go back"
                className="w-[28px] h-[28px] rounded-[6px] flex items-center justify-center text-[#9ba7b8] hover:bg-[#eef0f4] hover:text-[#3d4d5f] transition-colors flex-shrink-0"
              >
                <IconArrowLeft size={18} />
              </button>
              <span className="flex-1 text-center text-[15px] font-semibold text-[#1a2533] leading-snug">
                {title}
              </span>
              {/* Spacer keeps title centred */}
              <div className="w-[28px]" aria-hidden="true" />
            </div>
          )}

          {/* ── Body ────────────────────────────────────────────────────── */}
          {/*
            flex-1 + overflow-y-auto: used ONLY on form modals where the panel
            has a constrained height. This makes the body fill remaining space
            and scroll when content overflows.

            On contentFit (confirm) modals: no flex-1. The body just renders
            its content at natural height. The panel wraps around it.
          */}
          <div className={cn(
            'px-4 py-4 md:px-6 md:py-4',
            !contentFit && 'flex-1 overflow-y-auto flex flex-col gap-4',
            contentFit  && 'overflow-visible',
          )}>
            {children}
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          {footer && (
            <div className={cn(
              'flex-shrink-0 border-t border-[#eef0f4]',
              // Mobile footer: full-width stacked buttons, safe area bottom padding
              'px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)]',
              // Desktop footer: right-aligned row, standard padding
              'md:px-6 md:pt-4 md:pb-5',
            )}>
              <div className="flex flex-col gap-2 w-full md:flex-row md:justify-end md:w-auto md:gap-2">
                {footer}
              </div>
            </div>
          )}

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM MODAL
// Wraps Modal with contentFit=true. Renders as bottom sheet on mobile,
// compact centred dialog on desktop. Never stretches to fill vertical space.
// ─────────────────────────────────────────────────────────────────────────────

export interface ConfirmModalProps {
  open:           boolean
  onClose:        () => void
  title:          string
  description:    string
  confirmLabel?:  string
  cancelLabel?:   string
  variant?:       'danger' | 'warning' | 'default'
  onConfirm:      () => void
  loading?:       boolean
}

export function ConfirmModal({
  open,
  onClose,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  variant      = 'default',
  onConfirm,
  loading      = false,
}: ConfirmModalProps) {
  const circleClass =
    variant === 'danger'  ? 'bg-[#fee2e2]' :
    variant === 'warning' ? 'bg-[#fef3c7]' :
                            'bg-[#eef0f4]'

  const iconEl =
    variant === 'danger'  ? <IconTrash        size={20} className="text-[#ef4444]" /> :
    variant === 'warning' ? <IconAlertTriangle size={20} className="text-[#f59e0b]" /> :
                            <IconHelp          size={20} className="text-[#6e7e92]"  />

  const confirmVariant: 'danger' | 'primary' =
    variant === 'danger' ? 'danger' : 'primary'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title=""
      size="sm"
      hideCloseButton
      contentFit
      footer={
        <>
          <Button variant="neutral" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            loading={loading}
            loadingText={`${confirmLabel}...`}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {/* Drag handle — mobile only */}
      <div
        className="flex md:hidden mx-auto w-[36px] h-[4px] bg-[#dde1e9] rounded-full mb-2"
        aria-hidden="true"
      />

      {/* Icon + title + description — centred layout */}
      <div className="flex flex-col items-center text-center px-2 pb-2">
        <div className={cn(
          'w-[44px] h-[44px] rounded-full flex items-center justify-center mb-3',
          circleClass,
        )}>
          {iconEl}
        </div>
        <Dialog.Title className="text-[15px] font-semibold text-[#1a2533]">
          {title}
        </Dialog.Title>
        <p className="text-[14px] text-[#3d4d5f] leading-relaxed mt-2">
          {description}
        </p>
      </div>
    </Modal>
  )
}
