// HOW ALFRED IS SHOWN, EVERYWHERE.
//
// One definition, so the board, the desk, the timelines, the lists and the
// Alfred page cannot drift into four versions of the same mark. Decided on the
// prototype: copper, the bow tie on its own (its name on hover), and two pills
// for anything a person approved: Alfred wrote it, and who let it go.

import type { SVGProps } from 'react'

export const ALFRED = {
  ink: '#9a4a14',
  bg: '#fbefe6',
  border: '#ecc4a5',
  strong: '#b4581a',
} as const

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'stroke'> {
  size?: number
  stroke?: number
}

/** A bow tie in the Tabler outline style, so it sits beside the other icons. */
export function IconBowTie({ size = 24, stroke = 2, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d="M10.5 12l-7 -4.5v9z" />
      <path d="M13.5 12l7 -4.5v9z" />
      <rect x="10.5" y="10.2" width="3" height="3.6" rx=".9" />
    </svg>
  )
}

/** The bow tie pill. Its words are for screen readers and the hover. */
export function AlfredMark({ title = 'Alfred', className = '' }: { title?: string; className?: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex items-center rounded-full border px-[5px] py-[2px] align-middle ${className}`}
      style={{ background: ALFRED.bg, borderColor: ALFRED.border, color: ALFRED.ink }}
    >
      <IconBowTie size={12} stroke={2.2} />
    </span>
  )
}

/** The coloured dot on a list row with something of Alfred's waiting. */
export function AlfredDot({ title = 'Alfred has something waiting' }: { title?: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="mr-[6px] inline-block h-[7px] w-[7px] rounded-full align-middle"
      style={{ background: ALFRED.strong }}
    />
  )
}

/** Written by Alfred, approved by a person, and whether it was edited first. */
export function AlfredApproval({ approvedBy, edited = false }: { approvedBy?: string | null; edited?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      <AlfredMark title="Written by Alfred" />
      {approvedBy ? (
        <span className="inline-flex items-center rounded-full border border-[#a8c5a0] bg-[#edf4eb] px-2 py-[2px] text-[10px] font-semibold text-[#2d5e28]">
          Approved by {approvedBy}
        </span>
      ) : null}
      {edited ? (
        <span className="inline-flex items-center rounded-full border border-[#dbd8cc] bg-[#f5f5f4] px-2 py-[2px] text-[10px] font-medium text-[#5a5a52]">
          Edited before sending
        </span>
      ) : null}
    </span>
  )
}
