'use client'

import * as React from 'react'
import { IconFileSpreadsheet, IconMail } from '@tabler/icons-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import OrderFormEmailModal from './OrderFormEmailModal'

/**
 * The two things you do with the Excel order form: keep a copy, or send it to
 * somebody.
 *
 * Built fresh by the API every time rather than kept as a file, so what they
 * fill in is our current colour and hardware libraries. The date is in the file
 * name, which is how we spot a form filled in from an old copy.
 */
export default function OrderFormActions() {
  const [busy, setBusy] = React.useState(false)
  const [emailing, setEmailing] = React.useState(false)
  const { toast } = useToast()

  async function download() {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/order-form')
      if (!response.ok) {
        // The route answers with JSON when it fails and a spreadsheet when it
        // works, so read the message rather than showing a generic failure.
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'Could not build the order form.')
      }

      const disposition = response.headers.get('Content-Disposition') || ''
      const named = disposition.match(/filename="([^"]+)"/)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = named?.[1] || 'PCD-Order-Form.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      toast({
        variant: 'success',
        title: 'Order form downloaded',
        description: 'Built from the current colour and hardware libraries. Ready to email out.',
      })
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Could not build the order form',
        description: error instanceof Error ? error.message : 'Something went wrong building the file.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={download} loading={busy} disabled={busy}>
          <IconFileSpreadsheet size={15} strokeWidth={2} />
          Download order form
        </Button>
        <Button size="sm" onClick={() => setEmailing(true)}>
          <IconMail size={15} strokeWidth={2} />
          Email order form
        </Button>
      </div>
      {emailing && <OrderFormEmailModal onClose={() => setEmailing(false)} />}
    </>
  )
}
