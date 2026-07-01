'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  IconLayoutDashboard, IconUsers, IconMail, IconFileText,
  IconFileInvoice, IconPackage, IconBox, IconPalette,
  IconSettings, IconLogout, IconChevronsLeft, IconChevronsRight,
  IconBell, IconDots, IconX, IconRulerMeasure,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { ToastProvider } from '@/components/ui/Toast'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string
  href:  string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon:  React.ComponentType<any>
}

// ── PCD colour constants (sidebar uses dark green bg) ─────────────────────────

const SIDEBAR_BG     = '#1c2b1e'
const ACCENT         = '#6b9e61'
const ACTIVE_BG      = 'rgba(255,255,255,0.15)'
const HOVER_CLASS    = 'hover:bg-white/[0.08]'
const TEXT_FULL      = 'rgba(255,255,255,1)'
const TEXT_MUTED     = 'rgba(255,255,255,0.55)'
const TEXT_SUBTLE    = 'rgba(255,255,255,0.40)'
const SIDEBAR_BORDER = 'rgba(255,255,255,0.10)'
const PAGE_BG        = '#faf9f6'
const BORDER         = '#dbd8cc'
const BORDER_LIGHT   = '#edf4eb'

// ── Nav data ──────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',      href: '/admin/dashboard',      icon: IconLayoutDashboard },
  { label: 'Customers',      href: '/admin/customers',      icon: IconUsers           },
  { label: 'Enquiries',      href: '/admin/enquiries',      icon: IconMail            },
  { label: 'Quote Requests', href: '/admin/quote-requests', icon: IconFileText        },
  { label: 'Quotes',         href: '/admin/quotes',         icon: IconFileInvoice     },
  { label: 'Orders',         href: '/admin/orders',         icon: IconPackage         },
  { label: 'Design Tool',    href: '/admin/design',         icon: IconRulerMeasure    },
  { label: 'Products',       href: '/admin/products',       icon: IconBox             },
  { label: 'Options',        href: '/admin/options',        icon: IconPalette         },
  { label: 'Settings',       href: '/admin/settings',       icon: IconSettings        },
]

const BOTTOM_PRIMARY: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: IconLayoutDashboard },
  { label: 'Customers', href: '/admin/customers', icon: IconUsers           },
  { label: 'Quotes',    href: '/admin/quotes',    icon: IconFileInvoice     },
  { label: 'Orders',    href: '/admin/orders',    icon: IconPackage         },
]

const BOTTOM_MORE: NavItem[] = [
  { label: 'Enquiries',      href: '/admin/enquiries',      icon: IconMail        },
  { label: 'Quote Requests', href: '/admin/quote-requests', icon: IconFileText    },
  { label: 'Design Tool',    href: '/admin/design',         icon: IconRulerMeasure},
  { label: 'Products',       href: '/admin/products',       icon: IconBox         },
  { label: 'Options',        href: '/admin/options',        icon: IconPalette     },
  { label: 'Settings',       href: '/admin/settings',       icon: IconSettings    },
]

// ── Page title lookup ─────────────────────────────────────────────────────────

const PAGE_TITLES: Record<string, string> = {
  '/admin/dashboard':      'Dashboard',
  '/admin/customers':      'Customers',
  '/admin/enquiries':      'Enquiries',
  '/admin/quote-requests': 'Quote Requests',
  '/admin/quotes':         'Quotes',
  '/admin/orders':         'Orders',
  '/admin/products':       'Products',
  '/admin/options':        'Colour Library',
  '/admin/settings':       'Settings',
  '/admin/design':         'Design Tool',
  '/admin/projects':       'Projects',
}

function getPageTitle(pathname: string): string {
  if (pathname.startsWith('/admin/quotes/'))                                       return 'Quote Builder'
  if (pathname.includes('/admin/products/') && pathname.endsWith('/edit'))         return 'Edit Product'
  if (pathname.includes('/admin/products/') && pathname.endsWith('/quote'))        return 'Quote Config'
  if (pathname === '/admin/products/new')                                          return 'New Product'
  const match = Object.keys(PAGE_TITLES)
    .filter(k => pathname === k || pathname.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0]
  return match ? PAGE_TITLES[match] : 'Admin'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin/dashboard') return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

// ── PcdNotificationsPanel ─────────────────────────────────────────────────────

function PcdNotificationsPanel({ notifications }: { notifications: Record<string, number> }) {
  const [open, setOpen] = React.useState(false)
  const panelRef = React.useRef<HTMLDivElement>(null)

  const totalCount  = Object.values(notifications).reduce((s, n) => s + n, 0)
  const notifItems  = NAV_ITEMS.filter(item => (notifications[item.href] ?? 0) > 0)

  React.useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen(prev => !prev)}
        className="relative w-[32px] h-[32px] rounded-[6px] flex items-center justify-center text-[#6e7e92] hover:bg-[#eef0f4] transition-colors"
      >
        <IconBell size={17} />
        {totalCount > 0 && (
          <span className="absolute -top-[2px] -right-[2px] min-w-[16px] h-[16px] rounded-full bg-[#6b9e61] text-white text-[10px] font-semibold flex items-center justify-center px-[3px]">
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-[300px] bg-white rounded-[8px] shadow-[0_4px_24px_rgba(0,0,0,0.1)] z-[60] overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${BORDER_LIGHT}` }}>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-[#1a1a18]">Notifications</span>
              {totalCount > 0 && (
                <span className="text-[11px] font-medium px-2 py-[1px] rounded-full" style={{ backgroundColor: BORDER_LIGHT, color: '#2d5e28' }}>
                  {totalCount} new
                </span>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="text-[#9ba7b8] hover:text-[#3d4d5f] transition-colors">
              <IconX size={14} />
            </button>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {notifItems.length === 0 ? (
              <div className="py-10 text-center">
                <IconBell size={28} className="mx-auto mb-2" style={{ color: BORDER_LIGHT }} />
                <p className="text-[13px] text-[#9ba7b8]">No new notifications</p>
              </div>
            ) : (
              notifItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between px-4 py-3 transition-colors"
                  style={{ borderBottom: `1px solid ${BORDER_LIGHT}`, backgroundColor: `${BORDER_LIGHT}80` }}
                >
                  <span className="text-[13px] font-medium text-[#1a1a18]">{item.label}</span>
                  <span className="min-w-[20px] h-[20px] rounded-full text-white text-[11px] font-semibold flex items-center justify-center px-[5px]" style={{ backgroundColor: ACCENT }}>
                    {notifications[item.href]}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── SidebarNavLink ────────────────────────────────────────────────────────────

function SidebarNavLink({
  item, active, collapsed, count,
}: {
  item:      NavItem
  active:    boolean
  collapsed: boolean
  count:     number
}) {
  if (collapsed) {
    return (
      <div className="group/navitem relative">
        <Link
          href={item.href}
          className={cn(
            'mx-2 flex justify-center py-[8px] rounded-[6px] transition-colors duration-100 relative',
            !active && HOVER_CLASS,
          )}
          style={active ? { backgroundColor: ACTIVE_BG } : {}}
        >
          <item.icon size={17} style={{ color: active ? TEXT_FULL : TEXT_MUTED }} />
          {count > 0 && (
            <span className="absolute top-[4px] right-[4px] w-[7px] h-[7px] rounded-full" style={{ backgroundColor: ACCENT }} />
          )}
        </Link>
        <span className="hidden group-hover/navitem:block absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 bg-[#0f1a10] border border-white/15 text-white text-[12px] font-medium px-2 py-1 rounded-[4px] whitespace-nowrap z-[100] pointer-events-none">
          {item.label}
          {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
        </span>
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      className={cn(
        'mx-2 flex items-center gap-[9px] px-2 py-[8px] rounded-[6px]',
        'transition-colors duration-100 overflow-hidden whitespace-nowrap',
        !active && HOVER_CLASS,
      )}
      style={active ? { backgroundColor: ACTIVE_BG } : {}}
    >
      <item.icon size={17} className="flex-shrink-0 w-[20px]" style={{ color: active ? TEXT_FULL : TEXT_MUTED }} />
      <span className="flex-1 text-[13px] font-medium" style={{ color: active ? TEXT_FULL : TEXT_MUTED }}>
        {item.label}
      </span>
      {count > 0 && (
        <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-semibold flex items-center justify-center px-[4px]" style={{ backgroundColor: ACCENT }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}

// ── PcdSidebar ────────────────────────────────────────────────────────────────

function PcdSidebar({
  collapsed, onToggle, pathname, notifications, onLogout,
}: {
  collapsed:     boolean
  onToggle:      () => void
  pathname:      string
  notifications: Record<string, number>
  onLogout:      () => void
}) {
  return (
    <div
      className={cn(
        'flex flex-col h-full transition-all duration-200 ease-in-out flex-shrink-0',
        collapsed ? 'w-[56px]' : 'w-[220px]',
      )}
      style={{ backgroundColor: SIDEBAR_BG }}
    >
      {/* Header / brand */}
      {collapsed ? (
        <div className="flex justify-center py-[13px] flex-shrink-0" style={{ borderBottom: `1px solid ${SIDEBAR_BORDER}` }}>
          <img src="/images/sidebar-logo.png" alt="PCD" className="w-[30px] h-[30px] rounded-[6px] object-contain" />
        </div>
      ) : (
        <div className="flex items-center gap-[10px] px-[14px] py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${SIDEBAR_BORDER}` }}>
          <img src="/images/sidebar-logo.png" alt="" className="w-[30px] h-[30px] rounded-[6px] object-contain flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold truncate" style={{ color: TEXT_FULL }}>Perth Cabinet Doors</p>
            <p className="text-[11px] truncate" style={{ color: TEXT_SUBTLE }}>Admin</p>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map(item => (
          <SidebarNavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            collapsed={collapsed}
            count={notifications[item.href] ?? 0}
          />
        ))}
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 py-2" style={{ borderTop: `1px solid ${SIDEBAR_BORDER}` }}>
        {collapsed ? (
          <div className="group/navitem relative">
            <button
              type="button"
              onClick={onLogout}
              className={cn('mx-2 flex justify-center py-[8px] rounded-[6px] transition-colors duration-100 w-[calc(100%-16px)]', HOVER_CLASS)}
            >
              <IconLogout size={17} style={{ color: TEXT_SUBTLE }} />
            </button>
            <span className="hidden group-hover/navitem:block absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 bg-[#0f1a10] border border-white/15 text-white text-[12px] font-medium px-2 py-1 rounded-[4px] whitespace-nowrap z-[100] pointer-events-none">
              Log out
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onLogout}
            className={cn('mx-2 flex items-center gap-[9px] px-2 py-[8px] rounded-[6px] transition-colors duration-100 overflow-hidden whitespace-nowrap', HOVER_CLASS)}
          >
            <IconLogout size={17} className="flex-shrink-0 w-[20px]" style={{ color: TEXT_SUBTLE }} />
            <span className="text-[13px] font-medium" style={{ color: TEXT_SUBTLE }}>Log out</span>
          </button>
        )}

        {/* Collapse toggle */}
        <div className={cn('flex pt-1 pb-1', collapsed ? 'justify-center' : 'justify-end px-3')}>
          <button
            type="button"
            onClick={onToggle}
            className={cn('w-[24px] h-[24px] rounded-[4px] flex items-center justify-center transition-colors', HOVER_CLASS)}
            style={{ color: TEXT_SUBTLE }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <IconChevronsRight size={14} /> : <IconChevronsLeft size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PcdTopbar ─────────────────────────────────────────────────────────────────

function PcdTopbar({
  pathname, userEmail, notifications,
}: {
  pathname:      string
  userEmail:     string
  notifications: Record<string, number>
}) {
  const pageTitle = getPageTitle(pathname)

  return (
    <div
      className="h-[52px] flex items-center justify-between px-5 flex-shrink-0 bg-white"
      style={{ borderBottom: `1px solid ${BORDER}` }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-[13px]">
        <span className="text-[#9ba7b8]">PCD</span>
        <span className="mx-1 text-[#c5cdd8]">/</span>
        <span className="text-[#1a1a18] font-medium">{pageTitle}</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1">
        <PcdNotificationsPanel notifications={notifications} />
        <Link
          href="/admin/settings"
          aria-label="Account settings"
          className="ml-1 rounded-full hover:opacity-80 transition-opacity"
        >
          <Avatar name={userEmail || 'Admin'} size="sm" className="w-[28px] h-[28px]" />
        </Link>
      </div>
    </div>
  )
}

// ── PcdBottomNav ──────────────────────────────────────────────────────────────

function PcdBottomNav({
  pathname, notifications, onLogout,
}: {
  pathname:      string
  notifications: Record<string, number>
  onLogout:      () => void
}) {
  const [moreOpen, setMoreOpen] = React.useState(false)
  const moreActive = BOTTOM_MORE.some(item => isActive(pathname, item.href))

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 h-[56px] bg-white flex items-center z-30 md:hidden"
        style={{ borderTop: `1px solid ${BORDER}` }}
      >
        {BOTTOM_PRIMARY.map(item => {
          const active = isActive(pathname, item.href)
          const count  = notifications[item.href] ?? 0
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 h-full flex flex-col items-center justify-center gap-[3px]"
            >
              <div className="relative">
                <item.icon size={20} style={{ color: active ? ACCENT : '#9ba7b8' }} />
                {count > 0 && (
                  <span className="absolute -top-[2px] -right-[2px] w-[7px] h-[7px] rounded-full border-[1.5px] border-white" style={{ backgroundColor: ACCENT }} />
                )}
              </div>
              <span
                className={cn('text-[10px]', active ? 'font-semibold' : 'font-medium text-[#9ba7b8]')}
                style={active ? { color: ACCENT } : {}}
              >
                {item.label}
              </span>
            </Link>
          )
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex-1 h-full flex flex-col items-center justify-center gap-[3px]"
        >
          <IconDots size={20} style={{ color: moreActive ? ACCENT : '#9ba7b8' }} />
          <span
            className={cn('text-[10px]', moreActive ? 'font-semibold' : 'font-medium text-[#9ba7b8]')}
            style={moreActive ? { color: ACCENT } : {}}
          >
            More
          </span>
        </button>
      </nav>

      {/* More sheet */}
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="" hideCloseButton contentFit>
        <div className="pb-2">
          <div className="flex md:hidden mx-auto w-[36px] h-[4px] rounded-full mb-3" style={{ backgroundColor: BORDER }} aria-hidden="true" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9ba7b8] mb-2 px-1">More</p>
          {BOTTOM_MORE.map(item => {
            const active = isActive(pathname, item.href)
            const count  = notifications[item.href] ?? 0
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn('flex items-center justify-between py-[11px] px-1 text-[14px]')}
                style={{ borderBottom: `1px solid ${BORDER_LIGHT}`, color: active ? ACCENT : '#1a1a18', fontWeight: active ? 500 : 400 }}
              >
                <div className="flex items-center gap-3">
                  <item.icon size={18} style={{ color: active ? ACCENT : '#6e7e92' }} />
                  {item.label}
                </div>
                {count > 0 && (
                  <span className="min-w-[20px] h-[20px] rounded-full text-white text-[11px] font-semibold flex items-center justify-center px-[5px]" style={{ backgroundColor: ACCENT }}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => { setMoreOpen(false); onLogout() }}
            className="flex w-full items-center gap-3 py-[11px] px-1 text-[14px] text-[#6e7e92]"
          >
            <IconLogout size={18} />
            Log out
          </button>
        </div>
      </Modal>
    </>
  )
}

// ── AdminShell ────────────────────────────────────────────────────────────────

const SIDEBAR_KEY = 'pcd_admin_sidebar_collapsed'

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()

  const [mounted,       setMounted]       = React.useState(false)
  const [collapsed,     setCollapsed]     = React.useState(false)
  const [userEmail,     setUserEmail]     = React.useState('')
  const [notifications, setNotifications] = React.useState<Record<string, number>>({})
  const [logoutOpen,    setLogoutOpen]    = React.useState(false)
  const [logoutLoading, setLogoutLoading] = React.useState(false)

  // Hydration guard — read localStorage only after mount to avoid SSR mismatch
  React.useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem(SIDEBAR_KEY)
    if (stored !== null) setCollapsed(stored === 'true')
  }, [])

  // Persist sidebar collapse preference
  React.useEffect(() => {
    if (!mounted) return
    localStorage.setItem(SIDEBAR_KEY, String(collapsed))
  }, [collapsed, mounted])

  // Auth — fetch user email for avatar
  React.useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data?.user?.email ?? '')
    })
  }, [])

  // Notifications — poll /api/admin/notifications on load, focus, and 30s interval
  React.useEffect(() => {
    let cancelled = false

    async function loadNotifications() {
      try {
        const res     = await fetch('/api/admin/notifications', { cache: 'no-store' })
        const payload = await res.json()
        if (!cancelled && res.ok && payload.ok) {
          setNotifications(payload.notifications ?? {})
        }
      } catch {
        if (!cancelled) setNotifications({})
      }
    }

    loadNotifications()
    window.addEventListener('focus', loadNotifications)
    const intervalId = window.setInterval(loadNotifications, 30000)

    return () => {
      cancelled = true
      window.removeEventListener('focus', loadNotifications)
      window.clearInterval(intervalId)
    }
  }, [pathname])

  async function handleLogout() {
    setLogoutLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.signOut()
      router.push('/admin')
      router.refresh()
    } finally {
      setLogoutLoading(false)
    }
  }

  // Avoid layout shift during hydration
  if (!mounted) return null

  return (
    <ToastProvider>
    <>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: PAGE_BG }}>
        {/* Sidebar — desktop only */}
        <div className="hidden md:flex flex-shrink-0">
          <PcdSidebar
            collapsed={collapsed}
            onToggle={() => setCollapsed(prev => !prev)}
            pathname={pathname}
            notifications={notifications}
            onLogout={() => setLogoutOpen(true)}
          />
        </div>

        {/* Main column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <PcdTopbar
            pathname={pathname}
            userEmail={userEmail}
            notifications={notifications}
          />
          <main className="flex-1 overflow-y-auto pb-[56px] md:pb-0">
            {children}
          </main>
        </div>
      </div>

      {/* Bottom nav — mobile only (fixed, outside scroll container) */}
      <PcdBottomNav
        pathname={pathname}
        notifications={notifications}
        onLogout={() => setLogoutOpen(true)}
      />

      <ConfirmModal
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Log out?"
        description="You'll be returned to the login page."
        variant="default"
        confirmLabel="Log out"
        cancelLabel="Stay logged in"
        onConfirm={handleLogout}
        loading={logoutLoading}
      />
    </>
    </ToastProvider>
  )
}
