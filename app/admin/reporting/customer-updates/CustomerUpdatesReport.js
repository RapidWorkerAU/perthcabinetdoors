'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconMail, IconListSearch, IconUser, IconPackage } from '@tabler/icons-react'

import { AdminPageHeader } from '@/components/ui/AdminPageHeader'
import { ActionMenu, ActionMenuItem } from '@/components/ui/ActionMenu'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { StatusPill } from '@/components/ui/StatusPill'
import { useToast } from '@/components/ui/Toast'
import AdminLoading from '@/components/admin/AdminLoading'
import { AdminPagination, useAdminPagination, REPORT_PAGE_SIZE } from '../../_components/AdminPagination'

import {
  internalLabelFor,
  longDate,
  sentenceFor,
  shortDate,
  updateEmailBody,
  updateEmailSubject,
} from '@/lib/pcd-update-wording'

// WEEKLY CUSTOMER UPDATES.
//
// Who has had something happen on their order, and whether they have been told.
//
// NOTHING ON THIS PAGE SENDS ITSELF. The report is read weekly by a person, who
// opens a customer, reads what actually changed, then reviews and edits the
// email before it goes. That review step is the point: it is what stops a
// machine telling somebody their doors are finished on the morning we found a
// problem with them.
//
// The sentence a customer reads is imported, not written here, so the wording
// on screen and the wording in the email cannot drift apart.

function perthToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function daysBefore(day, days) {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - days * 86400000).toISOString().slice(0, 10)
}

export default function CustomerUpdatesReport() {
  const { toast } = useToast()

  const today = useMemo(() => perthToday(), [])
  const [from, setFrom] = useState(() => daysBefore(perthToday(), 7))
  const [to, setTo] = useState(today)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // { row, step, subject, body, sending }
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/reporting/customer-updates?from=${from}&to=${to}`)
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not load the report.')
      setRows(payload.rows || [])
    } catch (thrown) {
      setError(thrown?.message || 'Could not load the report.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, [load])

  function preset(days) {
    setFrom(daysBefore(today, days))
    setTo(today)
  }

  function openFor(row, step) {
    setOpen({
      row,
      step,
      subject: updateEmailSubject(),
      body: updateEmailBody({ customerName: row.name, orders: row.orders }),
      sending: false,
    })
  }

  async function send() {
    if (!open) return
    setOpen(current => ({ ...current, sending: true }))
    try {
      const response = await fetch('/api/admin/reporting/customer-updates/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: open.row.customerId,
          customer_name: open.row.name,
          email: open.row.email,
          subject: open.subject,
          body: open.body,
          orders: open.row.orders.map(order => ({ id: order.id, number: order.number })),
        }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'The update could not be sent.')

      toast({
        title: 'Update sent',
        description: `${open.row.name} has been emailed, and it is recorded against their customer record.`,
        variant: 'success',
      })
      setOpen(null)
      load()
    } catch (thrown) {
      setOpen(current => (current ? { ...current, sending: false } : current))
      toast({ title: 'Nothing was sent', description: thrown?.message || '', variant: 'error' })
    }
  }

  // Keyed on the range: changing it and staying on page three would show a
  // slice of a list that no longer exists.
  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(rows, `${from}|${to}`, REPORT_PAGE_SIZE)

  const sentCount = rows.filter(row => row.lastSentAt && row.lastSentAt.slice(0, 10) >= from).length

  if (loading && !rows.length) {
    return <AdminLoading steps={['Reading order activity', 'Grouping by customer']} label="Building the report" />
  }

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader
        title="Weekly customer updates"
        subtitle="Customers whose orders changed in the period, and whether they have been told"
      />

      {/* Date range */}
      <div className="mb-[14px] flex flex-wrap items-end gap-[10px] rounded-[8px] border border-[#dbd8cc] bg-white px-[14px] py-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">From</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={event => setFrom(event.target.value)}
            className="h-[34px] rounded-[6px] border border-[#dbd8cc] bg-white px-[9px] text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">To</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={event => setTo(event.target.value)}
            className="h-[34px] rounded-[6px] border border-[#dbd8cc] bg-white px-[9px] text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
          />
        </label>
        <div className="ml-auto flex gap-[6px]">
          <Button variant="secondary" size="sm" onClick={() => preset(7)}>Last 7 days</Button>
          <Button variant="secondary" size="sm" onClick={() => preset(14)}>Last 14 days</Button>
          <Button variant="secondary" size="sm" onClick={() => preset(30)}>Last 30 days</Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-[6px] border border-[#fcd34d] bg-[#fffbeb] px-4 py-3 text-[13px] text-[#92400e]">
          {error}
        </div>
      )}

      <p className="mb-[10px] text-[13px] text-[#8b8a81]">
        <b className="font-semibold text-[#1a1a18]">{rows.length}</b>{' '}
        {rows.length === 1 ? 'customer' : 'customers'} with updates between{' '}
        <b className="font-semibold text-[#1a1a18]">{longDate(from)}</b> and{' '}
        <b className="font-semibold text-[#1a1a18]">{longDate(to)}</b>
        {sentCount > 0 && <>, <b className="font-semibold text-[#1a1a18]">{sentCount}</b> already sent</>}
      </p>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-[13px]">
            <thead>
              <tr className="border-b border-[#dbd8cc] bg-[#f5f8f4]">
                {['Customer', 'Orders', 'Updates', 'Latest update', 'Status', 'Actions'].map(column => (
                  <th
                    key={column}
                    className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[13px] text-[#8b8a81]">
                    No customers had order updates in this period.
                  </td>
                </tr>
              )}
              {pageItems.map(row => (
                <tr
                  key={row.key}
                  className="cursor-pointer border-b border-[#edf4eb] transition-colors last:border-b-0 hover:bg-[#f5f8f4]"
                  onClick={() => openFor(row, 1)}
                >
                  <td className="px-4 py-[11px]">
                    <div className="font-semibold text-[#1a1a18]">{row.name || 'Unnamed customer'}</div>
                    <div className="mt-[1px] text-[12px] text-[#8b8a81]">{row.email || 'No email address'}</div>
                  </td>
                  <td className="px-4 py-[11px]">
                    <div className="flex flex-wrap gap-1">
                      {row.orders.map(order => (
                        <span
                          key={order.id}
                          className="rounded-[4px] border border-[#dbd8cc] bg-[#f5f8f4] px-[6px] py-[1px] font-mono text-[11px] text-[#1a1a18]"
                        >
                          {order.number}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-[11px] tabular-nums text-[#1a1a18]">
                    <span className="font-semibold">{row.updateCount}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-[11px] text-[#1a1a18]">{shortDate(row.latestAt)}</td>
                  <td className="px-4 py-[11px]">
                    {row.lastSentAt && row.lastSentAt.slice(0, 10) >= from ? (
                      <StatusPill tone="success">Sent {shortDate(row.lastSentAt)}</StatusPill>
                    ) : (
                      <StatusPill tone="warning">Not sent</StatusPill>
                    )}
                  </td>
                  <td className="px-4 py-[11px]" onClick={event => event.stopPropagation()}>
                    <div className="flex justify-end">
                      <ActionMenu label={`Open actions for ${row.name || 'this customer'}`}>
                        <ActionMenuItem icon={<IconMail size={14} />} onClick={() => openFor(row, 2)}>
                          Send update email
                        </ActionMenuItem>
                        <ActionMenuItem icon={<IconListSearch size={14} />} onClick={() => openFor(row, 1)}>
                          View updates
                        </ActionMenuItem>
                        {row.customerId && (
                          <ActionMenuItem
                            icon={<IconUser size={14} />}
                            onClick={() => window.open(`/admin/customers/${row.customerId}`, '_blank', 'noopener,noreferrer')}
                          >
                            Open customer
                          </ActionMenuItem>
                        )}
                        {row.orders[0] && (
                          <ActionMenuItem
                            icon={<IconPackage size={14} />}
                            onClick={() => window.open(`/admin/orders/${row.orders[0].id}`, '_blank', 'noopener,noreferrer')}
                          >
                            Open order
                          </ActionMenuItem>
                        )}
                      </ActionMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AdminPagination
          label="customers"
          pageSize={REPORT_PAGE_SIZE}
          page={page}
          pageCount={pageCount}
          totalItems={totalItems}
          onPageChange={setPage}
        />
      </div>

      {/* Mobile cards. A six column table on a phone is unreadable. */}
      <div className="flex flex-col gap-2 md:hidden">
        {!rows.length && (
          <p className="py-10 text-center text-[13px] text-[#8b8a81]">
            No customers had order updates in this period.
          </p>
        )}
        {pageItems.map(row => (
          <button
            key={row.key}
            type="button"
            onClick={() => openFor(row, 1)}
            className="rounded-[8px] border border-[#dbd8cc] bg-white p-3 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold text-[#1a1a18]">{row.name || 'Unnamed customer'}</div>
                <div className="mt-[1px] truncate text-[12px] text-[#8b8a81]">{row.email}</div>
              </div>
              {row.lastSentAt && row.lastSentAt.slice(0, 10) >= from ? (
                <StatusPill tone="success">Sent</StatusPill>
              ) : (
                <StatusPill tone="warning">Not sent</StatusPill>
              )}
            </div>
            <div className="mt-2 text-[12px] text-[#5a5a52]">
              {row.updateCount} update{row.updateCount === 1 ? '' : 's'} across{' '}
              {row.orders.length} order{row.orders.length === 1 ? '' : 's'}, latest {shortDate(row.latestAt)}
            </div>
          </button>
        ))}
      </div>

      {open && <UpdateModal state={open} setState={setOpen} onSend={send} from={from} to={to} />}
    </div>
  )
}

// ── The two step modal ───────────────────────────────────────────────────────
//
// Step one is what actually changed, shown with the exact sentence the customer
// would read underneath each one. Step two is that assembled into an email,
// still editable. Sending from the kebab opens straight at step two, and the
// Back button means a person can always check what they are about to claim.

function UpdateModal({ state, setState, onSend, from, to }) {
  const { row, step, sending } = state
  const canSend = Boolean(row.email) && state.subject.trim() && state.body.trim()

  return (
    <Modal
      open
      onClose={() => (sending ? null : setState(null))}
      title={row.name || 'Customer update'}
      subtitle={
        step === 1
          ? `${row.updateCount} update${row.updateCount === 1 ? '' : 's'} between ${shortDate(from)} and ${shortDate(to)}`
          : 'Read it before it goes out, and change anything that needs it'
      }
      size="lg"
      footer={
        step === 1 ? (
          <>
            <span className="mr-auto text-[12.5px] text-[#8b8a81]">
              {row.lastSentAt
                ? `Last update sent ${longDate(row.lastSentAt)}`
                : 'No update has been sent to this customer'}
            </span>
            <Button variant="secondary" onClick={() => setState(null)}>Close</Button>
            {/* Two words. "Compose update email" wrapped onto a second line in
                the footer, which makes the button taller than the one beside
                it and reads as a mistake. */}
            <Button
              onClick={() => setState(current => ({ ...current, step: 2 }))}
              disabled={!row.email}
              tooltip={row.email ? undefined : 'This customer has no email address on file'}
            >
              Write update
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setState(current => ({ ...current, step: 1 }))} disabled={sending}>
              Back to updates
            </Button>
            <Button variant="secondary" onClick={() => setState(null)} disabled={sending}>Cancel</Button>
            <Button onClick={onSend} disabled={!canSend} loading={sending} loadingText="Sending...">
              Send update
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <Steps step={step} />
        {step === 1 ? <UpdateDetail row={row} /> : <UpdateEmail state={state} setState={setState} row={row} />}
      </div>
    </Modal>
  )
}

function Steps({ step }) {
  return (
    <div className="flex items-center gap-[6px]">
      {[[1, 'Updates'], [2, 'Email']].map(([n, label], index) => (
        <div key={n} className="flex items-center gap-[6px]">
          {index > 0 && <span className="h-px w-[22px] bg-[#dbd8cc]" />}
          <span className={`flex items-center gap-[7px] text-[12px] font-semibold ${step === n ? 'text-[#1a1a18]' : 'text-[#8b8a81]'}`}>
            <span
              className={`grid h-[19px] w-[19px] place-items-center rounded-full border text-[10.5px] ${
                step === n ? 'border-[#6b9e61] bg-[#6b9e61] text-white' : 'border-[#dbd8cc] bg-white'
              }`}
            >
              {n}
            </span>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

function UpdateDetail({ row }) {
  return (
    <>
      {row.orders.map(order => {
        const shown = order.changes.filter(change => change.kind !== 'internal')
        if (!shown.length) return null
        return (
          <div key={order.id} className="overflow-hidden rounded-[8px] border border-[#dbd8cc]">
            <div className="flex flex-wrap items-center gap-[9px] border-b border-[#dbd8cc] bg-[#f5f8f4] px-[13px] py-[9px]">
              <span className="font-mono text-[12px] font-medium text-[#1a1a18]">{order.number}</span>
              {order.name && <span className="text-[12.5px] text-[#5a5a52]">{order.name}</span>}
              <StatusPill status={order.status} />
            </div>
            {shown.map((change, index) => {
              const line = sentenceFor(change)
              return (
                <div key={index} className="flex gap-3 border-b border-[#edf4eb] px-[13px] py-[10px] last:border-b-0">
                  <span className="w-[62px] flex-shrink-0 pt-[1px] font-mono text-[11px] text-[#8b8a81]">
                    {shortDate(change.at)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[#1a1a18]">
                      {internalLabelFor(change)}
                      {!line && (
                        <span className="ml-[6px] rounded-[3px] border border-[#fcd34d] bg-[#fffbeb] px-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#92400e]">
                          not sent
                        </span>
                      )}
                    </div>
                    {/* THE ACTUAL SENTENCE. Shown against the change it came
                        from so what is approved here is exactly what a customer
                        reads, rather than being assembled out of sight.
                        Set in the ordinary body grey: green read as a status,
                        as though these lines were themselves good news, when
                        all they are is the wording. */}
                    {line && (
                      <div className="mt-1 border-l-2 border-[#dbd8cc] pl-[9px] text-[12.5px] text-[#5a5a52]">
                        {line}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {row.internalCount > 0 && (
        <div className="rounded-[6px] border border-[#fcd34d] bg-[#fffbeb] px-3 py-[10px] text-[12.5px] text-[#92400e]">
          <b className="font-bold">
            {row.internalCount} internal edit{row.internalCount === 1 ? ' is' : 's are'} hidden.
          </b>{' '}
          Address corrections, renames and internal references. They stay in the order history, they just
          do not go to the customer.
        </div>
      )}
    </>
  )
}

function UpdateEmail({ state, setState, row }) {
  return (
    <>
      <div>
        <p className="mb-[5px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">Send to</p>
        <div className="flex items-center justify-between gap-3 rounded-[6px] border border-[#a8c5a0] bg-[#f5f8f4] px-[11px] py-[9px]">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[#1a1a18]">{row.name}</p>
            <p className="truncate text-[12px] text-[#5a5a52]">{row.email}</p>
          </div>
        </div>
      </div>

      <label className="block">
        <span className="mb-[5px] block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">Subject</span>
        <input
          className="h-[36px] w-full rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
          value={state.subject}
          onChange={event => setState(current => ({ ...current, subject: event.target.value }))}
        />
      </label>

      <label className="block">
        <span className="mb-[5px] block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">Message</span>
        <textarea
          className="min-h-[320px] w-full resize-y rounded-[6px] border border-[#dbd8cc] bg-white px-3 py-2 text-[13px] leading-[1.6] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
          value={state.body}
          onChange={event => setState(current => ({ ...current, body: event.target.value }))}
        />
      </label>

      <p className="text-[12.5px] leading-[1.5] text-[#8b8a81]">
        Built from the updates in step one. Edit anything before it goes, and add whatever context the
        order history cannot know. What you send is recorded against the customer.
      </p>
    </>
  )
}
