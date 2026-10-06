'use client'

// THE ALFRED PAGE.
//
// Three views behind the second sidebar, each a table in the shared list style
// with filter pills, and everything opening in a pop-up rather than as a long
// list of open emails:
//
//   Waiting for you   drafts to approve or decline
//   Questions         facts Alfred needs before he can draft
//   What Alfred did   everything, newest first, with who approved it
//
// Nothing on this page sends anything except Approve and send, and that needs
// a person's name. The admin is one shared login, so the name is picked once
// per browser and remembered.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { tableStyles as t } from '@/components/ui/table-styles'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { AdminPagination, PAGE_SIZE, useAdminPagination } from '../_components/AdminPagination'
import SecondarySidebar, { SecondarySidebarFrame } from '../_components/SecondarySidebar'
import { AlfredApproval, AlfredMark, ALFRED } from '@/components/admin/AlfredMark'
import { deskReplyEmailHtml } from '../../../lib/pcd-desk-email'
import { toTermsHtml } from '../../../lib/pcd-terms-html'
import AskAlfred from './AskAlfred'
import { DECLINE_REASONS, LESSON_REASONS } from '../../../lib/pcd-alfred-reasons'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
type View = 'waiting' | 'questions' | 'done' | 'ask'

const APPROVER_KEY = 'pcd.alfred.approver'
const KIND_LABEL: Record<string, string> = { reply: 'Reply', update: 'Order update', quote: 'Draft quote', enquiry: 'Enquiry reply', chat: 'Asked for' }
const QUOTE_DELETE_REASONS = ['We are quoting it ourselves', 'Not something we make', 'Spam or a test', 'Needs a site measure first']

function readApprover() {
  try {
    return window.localStorage.getItem(APPROVER_KEY) || ''
  } catch {
    return ''
  }
}
function writeApprover(name: string) {
  try {
    window.localStorage.setItem(APPROVER_KEY, name)
  } catch {
    /* The name still applies for this visit. */
  }
}

function ago(value: string) {
  if (!value) return ''
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 60) return `${minutes || 1} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}
function when(value: string) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-AU', { timeZone: 'Australia/Perth', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

const pill = 'inline-flex items-center rounded-full border px-2 py-[2px] text-[10.5px] font-semibold whitespace-nowrap'

function Pills({ options, value, onChange }: { options: [string, string, number][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {options.map(([key, label, count]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            'inline-flex min-h-[32px] items-center gap-2 rounded-full border px-3 py-[6px] text-[12px] font-medium',
            value === key ? 'border-[#1c2b1e] bg-[#1c2b1e] text-white' : 'border-[#dbd8cc] bg-white text-[#5a5a52] hover:bg-[#f5f8f4]'
          )}
        >
          {label}
          <span className={cn('rounded-full px-[6px] py-[1px] text-[11px] font-semibold', value === key ? 'bg-white/20 text-white' : 'bg-[#edf4eb] text-[#2d5e28]')}>{count}</span>
        </button>
      ))}
    </div>
  )
}

export default function AlfredClient({ view }: { view: View }) {
  const { toast } = useToast()
  const [data, setData] = useState<Row | null>(null)
  const [loadError, setLoadError] = useState('')
  const [setup, setSetup] = useState(false)
  const [approver, setApprover] = useState('')
  const [picking, setPicking] = useState<null | (() => void)>(null)
  const [openDraft, setOpenDraft] = useState<Row | null>(null)
  const [openQuestion, setOpenQuestion] = useState<Row | null>(null)
  const [openDone, setOpenDone] = useState<Row | null>(null)
  const [running, setRunning] = useState(false)
  const [signature, setSignature] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/alfred', { cache: 'no-store' })
      const payload = await res.json()
      if (!payload.ok) {
        setSetup(Boolean(payload.setup))
        setLoadError(payload.error || 'Could not load Alfred.')
        return
      }
      setLoadError('')
      setData(payload)
    } catch (error: any) {
      setLoadError(error?.message || 'Could not load Alfred.')
    }
  }, [])

  useEffect(() => {
    setApprover(readApprover())
    load()
    fetch('/api/admin/business-defaults', { cache: 'no-store' })
      .then(r => r.json())
      .then(p => setSignature(p?.defaults?.email_signature_html || ''))
      .catch(() => {})
  }, [load])

  // Opened from a link elsewhere (the board, the desk): ?draft=<id>.
  useEffect(() => {
    if (!data) return
    const id = new URLSearchParams(window.location.search).get('draft')
    if (id) {
      const found = (data.waiting || []).find((d: Row) => d.id === id)
      if (found) setOpenDraft(found)
    }
  }, [data])

  const customers = useMemo(() => new Map<string, Row>((data?.customers || []).map((c: Row) => [c.id, c])), [data])
  const orders = useMemo(() => new Map<string, Row>((data?.orders || []).map((o: Row) => [o.id, o])), [data])
  const nameOf = (row: Row) => customers.get(row.customer_id)?.name || customers.get(row.customer_id)?.email || row.to_email || 'Unknown'

  /** Run something that needs a person's name, asking for it first if needed. */
  function asApprover(then: (name: string) => void) {
    const name = approver || readApprover()
    if (name) return then(name)
    setPicking(() => () => then(readApprover()))
  }

  async function runNow(job: 'replies' | 'updates' = 'replies') {
    setRunning(true)
    try {
      const res = await fetch('/api/admin/alfred/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job }) })
      const p = await res.json()
      if (!p.enabled) toast({ title: 'Alfred is switched off. Turn him on in Settings, Alfred.', variant: 'warning' })
      else
        toast({
          title: `${p.drafts} drafted${p.quotes ? `, ${p.quotes} draft quote${p.quotes === 1 ? '' : 's'}` : ''}, ${p.questions} question${p.questions === 1 ? '' : 's'}${job === 'replies' ? `, ${p.skipped} skipped` : ''}.`,
          description: p.problems?.[0],
          variant: p.problems?.length ? 'warning' : 'success',
        })
      await load()
    } catch (error: any) {
      toast({ title: error?.message || 'The check failed.', variant: 'error' })
    } finally {
      setRunning(false)
    }
  }

  const waiting: Row[] = data?.waiting || []
  const openQuestions: Row[] = (data?.questions || []).filter((q: Row) => q.status === 'open')
  const settings = data?.settings
  const usage = data?.usage
  const lastRun = data?.runs?.[0]

  const items = [
    { href: '/admin/alfred/waiting', label: 'Waiting for you', count: waiting.length },
    { href: '/admin/alfred/questions', label: 'Questions', count: openQuestions.length },
    { href: '/admin/alfred/done', label: 'What Alfred did' },
    { href: '/admin/alfred/ask', label: 'Ask Alfred' },
  ]

  const title = view === 'waiting' ? 'Waiting for you' : view === 'questions' ? 'Questions' : view === 'ask' ? 'Ask Alfred' : 'What Alfred did'
  const note =
    view === 'waiting'
      ? 'Everything Alfred has prepared. Nothing is sent until you approve it.'
      : view === 'questions'
        ? 'Alfred asks when a fact is missing rather than guess. Answer and he drafts from it.'
        : view === 'ask'
          ? 'Questions about our records, and emails to approve.'
          : 'Everything Alfred has done, newest first.'

  return (
    <SecondarySidebarFrame
      sidebar={<SecondarySidebar eyebrow="Assistant" items={items} backHref="/admin/dashboard" backLabel="Dashboard" ariaLabel="Alfred" />}
    >
      <div className="min-h-full bg-[#f5f8f4] p-4 md:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-[20px] font-bold text-[#1a1a18]">
              {title} <AlfredMark />
            </h1>
            <p className="mt-[2px] text-[13px] text-[#5a5a52]">{note}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {settings ? (
              <span
                className={cn(pill, settings.enabled ? 'border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28]' : 'border-[#dbd8cc] bg-[#f5f5f4] text-[#5a5a52]')}
              >
                {settings.enabled ? `On${lastRun ? ` · last checked ${when(lastRun.started_at)}` : ''}` : 'Switched off'}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setPicking(() => () => setApprover(readApprover()))}
              className="h-[32px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium text-[#5a5a52] hover:bg-[#f5f8f4]"
            >
              {approver ? <>Approving as <b className="text-[#1a1a18]">{approver}</b></> : 'Choose who is approving'}
            </button>
            <button
              type="button"
              onClick={() => runNow('replies')}
              disabled={running || !settings?.enabled}
              className="h-[32px] whitespace-nowrap rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50"
            >
              {running ? 'Checking...' : 'Check emails and requests now'}
            </button>
            <button
              type="button"
              onClick={() => runNow('updates')}
              disabled={running || !settings?.enabled || !settings?.jobs?.updates}
              className="h-[32px] whitespace-nowrap rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50"
            >
              {running ? 'Checking...' : 'Check orders now'}
            </button>
            <Link href="/admin/settings?tab=alfred" className="h-[32px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium leading-[32px] text-[#1a1a18] hover:bg-[#f5f8f4]">
              Alfred settings
            </Link>
          </div>
        </div>

        {usage && settings ? (
          <p className="mb-4 text-[11.5px] text-[#8b8a81]">
            Today {usage.draftsToday} of {settings.daily_draft_cap} drafts · This month US${Number(usage.spentThisMonth).toFixed(2)} of US${settings.monthly_spend_cap_usd}
          </p>
        ) : null}

        {loadError ? (
          <div className="mb-4 rounded-[8px] border border-[#fca5a5] bg-[#fef2f2] px-4 py-3 text-[13px] text-[#991b1b]">
            {setup ? `${loadError}` : loadError}
          </div>
        ) : null}

        {!data && !loadError ? <div className={cn(t.card, t.empty)}>Loading...</div> : null}

        {data && view === 'waiting' ? <WaitingTable rows={waiting} nameOf={nameOf} orders={orders} onOpen={setOpenDraft} /> : null}
        {data && view === 'questions' ? <QuestionsTable rows={data.questions || []} nameOf={nameOf} onOpen={setOpenQuestion} /> : null}
        {data && view === 'ask' ? <AskAlfred asApprover={asApprover} signature={signature} enabled={Boolean(settings?.enabled)} /> : null}
        {data && view === 'done' ? <DoneTable rows={data.decided || []} questions={data.questions || []} nameOf={nameOf} onOpen={setOpenDone} /> : null}
      </div>

      {openDraft?.kind === 'quote' ? (
        <QuoteDraftModal
          draft={openDraft}
          name={nameOf(openDraft)}
          onClose={() => setOpenDraft(null)}
          asApprover={asApprover}
          onDone={async () => {
            setOpenDraft(null)
            await load()
          }}
        />
      ) : openDraft ? (
        <DraftModal
          draft={openDraft}
          name={nameOf(openDraft)}
          order={orders.get(openDraft.order_id)}
          signature={signature}
          onClose={() => setOpenDraft(null)}
          asApprover={asApprover}
          onDone={async () => {
            setOpenDraft(null)
            await load()
          }}
        />
      ) : null}
      {openQuestion ? (
        <QuestionModal
          question={openQuestion}
          name={nameOf(openQuestion)}
          onClose={() => setOpenQuestion(null)}
          asApprover={asApprover}
          onDone={async () => {
            setOpenQuestion(null)
            await load()
          }}
        />
      ) : null}
      {openDone ? <DoneModal row={openDone} name={nameOf(openDone)} onClose={() => setOpenDone(null)} /> : null}
      {picking ? (
        <ApproverModal
          names={settings?.approvers || ['Jason', 'Ashleigh']}
          current={approver}
          onPick={name => {
            writeApprover(name)
            setApprover(name)
            const next = picking
            setPicking(null)
            next?.()
          }}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </SecondarySidebarFrame>
  )
}

/* ── Tables ─────────────────────────────────────────────────────────────── */

function WaitingTable({ rows, nameOf, orders, onOpen }: { rows: Row[]; nameOf: (r: Row) => string; orders: Map<string, Row>; onOpen: (r: Row) => void }) {
  const [filter, setFilter] = useState('all')
  const kinds = [...new Set(rows.map(r => r.kind))]
  const shown = filter === 'all' ? rows : rows.filter(r => r.kind === filter)
  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(shown, filter, PAGE_SIZE)
  return (
    <>
      <Pills
        options={[['all', 'All', rows.length], ...kinds.map(k => [k, KIND_LABEL[k] || k, rows.filter(r => r.kind === k).length] as [string, string, number])]}
        value={filter}
        onChange={setFilter}
      />
      <div className={t.card}>
        <div className={t.sideScroll}>
          <table className={t.table}>
            <thead>
              <tr>
                <th className={t.th}>Type</th>
                <th className={t.th}>Customer</th>
                <th className={t.th}>Subject</th>
                <th className={t.th}>Why Alfred made it</th>
                <th className={t.th}>Waiting</th>
                <th className={t.th}></th>
              </tr>
            </thead>
            <tbody className={t.body}>
              {pageItems.length ? (
                pageItems.map(row => (
                  <tr key={row.id} className="cursor-pointer transition-colors hover:bg-[#f5f8f4]" onClick={() => onOpen(row)}>
                    <td className={cn(t.td, 'whitespace-nowrap')}>{KIND_LABEL[row.kind] || row.kind}</td>
                    <td className={cn(t.td, 'font-medium')}>
                      {nameOf(row)}
                      {orders.get(row.order_id) ? <div className="font-mono text-[11px] text-[#8b8a81]">{orders.get(row.order_id)?.order_number}</div> : null}
                    </td>
                    <td className={t.td}>{row.subject}</td>
                    <td className={cn(t.td, 'max-w-[360px] text-[12.5px] text-[#5a5a52]')}>
                      <span className="line-clamp-2">{row.problem ? <b className="text-[#991b1b]">{row.problem} </b> : null}{row.why}</span>
                    </td>
                    <td className={cn(t.td, 'whitespace-nowrap')}>{ago(row.created_at)}</td>
                    <td className={cn(t.td, 'w-[1%] whitespace-nowrap text-right')}>
                      <button type="button" className="inline-flex h-[26px] items-center justify-center whitespace-nowrap rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[11px] font-medium hover:bg-[#f5f8f4]">
                        Open draft
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className={t.empty}>Nothing waiting. Alfred checks every hour through the working day.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <AdminPagination label="drafts" page={page} pageCount={pageCount} totalItems={totalItems} onPageChange={setPage} />
      </div>
    </>
  )
}

function QuestionsTable({ rows, nameOf, onOpen }: { rows: Row[]; nameOf: (r: Row) => string; onOpen: (r: Row) => void }) {
  const [filter, setFilter] = useState('open')
  const shown = rows.filter(r => (filter === 'open' ? r.status === 'open' : r.status === 'answered'))
  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(shown, filter, PAGE_SIZE)
  return (
    <>
      <Pills
        options={[
          ['open', 'Waiting for an answer', rows.filter(r => r.status === 'open').length],
          ['answered', 'Answered', rows.filter(r => r.status === 'answered').length],
        ]}
        value={filter}
        onChange={setFilter}
      />
      <div className={t.card}>
        <div className={t.sideScroll}>
          <table className={t.table}>
            <thead>
              <tr>
                <th className={t.th}>Question</th>
                <th className={t.th}>Customer</th>
                <th className={t.th}>Asked</th>
                <th className={t.th}>{filter === 'open' ? '' : 'Answer'}</th>
              </tr>
            </thead>
            <tbody className={t.body}>
              {pageItems.length ? (
                pageItems.map(row => (
                  <tr key={row.id} className="cursor-pointer transition-colors hover:bg-[#f5f8f4]" onClick={() => onOpen(row)}>
                    <td className={cn(t.td, 'font-medium')}>{row.question}</td>
                    <td className={t.td}>{nameOf(row)}</td>
                    <td className={cn(t.td, 'whitespace-nowrap')}>{ago(row.created_at)} ago</td>
                    <td className={cn(t.td, filter === 'open' ? 'w-[1%] whitespace-nowrap text-right' : 'text-[12.5px] text-[#5a5a52]')}>
                      {filter === 'open' ? (
                        <button type="button" className="inline-flex h-[26px] items-center justify-center whitespace-nowrap rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[11px] font-medium hover:bg-[#f5f8f4]">
                          Open question
                        </button>
                      ) : (
                        `${row.answered_by}: ${row.answer}`
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className={t.empty}>{filter === 'open' ? 'No questions waiting.' : 'Nothing answered yet.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <AdminPagination label="questions" page={page} pageCount={pageCount} totalItems={totalItems} onPageChange={setPage} />
      </div>
    </>
  )
}

function outcome(row: Row) {
  if (row.status === 'approved') return <AlfredApproval approvedBy={row.decided_by} edited={row.edited_before_send} />
  if (row.status === 'declined' && row.decided_by === 'Alfred') return <span className={cn(pill, 'border-[#dbd8cc] bg-[#f5f5f4] text-[#5a5a52]')}>Skipped</span>
  if (row.status === 'declined') return <span className={cn(pill, 'border-[#fca5a5] bg-[#fef2f2] text-[#991b1b]')}>Declined by {row.decided_by}</span>
  if (row.status === 'withdrawn') return <span className={cn(pill, 'border-[#e8d68f] bg-[#fffdf0] text-[#8a6d0b]')}>Withdrawn</span>
  return <span className={cn(pill, 'border-[#fca5a5] bg-[#fef2f2] text-[#991b1b]')}>Failed</span>
}

function DoneTable({ rows, questions, nameOf, onOpen }: { rows: Row[]; questions: Row[]; nameOf: (r: Row) => string; onOpen: (r: Row) => void }) {
  const [filter, setFilter] = useState('all')
  const skipped = (r: Row) => r.status === 'declined' && r.decided_by === 'Alfred'
  const asked: Row[] = questions.map(q => ({ ...q, _question: true, updated_at: q.answered_at || q.created_at }))
  const all: Row[] = [...rows, ...asked].sort((a: Row, b: Row) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))
  const inFilter = (f: string, r: Row): boolean => {
    if (f === 'all') return true
    if (f === 'sent') return r.status === 'approved'
    if (f === 'declined') return r.status === 'declined' && !skipped(r)
    if (f === 'skipped') return skipped(r)
    if (f === 'asked') return Boolean(r._question)
    return r.status === 'withdrawn' && !r._question
  }
  const shown = all.filter(r => inFilter(filter, r))
  const count = (f: string) => all.filter(r => inFilter(f, r)).length
  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(shown, filter, PAGE_SIZE)
  return (
    <>
      <Pills
        options={[
          ['all', 'All', count('all')],
          ['sent', 'Sent', count('sent')],
          ['declined', 'Declined', count('declined')],
          ['skipped', 'Skipped', count('skipped')],
          ['asked', 'Asked you', count('asked')],
          ['withdrawn', 'Withdrawn', count('withdrawn')],
        ]}
        value={filter}
        onChange={setFilter}
      />
      <div className={t.card}>
        <div className={t.sideScroll}>
          <table className={t.table}>
            <thead>
              <tr>
                <th className={t.th}>When</th>
                <th className={t.th}>What Alfred did</th>
                <th className={t.th}>Customer</th>
                <th className={t.th}>Outcome</th>
              </tr>
            </thead>
            <tbody className={t.body}>
              {pageItems.length ? (
                pageItems.map(row => (
                  <tr key={`${row._question ? 'q' : 'd'}${row.id}`} className="cursor-pointer transition-colors hover:bg-[#f5f8f4]" onClick={() => onOpen(row)}>
                    <td className={cn(t.td, 'whitespace-nowrap font-mono text-[12px]')}>{when(row.updated_at || row.created_at)}</td>
                    <td className={t.td}>{row._question ? `Asked: ${row.question}` : `${KIND_LABEL[row.kind] || row.kind}: ${row.subject || ''}`}</td>
                    <td className={t.td}>{nameOf(row)}</td>
                    <td className={t.td}>
                      {row._question ? (
                        <span className={cn(pill, row.status === 'answered' ? 'border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28]' : 'border-[#bfdbfe] bg-[#eff6ff] text-[#1e40af]')}>
                          {row.status === 'answered' ? `Answered by ${row.answered_by}` : 'Waiting for an answer'}
                        </span>
                      ) : (
                        outcome(row)
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className={t.empty}>Nothing yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <AdminPagination label="entries" page={page} pageCount={pageCount} totalItems={totalItems} onPageChange={setPage} />
      </div>
    </>
  )
}

/* ── Pop-ups ────────────────────────────────────────────────────────────── */

const box = 'rounded-[8px] border border-[#dbd8cc] bg-[#f5f8f4] p-4'
const lbl = 'mb-[6px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]'

function DraftModal({
  draft,
  name,
  order,
  signature,
  onClose,
  asApprover,
  onDone,
}: {
  draft: Row
  name: string
  order?: Row
  signature: string
  onClose: () => void
  asApprover: (then: (name: string) => void) => void
  onDone: () => Promise<void>
}) {
  const { toast } = useToast()
  const [text, setText] = useState(String(draft.body_text || ''))
  const [preview, setPreview] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const edited = text.trim() !== String(draft.body_text || '').trim()

  async function act(action: 'approve' | 'decline', by: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/alfred/drafts/${draft.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, approvedBy: by, bodyText: text, reason }),
      })
      const p = await res.json()
      if (!res.ok || !p.ok) {
        toast({ title: p.error || 'That did not work.', variant: 'error' })
        if (res.status === 409) await onDone()
        return
      }
      toast({
        title: action === 'approve' ? `Sent to ${draft.to_email}.` : 'Draft declined. Nothing was sent.',
        description:
          action === 'approve'
            ? `Written by Alfred, approved by ${by}${edited ? ', edited before sending' : ''}.`
            : LESSON_REASONS.includes(reason)
              ? `Alfred will learn from this: ${reason}.`
              : undefined,
        variant: 'success',
      })
      await onDone()
    } finally {
      setBusy(false)
    }
  }

  const footer = declining ? (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      <button type="button" className="h-[34px] rounded-[6px] border border-[#dbd8cc] bg-white px-4 text-[13px] font-medium" onClick={() => setDeclining(false)}>
        Keep draft
      </button>
      <button
        type="button"
        disabled={!reason || busy}
        className="h-[34px] rounded-[6px] border border-[#f0c7c3] bg-white px-4 text-[13px] font-medium text-[#b42318] disabled:opacity-50"
        onClick={() => asApprover(by => act('decline', by))}
      >
        Decline draft
      </button>
    </div>
  ) : (
    <div className="flex w-full flex-wrap items-center gap-2">
      <button type="button" className="mr-auto h-[34px] rounded-[6px] border border-[#f0c7c3] bg-white px-4 text-[13px] font-medium text-[#b42318]" onClick={() => setDeclining(true)}>
        Decline draft
      </button>
      <button type="button" className="h-[34px] rounded-[6px] border border-[#dbd8cc] bg-white px-4 text-[13px] font-medium" onClick={() => setPreview(v => !v)}>
        {preview ? 'Edit email' : 'Preview email'}
      </button>
      <button
        type="button"
        disabled={busy || !text.trim()}
        className="h-[34px] rounded-[6px] bg-[#1c2b1e] px-4 text-[13px] font-medium text-white hover:bg-[#2d3f2f] disabled:opacity-50"
        onClick={() => asApprover(by => act('approve', by))}
      >
        {busy ? 'Sending...' : 'Approve and send'}
      </button>
    </div>
  )

  return (
    <Modal open onClose={onClose} size="xl" className="md:!w-[920px] md:!max-w-[94vw]" title={`${draft.kind === 'update' ? 'Update for' : draft.kind === 'enquiry' ? 'Enquiry reply to' : 'Reply to'} ${name}`} subtitle={`${draft.subject || ''} · waiting ${ago(draft.created_at)}`} footer={footer}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-[12px] text-[#8b8a81]">
            To <b className="text-[#3a3a34]">{name}</b> &lt;{draft.to_email}&gt; · from our sales email, in the same layout as a reply from the customer page
          </p>
          {preview ? (
            <iframe
              title="The email the customer receives"
              sandbox=""
              className="h-[520px] w-full rounded-[8px] border border-[#dbd8cc] bg-white"
              srcDoc={deskReplyEmailHtml({ bodyHtml: toTermsHtml(text), signatureHtml: toTermsHtml(signature || ''), reference: null, subject: draft.subject || '' })}
            />
          ) : (
            <textarea
              id="alfred-draft-body"
              value={text}
              onChange={e => setText(e.target.value)}
              className="min-h-[320px] w-full rounded-[6px] border border-[#dbd8cc] bg-white px-3 py-2 text-[14px] leading-relaxed text-[#1a1a18] outline-none focus:border-[#6b9e61]"
            />
          )}
          {edited ? <span className="self-start rounded-full border border-[#dbd8cc] bg-[#f5f5f4] px-2 py-[2px] text-[10.5px] text-[#5a5a52]">Edited</span> : null}
          {draft.problem ? <p className="text-[12px] text-[#991b1b]">{draft.problem}</p> : null}
          {declining ? (
            <div className={box}>
              <div className={lbl}>Why not?</div>
              <div className="flex flex-wrap gap-2">
                {DECLINE_REASONS.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={cn('rounded-[6px] border px-3 py-[6px] text-[12px]', reason === r ? 'border-[#1c2b1e] bg-[#1c2b1e] text-white' : 'border-[#dbd8cc] bg-white')}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-[#8b8a81]">Nothing is sent. Alfred will not draft this one again.</p>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          <div className={box}>
            <div className={lbl}>Checks</div>
            <ul className="m-0 flex list-none flex-col gap-[5px] p-0 text-[12px]">
              {(draft.checks || []).map((c: string) => (
                <li key={c} className="relative pl-5">
                  <span className="absolute left-0 font-bold text-[#2d5e28]">✓</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div className={box}>
            <div className={lbl}>Why Alfred made this</div>
            <p className="m-0 text-[12.5px]">{draft.why}</p>
          </div>
          <div className={box}>
            <div className={lbl}>Facts Alfred used</div>
            <ul className="m-0 flex flex-col gap-[3px] pl-4 text-[12.5px]">
              {(draft.facts || []).map((f: string) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            {draft.customer_id ? (
              <Link href={`/admin/customers/${draft.customer_id}`} className="h-[30px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium leading-[30px] hover:bg-[#f5f8f4]">
                Open customer
              </Link>
            ) : null}
            {order ? (
              <Link href={`/admin/orders/${draft.order_id}`} className="h-[30px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium leading-[30px] hover:bg-[#f5f8f4]">
                Open {order.order_number}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/**
 * A draft quote. There is no email here: the quote is checked, priced where
 * Alfred could not, and sent from the quote the normal way. Deleting it puts
 * the request back on the list.
 */
function QuoteDraftModal({
  draft,
  name,
  onClose,
  asApprover,
  onDone,
}: {
  draft: Row
  name: string
  onClose: () => void
  asApprover: (then: (name: string) => void) => void
  onDone: () => Promise<void>
}) {
  const { toast } = useToast()
  const [deleting, setDeleting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const notes: Row[] = Array.isArray(draft.line_notes) ? draft.line_notes : []

  async function remove(by: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/alfred/drafts/${draft.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decline', approvedBy: by, reason }),
      })
      const p = await res.json()
      if (!res.ok || !p.ok) {
        toast({ title: p.error || 'That did not work.', variant: 'error' })
        if (res.status === 409) await onDone()
        return
      }
      toast({ title: 'Draft quote deleted. The request is back on the list.', variant: 'success' })
      await onDone()
    } finally {
      setBusy(false)
    }
  }

  const footer = deleting ? (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      <button type="button" className="h-[34px] rounded-[6px] border border-[#dbd8cc] bg-white px-4 text-[13px] font-medium" onClick={() => setDeleting(false)}>
        Keep draft
      </button>
      <button
        type="button"
        disabled={!reason || busy}
        className="h-[34px] rounded-[6px] border border-[#f0c7c3] bg-white px-4 text-[13px] font-medium text-[#b42318] disabled:opacity-50"
        onClick={() => asApprover(by => remove(by))}
      >
        {busy ? 'Deleting...' : 'Delete draft quote'}
      </button>
    </div>
  ) : (
    <div className="flex w-full flex-wrap items-center gap-2">
      <button type="button" className="mr-auto h-[34px] rounded-[6px] border border-[#f0c7c3] bg-white px-4 text-[13px] font-medium text-[#b42318]" onClick={() => setDeleting(true)}>
        Delete draft quote
      </button>
      {draft.quote_id ? (
        <Link href={`/admin/quotes/${draft.quote_id}`} className="inline-flex h-[34px] items-center rounded-[6px] bg-[#1c2b1e] px-4 text-[13px] font-medium text-white hover:bg-[#2d3f2f]">
          Open draft quote
        </Link>
      ) : null}
    </div>
  )

  return (
    <Modal open onClose={onClose} size="lg" title={`Draft quote for ${name}`} subtitle={`${draft.subject || ''} · waiting ${ago(draft.created_at)}`} footer={footer}>
      <div className={cn(box, 'text-[12.5px]')}>{draft.why}</div>
      <p className="m-0 text-[12px] text-[#5a5a52]">Nothing has been sent. Check it, price anything Alfred could not, and send it from the quote.</p>
      <div className={box}>
        <div className={lbl}>What Alfred found</div>
        <ul className="m-0 flex flex-col gap-[3px] pl-4 text-[12.5px]">
          {(draft.facts || []).map((f: string) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
      {notes.length ? (
        <div className={box}>
          <div className={lbl}>Alfred&apos;s line notes</div>
          <ul className="m-0 flex list-none flex-col gap-[5px] p-0 text-[12.5px]">
            {notes.map((n: Row) => (
              <li key={`${n.index}`}>
                <b>Line {Number(n.index) + 1}:</b> {n.note}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-[#8b8a81]">Also on the quote, behind the bow tie beside each line&apos;s notes.</p>
        </div>
      ) : null}
      {deleting ? (
        <div className={box}>
          <div className={lbl}>Why delete it?</div>
          <div className="flex flex-wrap gap-2">
            {QUOTE_DELETE_REASONS.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={cn('rounded-[6px] border px-3 py-[6px] text-[12px]', reason === r ? 'border-[#1c2b1e] bg-[#1c2b1e] text-white' : 'border-[#dbd8cc] bg-white')}
              >
                {r}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[#8b8a81]">The draft quote is deleted and the request goes back on the list. Alfred will not draft it again.</p>
        </div>
      ) : null}
    </Modal>
  )
}

function QuestionModal({
  question,
  name,
  onClose,
  asApprover,
  onDone,
}: {
  question: Row
  name: string
  onClose: () => void
  asApprover: (then: (name: string) => void) => void
  onDone: () => Promise<void>
}) {
  const { toast } = useToast()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const answered = question.status !== 'open'

  async function send(answer: string, by: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/alfred/questions/${question.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer, answeredBy: by }),
      })
      const p = await res.json()
      if (!res.ok || !p.ok) {
        toast({ title: p.error || 'That did not work.', variant: 'error' })
        if (res.status !== 502) return
      } else {
        toast({ title: p.made === 'draft' ? 'Alfred drafted a reply from your answer. Check it and approve it.' : 'Answer saved.', variant: 'success' })
        // Straight to the draft the answer made, so it can be checked now.
        if (p.made === 'draft' && p.draftId) {
          window.location.assign(`/admin/alfred/waiting?draft=${p.draftId}`)
          return
        }
      }
      await onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={question.question}
      subtitle={`${name} · asked ${ago(question.created_at)} ago`}
      footer={
        <button type="button" className="h-[34px] rounded-[6px] border border-[#dbd8cc] bg-white px-4 text-[13px] font-medium" onClick={onClose}>
          Close
        </button>
      }
    >
      {question.why ? <div className={cn(box, 'text-[12.5px]')}>{question.why}</div> : null}
      {!answered ? (
        <p className="m-0 text-[12px] text-[#5a5a52]">
          Your answer is not sent to the customer. Alfred uses it as a fact and drafts a reply, which waits for you to check
          and approve.
        </p>
      ) : null}
      {answered ? (
        <p className="text-[13px]">
          {question.answered_by} answered: <b>{question.answer}</b>
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(question.options || []).map((o: string) => (
              <button
                key={o}
                type="button"
                disabled={busy}
                onClick={() => asApprover(by => send(o, by))}
                className="rounded-full border px-3 py-[6px] text-[12px] font-semibold disabled:opacity-50"
                style={{ borderColor: ALFRED.border, color: ALFRED.ink, background: '#fff' }}
              >
                {o}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              id="alfred-question-answer"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder="Or type an answer"
              className="h-[36px] min-w-0 flex-1 rounded-[6px] border border-[#dbd8cc] px-3 text-[13px] outline-none focus:border-[#6b9e61]"
            />
            <button
              type="button"
              disabled={busy || !typed.trim()}
              onClick={() => asApprover(by => send(typed.trim(), by))}
              className="h-[36px] rounded-[6px] bg-[#1c2b1e] px-4 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Sending...' : 'Send answer'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

function DoneModal({ row, name, onClose }: { row: Row; name: string; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={row._question ? row.question : `${KIND_LABEL[row.kind] || row.kind} to ${name}`}
      subtitle={when(row.updated_at || row.created_at)}
      footer={
        <button type="button" className="h-[34px] rounded-[6px] border border-[#dbd8cc] bg-white px-4 text-[13px] font-medium" onClick={onClose}>
          Close
        </button>
      }
    >
      {row._question ? (
        <p className="text-[13px]">{row.status === 'answered' ? `${row.answered_by} answered: ${row.answer}` : 'Still waiting for an answer.'}</p>
      ) : (
        <>
          <div>{outcome(row)}</div>
          {row.decline_reason ? <p className="text-[13px] text-[#5a5a52]">{row.decline_reason}</p> : null}
          {row.problem ? <p className="text-[13px] text-[#5a5a52]">{row.problem}</p> : null}
          {row.body_text ? <div className={cn(box, 'whitespace-pre-wrap text-[13px]')}>{row.body_text}</div> : null}
          {row.kind === 'quote' && (row.facts || []).length ? (
            <ul className="m-0 flex flex-col gap-[3px] pl-4 text-[12.5px]">
              {(row.facts || []).map((f: string) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : null}
          {row.kind === 'quote' && row.quote_id ? (
            <Link href={`/admin/quotes/${row.quote_id}`} className="text-[12px] font-semibold text-[#2d5e28] hover:underline">
              Open quote
            </Link>
          ) : null}
          {row.customer_id ? (
            <Link href={`/admin/customers/${row.customer_id}`} className="text-[12px] font-semibold text-[#2d5e28] hover:underline">
              Open customer
            </Link>
          ) : null}
        </>
      )}
    </Modal>
  )
}

function ApproverModal({ names, current, onPick, onClose }: { names: string[]; current: string; onPick: (n: string) => void; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} size="sm" title="Who is approving?" subtitle="This browser remembers it. Anything you approve or decline records your name.">
      <div className="flex flex-col gap-2">
        {names.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            className={cn('h-[40px] rounded-[6px] text-[13px] font-medium', n === current ? 'bg-[#1c2b1e] text-white' : 'border border-[#dbd8cc] bg-white hover:bg-[#f5f8f4]')}
          >
            {n}
          </button>
        ))}
      </div>
    </Modal>
  )
}
