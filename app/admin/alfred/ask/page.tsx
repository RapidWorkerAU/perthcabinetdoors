import { redirect } from 'next/navigation'

// The chat used to live here, beside tabs that are gone. Old links still land on it.
export default function AlfredAskPage() {
  redirect('/admin/alfred')
}
