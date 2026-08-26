'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

// THE SECOND SIDEBAR, once.
//
// ── WHAT IT IS ───────────────────────────────────────────────────────────────
//
// A main nav item that covers several screens gets one of these rather than a
// row each in the main rail. Reporting has one per report; Option Libraries has
// one per library. The rail is a list of parts of the business, not a list of
// pages.
//
// ── WHY IT IS A COMPONENT AND NOT A PATTERN TO COPY ──────────────────────────
//
// The quote builder and the order page each carry their own version of this,
// written out inline, because each also holds a stack of actions particular to
// that document. Reporting's was written from scratch to match them by eye and
// came out 208 wide with the wrong border, a heavier header and coloured dots
// that exist nowhere else: close enough to look right alone and obviously wrong
// the moment you clicked between the two.
//
// So the third and fourth uses share this instead of becoming a fourth and
// fifth near miss. The measurements are the ones the order page uses, and
// test/second-sidebar.test.mjs holds all of them to it.

export interface SecondaryLink {
  href:  string
  label: string
  /** Listed and marked rather than hidden, so the shape of what is coming shows. */
  soon?: boolean
}

const ROW =
  'flex items-center px-3 py-[9px] rounded-[6px] w-full text-left text-[13px] font-medium transition-colors'
const ACTIVE = 'bg-[#edf4eb] text-[#1c2b1e]'
const IDLE = 'text-[#5a5a52] hover:bg-[#f5f8f4]'

export default function SecondarySidebar({
  eyebrow,
  items,
  backHref,
  backLabel,
  ariaLabel,
}: {
  eyebrow:   string
  items:     SecondaryLink[]
  backHref:  string
  backLabel: string
  ariaLabel: string
}) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const current = items.find(item => isActive(item.href))

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex flex-col w-[220px] h-full min-h-0 flex-shrink-0 border-r border-[#edf4eb] bg-white">
        <div className="px-4 py-4 border-b border-[#edf4eb]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8b8a81] mb-[2px]">{eyebrow}</p>
          <p className="text-[15px] font-semibold text-[#1a1a18] truncate">{current?.label || eyebrow}</p>
          <Link href={backHref} className="text-[12px] text-[#6b9e61] hover:underline mt-[2px] block">
            ← {backLabel}
          </Link>
        </div>

        <nav className="p-3 flex flex-col gap-[2px] overflow-y-auto flex-1" aria-label={ariaLabel}>
          {items.map(item =>
            item.soon ? (
              <span key={item.href} className={cn(ROW, 'text-[#b6b4aa] cursor-default')}>
                <span className="truncate">{item.label}</span>
                <span className="ml-auto pl-2 text-[10px]">soon</span>
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn(ROW, isActive(item.href) ? ACTIVE : IDLE)}
              >
                <span className="truncate">{item.label}</span>
              </Link>
            ),
          )}
        </nav>
      </aside>

      {/* Mobile: the same list across the top. The panel above is desktop only,
          and hiding it with nothing in its place would leave no way to reach a
          second screen on a phone. */}
      <div className="md:hidden border-b border-[#edf4eb] bg-white">
        <nav className="flex gap-2 overflow-x-auto px-4 py-3" aria-label={ariaLabel}>
          {items.filter(item => !item.soon).map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'whitespace-nowrap rounded-[6px] px-3 py-[7px] text-[13px] font-medium transition-colors',
                isActive(item.href) ? ACTIVE : IDLE,
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  )
}

/** The frame a grouped section sits in: sidebar beside content, stacked on a phone. */
export function SecondarySidebarFrame({
  sidebar,
  children,
}: {
  sidebar:  React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col md:flex-row min-h-full md:h-full md:min-h-0">
      {sidebar}
      <div className="min-w-0 flex-1 md:h-full md:min-h-0 md:overflow-y-auto">{children}</div>
    </div>
  )
}
