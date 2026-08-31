'use client'

import { useState } from 'react'

// A DAY AT A TIME, AS BARS.
//
// ── WHY BARS AND NOT A LINE ──────────────────────────────────────────────────
//
// A line says the value between two points means something. Between Tuesday and
// Wednesday there is nothing, and on the small counts here, design sessions and
// quote requests, a line drawn through a run of ones and zeros invents a trend
// out of rounding. A bar per day says one day, one number, which is what it is.
//
// ── WHY IT IS CSS AND NOT SVG ────────────────────────────────────────────────
//
// Bars anchored to a baseline are what flexbox already does. Percentages resize
// with the panel, a 4px corner stays 4px at every width, and the 2px gap between
// bars is a gap rather than something drawn. An SVG would have to be measured
// before it could be drawn correctly and re-measured on every resize.
//
// ── WHAT IS LABELLED ─────────────────────────────────────────────────────────
//
// The last day and the busiest day, and nothing else. A number on every bar is
// thirty numbers, which is a table wearing a chart's clothes. Everything else is
// on hover and in the table underneath.

const GREEN = '#6b9e61'

export interface DayPoint {
  day:   string
  value: number
  note?: string
}

function shortDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function longDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** 0 / 60 / 120 rather than 0 / 47 / 94. Nobody reads a chart off 47. */
function niceTop(max: number) {
  if (max <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
  return Math.ceil(max / (magnitude / 2)) * (magnitude / 2)
}

export default function DayBars({
  days,
  colour = GREEN,
  height = 132,
  unit = '',
  peakIndex,
}: {
  days:      DayPoint[]
  colour?:   string
  height?:   number
  unit?:     string
  peakIndex: number
}) {
  const [hover, setHover] = useState<number | null>(null)

  if (!days.length) {
    return <p className="px-1 py-8 text-center text-[12.5px] text-[#8b8a81]">No days in this period yet.</p>
  }

  const top = niceTop(Math.max(...days.map(d => d.value)))
  const last = days.length - 1
  const shown = hover === null ? null : days[hover]

  return (
    <div>
      <div className="relative flex gap-[8px]">
        {/* The scale. Only three, because a gridline is scaffolding and the bars
            are the thing being looked at. */}
        <div
          className="flex w-[26px] flex-shrink-0 flex-col justify-between text-right font-mono text-[9.5px] leading-none text-[#8b8a81]"
          style={{ height }}
          aria-hidden="true"
        >
          <span>{top}</span>
          <span>{Math.round(top / 2)}</span>
          <span>0</span>
        </div>

        <div className="relative min-w-0 flex-1" style={{ height }}>
          {[0, 50, 100].map(at => (
            <span
              key={at}
              className="pointer-events-none absolute left-0 right-0 border-t border-[#edf4eb]"
              style={{ top: `${at}%` }}
              aria-hidden="true"
            />
          ))}

          <div className="absolute inset-0 flex items-end gap-[2px]">
            {days.map((point, index) => {
              const lit = hover === index || (hover === null && (index === last || index === peakIndex))
              return (
                <button
                  key={point.day}
                  type="button"
                  onMouseEnter={() => setHover(index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(index)}
                  onBlur={() => setHover(null)}
                  aria-label={`${longDay(point.day)}: ${point.value}${unit ? ' ' + unit : ''}`}
                  className="group relative flex h-full min-w-0 flex-1 cursor-default items-end rounded-[2px] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#6b9e61]"
                >
                  {/* The bar. A day with nothing on it still gets a sliver, so
                      a quiet Sunday reads as counted rather than as a gap where
                      the data should be. */}
                  <span
                    className="w-full rounded-t-[4px] transition-opacity"
                    style={{
                      background: colour,
                      height: point.value > 0 ? `${Math.max((point.value / top) * 100, 2)}%` : '2px',
                      opacity: point.value > 0 ? (lit ? 1 : 0.8) : 0.25,
                    }}
                  />
                </button>
              )
            })}
          </div>

          {/* Two direct labels: the last day and the busiest one. */}
          {[last, peakIndex].filter((index, at, all) => index >= 0 && all.indexOf(index) === at).map(index => (
            <span
              key={index}
              className="pointer-events-none absolute font-mono text-[10px] font-semibold text-[#5a5a52]"
              style={{
                left: `${((index + 0.5) / days.length) * 100}%`,
                bottom: `calc(${Math.max((days[index].value / top) * 100, 2)}% + 3px)`,
                transform: 'translateX(-50%)',
              }}
              aria-hidden="true"
            >
              {days[index].value}
            </span>
          ))}
        </div>
      </div>

      {/* The date rail, and the hover read-out in the middle of it so the panel
          does not change height when somebody moves the mouse across it. */}
      <div className="mt-[5px] flex items-baseline justify-between gap-2 pl-[34px] font-mono text-[10px] text-[#8b8a81]">
        <span>{shortDay(days[0].day)}</span>
        <span className="truncate font-sans text-[11px] text-[#1a1a18]">
          {shown ? (
            <>
              {longDay(shown.day)} <b className="font-mono font-semibold">{shown.value}</b>
              {unit ? ` ${unit}` : ''}
              {shown.note ? <span className="text-[#8b8a81]"> · {shown.note}</span> : null}
            </>
          ) : (
            <span className="text-[#8b8a81]">Hover a day</span>
          )}
        </span>
        <span>{shortDay(days[last].day)}</span>
      </div>
    </div>
  )
}
