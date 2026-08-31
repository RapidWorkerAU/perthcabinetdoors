'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  IconMail,
  IconFileText,
  IconClipboardList,
  IconPackage,
  IconPlus,
} from '@tabler/icons-react'
import DetailToggle from './_components/DetailToggle'
import type { Detail } from './_components/detail'
import WebsitePanels, { ProducedPanel, type SiteStats } from './_components/WebsitePanels'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Stats {
  newEnquiries:    number
  quoteRequests:   number
  openQuotes:      number
  activeOrders:    number
  pendingPayments: number
  ordersOnHold:    number
}

interface DashboardProps {
  stats:         Stats
  site:          SiteStats
  todayLabel:    string
  initialDetail: Detail
}

// ─── The stat strip ──────────────────────────────────────────────────────────
//
// Five tiles, and two of them are now about the website. Visits and median stay
// only exist once the page tracking has collected something, and until it has
// they say so rather than showing a confident nought: a zero is a claim that
// nobody visited, and that is a different thing from not having looked.

const secs = (ms: number | null) => {
  if (!ms || ms <= 0) return '—'
  const total = Math.round(ms / 1000)
  return total >= 60 ? `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s` : `${total}s`
}

interface Tile {
  label:   string
  value:   string
  href:    string
  sub?:    string
  change?: number | null
  tone?:   'alert' | 'danger'
  waiting?: boolean
}

function StatTile({ tile }: { tile: Tile }) {
  if (tile.waiting) {
    return (
      <div className="block rounded-[8px] border border-dashed border-[#dbd8cc] bg-[#fbfbf9] p-3">
        <div className="font-mono text-[22px] font-medium leading-none text-[#c5c4ba]">&mdash;</div>
        <div className="mt-[4px] text-[11px] text-[#8b8a81]">{tile.label}</div>
        <div className="mt-[5px] text-[10px] font-medium text-[#8b8a81]">Not collected yet</div>
      </div>
    )
  }

  const change = tile.change
  const changeTone = change === null || change === undefined ? '' : change > 0 ? 'text-[#2d5e28]' : change < 0 ? 'text-[#a32b21]' : 'text-[#8b8a81]'

  return (
    <Link
      href={tile.href}
      className={`block rounded-[8px] border p-3 transition-colors hover:border-[#6b9e61] ${
        tile.tone === 'danger' ? 'border-[#fca5a5] bg-[#fef5f5]' :
        tile.tone === 'alert'  ? 'border-[#a8c5a0] bg-[#f5fff5]' :
                                 'border-[#dbd8cc] bg-white'
      }`}
    >
      <div className={`font-mono text-[22px] font-medium leading-none ${
        tile.tone === 'danger' ? 'text-[#991b1b]' :
        tile.tone === 'alert'  ? 'text-[#1c2b1e]' :
                                 'text-[#1a1a18]'
      }`}>
        {tile.value}
      </div>
      <div className="mt-[4px] text-[11px] text-[#8b8a81]">{tile.label}</div>
      {change !== null && change !== undefined ? (
        <div className={`mt-[5px] text-[10px] font-semibold ${changeTone}`}>
          {change > 0 ? '▲ ' : change < 0 ? '▼ ' : ''}{Math.abs(change)}% on last period
        </div>
      ) : (
        <div className={`mt-[5px] text-[10px] font-medium ${tile.tone === 'danger' ? 'text-[#991b1b]' : 'text-[#6b9e61]'}`}>
          {tile.sub || 'View →'}
        </div>
      )}
    </Link>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

export default function DashboardClient({ stats, site, todayLabel, initialDetail }: DashboardProps) {
  // Seeded from the cookie the server already read, so this never disagrees
  // with what was painted. Changing it is instant, because every panel's data
  // came down with the page; the cookie is written so the next visit starts
  // here. See _components/DetailToggle.tsx.
  const [detail, setDetail] = useState<Detail>(initialDetail)

  const tiles: Tile[] = [
    {
      label: 'Visits this month',
      value: site.collecting ? site.traffic.totals.visits.toLocaleString('en-AU') : '—',
      href: '/admin/dashboard',
      change: site.traffic.change.visits,
      waiting: !site.collecting,
    },
    {
      label: 'Median time on site',
      value: secs(site.traffic.totals.medianDwellMs),
      href: '/admin/dashboard',
      change: site.traffic.change.medianDwellMs,
      waiting: !site.collecting,
    },
    {
      label: 'Design tool started',
      value: site.activity.totals.designStarted.toLocaleString('en-AU'),
      href: '/admin/design',
      change: site.activity.change.designStarted,
      tone: 'alert',
    },
    {
      label: 'Quote requests waiting',
      value: String(stats.quoteRequests),
      href: '/admin/quote-requests',
      sub: 'View →',
      tone: stats.quoteRequests > 0 ? 'alert' : undefined,
    },
    {
      label: 'Pending payments',
      value: String(stats.pendingPayments),
      href: '/admin/financials',
      sub: 'money owed',
      tone: stats.pendingPayments > 0 ? 'danger' : undefined,
    },
  ]

  return (
    <div className="max-w-[1400px] p-5">

      {/* Page header. The right hand side was always empty; the detail
          preference lives there because it belongs to whoever is looking at
          this rather than to the build. */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1a18]">Dashboard</h1>
          <p className="mt-[2px] text-[12px] text-[#8b8a81]">{todayLabel}</p>
        </div>
        <DetailToggle value={detail} onChange={setDetail} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map(tile => <StatTile key={tile.label} tile={tile} />)}
      </div>

      {/* Body — the website on the left, what to do and where to go on the right */}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_260px]">

        <WebsitePanels site={site} detail={detail} />

        <div className="flex flex-col gap-4">

          {/* Quick actions */}
          <div className="rounded-[10px] border border-[#dbd8cc] bg-white p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-[#1a1a18]">Quick actions</h2>
            <div className="flex flex-col gap-2">
              <Link
                href="/admin/quotes/new"
                className="flex h-[38px] items-center gap-2.5 rounded-[8px] bg-[#1c2b1e] px-3 text-[13px] font-medium !text-white transition-colors hover:bg-[#2d3f2f]"
              >
                <IconPlus size={15} className="flex-shrink-0" />
                New quote
              </Link>
              <Link
                href="/admin/board"
                className="flex h-[38px] items-center gap-2.5 rounded-[8px] border border-[#dbd8cc] bg-[#f5f8f4] px-3 text-[13px] font-medium text-[#1a1a18] transition-colors hover:bg-[#edf4eb]"
              >
                <IconClipboardList size={15} className="flex-shrink-0 text-[#6b9e61]" />
                The board
              </Link>
              <Link
                href="/admin/enquiries"
                className="flex h-[38px] items-center gap-2.5 rounded-[8px] border border-[#dbd8cc] bg-[#f5f8f4] px-3 text-[13px] font-medium text-[#1a1a18] transition-colors hover:bg-[#edf4eb]"
              >
                <IconMail size={15} className="flex-shrink-0 text-[#6b9e61]" />
                Enquiries
                {stats.newEnquiries > 0 && (
                  <span className="ml-auto inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[#2d5e28] px-1 text-[10px] font-bold text-white">
                    {stats.newEnquiries}
                  </span>
                )}
              </Link>
              <Link
                href="/admin/orders"
                className="flex h-[38px] items-center gap-2.5 rounded-[8px] border border-[#dbd8cc] bg-[#f5f8f4] px-3 text-[13px] font-medium text-[#1a1a18] transition-colors hover:bg-[#edf4eb]"
              >
                <IconPackage size={15} className="flex-shrink-0 text-[#6b9e61]" />
                Orders
                {stats.ordersOnHold > 0 && (
                  <span className="ml-auto inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[#dcbf55] px-1 text-[10px] font-bold text-[#5c4200]">
                    {stats.ordersOnHold} on hold
                  </span>
                )}
              </Link>
              <Link
                href="/admin/customers"
                className="flex h-[38px] items-center gap-2.5 rounded-[8px] border border-[#dbd8cc] bg-[#f5f8f4] px-3 text-[13px] font-medium text-[#1a1a18] transition-colors hover:bg-[#edf4eb]"
              >
                <IconFileText size={15} className="flex-shrink-0 text-[#6b9e61]" />
                Customers
              </Link>
            </div>
          </div>

          <ProducedPanel site={site} />

          {/* Summary */}
          <div className="rounded-[10px] border border-[#dbd8cc] bg-[#f5f8f4] p-4">
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8b8a81]">Summary</h2>
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
                  className="flex items-center justify-between border-b border-[#edf4eb] py-[9px] transition-opacity last:border-b-0 hover:opacity-70"
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
