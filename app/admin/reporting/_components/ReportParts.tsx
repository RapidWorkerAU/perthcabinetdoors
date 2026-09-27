'use client'

// THE PIECES EVERY MONEY REPORT IS BUILT FROM.
//
// Financials set the look: a period control beside the title, a rail of figures
// down the left where clicking one lists it, and one ledger table on the right
// with a totals row. A second report built from its own pieces looked like a
// different product, so the pieces live here and every report imports them.
// Change how a report looks here, never in a page.

import { cn } from '@/lib/utils'
import { tableStyles as t } from '@/components/ui/table-styles'
import { PERIODS } from '../../../../lib/pcd-financials'

export const CARD = 'bg-white border border-[#dbd8cc] rounded-[10px]'
// Ledger tables take their look from the shared table tokens. Figures never
// wrap, so a column lines up.
export const TH = t.th
export const TD = cn(t.td, 'whitespace-nowrap')
export const NUM = t.num
// The totals row: a cell like the rest, with its line above rather than below.
export const FOOT = cn(t.td, 'whitespace-nowrap border-b-0 border-t border-[#dbd8cc] font-semibold')

// Cents, unlike the headline figures. A total is read for its size; a row is
// read to be matched against an invoice, and $255 does not match $255.75.
export function money2(value: number): string {
  return Number(value || 0).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function dateLabel(value: string | null): string {
  if (!value) return '·'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '·'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })
}

/** "2026-09" as "Sep 2026". */
export function monthLabel(key: string): string {
  const d = new Date(key + '-01T00:00:00')
  if (Number.isNaN(d.getTime())) return key
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

export function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-[40px] px-3 text-[13px] md:min-h-0 md:h-[26px] md:px-[10px] md:text-[11px] font-medium rounded-[6px] border transition-colors ${
        on ? 'bg-[#1c2b1e] text-white border-[#1c2b1e]' : 'bg-white text-[#5a5a52] border-[#dbd8cc] hover:border-[#6b9e61]'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * The period buttons. ONE LINE, never wrapped: a second row of them read as a
 * second control. Where the screen is too narrow for all seven they scroll
 * sideways instead.
 */
export function PeriodPills({ periodId, onChange }: { periodId: string; onChange: (id: string) => void }) {
  return (
    <div className="flex max-w-full items-center gap-1.5 flex-nowrap overflow-x-auto">
      {PERIODS.map(p => (
        <span key={p.id} className="flex-shrink-0 whitespace-nowrap">
          <Pill on={periodId === p.id} onClick={() => onChange(p.id)}>{p.label}</Pill>
        </span>
      ))}
    </div>
  )
}

/**
 * A report's title, what it shows, anything that belongs under the title (a
 * view switch), and the period buttons. The buttons sit beside the title only
 * where the page is wide enough for both on one line; anywhere narrower they
 * take their own line under it, rather than wrapping into two rows.
 */
export function ReportHeader({ title, subtitle, periodId, onPeriod, children }: {
  title: string
  subtitle: string
  periodId: string
  onPeriod: (id: string) => void
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col 2xl:flex-row 2xl:items-end 2xl:justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h1 className="text-[20px] font-bold text-[#1a1a18]">{title}</h1>
        <p className="text-[12px] text-[#8b8a81] mt-[2px]">{subtitle}</p>
        {children}
      </div>
      <PeriodPills periodId={periodId} onChange={onPeriod} />
    </div>
  )
}

/** The From and To boxes a custom period opens. */
export function CustomRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <div className={`${CARD} p-3 mb-4 flex items-center gap-2 flex-wrap`}>
      <span className="text-[11px] text-[#8b8a81]">From</span>
      <input
        type="date"
        value={from}
        onChange={e => onFrom(e.target.value)}
        className="h-[40px] px-3 text-[16px] md:h-[28px] md:px-2 md:text-[11px] border border-[#dbd8cc] rounded-[6px] text-[#1a1a18]"
      />
      <span className="text-[11px] text-[#8b8a81]">to</span>
      <input
        type="date"
        value={to}
        onChange={e => onTo(e.target.value)}
        className="h-[40px] px-3 text-[16px] md:h-[28px] md:px-2 md:text-[11px] border border-[#dbd8cc] rounded-[6px] text-[#1a1a18]"
      />
    </div>
  )
}

/**
 * Two or more views of one card, side by side: "Confirmed orders · 12" and
 * "Unaccepted quotes · 4". One line, never wrapped; on a screen too narrow for
 * all of them it scrolls sideways.
 */
export function Segmented<K extends string>({ options, value, onChange }: {
  options: { key: K; label: string }[]
  value: K
  onChange: (key: K) => void
}) {
  return (
    <div className="inline-flex max-w-full flex-nowrap rounded-[7px] border border-[#dbd8cc] overflow-x-auto self-start">
      {options.map((option, index) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          aria-pressed={value === option.key}
          className={`flex-shrink-0 min-h-[40px] px-3 text-[13px] md:min-h-0 md:py-[5px] md:text-[11.5px] font-medium transition-colors whitespace-nowrap ${
            index ? 'border-l border-[#dbd8cc]' : ''
          } ${value === option.key ? 'bg-[#1c2b1e] text-white' : 'bg-white text-[#5a5a52] hover:bg-[#faf9f5]'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// One line of the rail. Clicking a figure that has a table behind it switches
// the table to it, so the summary and the list are never showing two different
// things without the person having asked for that.
export function RailRow({ label, value, sub, strong, onClick, active }: {
  label: string
  value: string
  sub?: string
  strong?: boolean
  onClick?: () => void
  active?: boolean
}) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-[#8b8a81]">{label}</span>
        {active && <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[#6b9e61]">Listed</span>}
      </div>
      <div className={`${NUM} ${strong ? 'text-[17px] text-[#1a1a18]' : 'text-[14px] text-[#5a5a52]'} font-medium mt-[2px]`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-[#8b8a81] mt-[2px] leading-[1.4]">{sub}</div>}
    </>
  )

  if (!onClick) return <div className="px-3 py-[9px] border-b border-[#edf4eb] last:border-b-0">{body}</div>

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-[9px] border-b border-[#edf4eb] last:border-b-0 transition-colors ${
        active ? 'bg-[#f5fff5]' : 'hover:bg-[#faf9f5]'
      }`}
    >
      {body}
    </button>
  )
}

/** The gap between two groups of figures in one rail card. */
export function RailDivider() {
  return <div className="h-[5px] bg-[#faf9f5] border-y border-[#edf4eb]" />
}

/** A chip for a status in a ledger row. `tone` picks the colour. */
const CHIP_TONES = {
  good: 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]',
  done: 'bg-[#f2f2f0] text-[#5a5a52] border-[#dbd8cc]',
  wait: 'bg-[#fffef0] text-[#8a6d0b] border-[#f0d060]',
  quiet: 'bg-[#f4f2ec] text-[#5a5a52] border-[#d3cec0]',
  warm: 'bg-[#fdf8ea] text-[#8a6d0b] border-[#e7d3b0]',
} as const
export type ChipTone = keyof typeof CHIP_TONES

export function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-[1px] rounded-full text-[10px] font-semibold border ${CHIP_TONES[tone]}`}>
      {children}
    </span>
  )
}

/** "How these figures are worked out", last and quiet. */
export function HowWorkedOut({ children }: { children: React.ReactNode }) {
  return (
    <details className={`${CARD} mt-4`}>
      <summary className="px-4 py-3 text-[12px] font-semibold text-[#1a1a18] cursor-pointer select-none">
        How these figures are worked out
      </summary>
      <ul className="px-4 pb-3 flex flex-col gap-2 text-[11.5px] text-[#5a5a52] leading-[1.5]">
        {children}
      </ul>
    </details>
  )
}
