import AdminShell from '../_components/AdminShell'
import ReportingNav from './ReportingNav'

// The frame every report sits in, written once.
//
// NOT a layout.tsx. A route layout wraps the PAGE, and each admin page renders
// AdminShell itself, so a layout here would put the second sidebar outside the
// admin chrome entirely: floating beside a full height shell rather than inside
// it. Composing it explicitly keeps the nesting right.
//
// NO SCROLL CONTAINER. AdminShell's <main> already scrolls, and a second one
// nested inside it gives a long report two scrollbars and a sidebar you cannot
// reach. The nav sticks instead.

export default function ReportingShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminShell>
      <div className="flex min-h-full">
        <ReportingNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </AdminShell>
  )
}
