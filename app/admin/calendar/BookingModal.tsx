'use client'

import * as React from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import {
  BOOKING_KINDS,
  DURATIONS,
  defaultMinutesFor,
  defaultTitle,
  formatMinutes,
} from '../../../lib/pcd-calendar'

// Booking a site measure, a delivery, an install or a reminder.
//
// THE CUSTOMER IS THE ANCHOR, and it is the whole reason bookings are their own
// table rather than two date columns on a quote: a measure is booked before
// there is a quote to put it on. The job it turns out to be about can be linked
// now or later, and neither is required.

interface Customer {
  id:            string
  name?:         string
  company_name?: string
  email?:        string
  site_address?: string
  site_street?:  string
  site_suburb?:  string
}

interface OrderOption {
  id:            string
  order_number?: string
  name?:         string
  customer_name?: string
}

export interface BookingDraft {
  id?:             string
  kind:            string
  title:           string
  day:             string
  startMinutes:    number
  minutes:         number
  customerId:      string | null
  customerName:    string
  orderId:         string | null
  siteAddress:     string
  notes:           string
  addToOutlook:    boolean
  // Typed into the mailbox calendar rather than here. Changes still go back to
  // that same event, and the form says so rather than leaving somebody
  // wondering whether they have just made a second copy of their own booking.
  fromOutlook?:    boolean
  unclaimed?:      boolean
}

interface BookingModalProps {
  open:      boolean
  onClose:   () => void
  onSaved:   () => void
  draft:     BookingDraft | null
  orders:    OrderOption[]
}

/** "09:30" from minutes past midnight, for the time input. */
function toTimeValue(minutes: number) {
  const safe = Math.max(0, Math.min(1439, Math.round(minutes)))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

function fromTimeValue(value: string, fallback: number) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''))
  if (!match) return fallback
  return Number(match[1]) * 60 + Number(match[2])
}

function addressOf(customer: Customer) {
  if (customer.site_address) return customer.site_address
  return [customer.site_street, customer.site_suburb].filter(Boolean).join(', ')
}

export default function BookingModal({ open, onClose, onSaved, draft, orders }: BookingModalProps) {
  const { toast } = useToast()

  const [form, setForm]           = React.useState<BookingDraft | null>(draft)
  const [isSaving, setIsSaving]   = React.useState(false)
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [search, setSearch]       = React.useState('')
  const [showList, setShowList]   = React.useState(false)
  // Whether the person has typed their own title. Until they do, the title
  // follows the kind and the customer, so it is never left saying "Site measure"
  // for a delivery.
  const [titleEdited, setTitleEdited] = React.useState(false)

  React.useEffect(() => {
    setForm(draft)
    setSearch(draft?.customerName || '')
    setTitleEdited(Boolean(draft?.id))
  }, [draft])

  // Customers are only fetched when the form is actually opened. Nothing on the
  // calendar itself needs them, and loading the whole list to draw a timeline
  // would be a page load spent on a menu nobody opened.
  React.useEffect(() => {
    if (!open || customers.length) return
    let cancelled = false
    fetch('/api/admin/customers', { cache: 'no-store' })
      .then(res => res.json())
      .then(payload => { if (!cancelled) setCustomers(payload.customers || []) })
      .catch(() => { if (!cancelled) toast({ title: 'The customer list could not be loaded. You can still book without one.', variant: 'warning' }) })
    return () => { cancelled = true }
  }, [open, customers.length, toast])

  const matches = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return customers.slice(0, 8)
    return customers
      .filter(c => `${c.name || ''} ${c.company_name || ''} ${c.email || ''}`.toLowerCase().includes(query))
      .slice(0, 8)
  }, [customers, search])

  if (!form) return null

  function set<K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) {
    setForm(prev => (prev ? { ...prev, [key]: value } : prev))
  }

  function chooseKind(kind: string) {
    setForm(prev => {
      if (!prev) return prev
      return {
        ...prev,
        kind,
        // The duration follows the kind until somebody changes it. An install is
        // never half an hour and a reminder is never half a day.
        minutes: defaultMinutesFor(kind),
        title: titleEdited ? prev.title : defaultTitle(kind, prev.customerName),
      }
    })
  }

  function chooseCustomer(customer: Customer | null) {
    setForm(prev => {
      if (!prev) return prev
      const name = customer?.name || ''
      return {
        ...prev,
        customerId: customer?.id || null,
        customerName: name,
        // The address comes across so nobody types it twice, and stays editable
        // because the job is not always at the address on file.
        siteAddress: customer ? addressOf(customer) || prev.siteAddress : prev.siteAddress,
        title: titleEdited ? prev.title : defaultTitle(prev.kind, name),
      }
    })
    setSearch(customer?.name || '')
    setShowList(false)
  }

  async function save() {
    if (!form) return
    setIsSaving(true)
    try {
      const editing = Boolean(form.id)
      const res = await fetch(editing ? `/api/admin/calendar/${form.id}` : '/api/admin/calendar', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const payload = await res.json()

      if (!payload.ok) {
        toast({ title: payload.error || 'The booking could not be saved.', variant: 'error' })
        return
      }

      // The booking is saved either way. Whether it reached Outlook is a
      // separate fact and is reported as one, so a booking that did not sync is
      // never mistaken for one that did.
      if (payload.sync?.skipped) {
        toast({ title: `Booked for ${form.day}. Not added to the mailbox calendar.`, variant: 'success' })
      } else if (payload.sync?.ok) {
        toast({ title: 'Booked, and added to the sales mailbox calendar.', variant: 'success' })
      } else {
        toast({
          title: 'Booked. It has not reached the mailbox calendar yet.',
          description: payload.sync?.error || 'The next sync will try again.',
          variant: 'warning',
        })
      }

      onSaved()
      onClose()
    } catch (error: unknown) {
      toast({ title: error instanceof Error ? error.message : 'The booking could not be saved.', variant: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  const durationLabel = DURATIONS.find(d => d.minutes === form.minutes)?.label

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={form.unclaimed ? 'What is this?' : form.id ? 'Edit booking' : 'Book something'}
      subtitle={
        form.fromOutlook
          ? 'Typed into the sales mailbox calendar. Changes here update that same Outlook event.'
          : form.id
            ? 'Changes are sent to the mailbox calendar too.'
            : 'It goes on the calendar and in the sales mailbox calendar.'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={save} loading={isSaving}>{form.id ? 'Save changes' : 'Save booking'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">

        {/* ── What it is ─────────────────────────────────────────────────── */}
        <div>
          <div className="mb-[6px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">What is it</div>
          <div className="flex flex-wrap gap-[6px]">
            {BOOKING_KINDS.map((kind: { value: string; label: string }) => (
              <button
                key={kind.value}
                type="button"
                onClick={() => chooseKind(kind.value)}
                aria-pressed={form.kind === kind.value}
                className={[
                  'flex min-h-[40px] items-center gap-2 rounded-[6px] border px-3 text-[13px] font-semibold transition-colors',
                  form.kind === kind.value
                    ? 'border-[#1a1a18] bg-[#f5f8f4] text-[#1a1a18]'
                    : 'border-[#dbd8cc] bg-white text-[#5a5a52] hover:bg-[#f5f8f4]',
                ].join(' ')}
              >
                <span className="h-[9px] w-[9px] flex-none rounded-[2.5px]" style={{ backgroundColor: KIND_COLOUR[kind.value] }} />
                {kind.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Who it is for ──────────────────────────────────────────────── */}
        <div className="relative">
          <Input
            label="Customer"
            optional
            value={search}
            autoComplete="off"
            placeholder="Start typing a name"
            onChange={e => { setSearch(e.target.value); setShowList(true) }}
            onFocus={() => setShowList(true)}
            helper="A measure can be booked before there is a quote. Leave it empty for a reminder that is not about a job."
          />
          {showList && matches.length > 0 && (
            <div
              className="absolute z-20 mt-[2px] max-h-[196px] w-full overflow-auto rounded-[6px] border border-[#dbd8cc] bg-white shadow-[0_4px_16px_rgba(28,43,30,0.12)]"
              data-pcd-combobox-menu="true"
            >
              {matches.map(customer => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => chooseCustomer(customer)}
                  className="block w-full border-b border-[#edf4eb] px-3 py-2 text-left text-[13px] last:border-b-0 hover:bg-[#edf4eb]"
                >
                  <span className="font-semibold text-[#1a1a18]">{customer.name || 'Unnamed'}</span>
                  {addressOf(customer) && <span className="block text-[12px] text-[#8b8a81]">{addressOf(customer)}</span>}
                </button>
              ))}
              {search.trim() && (
                <button
                  type="button"
                  onClick={() => chooseCustomer(null)}
                  className="block w-full px-3 py-2 text-left text-[13px] text-[#5a5a52] hover:bg-[#edf4eb]"
                >
                  Book without a customer
                </button>
              )}
            </div>
          )}
        </div>

        <Select
          label="About which job"
          optional
          value={form.orderId || ''}
          onChange={e => set('orderId', e.target.value || null)}
          helper="Only orders. A measure booked before the job exists is linked later from the booking."
          options={[
            { value: '', label: 'Nothing yet, just the customer' },
            ...orders.map(order => ({
              value: order.id,
              label: [order.order_number, order.name || order.customer_name].filter(Boolean).join('  '),
            })),
          ]}
        />

        {/* ── When ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="Date"
            type="date"
            value={form.day}
            onChange={e => set('day', e.target.value)}
          />
          <Input
            label="Start"
            type="time"
            value={toTimeValue(form.startMinutes)}
            onChange={e => set('startMinutes', fromTimeValue(e.target.value, form.startMinutes))}
          />
          <Select
            label="How long"
            value={String(form.minutes)}
            onChange={e => set('minutes', Number(e.target.value))}
            options={DURATIONS.map((duration: { minutes: number; label: string }) => ({
              value: String(duration.minutes),
              label: duration.label,
            }))}
          />
        </div>
        <p className="-mt-2 text-[12px] text-[#8b8a81]">
          {formatMinutes(form.startMinutes)} to {formatMinutes(form.startMinutes + form.minutes)}
          {durationLabel ? `, ${durationLabel.toLowerCase()}` : ''}, Perth time.
        </p>

        {/* ── Where and what ─────────────────────────────────────────────── */}
        <Input
          label="Address"
          optional
          value={form.siteAddress}
          onChange={e => set('siteAddress', e.target.value)}
          helper="Goes in the Outlook event as the location, so the reminder on your phone has it."
        />

        <Input
          label="What it says on the calendar"
          value={form.title}
          onChange={e => { setTitleEdited(true); set('title', e.target.value) }}
        />

        <Textarea
          label="Notes"
          optional
          rows={3}
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Anything the person going out needs to know"
        />

        {/* Not offered on something that came FROM the mailbox calendar: it is
            already in there, and unticking it would only make this row and that
            event quietly stop agreeing with each other. */}
        {!form.fromOutlook && (
          <label className="flex min-h-[40px] cursor-pointer items-center gap-[10px] text-[13px] font-semibold text-[#5a5a52]">
            <input
              type="checkbox"
              checked={form.addToOutlook}
              onChange={e => set('addToOutlook', e.target.checked)}
              className="h-[16px] w-[16px] accent-[#2d5e28]"
            />
            Put it in the sales mailbox calendar
          </label>
        )}
      </div>
    </Modal>
  )
}

// Kept here as well as on the calendar so the swatches in the picker are the
// same colours as the bars they will become.
export const KIND_COLOUR: Record<string, string> = {
  measure:  '#3f6f9c',
  delivery: '#c0803a',
  install:  '#7a6a8f',
  reminder: '#8b8a81',
  other:    '#8b8a81',
}
