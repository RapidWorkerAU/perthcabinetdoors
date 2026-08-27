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

// One thing to do, worked out in lib/pcd-action-queue.js. Every field here is
// decided there, including the wording, so a change of tone happens in one file
// rather than being split between the sentence and the screen that prints it.
// One board card, worded for a row. Every field is decided in
// lib/pcd-action-queue.js, including the sentence, so a change of tone happens
// in one file rather than being split between the words and the screen.
export interface QueueItem {
  id:          string
  cat:         string
  tier:        number
  title:       string
  detail:      string
  flag:        { text: string; tone: 'crit' | 'warn' | 'info' } | null
  value:       number | null
  valueNote:   string
  days:        number
  href:        string
  actionLabel: string
}

interface Queue {
  items:  QueueItem[]
  total:  number
  hidden: number
  // What would not load. A queue that is short because a table refused to
  // answer must say so, or a broken query reads as a quiet morning. `missing`
  // is the same thing in the words of the work it affects, which is how the
  // board says it too.
  problems: string[]
  missing:  string
  // Cards deliberately cleared off the board. Named here so a short list is
  // explained by something somebody did rather than looking like a bug.
  setAsideCount: number
}

interface DashboardProps {
  stats:      Stats
  queue:      Queue
  todayLabel: string
}

// ─── The queue ───────────────────────────────────────────────────────────────
//
// A stripe down the left of each row carries the tier, so how urgent something
// is reads before any of the words do. Colour is the only thing doing that job,
// so the flag beside the title repeats it in words for anybody who cannot use
// the colour.

const TIER_STRIPE: Record<number, string> = {
  3: 'bg-[#ef4444]',
  2: 'bg-[#f59e0b]',
  1: 'bg-[#3b82f6]',
  0: 'bg-[#cfd8c9]',
}

const FLAG_TONE = {
  crit: 'bg-[#fee2e2] text-[#991b1b]',
  warn: 'bg-[#fef3c7] text-[#5c4200]',
  info: 'bg-[#dbeafe] text-[#1e5fa8]',
} as const

const money = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value)

function QueueRow({ item }: { item: QueueItem }) {
  return (
    <Link
      href={item.href}
      className="grid grid-cols-[3px_1fr_auto] items-center border-b border-[#edf4eb] last:border-b-0 hover:bg-[#f9fbf8] transition-colors group"
    >
      <span className={`self-stretch ${TIER_STRIPE[item.tier] || TIER_STRIPE[0]}`} aria-hidden="true" />

      <div className="min-w-0 py-[11px] pl-[13px] pr-3">
        <p className="text-[13px] font-semibold text-[#1a1a18] leading-[1.35]">
          {item.title}
          {item.flag && (
            <span
              className={`ml-[7px] inline-block align-[1px] rounded-[3px] px-[6px] py-[2px] font-mono text-[9.5px] font-semibold uppercase tracking-[0.07em] ${FLAG_TONE[item.flag.tone]}`}
            >
              {item.flag.text}
            </span>
          )}
        </p>
        <p className="mt-[2px] text-[11.5px] text-[#8b8a81] truncate">{item.detail}</p>
      </div>

      <div className="flex items-center gap-[10px] py-[11px] pr-4">
        {/* An item with no price shows why rather than a dash. A quote request
            has not been costed; a dash reads as a number we lost. */}
        <div className="text-right font-mono text-[12.5px] font-medium leading-tight text-[#1a1a18] tabular-nums">
          {item.value === null ? <span className="text-[#c5cdd8]">·</span> : money(item.value)}
          <span className="block font-sans text-[10px] font-normal tracking-[0.02em] text-[#8b8a81]">
            {item.valueNote}
          </span>
        </div>
        <span className="whitespace-nowrap rounded-[6px] border border-[#dbd8cc] bg-[#f5f8f4] px-[11px] py-[5px] text-[11.5px] font-semibold text-[#1a1a18] group-hover:border-[#6b9e61] group-hover:bg-[#edf4eb] transition-colors">
          {item.actionLabel}
        </span>
      </div>
    </Link>
  )
}

function ActionQueuePanel({ queue }: { queue: Queue }) {
  return (
    <div className="bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#edf4eb]">
        <span className="text-[13px] font-semibold text-[#1a1a18]">Do this next</span>
        {queue.total > 0 && (
          <span className="text-[10px] font-semibold bg-[#1c2b1e] text-white px-[6px] py-[1px] rounded-full">
            {queue.total}
          </span>
        )}
      </div>

      {/* SAID OUT LOUD. An empty list and a list that could not be built look
          identical, and the second one is the dangerous one. */}
      {queue.problems.length > 0 && (
        <p className="border-b border-[#fde68a] bg-[#fffbeb] px-4 py-[9px] text-[12px] text-[#5c4200]">
          This list is incomplete: {queue.missing || queue.problems.join(', ')} could not be loaded just now.
          Refresh, and if it keeps happening the detail is in the server log.
        </p>
      )}

      {queue.items.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-[#8b8a81]">
          Nothing is waiting on you. The board is clear.
          {queue.setAsideCount > 0 && ` ${queue.setAsideCount} set aside.`}
        </p>
      ) : (
        <>
          <div className="flex flex-col">
            {queue.items.map(item => <QueueRow key={item.id} item={item} />)}
          </div>

          {/* The board is where the rest of them are, and where a card is set
              aside. Always offered, not only when there is an overflow: this
              panel is the top of that list and should say so. */}
          <Link
            href="/admin/board"
            className="flex items-center justify-between border-t border-[#edf4eb] bg-[#f5f8f4] px-4 py-[7px] text-[11.5px] font-medium text-[#2d5e28] hover:bg-[#edf4eb] transition-colors"
          >
            <span>
              {queue.hidden > 0 ? `${queue.hidden} more on the board` : 'That is all of it'}
              {queue.setAsideCount > 0 && (
                <span className="font-normal text-[#8b8a81]"> · {queue.setAsideCount} set aside</span>
              )}
            </span>
            <span>Open the board →</span>
          </Link>

          {/* THE RULE, WRITTEN DOWN. A list that sorts itself without saying how
              is one people stop trusting the first time it puts something odd at
              the top. See lib/pcd-action-queue.js. */}
          <p className="border-t border-[#edf4eb] bg-[#f5f8f4] px-4 py-2 text-[11px] text-[#8b8a81]">
            The top of <span className="font-semibold text-[#5a5a52]">the board</span>, oldest and largest first.
            Set a card aside there and it leaves here too.
          </p>
        </>
      )}
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

export default function DashboardClient({ stats, queue, todayLabel }: DashboardProps) {
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
          { label: 'Pending payments', value: stats.pendingPayments, href: '/admin/financials',      alert: false,                     danger: stats.pendingPayments > 0 },
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

      {/* Body — the queue left, quick actions + summary right */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4 items-start">

        {/* Left — what to do next */}
        <div className="flex flex-col gap-4">
          <ActionQueuePanel queue={queue} />
        </div>

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
