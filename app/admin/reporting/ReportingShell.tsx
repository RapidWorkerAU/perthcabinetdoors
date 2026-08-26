import AdminShell from '../_components/AdminShell'
import SecondarySidebar, { SecondarySidebarFrame, type SecondaryLink } from '../_components/SecondarySidebar'

// Reporting: one page per report, behind one row in the main rail.
//
// NOT a layout.tsx. A route layout wraps the PAGE, and each admin page renders
// AdminShell itself, so a layout here would put the second sidebar outside the
// admin chrome entirely. Composing it explicitly keeps the nesting right.
//
// ── EVERY ROW HERE IS A PAGE THAT EXISTS ─────────────────────────────────────
//
// Sales by month, production throughput and aged receivables were listed as
// coming soon and have been taken off. Two of them Financials already answers,
// and production throughput cannot be built at all yet: measuring how long
// pieces take between stages needs stage changes on record, and all 194 line
// items still read "Not Ordered" because those transitions were never logged
// until it was fixed. A list of things that are not coming is a worse list than
// a short one.

export const REPORTS: SecondaryLink[] = [
  // Financials leads and is where /admin/reporting lands: it is the one looked
  // at daily. Its route did not move, it is still /admin/financials.
  { href: '/admin/financials', label: 'Financials' },
  { href: '/admin/reporting/customer-updates', label: 'Weekly customer updates' },
  { href: '/admin/reporting/materials', label: 'Colours and materials' },
  { href: '/admin/reporting/leads', label: 'Lead conversion' },
]

export default function ReportingShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminShell>
      <SecondarySidebarFrame
        sidebar={
          <SecondarySidebar
            eyebrow="Reporting"
            items={REPORTS}
            backHref="/admin/dashboard"
            backLabel="Dashboard"
            ariaLabel="Reports"
          />
        }
      >
        {children}
      </SecondarySidebarFrame>
    </AdminShell>
  )
}
