import AdminShell from '../_components/AdminShell'
import SecondarySidebar, { SecondarySidebarFrame, type SecondaryLink } from '../_components/SecondarySidebar'

// WORK MANAGEMENT: the two screens about what is happening now.
//
// The board is what the workshop is doing, the calendar is where everybody has
// to be. They were two rows in the main rail, which is a rail of parts of the
// business rather than of screens, and these two are one part of it.
//
// THE ROUTES DID NOT MOVE. /admin/board and /admin/calendar are still exactly
// where they were, so every bookmark, link and the mobile bottom bar all still
// work. Only the navigation around them changed.

export const WORK_SCREENS: SecondaryLink[] = [
  { href: '/admin/board', label: 'The Board' },
  { href: '/admin/calendar', label: 'Calendar' },
]

export default function WorkShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminShell>
      <SecondarySidebarFrame
        sidebar={
          <SecondarySidebar
            eyebrow="Work Management"
            items={WORK_SCREENS}
            backHref="/admin/dashboard"
            backLabel="Dashboard"
            ariaLabel="Work management"
          />
        }
      >
        {children}
      </SecondarySidebarFrame>
    </AdminShell>
  )
}
