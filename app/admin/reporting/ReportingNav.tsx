'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

// THE SECOND SIDEBAR.
//
// Reporting is one page with many reports under it, so it gets its own list
// rather than one row per report in the main rail. The main rail is already
// sixteen items long and a report is not a section of the business.
//
// A light panel rather than an extension of the dark rail: this reads as page
// content, which is what it is. The colours are the admin's own, from
// app/admin/_components/AdminShell.tsx.
//
// Reports that do not exist yet are listed and marked. A sidebar that grows an
// item every few months tells nobody anything; one that shows where this is
// going lets you say "do that one next".

export interface ReportLink {
  href:  string
  label: string
  soon?: boolean
}

export const REPORTS: ReportLink[] = [
  { href: '/admin/reporting/customer-updates', label: 'Weekly customer updates' },
  { href: '/admin/reporting/sales',            label: 'Sales by month',       soon: true },
  { href: '/admin/reporting/production',       label: 'Production throughput', soon: true },
  { href: '/admin/reporting/receivables',      label: 'Aged receivables',      soon: true },
  { href: '/admin/reporting/materials',        label: 'Colours and materials', soon: true },
  { href: '/admin/reporting/leads',            label: 'Lead conversion',       soon: true },
]

export default function ReportingNav() {
  const pathname = usePathname()

  return (
    <aside className="sticky top-0 hidden max-h-screen w-[208px] flex-shrink-0 self-start overflow-y-auto border-r border-[#dbd8cc] bg-white py-4 md:block">
      <div className="mb-[6px] border-b border-[#edf4eb] px-4 pb-3">
        <p className="text-[14px] font-bold text-[#1a1a18]">Reporting</p>
        <p className="mt-[2px] text-[11.5px] text-[#8b8a81]">{REPORTS.length} reports</p>
      </div>

      <nav>
        {REPORTS.map(report => {
          const active = pathname === report.href || pathname.startsWith(report.href + '/')

          if (report.soon) {
            return (
              <div
                key={report.href}
                className="mx-2 mb-[1px] flex items-center gap-[9px] rounded-[6px] px-[10px] py-[7px] text-[13px] font-medium text-[#b6b4aa]"
              >
                <span className="h-[6px] w-[6px] flex-shrink-0 rounded-full bg-[#dbd8cc]" />
                <span className="min-w-0 truncate">{report.label}</span>
                <span className="ml-auto text-[10px]">soon</span>
              </div>
            )
          }

          return (
            <Link
              key={report.href}
              href={report.href}
              className={cn(
                'mx-2 mb-[1px] flex items-center gap-[9px] rounded-[6px] px-[10px] py-[7px] text-[13px] transition-colors',
                active
                  ? 'bg-[#f5f8f4] font-semibold text-[#1a1a18] shadow-[inset_2px_0_0_#6b9e61]'
                  : 'font-medium text-[#5a5a52] hover:bg-[#f5f8f4] hover:text-[#1a1a18]',
              )}
            >
              <span
                className={cn(
                  'h-[6px] w-[6px] flex-shrink-0 rounded-full',
                  active ? 'bg-[#6b9e61]' : 'bg-[#dbd8cc]',
                )}
              />
              <span className="min-w-0 truncate">{report.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
