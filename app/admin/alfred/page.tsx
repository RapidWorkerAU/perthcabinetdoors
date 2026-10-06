import { redirect } from 'next/navigation'

// Alfred opens on what is waiting for a person.
export default function AlfredPage() {
  redirect('/admin/alfred/waiting')
}
