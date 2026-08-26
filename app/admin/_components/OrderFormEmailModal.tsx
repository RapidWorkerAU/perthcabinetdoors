'use client'

import * as React from 'react'
import { IconSearch, IconX } from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ORDER_FORM_SUBJECT, defaultOrderFormMessage } from '@/lib/pcd-order-form-email'

interface Customer {
  id:            string
  name?:         string | null
  contact_name?: string | null
  email?:        string | null
  company?:      string | null
  site_suburb?:  string | null
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function customerLabel(customer: Customer) {
  return customer.contact_name || customer.name || customer.company || customer.email || 'Unnamed'
}

/**
 * Emailing somebody the order form.
 *
 * Two ways to say who it goes to, because both happen: an existing customer we
 * already have a record for, or an address somebody has just been given on the
 * phone. Picking a customer is the better one and is offered first, because it
 * is the only one that files the email onto their conversation afterwards.
 */
export default function OrderFormEmailModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [picked, setPicked] = React.useState<Customer | null>(null)
  const [typedEmail, setTypedEmail] = React.useState('')
  const [subject, setSubject] = React.useState(ORDER_FORM_SUBJECT)
  const [message, setMessage] = React.useState(() => defaultOrderFormMessage({}))
  const [sending, setSending] = React.useState(false)
  // Once somebody has edited the words, choosing a different customer must not
  // throw them away. Re-greeting a rewritten email is worse than an email that
  // opens "Hi," when it could have opened with their name.
  const [edited, setEdited] = React.useState(false)

  React.useEffect(() => {
    let live = true
    fetch('/api/admin/customers')
      .then(r => r.json())
      .then(body => {
        if (!live) return
        setCustomers(Array.isArray(body?.customers) ? body.customers : [])
      })
      .catch(() => { if (live) setCustomers([]) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])

  const matches = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    const withEmail = customers.filter(c => c.email)
    if (!term) return withEmail.slice(0, 8)
    return withEmail
      .filter(c => [customerLabel(c), c.email, c.company].some(v => String(v || '').toLowerCase().includes(term)))
      .slice(0, 8)
  }, [customers, search])

  function choose(customer: Customer) {
    setPicked(customer)
    setTypedEmail('')
    setSearch('')
    if (!edited) setMessage(defaultOrderFormMessage({ name: customerLabel(customer) }))
  }

  const to = picked?.email || typedEmail.trim()
  const canSend = EMAIL_SHAPE.test(to) && message.trim().length > 0 && !sending

  async function send() {
    setSending(true)
    try {
      const response = await fetch('/api/admin/order-form/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, customerId: picked?.id || null, subject, message }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.ok) throw new Error(body?.error || 'The order form could not be sent.')

      toast({
        variant: body.warning ? 'warning' : 'success',
        title: `Order form sent to ${body.sentTo}`,
        description: body.warning || `${body.fileName} attached, built from today's libraries.`,
      })
      onClose()
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Could not send the order form',
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
      title="Email the order form"
      subtitle="They get today's colours, profiles and hardware, attached as an Excel file"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={!canSend} loading={sending} loadingText="Sending…">
            Send order form
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] mb-2">Send to</p>

          {picked ? (
            <div className="flex items-center justify-between gap-3 rounded-[6px] border border-[#a8c5a0] bg-[#f5f8f4] px-3 py-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#1a1a18] truncate">{customerLabel(picked)}</p>
                <p className="text-[12px] text-[#5a5a52] truncate">{picked.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="shrink-0 text-[#5a5a52] hover:text-[#1a1a18] transition-colors"
                aria-label="Choose somebody else"
              >
                <IconX size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8b8a81]" />
                <input
                  className="w-full h-[36px] pl-8 pr-3 border border-[#dbd8cc] rounded-[6px] bg-white text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
                  placeholder={loading ? 'Loading customers…' : 'Search a customer by name, company or email'}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  disabled={loading}
                />
              </div>

              {matches.length > 0 && (
                <ul className="mt-2 border border-[#dbd8cc] rounded-[6px] divide-y divide-[#f0ede4] max-h-[180px] overflow-y-auto">
                  {matches.map(customer => (
                    <li key={customer.id}>
                      <button
                        type="button"
                        onClick={() => choose(customer)}
                        className="w-full text-left px-3 py-2 hover:bg-[#f5f8f4] transition-colors"
                      >
                        <span className="block text-[13px] text-[#1a1a18] truncate">{customerLabel(customer)}</span>
                        <span className="block text-[12px] text-[#5a5a52] truncate">{customer.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3">
                <label className="block text-[12px] text-[#5a5a52] mb-1">
                  Or type an address, for somebody who is not on file yet
                </label>
                <input
                  className="w-full h-[36px] px-3 border border-[#dbd8cc] rounded-[6px] bg-white text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
                  placeholder="name@company.com.au"
                  value={typedEmail}
                  onChange={e => setTypedEmail(e.target.value)}
                />
                {typedEmail.trim() && !EMAIL_SHAPE.test(typedEmail.trim()) && (
                  <p className="mt-1 text-[12px] text-[#991b1b]">That does not look like an email address.</p>
                )}
                {EMAIL_SHAPE.test(typedEmail.trim()) && (
                  <p className="mt-1 text-[12px] text-[#5a5a52]">
                    This one is not on file, so the email will not be filed on a customer&apos;s conversation.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] mb-1">Subject</span>
          <input
            className="w-full h-[36px] px-3 border border-[#dbd8cc] rounded-[6px] bg-white text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] mb-1">Message</span>
          <textarea
            className="w-full px-3 py-2 border border-[#dbd8cc] rounded-[6px] bg-white text-[13px] leading-[1.6] text-[#1a1a18] outline-none focus:border-[#6b9e61] resize-y"
            rows={16}
            value={message}
            onChange={e => { setMessage(e.target.value); setEdited(true) }}
          />
          <span className="mt-1 block text-[12px] text-[#5a5a52]">
            Lines starting with a dash become bullet points. It goes out in our usual email styling with the
            spreadsheet attached.
          </span>
        </label>
      </div>
    </Modal>
  )
}
