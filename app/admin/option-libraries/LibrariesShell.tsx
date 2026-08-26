import AdminShell from '../_components/AdminShell'
import SecondarySidebar, { SecondarySidebarFrame, type SecondaryLink } from '../_components/SecondarySidebar'

// OPTION LIBRARIES: the four lists everything else is priced and built from.
//
// They used to be four rows in the main rail, which made a seventeen item rail
// where four of the items were the same kind of thing. One row now, and the
// four sit behind it.
//
// THE ROUTES DID NOT MOVE. /admin/options, /admin/profiles,
// /admin/benchtop-materials and /admin/hardware are all still exactly where
// they were, so every bookmark and every link into them still works. Only the
// navigation around them changed.

export const LIBRARIES: SecondaryLink[] = [
  { href: '/admin/options', label: 'Board Library' },
  { href: '/admin/profiles', label: 'Profile Library' },
  { href: '/admin/benchtop-materials', label: 'Benchtop Library' },
  { href: '/admin/hardware', label: 'Hardware Library' },
]

export default function LibrariesShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminShell>
      <SecondarySidebarFrame
        sidebar={
          <SecondarySidebar
            eyebrow="Option Libraries"
            items={LIBRARIES}
            backHref="/admin/dashboard"
            backLabel="Dashboard"
            ariaLabel="Option libraries"
          />
        }
      >
        {children}
      </SecondarySidebarFrame>
    </AdminShell>
  )
}
