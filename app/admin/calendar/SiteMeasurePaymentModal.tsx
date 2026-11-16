'use client'

import * as React from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

// Sending the payment link for a site measure booked by hand.
//
// Opened from the booking on the calendar. The server fills it in: who it goes
// to, the words, and when the link closes, which defaults to (and can never be
// later than) the moment the day before confirmation goes out. The box is
// ticked when they still need to give us their rooms, job and address.
//
// The message is plain text and editable. The button carrying the link is
// added underneath when it is sent, so an edit can never lose it.

interface Draft {
  refusal:      string
  resend:       boolean
  name:         string
  email:        string
  fee:          number
  dayWords:     string
  timeWords:    string
  needDetails:  boolean
  expiresAt:    string
  latestExpiry: string
  latestWords:  string
  subject:      string
  messages:     { withDetails: string; payOnly: string }
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputClass =
  'w-full h-[36px] px-3 border border-[#dbd8cc] rounded-[6px] bg-white text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]'
const labelClass = 'block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] mb-1'

function money(amount: number) {
  return Number(amount || 0).toLocaleString('en-AU', {
    style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

export default function SiteMeasurePaymentModal({
  bookingId,
  onClose,
  onSent,
}: {
  bookingId: string
  onClose:   () => void
  onSent:    () => void
}) {
  const { toast } = useToast()
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [loadError, setLoadError] = React.useState('')
  const [to, setTo] = React.useState('')
  const [name, setName] = React.useState('')
  const [needDetails, setNeedDetails] = React.useState(true)
  const [expiresAt, setExpiresAt] = React.useState('')
  const [subject, setSubject] = React.useState('')
  const [message, setMessage] = React.useState('')
  // Once somebody has rewritten the words, ticking the box must not throw
  // their version away.
  const [edited, setEdited] = React.useState(false)
  const [sending, setSending] = React.useState(false)

  React.useEffect(() => {
    let live = true
    fetch(`/api/admin/calendar/${bookingId}/payment-link`, { cache: 'no-store' })
      .then(res => res.json())
      .then(payload => {
        if (!live) return
        if (!payload?.ok) {
          setLoadError(payload?.error || 'The payment link could not be loaded.')
          return
        }
        const next: Draft = payload.draft
        setDraft(next)
        setTo(next.email)
        setName(next.name)
        setNeedDetails(next.needDetails)
        setExpiresAt(next.expiresAt)
        setSubject(next.subject)
        setMessage(next.needDetails ? next.messages.withDetails : next.messages.payOnly)
      })
      .catch(() => { if (live) setLoadError('The payment link could not be loaded.') })
    return () => { live = false }
  }, [bookingId])

  function toggleDetails(next: boolean) {
    setNeedDetails(next)
    if (!edited && draft) setMessage(next ? draft.messages.withDetails : draft.messages.payOnly)
  }

  const expiryTooLate = Boolean(draft && expiresAt && draft.latestExpiry && expiresAt > draft.latestExpiry)
  const canSend =
    Boolean(draft) && !draft?.refusal && EMAIL_SHAPE.test(to.trim()) && message.trim().length > 0
    && Boolean(expiresAt) && !expiryTooLate && !sending

  async function send() {
    setSending(true)
    try {
      const res = await fetch(`/api/admin/calendar/${bookingId}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to.trim(), name: name.trim(), needDetails, expiresAt, subject, message }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || 'The payment link could not be sent.')
      toast({
        variant: payload.warning ? 'warning' : 'success',
        title: `Payment link sent to ${payload.sentTo}`,
        description: payload.warning || 'The booking shows as held, not paid until the money arrives.',
      })
      onSent()
      onClose()
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Could not send the payment link',
        description: error instanceof Error ? error.message : 'Something went wrong sending it.',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={draft?.resend ? 'Send the payment link again' : 'Send payment link'}
      subtitle={draft ? `Site measure, ${draft.dayWords}, ${draft.timeWords}` : 'Site measure'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={!canSend} loading={sending} loadingText="Sending…">
            Send payment link
          </Button>
        </>
      }
    >
      {loadError ? (
        <p className="text-[13px] text-[#991b1b]">{loadError}</p>
      ) : !draft ? (
        <p className="text-[13px] text-[#8b8a81]">Loading…</p>
      ) : draft.refusal ? (
        <p className="rounded-[7px] border border-[#e8d68f] bg-[#fffdf0] px-[10px] py-[9px] text-[13px] leading-[1.55] text-[#8a6d0b]">
          {draft.refusal}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Send to</span>
              <input className={inputClass} type="email" placeholder="name@example.com" value={to} onChange={e => setTo(e.target.value)} />
              {to.trim() && !EMAIL_SHAPE.test(to.trim()) && (
                <span className="mt-1 block text-[12px] text-[#991b1b]">That does not look like an email address.</span>
              )}
            </label>
            <label className="block">
              <span className={labelClass}>Their name</span>
              <input className={inputClass} value={name} onChange={e => setName(e.target.value)} />
            </label>
          </div>

          <label className="flex items-start gap-2 rounded-[7px] border border-[#dbd8cc] bg-[#fbfaf6] px-3 py-[10px]">
            <input
              type="checkbox"
              className="mt-[2px]"
              checked={needDetails}
              onChange={e => toggleDetails(e.target.checked)}
            />
            <span className="text-[13px] leading-[1.5] text-[#1a1a18]">
              <b>They need to fill in their site measure details</b>
              <span className="block text-[12px] text-[#5a5a52]">
                Ticked, the link asks for their rooms, job type, phone and address before they pay. Leave it unticked
                if we already have all of that, and the link goes straight to paying.
              </span>
            </span>
          </label>

          <label className="block">
            <span className={labelClass}>Link stops working</span>
            <input
              className={inputClass}
              type="datetime-local"
              value={expiresAt}
              max={draft.latestExpiry}
              onChange={e => setExpiresAt(e.target.value)}
            />
            <span className={`mt-1 block text-[12px] ${expiryTooLate ? 'text-[#991b1b]' : 'text-[#5a5a52]'}`}>
              Perth time. The latest is {draft.latestWords}, when the confirmation email goes out. From then their
              confirmation page asks them to pay {money(draft.fee)} before they can confirm.
            </span>
          </label>

          <label className="block">
            <span className={labelClass}>Subject</span>
            <input className={inputClass} value={subject} onChange={e => setSubject(e.target.value)} />
          </label>

          <label className="block">
            <span className={labelClass}>Message</span>
            <textarea
              className="w-full px-3 py-2 border border-[#dbd8cc] rounded-[6px] bg-white text-[13px] leading-[1.6] text-[#1a1a18] outline-none focus:border-[#6b9e61] resize-y"
              rows={12}
              value={message}
              onChange={e => { setMessage(e.target.value); setEdited(true) }}
            />
            <span className="mt-1 block text-[12px] text-[#5a5a52]">
              The booking details and a {needDetails ? 'Add my details and pay' : `Pay ${money(draft.fee)} and confirm`} button
              are added under your message. The fee is the site measure fee from Settings.
            </span>
          </label>
        </div>
      )}
    </Modal>
  )
}
