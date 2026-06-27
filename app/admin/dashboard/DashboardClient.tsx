'use client'

import Link from 'next/link'
import {
  IconMail,
  IconFileText,
  IconClipboardList,
  IconPackage,
  IconPlus,
} from '@tabler/icons-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Stats {
  newEnquiries:    number
  quoteRequests:   number
  openQuotes:      number
  activeOrders:    number
  pendingPayments: number
  ordersOnHold:    number
}

type AttentionItem = { id: string; name: string; subtitle: string; age?: string }

interface Attention {
  enquiries:       AttentionItem[]
  quoteRequests:   AttentionItem[]
  awaitingQuotes:  AttentionItem[]
  pendingPayments: AttentionItem[]
}

interface DashboardProps {
  stats:     Stats
  attention: Attention
  todayLabel: string
}

// ─── Colour map ──────────────────────────────────────────────────────────────

const GROUP_COLOURS = {
  green: {
    wrap:    'bg-[#f5fff5] border border-[#a8c5a0] border-l-[3px] border-l-[#6b9e61]',
    header:  'border-b border-[#d4edda]',
    label:   'text-[#2d5e28]',
    linkCol: '#2d5e28',
    more:    'bg-[#f0fdf4] text-[#2d5e28]',
    emptyMsg:'No new enquiries',
  },
  amber: {
    wrap:    'bg-[#fffef0] border border-[#f0d060] border-l-[3px] border-l-[#f59e0b]',
    header:  'border-b border-[#fef3c7]',
    label:   'text-[#5c4200]',
    linkCol: '#5c4200',
    more:    'bg-[#fffbeb] text-[#5c4200]',
    emptyMsg:'No quote requests',
  },
  blue: {
    wrap:    'bg-[#f0f7ff] border border-[#93c5fd] border-l-[3px] border-l-[#3b82f6]',
    header:  'border-b border-[#dbeafe]',
    label:   'text-[#1e5fa8]',
    linkCol: '#1e5fa8',
    more:    'bg-[#eff6ff] text-[#1e5fa8]',
    emptyMsg:'No quotes awaiting response',
  },
  red: {
    wrap:    'bg-[#fef5f5] border border-[#fca5a5] border-l-[3px] border-l-[#ef4444]',
    header:  'border-b border-[#fee2e2]',
    label:   'text-[#991b1b]',
    linkCol: '#991b1b',
    more:    'bg-[#fef2f2] text-[#991b1b]',
    emptyMsg:'No pending payments — all clear ✓',
  },
} as const

// ─── AttentionGroup ──────────────────────────────────────────────────────────

function AttentionGroup({
  label, count, items, href, colour, maxItems = 3, alwaysShowAll = false,
}: {
  label:          string
  count:          number
  items:          AttentionItem[]
  href:           string
  colour:         keyof typeof GROUP_COLOURS
  maxItems?:      number
  alwaysShowAll?: boolean
}) {
  const c        = GROUP_COLOURS[colour]
  const shown    = alwaysShowAll ? items : items.slice(0, maxItems)
  const overflow = alwaysShowAll ? 0 : Math.max(0, items.length - maxItems)

  return (
    <div className={`rounded-[5px] overflow-hidden ${c.wrap}`}>
      {/* Group header */}
      <div className={`flex items-center justify-between px-[10px] py-[6px] ${c.header}`}>
        <span className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${c.label}`}>
          {label} · {count}
        </span>
        {count > 0 && (
          <Link href={href} className="text-[11px] font-medium hover:underline" style={{ color: c.linkCol }}>
            View all →
          </Link>
        )}
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <p className="px-[10px] py-[9px] text-[11px] italic opacity-60 text-[#5a5a52]">
          {c.emptyMsg}
        </p>
      ) : (
        <>
          {shown.map(item => (
            <Link
              key={item.id}
              href={href}
              className="flex items-center justify-between px-[10px] py-[8px] border-b border-black/5 last:border-b-0 hover:brightness-[0.97] transition-all"
            >
              <div className="min-w-0 mr-3">
                <p className="text-[12px] font-medium text-[#1a1a18] truncate">{item.name}</p>
                <p className="text-[11px] text-[#8b8a81] mt-[1px] truncate">{item.subtitle}</p>
              </div>
              <div className="flex items-center gap-[5px] flex-shrink-0">
                {item.age && <span className="text-[10px] text-[#c5cdd8]">{item.age}</span>}
                <span className="text-[13px] text-[#c5cdd8]">›</span>
              </div>
            </Link>
          ))}
          {overflow > 0 && (
            <Link
              href={href}
              className={`flex items-center justify-between px-[10px] py-[6px] text-[11px] font-medium border-t border-black/[0.06] ${c.more}`}
            >
              <span>+ {overflow} more</span>
              <span>View all →</span>
            </Link>
          )}
        </>
      )}
    </div>
  )
}

// ─── NeedsAttentionPanel ─────────────────────────────────────────────────────

function NeedsAttentionPanel({ attention }: { attention: Attention }) {
  const total =
    attention.enquiries.length +
    attention.quoteRequests.length +
    attention.awaitingQuotes.length +
    attention.pendingPayments.length

  return (
    <div className="bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#edf4eb]">
        <span className="text-[13px] font-semibold text-[#1a1a18]">Needs attention</span>
        <span className="text-[10px] font-semibold bg-[#1c2b1e] text-white px-[6px] py-[1px] rounded-full">
          {total}
        </span>
      </div>
      <div className="p-[10px] flex flex-col gap-2">
        <AttentionGroup
          label="New enquiries"
          count={attention.enquiries.length}
          items={attention.enquiries}
          href="/admin/enquiries"
          colour="green"
          maxItems={2}
        />
        <AttentionGroup
          label="Quote requests"
          count={attention.quoteRequests.length}
          items={attention.quoteRequests}
          href="/admin/quote-requests"
          colour="amber"
          maxItems={2}
        />
        <AttentionGroup
          label="Quotes awaiting response"
          count={attention.awaitingQuotes.length}
          items={attention.awaitingQuotes}
          href="/admin/quotes"
          colour="blue"
          maxItems={2}
        />
        <AttentionGroup
          label="Payments pending"
          count={attention.pendingPayments.length}
          items={attention.pendingPayments}
          href="/admin/orders"
          colour="red"
          maxItems={2}
        />
      </div>
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

export default function DashboardClient({ stats, attention, todayLabel }: DashboardProps) {
  return (
    <div className="p-5 max-w-[1400px]">

      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1a18]">Dashboard</h1>
          <p className="text-[12px] text-[#8b8a81] mt-[2px]">{todayLabel}</p>
        </div>
      </div>

      {/* Stat strip — 5 cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {([
          { label: 'New enquiries',    value: stats.newEnquiries,    href: '/admin/enquiries',       alert: stats.newEnquiries > 0,    danger: false },
          { label: 'Quote requests',   value: stats.quoteRequests,   href: '/admin/quote-requests',  alert: stats.quoteRequests > 0,   danger: false },
          { label: 'Open quotes',      value: stats.openQuotes,      href: '/admin/quotes',          alert: false,                     danger: false },
          { label: 'Active orders',    value: stats.activeOrders,    href: '/admin/orders',          alert: false,                     danger: false },
          { label: 'Pending payments', value: stats.pendingPayments, href: '/admin/orders',          alert: false,                     danger: stats.pendingPayments > 0 },
        ] as const).map(stat => (
          <Link
            key={stat.label}
            href={stat.href}
            className={`block bg-white border rounded-[8px] p-3 hover:border-[#6b9e61] transition-colors ${
              stat.danger ? 'border-[#fca5a5] bg-[#fef5f5]' :
              stat.alert  ? 'border-[#a8c5a0] bg-[#f5fff5]' :
                            'border-[#dbd8cc]'
            }`}
          >
            <div className={`text-[22px] font-medium font-mono leading-none ${
              stat.danger      ? 'text-[#991b1b]' :
              stat.alert       ? 'text-[#1c2b1e]' :
              stat.value === 0 ? 'text-[#8b8a81]' :
                                 'text-[#1a1a18]'
            }`}>
              {stat.value}
            </div>
            <div className="text-[11px] text-[#8b8a81] mt-[4px]">{stat.label}</div>
            <div className={`text-[10px] font-medium mt-[5px] ${stat.danger ? 'text-[#991b1b]' : 'text-[#6b9e61]'}`}>
              View →
            </div>
          </Link>
        ))}
      </div>

      {/* Body — needs attention left, quick actions + summary right */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4 items-start">

        {/* Left — needs attention */}
        <NeedsAttentionPanel attention={attention} />

        {/* Right — quick actions + summary (unchanged) */}
        <div className="flex flex-col gap-4">

          {/* Quick actions */}
          <div className="bg-white border border-[#dbd8cc] rounded-[10px] p-4">
            <h2 className="text-[13px] font-semibold text-[#1a1a18] mb-3">Quick actions</h2>
            <div className="flex flex-col gap-2">
              <Link
                href="/admin/quotes/new"
                className="flex items-center gap-2.5 h-[38px] px-3 bg-[#1c2b1e] !text-white text-[13px] font-medium rounded-[8px] hover:bg-[#2d3f2f] transition-colors"
              >
                <IconPlus size={15} className="flex-shrink-0" />
                New quote
              </Link>
              <Link
                href="/admin/enquiries"
                className="flex items-center gap-2.5 h-[38px] px-3 bg-[#f5f8f4] border border-[#dbd8cc] text-[#1a1a18] text-[13px] font-medium rounded-[8px] hover:bg-[#edf4eb] transition-colors"
              >
                <IconMail size={15} className="flex-shrink-0 text-[#6b9e61]" />
                View enquiries
                {stats.newEnquiries > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 bg-[#2d5e28] text-white text-[10px] font-bold rounded-full">
                    {stats.newEnquiries}
                  </span>
                )}
              </Link>
              <Link
                href="/admin/quote-requests"
                className="flex items-center gap-2.5 h-[38px] px-3 bg-[#f5f8f4] border border-[#dbd8cc] text-[#1a1a18] text-[13px] font-medium rounded-[8px] hover:bg-[#edf4eb] transition-colors"
              >
                <IconClipboardList size={15} className="flex-shrink-0 text-[#6b9e61]" />
                Quote requests
                {stats.quoteRequests > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 bg-[#2d5e28] text-white text-[10px] font-bold rounded-full">
                    {stats.quoteRequests}
                  </span>
                )}
              </Link>
              <Link
                href="/admin/orders"
                className="flex items-center gap-2.5 h-[38px] px-3 bg-[#f5f8f4] border border-[#dbd8cc] text-[#1a1a18] text-[13px] font-medium rounded-[8px] hover:bg-[#edf4eb] transition-colors"
              >
                <IconPackage size={15} className="flex-shrink-0 text-[#6b9e61]" />
                Orders
                {stats.ordersOnHold > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 bg-[#dcbf55] text-[#5c4200] text-[10px] font-bold rounded-full">
                    {stats.ordersOnHold} on hold
                  </span>
                )}
              </Link>
              <Link
                href="/admin/customers"
                className="flex items-center gap-2.5 h-[38px] px-3 bg-[#f5f8f4] border border-[#dbd8cc] text-[#1a1a18] text-[13px] font-medium rounded-[8px] hover:bg-[#edf4eb] transition-colors"
              >
                <IconFileText size={15} className="flex-shrink-0 text-[#6b9e61]" />
                Customers
              </Link>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-[#f5f8f4] border border-[#dbd8cc] rounded-[10px] p-4">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8b8a81] mb-3">Summary</h2>
            <div className="flex flex-col gap-0">
              {([
                { label: 'New enquiries',    value: stats.newEnquiries,    href: '/admin/enquiries'      },
                { label: 'Open quotes',      value: stats.openQuotes,      href: '/admin/quotes'          },
                { label: 'Quote requests',   value: stats.quoteRequests,   href: '/admin/quote-requests' },
                { label: 'Active orders',    value: stats.activeOrders,    href: '/admin/orders'          },
                { label: 'Orders on hold',   value: stats.ordersOnHold,    href: '/admin/orders'          },
                { label: 'Pending payments', value: stats.pendingPayments, href: '/admin/orders'          },
              ] as const).map(({ label, value, href }) => (
                <Link
                  key={label}
                  href={href}
                  className="flex items-center justify-between py-[9px] border-b border-[#edf4eb] last:border-b-0 hover:opacity-70 transition-opacity"
                >
                  <span className="text-[12px] text-[#5a5a52]">{label}</span>
                  <span className="text-[13px] font-semibold text-[#1a1a18]">{value}</span>
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
