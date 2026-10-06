'use client'

// ASK ALFRED, THE CHAT.
//
// Ask about our records, ask for an email or a batch of them, or ask for a
// change. Every reply is one of these, each drawn its own way:
//
//   answer    plain text, with the facts it used behind a link
//   plan      the email in full: Approve and send, Save to Waiting, Edit email,
//             Discard email
//   batch     the customers, each ticked, and what the emails will say. Drafts
//             go to the Waiting list; nothing is sent from here
//   change    buttons built from the real order: the value, then the items,
//             then every change as from and to, approved by name
//   confirm   the question, with each option a button that answers it
//   cannot    why not, and the proper way, in amber
//   unclear   what it did not follow, with an example
//
// Nothing is sent or changed without a person's name on it. Chats are kept in
// one shared list (supabase/202610061800_pcd_alfred_chats.sql); before that has
// run, a chat is kept in this tab only.
//
// ── ONE CHAT, ONE ID ─────────────────────────────────────────────────────────
//
// The chat open on screen is named in the address (?chat=<id>) and in the tab.
// A refresh opens that same chat from the shared list, and what is said next
// is added to it. It used to keep only the words in the tab and forget which
// chat they were, so every refresh saved them again as a new chat. A new chat
// is made only by New chat, or by the first question on an empty page.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { tableStyles as t } from '@/components/ui/table-styles'
import { AlfredApproval, AlfredMark, ALFRED } from '@/components/admin/AlfredMark'
import { deskReplyEmailHtml } from '../../../lib/pcd-desk-email'
import { toTermsHtml } from '../../../lib/pcd-terms-html'
import { defaultMinutesFor, defaultTitle, formatMinutes } from '../../../lib/pcd-calendar'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
type Turn = {
  role: 'you' | 'alfred'
  text: string
  kind?: 'answer' | 'plan' | 'confirm' | 'cannot' | 'unclear' | 'problem' | 'change' | 'batch' | 'booking'
  options?: string[]
  facts?: string[]
  email?: { customerId: string; subject: string; body: string; toName?: string; toEmail?: string }
  sent?: { by: string; edited: boolean; saved?: boolean } | null
  cancelled?: boolean
  card?: Row
  batch?: { customerIds: string[]; instruction: string; customers?: { id: string; name: string; email: string }[] }
  table?: { columns: string[]; rows: string[][] }
  outcome?: string
}

const STORE = 'pcd.alfred.chat'
const APPROVER_KEY = 'pcd.alfred.approver'
const EXAMPLES = [
  'What is waiting for us today?',
  'Who owes us money?',
  'What is still waiting on Polytec?',
  'Mark the doors on PCD-1042 as ordered',
  'Book an install for Sarah Nguyen',
]

/** The chat kept in this tab: its id, when it has one, and its turns. */
const readLocal = (): { id: string | null; turns: Turn[] } => {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(STORE) || 'null')
    if (Array.isArray(raw)) return { id: null, turns: raw } // kept before ids were
    return { id: raw?.id || null, turns: Array.isArray(raw?.turns) ? raw.turns : [] }
  } catch {
    return { id: null, turns: [] }
  }
}
const writeLocal = (id: string | null, turns: Turn[]) => {
  try {
    window.sessionStorage.setItem(STORE, JSON.stringify({ id, turns: turns.slice(-40) }))
  } catch {
    /* The chat still works for this visit. */
  }
}
/** The chat named in the address, and naming it there without reloading. */
const chatInAddress = () => {
  try {
    return new URLSearchParams(window.location.search).get('chat')
  } catch {
    return null
  }
}
const putChatInAddress = (id: string | null) => {
  try {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('chat', id)
    else url.searchParams.delete('chat')
    window.history.replaceState(null, '', url.toString())
  } catch {
    /* The chat still works; only a refresh would not find it. */
  }
}
const approverName = () => {
  try {
    return window.localStorage.getItem(APPROVER_KEY) || ''
  } catch {
    return ''
  }
}
function when(value: string) {
  return value ? new Date(value).toLocaleString('en-AU', { timeZone: 'Australia/Perth', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''
}

const btn = 'inline-flex h-[30px] items-center whitespace-nowrap rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium hover:bg-[#f5f8f4] disabled:opacity-50'
const btnPrimary = 'inline-flex h-[30px] items-center whitespace-nowrap rounded-[6px] bg-[#1c2b1e] px-3 text-[12px] font-medium text-white hover:bg-[#2d3f2f] disabled:opacity-50'
const btnDanger = 'inline-flex h-[30px] items-center whitespace-nowrap rounded-[6px] border border-[#f0c7c3] bg-white px-3 text-[12px] font-medium text-[#b42318]'

export default function AskAlfred({ asApprover, signature, enabled }: { asApprover: (then: (name: string) => void) => void; signature: string; enabled: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [looking, setLooking] = useState<string[]>([])
  const [chats, setChats] = useState<Row[]>([])
  const [chatId, setChatId] = useState<string | null>(null)
  const [shared, setShared] = useState(true)
  const end = useRef<HTMLDivElement | null>(null)
  const saving = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The chat being kept, read at save time so a second save never starts a
  // second copy of the same chat.
  const idRef = useRef<string | null>(null)
  const creating = useRef(false)

  const [deleting, setDeleting] = useState<string | null>(null)

  const loadChats = useCallback(async () => {
    try {
      const p = await (await fetch('/api/admin/alfred/chats', { cache: 'no-store' })).json()
      if (!p.ok) {
        setShared(false)
        return false
      }
      setChats(p.chats || [])
      return true
    } catch {
      setShared(false)
      return false
    }
  }, [])

  /** Make a chat the one on screen, remembered in the address and the tab. */
  const showChat = useCallback((id: string | null, nextTurns: Turn[]) => {
    idRef.current = id
    setChatId(id)
    setTurns(nextTurns)
    writeLocal(id, nextTurns)
    putChatInAddress(id)
  }, [])

  // On opening: the chat named in the address, or the one this tab was on,
  // read from the shared list so it is the same chat and not a copy of it.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const kept = readLocal()
      const ok = await loadChats()
      if (cancelled) return
      const id = chatInAddress() || kept.id
      if (!ok) {
        setTurns(kept.turns)
        return
      }
      if (!id) return
      try {
        const p = await (await fetch(`/api/admin/alfred/chats/${id}`, { cache: 'no-store' })).json()
        if (cancelled) return
        if (p.ok) showChat(id, p.chat.turns || [])
        else showChat(null, [])
      } catch {
        if (!cancelled) showChat(id, kept.turns)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadChats, showChat])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [turns, looking])

  /** Keep the chat: in the shared list when it exists, in this tab otherwise. */
  const keep = useCallback(
    (next: Turn[]) => {
      writeLocal(idRef.current, next)
      if (!shared || !next.length) return
      if (saving.current) clearTimeout(saving.current)
      saving.current = setTimeout(async () => {
        try {
          const id = idRef.current
          if (id) {
            await fetch(`/api/admin/alfred/chats/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turns: next }) })
          } else if (!creating.current) {
            creating.current = true
            const first = next.find(t => t.role === 'you')?.text || 'Chat'
            const p = await (
              await fetch('/api/admin/alfred/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: first, turns: next, startedBy: approverName() }) })
            ).json()
            if (p.ok) {
              idRef.current = p.chat.id
              setChatId(p.chat.id)
              writeLocal(p.chat.id, next)
              putChatInAddress(p.chat.id)
            }
            creating.current = false
          }
          loadChats()
        } catch {
          /* Kept in this tab regardless. */
          creating.current = false
        }
      }, 400)
    },
    [shared, loadChats]
  )

  const update = (next: Turn[]) => {
    setTurns(next)
    keep(next)
  }

  async function ask(text: string) {
    const question = text.trim()
    if (!question || busy) return
    const next: Turn[] = [...turns, { role: 'you', text: question }]
    setTurns(next)
    setTyped('')
    setBusy(true)
    setLooking([])
    let reply: Turn | null = null
    try {
      const res = await fetch('/api/admin/alfred/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ask', turns: next.filter(t => t.kind !== 'problem').map(t => ({ role: t.role, text: t.outcome ? `${t.text}\n(${t.outcome})` : t.text, email: t.email, table: t.table })) }),
      })
      // One JSON line per event: what Alfred is looking up, then his reply.
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (reader) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line)
          if (event.type === 'looking') setLooking(current => [...current, event.text])
          if (event.type === 'done') reply = event.ok ? { role: 'alfred', ...event.reply } : { role: 'alfred', kind: 'problem', text: event.error || 'Alfred could not answer.' }
        }
      }
    } catch (error: any) {
      reply = { role: 'alfred', kind: 'problem', text: error?.message || 'Alfred could not answer.' }
    } finally {
      setBusy(false)
      setLooking([])
    }
    update([...next, reply || { role: 'alfred', kind: 'problem', text: 'Alfred did not answer. Try again.' }])
  }

  const patchTurn = (index: number, patch: Partial<Turn>) => update(turns.map((t, i) => (i === index ? { ...t, ...patch } : t)))
  const lastQuestion = (index: number) => [...turns.slice(0, index)].reverse().find(t => t.role === 'you')?.text || ''

  async function openChat(id: string) {
    try {
      const p = await (await fetch(`/api/admin/alfred/chats/${id}`, { cache: 'no-store' })).json()
      if (!p.ok) return
      showChat(id, p.chat.turns || [])
    } catch {
      /* Stays on the current chat. */
    }
  }
  function newChat() {
    showChat(null, [])
  }
  async function deleteChat(id: string) {
    setDeleting(null)
    try {
      await fetch(`/api/admin/alfred/chats/${id}`, { method: 'DELETE' })
    } catch {
      /* The list below says whether it went. */
    }
    if (id === idRef.current) showChat(null, [])
    loadChats()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="flex min-w-0 flex-col rounded-[8px] border border-[#dbd8cc] bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-[#edf4eb] px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">Chats</span>
          <button type="button" onClick={newChat} className={btn}>
            New chat
          </button>
        </div>
        <div className="max-h-[220px] overflow-y-auto lg:max-h-[62vh]">
          {!shared ? <p className="m-0 p-3 text-[11.5px] text-[#8b8a81]">Chats are kept in this tab until supabase/202610061800_pcd_alfred_chats.sql is run.</p> : null}
          {shared && !chats.length ? <p className="m-0 p-3 text-[11.5px] text-[#8b8a81]">No chats yet.</p> : null}
          {chats.map(c => (
            <div key={c.id} className={cn('group flex items-start gap-1 border-b border-[#f0eee6] hover:bg-[#f5f8f4]', c.id === chatId && 'bg-[#fbefe6]')}>
              <button type="button" onClick={() => openChat(c.id)} className="block min-w-0 flex-1 px-3 py-2 text-left">
                <span className="line-clamp-2 text-[12.5px] text-[#1a1a18]">{c.title}</span>
                <span className="text-[10.5px] text-[#8b8a81]">
                  {when(c.updated_at)}
                  {c.started_by ? ` · ${c.started_by}` : ''}
                </span>
              </button>
              {deleting === c.id ? (
                <span className="flex flex-col items-end gap-1 py-2 pr-2">
                  <button type="button" onClick={() => deleteChat(c.id)} className="text-[11px] font-semibold text-[#b42318] hover:underline">
                    Delete chat
                  </button>
                  <button type="button" onClick={() => setDeleting(null)} className="text-[11px] text-[#5a5a52] hover:underline">
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeleting(c.id)}
                  aria-label={`Delete the chat "${c.title}"`}
                  className="mr-2 mt-2 rounded-[4px] px-[6px] text-[14px] leading-[20px] text-[#8b8a81] opacity-60 hover:bg-white hover:text-[#b42318] hover:opacity-100 focus:opacity-100"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>

      <div className="flex min-h-[520px] min-w-0 flex-col rounded-[8px] border border-[#dbd8cc] bg-white">
        <div className="border-b border-[#edf4eb] px-4 py-3">
          <p className="m-0 text-[12px] text-[#5a5a52]">
            Ask about orders, quotes, money owing, suppliers or the calendar, ask for emails, or ask for a change to an order. Nothing is sent or changed until you approve it.
          </p>
        </div>

        <div className="flex max-h-[62vh] min-h-[360px] flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          {!turns.length && !busy ? (
            <div className="m-auto flex max-w-[480px] flex-col items-center gap-3 text-center">
              <AlfredMark />
              <p className="m-0 text-[13px] text-[#5a5a52]">Try one of these.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLES.map(e => (
                  <button key={e} type="button" disabled={!enabled} onClick={() => ask(e)} className="rounded-full border border-[#dbd8cc] bg-white px-3 py-[6px] text-[12px] hover:bg-[#f5f8f4] disabled:opacity-50">
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {turns.map((turn, index) =>
            turn.role === 'you' ? (
              <div key={index} className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-[10px] bg-[#1c2b1e] px-3 py-2 text-[13.5px] text-white">
                {turn.text}
              </div>
            ) : (
              <AlfredTurn
                key={index}
                turn={turn}
                latest={index === turns.length - 1}
                busy={busy}
                signature={signature}
                onOption={ask}
                onChange={patch => patchTurn(index, patch)}
                asApprover={asApprover}
                request={lastQuestion(index)}
              />
            )
          )}
          {busy ? (
            <div className="flex flex-col gap-[3px] text-[12px] text-[#8b8a81]">
              {(looking.length ? looking : ['Thinking']).map((l, i) => (
                <span key={i} className={i === looking.length - 1 || !looking.length ? 'text-[#5a5a52]' : ''}>
                  {l}...
                </span>
              ))}
            </div>
          ) : null}
          <div ref={end} />
        </div>

        <form
          className="flex gap-2 border-t border-[#edf4eb] p-3"
          onSubmit={e => {
            e.preventDefault()
            ask(typed)
          }}
        >
          <textarea
            id="ask-alfred"
            rows={2}
            value={typed}
            disabled={!enabled}
            onChange={e => setTyped(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ask(typed)
              }
            }}
            placeholder={enabled ? 'Ask Alfred' : 'Alfred is switched off. Turn him on in Settings, Alfred.'}
            className="min-w-0 flex-1 resize-none rounded-[6px] border border-[#dbd8cc] px-3 py-2 text-[13.5px] outline-none focus:border-[#6b9e61] disabled:bg-[#f5f5f4]"
          />
          <button type="submit" disabled={busy || !typed.trim() || !enabled} className="h-[40px] self-end rounded-[6px] bg-[#1c2b1e] px-4 text-[13px] font-medium text-white hover:bg-[#2d3f2f] disabled:opacity-50">
            Ask
          </button>
        </form>
      </div>
    </div>
  )
}

function AlfredTurn({
  turn,
  latest,
  busy,
  signature,
  onOption,
  onChange,
  asApprover,
  request,
}: {
  turn: Turn
  latest: boolean
  busy: boolean
  signature: string
  onOption: (text: string) => void
  onChange: (patch: Partial<Turn>) => void
  asApprover: (then: (name: string) => void) => void
  request: string
}) {
  const [showFacts, setShowFacts] = useState(false)
  const tone =
    turn.kind === 'cannot'
      ? 'border-[#e8d68f] bg-[#fffdf0] text-[#5f4b08]'
      : turn.kind === 'problem'
        ? 'border-[#fca5a5] bg-[#fef2f2] text-[#991b1b]'
        : 'border-[#ecc4a5] bg-[#fbefe6] text-[#1a1a18]'

  return (
    <div className="flex max-w-[92%] flex-col gap-2">
      <div className={cn('rounded-[10px] border px-3 py-2 text-[13.5px] leading-relaxed', tone)}>
        <span className="mr-2 inline-block align-middle">
          <AlfredMark />
        </span>
        <span className="whitespace-pre-wrap">{turn.text}</span>
      </div>

      {turn.kind === 'confirm' && turn.options?.length ? (
        <div className="flex flex-wrap gap-2">
          {turn.options.map(o => (
            <button
              key={o}
              type="button"
              disabled={!latest || busy}
              onClick={() => onOption(o)}
              className="rounded-full border bg-white px-3 py-[6px] text-[12px] font-semibold disabled:opacity-50"
              style={{ borderColor: ALFRED.border, color: ALFRED.ink }}
            >
              {o}
            </button>
          ))}
        </div>
      ) : null}

      {turn.table?.columns?.length ? <AnswerTable table={turn.table} /> : null}

      {turn.kind === 'plan' && turn.email ? <EmailCard turn={turn} signature={signature} onChange={onChange} asApprover={asApprover} request={request} /> : null}
      {turn.kind === 'change' && turn.card ? <ChangeCard turn={turn} onChange={onChange} asApprover={asApprover} /> : null}
      {turn.kind === 'booking' && turn.card ? <BookingCard turn={turn} onChange={onChange} asApprover={asApprover} /> : null}
      {turn.kind === 'batch' && turn.batch ? <BatchCard turn={turn} onChange={onChange} asApprover={asApprover} /> : null}

      {turn.facts?.length ? (
        <div className="text-[11.5px] text-[#8b8a81]">
          <button type="button" onClick={() => setShowFacts(v => !v)} className="font-semibold underline">
            {showFacts ? 'Hide the facts it used' : 'See the facts it used'}
          </button>
          {showFacts ? (
            <ul className="mt-1 flex flex-col gap-[2px] pl-4">
              {turn.facts.map(f => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/* ── A table ──────────────────────────────────────────────────────────────── */

// The scroll kind from the shared table standards: a fixed height box with the
// header pinned, so a long answer scrolls inside the chat rather than pushing
// it away. Copy table puts it on the clipboard with tabs between the cells,
// which is what Excel and Google Sheets paste as columns.
function AnswerTable({ table }: { table: { columns: string[]; rows: string[][] } }) {
  const { toast } = useToast()
  const money = (value: string) => /^-?\$?[\d,]+(\.\d+)?$/.test(String(value).trim())

  async function copy() {
    const text = [table.columns, ...table.rows].map(row => row.join('\t')).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: 'Table copied. Paste it into Excel or Sheets.', variant: 'success' })
    } catch {
      toast({ title: 'The table could not be copied here. Select it and copy instead.', variant: 'error' })
    }
  }

  return (
    <div className={t.card}>
      <div className="flex items-center justify-between gap-2 border-b border-[#edf4eb] px-3 py-[6px]">
        <span className={t.meta}>
          {table.rows.length} row{table.rows.length === 1 ? '' : 's'}
        </span>
        <button type="button" onClick={copy} className={btn}>
          Copy table
        </button>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className={t.tableWide}>
          <thead>
            <tr>
              {table.columns.map(c => (
                <th key={c} className={cn(t.th, t.thSticky, 'px-3')}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={t.body}>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className={cn(t.td, 'px-3 py-[8px]', money(cell) && cn(t.num, 'text-right'))}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── An email ─────────────────────────────────────────────────────────────── */

function EmailCard({ turn, signature, onChange, asApprover, request }: { turn: Turn; signature: string; onChange: (p: Partial<Turn>) => void; asApprover: (then: (name: string) => void) => void; request: string }) {
  const { toast } = useToast()
  const email = turn.email!
  const [editing, setEditing] = useState(false)
  const [preview, setPreview] = useState(false)
  const [body, setBody] = useState(email.body || '')
  const [sending, setSending] = useState(false)

  async function go(by: string, send: boolean) {
    setSending(true)
    try {
      const res = await fetch('/api/admin/alfred/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email, facts: turn.facts, request, approvedBy: by, bodyText: body, send }),
      })
      const p = await res.json()
      if (!res.ok || !p.ok) {
        toast({ title: p.error || (send ? 'It was not sent.' : 'It was not saved.'), variant: 'error' })
        return
      }
      const edited = body.trim() !== String(email.body || '').trim()
      onChange({ sent: { by, edited, saved: !send }, email: { ...email, body }, outcome: send ? `Sent, approved by ${by}` : 'Saved to the Waiting list' })
      setEditing(false)
      toast({
        title: send ? `Sent to ${email.toEmail || 'the customer'}.` : 'Saved to Waiting for you.',
        description: send ? `Written by Alfred, approved by ${by}${edited ? ', edited before sending' : ''}.` : undefined,
        variant: 'success',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-[8px] border border-[#dbd8cc] bg-white">
      <div className="border-b border-[#edf4eb] px-3 py-2 text-[12px] text-[#5a5a52]">
        To <b className="text-[#1a1a18]">{email.toName || 'the customer'}</b> &lt;{email.toEmail}&gt;
        <div>
          Subject <b className="text-[#1a1a18]">{email.subject}</b>
        </div>
      </div>
      {preview ? (
        <iframe
          title="The email the customer receives"
          sandbox=""
          className="h-[420px] w-full bg-white"
          srcDoc={deskReplyEmailHtml({ bodyHtml: toTermsHtml(body), signatureHtml: toTermsHtml(signature || ''), reference: null, subject: email.subject || '' })}
        />
      ) : editing ? (
        <textarea value={body} onChange={e => setBody(e.target.value)} className="block min-h-[220px] w-full border-0 px-3 py-2 text-[13.5px] leading-relaxed outline-none" />
      ) : (
        <div className="whitespace-pre-wrap px-3 py-2 text-[13.5px] leading-relaxed">{body}</div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-[#edf4eb] px-3 py-2">
        {turn.sent ? (
          turn.sent.saved ? (
            <span className="text-[12px] text-[#5a5a52]">
              Saved to{' '}
              <Link href="/admin/alfred/waiting" className="font-semibold text-[#2d5e28] hover:underline">
                Waiting for you
              </Link>
              . Nothing was sent.
            </span>
          ) : (
            <AlfredApproval approvedBy={turn.sent.by} edited={turn.sent.edited} />
          )
        ) : turn.cancelled ? (
          <span className="text-[12px] text-[#8b8a81]">Discarded. Nothing was sent.</span>
        ) : (
          <>
            <button type="button" onClick={() => onChange({ cancelled: true, outcome: 'Discarded' })} className={cn(btnDanger, 'mr-auto')}>
              Discard email
            </button>
            <button type="button" onClick={() => setPreview(v => !v)} className={btn}>
              {preview ? 'Hide preview' : 'Preview email'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(false)
                setEditing(v => !v)
              }}
              className={btn}
            >
              {editing ? 'Done editing' : 'Edit email'}
            </button>
            <button type="button" disabled={sending || !body.trim()} onClick={() => asApprover(by => go(by, false))} className={btn}>
              Save to Waiting
            </button>
            <button type="button" disabled={sending || !body.trim()} onClick={() => asApprover(by => go(by, true))} className={btnPrimary}>
              {sending ? 'Sending...' : 'Approve and send'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ── A batch of emails ────────────────────────────────────────────────────── */

function BatchCard({ turn, onChange, asApprover }: { turn: Turn; onChange: (p: Partial<Turn>) => void; asApprover: (then: (name: string) => void) => void }) {
  const { toast } = useToast()
  const batch = turn.batch!
  const people = batch.customers || []
  const [picked, setPicked] = useState<string[]>(people.filter(p => p.email).map(p => p.id))
  const [instruction, setInstruction] = useState(batch.instruction)
  const [working, setWorking] = useState(false)
  const done = Boolean(turn.outcome)

  async function draft(by: string) {
    setWorking(true)
    try {
      const res = await fetch('/api/admin/alfred/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch', customerIds: picked, instruction, approvedBy: by }),
      })
      const p = await res.json()
      if (!res.ok || !p.ok) {
        toast({ title: p.error || 'Nothing was drafted.', variant: 'error' })
        return
      }
      const outcome = `${p.drafted.length} drafted to the Waiting list${p.skipped.length ? `, ${p.skipped.length} not drafted` : ''}. Nothing was sent.`
      onChange({ outcome, batch: { ...batch, instruction }, facts: [...(turn.facts || []), ...p.skipped] })
      toast({ title: outcome, description: p.skipped[0], variant: p.skipped.length ? 'warning' : 'success' })
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="rounded-[8px] border border-[#dbd8cc] bg-white">
      <div className="border-b border-[#edf4eb] px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">What each email should say</div>
        {done ? (
          <p className="m-0 text-[13px]">{instruction}</p>
        ) : (
          <textarea value={instruction} onChange={e => setInstruction(e.target.value)} rows={2} className="block w-full rounded-[6px] border border-[#dbd8cc] px-2 py-1 text-[13px] outline-none focus:border-[#6b9e61]" />
        )}
      </div>
      <div className="max-h-[260px] overflow-y-auto">
        {people.map(p => (
          <label key={p.id} className={cn('flex items-center gap-2 border-b border-[#f0eee6] px-3 py-[7px] text-[12.5px]', !p.email && 'text-[#8b8a81]')}>
            <input
              type="checkbox"
              disabled={!p.email || done}
              checked={picked.includes(p.id)}
              onChange={e => setPicked(current => (e.target.checked ? [...current, p.id] : current.filter(id => id !== p.id)))}
            />
            <span className="min-w-0 flex-1">
              {p.name} <span className="text-[#8b8a81]">{p.email || 'no email on their record'}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        {done ? (
          <span className="text-[12px] text-[#5a5a52]">
            {turn.outcome}{' '}
            <Link href="/admin/alfred/waiting" className="font-semibold text-[#2d5e28] hover:underline">
              Open Waiting for you
            </Link>
          </span>
        ) : (
          <>
            <button type="button" onClick={() => onChange({ outcome: 'Discarded. Nothing was drafted.' })} className={cn(btnDanger, 'mr-auto')}>
              Discard
            </button>
            <span className="text-[11.5px] text-[#8b8a81]">Each is written from that customer&apos;s own records and waits for you to check.</span>
            <button type="button" disabled={working || !picked.length || !instruction.trim()} onClick={() => asApprover(by => draft(by))} className={btnPrimary}>
              {working ? 'Drafting...' : `Draft ${picked.length} email${picked.length === 1 ? '' : 's'}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ── A calendar booking ───────────────────────────────────────────────────── */

// The calendar's own booking form, built on the server from real records: the
// calendar's kinds and lengths, and this customer's actual jobs. Alfred's
// reading only fills it in. Nothing can be reviewed until it is clear: a kind,
// a customer for a measure, delivery or install, a day, and a time or all day.
const TIMES = Array.from({ length: (19 - 6) * 4 + 1 }, (_, i) => 6 * 60 + i * 15)

function BookingCard({ turn, onChange, asApprover }: { turn: Turn; onChange: (p: Partial<Turn>) => void; asApprover: (then: (name: string) => void) => void }) {
  const { toast } = useToast()
  const card = turn.card!
  const [draft, setDraft] = useState<Row>(card.draft)
  const [preview, setPreview] = useState<Row | null>(null)
  const [working, setWorking] = useState(false)
  const done = Boolean(turn.outcome)
  const set = (patch: Row) => {
    setPreview(null)
    setDraft(d => ({ ...d, ...patch }))
  }
  const gaps = [
    !draft.kind ? 'Pick what kind of booking it is.' : '',
    ['measure', 'delivery', 'install'].includes(draft.kind) && !draft.customerId ? 'This kind of booking needs a customer. Tell Alfred who it is for.' : '',
    !draft.day ? 'Pick the day.' : '',
    !draft.allDay && (draft.startMinutes === null || draft.startMinutes === undefined || draft.startMinutes === '') ? 'Pick the time, or make it all day.' : '',
  ].filter(Boolean)
  const jobValue = draft.orderId ? `order:${draft.orderId}` : draft.quoteId ? `quote:${draft.quoteId}` : ''
  const field = 'h-[34px] rounded-[6px] border border-[#dbd8cc] bg-white px-2 text-[13px] outline-none focus:border-[#6b9e61]'
  const lbl = 'mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]'

  async function review() {
    setWorking(true)
    try {
      const res = await fetch('/api/admin/alfred/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'booking_preview', card, draft }) })
      const p = await res.json()
      if (!res.ok || !p.ok) {
        toast({ title: p.error || 'That could not be checked.', variant: 'error' })
        return
      }
      setPreview(p.preview)
    } finally {
      setWorking(false)
    }
  }

  async function apply(by: string) {
    setWorking(true)
    try {
      const res = await fetch('/api/admin/alfred/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'booking_apply', card, draft, approvedBy: by }) })
      const p = await res.json()
      if (!res.ok || !p.ok) {
        toast({ title: p.error || 'Nothing was booked.', variant: 'error' })
        if (res.status === 409) setPreview(null)
        return
      }
      onChange({ outcome: `${p.summary} Approved by ${by}.`, card: { ...card, draft, bookingId: p.bookingId || card.bookingId } })
      toast({
        title: card.action === 'edit' ? 'Booking changed.' : 'Booked.',
        description: [p.synced ? 'In the sales mailbox calendar.' : 'Not in the mailbox calendar yet; the calendar page shows why.', p.asked ? 'The customer has been asked to confirm.' : ''].filter(Boolean).join(' '),
        variant: 'success',
      })
    } finally {
      setWorking(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-[8px] border border-[#dbd8cc] bg-white px-3 py-2 text-[12.5px]">
        <span className="inline-flex flex-wrap items-center gap-2">
          <AlfredMark title="Booked through Alfred" /> {turn.outcome}
          <Link href="/admin/calendar" className="font-semibold text-[#2d5e28] hover:underline">
            Open calendar
          </Link>
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-[8px] border border-[#dbd8cc] bg-white">
      <div className="border-b border-[#edf4eb] px-3 py-2 text-[12px] text-[#5a5a52]">
        {card.action === 'edit' ? 'Change a booking' : 'New booking'}
        {card.customer ? (
          <>
            {' '}for{' '}
            <Link href={`/admin/customers/${card.customer.id}`} className="font-semibold text-[#1a1a18] hover:underline">
              {card.customer.name}
            </Link>
          </>
        ) : null}
      </div>

      {preview ? (
        <>
          <div className="px-3 pt-2 text-[12.5px] font-medium">{preview.nothing ? 'Nothing would change.' : preview.summary}</div>
          {preview.rows?.length ? (
            <div className="max-h-[320px] overflow-auto px-3 py-2">
              <table className="w-full text-[12px]">
                <tbody>
                  {preview.rows.map((r: Row) => (
                    <tr key={r.label} className="border-t border-[#f0eee6] align-top first:border-t-0">
                      <td className="w-[130px] py-1 pr-2 text-[#8b8a81]">{r.label}</td>
                      {card.action === 'edit' ? <td className="py-1 pr-2 text-[#8b8a81]">{r.from}</td> : null}
                      <td className="py-1 font-medium">{r.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {preview.notes?.length ? (
            <ul className="mx-3 mb-2 flex list-none flex-col gap-[3px] rounded-[6px] border border-[#e8d68f] bg-[#fffdf0] px-3 py-2 text-[12px] text-[#5f4b08]">
              {preview.notes.map((n: string) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-[#edf4eb] px-3 py-2">
            <button type="button" onClick={() => onChange({ outcome: 'Discarded. Nothing was booked.' })} className={cn(btnDanger, 'mr-auto')}>
              Discard booking
            </button>
            <button type="button" onClick={() => setPreview(null)} className={btn}>
              Change details
            </button>
            <button type="button" disabled={working || preview.nothing} onClick={() => asApprover(by => apply(by))} className={btnPrimary}>
              {working ? 'Saving...' : card.action === 'edit' ? 'Approve and save changes' : 'Approve and book'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 px-3 py-3">
            <div>
              <span className={lbl}>Kind</span>
              <div className="flex flex-wrap gap-2">
                {card.kinds.map((k: Row) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() =>
                      // The length and title follow the kind until somebody changes them, the same as the calendar form.
                      set({
                        kind: k.value,
                        minutes: draft.kind === k.value ? draft.minutes : defaultMinutesFor(k.value),
                        title: !draft.title || draft.title === defaultTitle(draft.kind, draft.customerName) ? defaultTitle(k.value, draft.customerName) : draft.title,
                      })
                    }
                    className={cn('rounded-[6px] border px-3 py-[6px] text-[12px]', draft.kind === k.value ? 'border-[#1c2b1e] bg-[#1c2b1e] text-white' : 'border-[#dbd8cc] bg-white')}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className={lbl}>Job</span>
                <select
                  className={cn(field, 'w-full')}
                  value={jobValue}
                  disabled={!card.customer}
                  onChange={e => {
                    const [kind, id] = e.target.value.split(':')
                    const job = card.jobs.find((j: Row) => j.id === id)
                    set({ orderId: kind === 'order' ? id : null, quoteId: kind === 'quote' ? id : null, siteAddress: draft.siteAddress || job?.siteAddress || '' })
                  }}
                >
                  <option value="">{card.customer ? (card.jobs.length ? 'No job' : 'No open order or quote') : 'No customer'}</option>
                  {card.jobs.map((j: Row) => (
                    <option key={`${j.kind}:${j.id}`} value={`${j.kind}:${j.id}`}>
                      {j.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={lbl}>Day</span>
                <input type="date" className={cn(field, 'w-full')} value={draft.day || ''} onChange={e => set({ day: e.target.value })} />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className={lbl}>Time</span>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={field}
                    disabled={draft.allDay}
                    value={draft.allDay || draft.startMinutes === null || draft.startMinutes === undefined ? '' : String(draft.startMinutes)}
                    onChange={e => set({ startMinutes: e.target.value === '' ? null : Number(e.target.value) })}
                  >
                    <option value="">Pick a time</option>
                    {[...new Set([...TIMES, ...(Number.isFinite(Number(draft.startMinutes)) ? [Number(draft.startMinutes)] : [])])]
                      .sort((a, b) => a - b)
                      .map(m => (
                        <option key={m} value={m}>
                          {formatMinutes(m)}
                        </option>
                      ))}
                  </select>
                  <label className="inline-flex items-center gap-1 text-[12px]">
                    <input type="checkbox" checked={Boolean(draft.allDay)} onChange={e => set({ allDay: e.target.checked })} /> All day
                  </label>
                </div>
              </div>
              {draft.allDay ? null : (
                <div>
                  <span className={lbl}>How long</span>
                  <select className={field} value={String(draft.minutes)} onChange={e => set({ minutes: Number(e.target.value) })}>
                    {card.durations.map((d: Row) => (
                      <option key={d.minutes} value={d.minutes}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <label className="block">
              <span className={lbl}>Title</span>
              <input className={cn(field, 'w-full')} value={draft.title || ''} onChange={e => set({ title: e.target.value })} />
            </label>
            <label className="block">
              <span className={lbl}>Address</span>
              <input className={cn(field, 'w-full')} value={draft.siteAddress || ''} onChange={e => set({ siteAddress: e.target.value })} />
            </label>
            <label className="block">
              <span className={lbl}>Notes</span>
              <textarea rows={2} className="block w-full rounded-[6px] border border-[#dbd8cc] px-2 py-1 text-[13px] outline-none focus:border-[#6b9e61]" value={draft.notes || ''} onChange={e => set({ notes: e.target.value })} />
            </label>

            <div className="flex flex-wrap items-center gap-4 text-[12px]">
              <label className="inline-flex items-center gap-1">
                <input type="checkbox" checked={draft.addToOutlook !== false} onChange={e => set({ addToOutlook: e.target.checked })} /> Add to the sales mailbox calendar
              </label>
              {card.action === 'edit' ? (
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={draft.status === 'done'} onChange={e => set({ status: e.target.checked ? 'done' : 'booked' })} /> Mark as done
                </label>
              ) : null}
            </div>

            {gaps.length ? <p className="m-0 text-[12px] text-[#8a6d0b]">{gaps[0]}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-[#edf4eb] px-3 py-2">
            <button type="button" onClick={() => onChange({ outcome: 'Discarded. Nothing was booked.' })} className={cn(btnDanger, 'mr-auto')}>
              Discard booking
            </button>
            <button type="button" disabled={Boolean(gaps.length) || working} onClick={review} className={btnPrimary}>
              {working ? 'Checking...' : 'Review booking'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ── A change ─────────────────────────────────────────────────────────────── */

function ChangeCard({ turn, onChange, asApprover }: { turn: Turn; onChange: (p: Partial<Turn>) => void; asApprover: (then: (name: string) => void) => void }) {
  const { toast } = useToast()
  const card = turn.card!
  const [value, setValue] = useState<string>(card.value || '')
  const [items, setItems] = useState<string[]>((card.items || []).filter((i: Row) => i.selected).map((i: Row) => i.itemId))
  const [preview, setPreview] = useState<Row | null>(null)
  const [working, setWorking] = useState(false)
  const done = Boolean(turn.outcome)
  const eligible = (card.items || []).filter((i: Row) => i.eligiblePanels)
  const needsItems = card.scope === 'panels'
  const ready = Boolean(String(value).trim()) && (!needsItems || items.length > 0)
  const selection = { field: card.field, recordType: card.recordType, recordId: card.recordId, value, itemIds: items }

  async function review() {
    setWorking(true)
    try {
      const res = await fetch('/api/admin/alfred/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'change_preview', selection }) })
      const p = await res.json()
      if (!res.ok || !p.ok) {
        toast({ title: p.error || 'That could not be checked.', variant: 'error' })
        return
      }
      setPreview(p.preview)
    } finally {
      setWorking(false)
    }
  }

  async function apply(by: string) {
    setWorking(true)
    try {
      const res = await fetch('/api/admin/alfred/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_apply', selection, expected: preview?.rows || [], approvedBy: by }),
      })
      const p = await res.json()
      if (!res.ok || !p.ok) {
        toast({ title: p.error || 'Nothing was changed.', variant: 'error' })
        if (res.status === 409) setPreview(null)
        return
      }
      onChange({ outcome: `${p.summary} Approved by ${by}.` })
      toast({ title: p.summary, description: `Changed through Alfred, approved by ${by}.`, variant: 'success' })
    } finally {
      setWorking(false)
    }
  }

  const recordHref = card.recordType === 'order' ? `/admin/orders/${card.recordId}` : card.recordType === 'quote' ? `/admin/quotes/${card.recordId}` : `/admin/customers/${card.recordId}`

  return (
    <div className="rounded-[8px] border border-[#dbd8cc] bg-white">
      <div className="border-b border-[#edf4eb] px-3 py-2 text-[12px] text-[#5a5a52]">
        {card.fieldLabel} on{' '}
        <Link href={recordHref} className="font-semibold text-[#1a1a18] hover:underline">
          {card.recordLabel}
        </Link>
        {card.now ? <span> · now {card.now}</span> : null}
      </div>

      {done ? (
        <div className="px-3 py-2 text-[12.5px]">
          <span className="inline-flex items-center gap-2">
            <AlfredMark title="Changed through Alfred" /> {turn.outcome}
          </span>
        </div>
      ) : preview ? (
        <>
          <div className="px-3 pt-2 text-[12.5px] font-medium">{preview.nothing ? 'Nothing needs changing: everything picked already holds that value.' : preview.summary}</div>
          {preview.notes?.length ? (
            <ul className="mx-3 mt-2 flex list-none flex-col gap-[3px] rounded-[6px] border border-[#e8d68f] bg-[#fffdf0] px-3 py-2 text-[12px] text-[#5f4b08]">
              {preview.notes.map((n: string) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          {preview.rows?.length ? (
            <div className="max-h-[280px] overflow-auto px-3 py-2">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-[#8b8a81]">
                    <th className="py-1 pr-2 font-semibold">{card.scope === 'panels' ? 'Panel' : card.scope === 'note' ? 'For' : 'Order'}</th>
                    {card.scope === 'note' ? null : <th className="py-1 pr-2 font-semibold">From</th>}
                    <th className="py-1 font-semibold">{card.scope === 'note' ? 'Note added' : 'To'}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r: Row, i: number) => (
                    <tr key={i} className="border-t border-[#f0eee6] align-top">
                      <td className="py-1 pr-2">{r.label}</td>
                      {card.scope === 'note' ? null : <td className="py-1 pr-2 text-[#8b8a81]">{r.from}</td>}
                      <td className="py-1 font-medium">{r.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-[#edf4eb] px-3 py-2">
            <button type="button" onClick={() => onChange({ outcome: 'Discarded. Nothing was changed.' })} className={cn(btnDanger, 'mr-auto')}>
              Discard change
            </button>
            <button type="button" onClick={() => setPreview(null)} className={btn}>
              Change selection
            </button>
            <button type="button" disabled={working || preview.nothing} onClick={() => asApprover(by => apply(by))} className={btnPrimary}>
              {working ? 'Applying...' : 'Approve and apply'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="px-3 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">
              {card.kind === 'choice' ? 'Change it to' : card.kind === 'date' ? 'Date' : card.field === 'note' ? 'Note' : 'Value'}
            </div>
            {card.kind === 'choice' ? (
              <div className="flex flex-wrap gap-2">
                {card.values.map((v: Row) => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => setValue(v.value)}
                    className={cn('rounded-[6px] border px-3 py-[6px] text-[12px]', value === v.value ? 'border-[#1c2b1e] bg-[#1c2b1e] text-white' : 'border-[#dbd8cc] bg-white')}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            ) : card.kind === 'date' ? (
              <input type="date" value={value} onChange={e => setValue(e.target.value)} className="h-[34px] rounded-[6px] border border-[#dbd8cc] px-2 text-[13px] outline-none focus:border-[#6b9e61]" />
            ) : card.field === 'note' ? (
              <textarea value={value} onChange={e => setValue(e.target.value)} rows={3} className="block w-full rounded-[6px] border border-[#dbd8cc] px-2 py-1 text-[13px] outline-none focus:border-[#6b9e61]" />
            ) : (
              <input value={value} onChange={e => setValue(e.target.value)} className="h-[34px] w-full max-w-[280px] rounded-[6px] border border-[#dbd8cc] px-2 text-[13px] outline-none focus:border-[#6b9e61]" />
            )}
          </div>

          {needsItems ? (
            <div className="border-t border-[#edf4eb]">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">Which items</span>
                <button
                  type="button"
                  disabled={!eligible.length}
                  onClick={() => setItems(items.length === eligible.length ? [] : eligible.map((i: Row) => i.itemId))}
                  className={btn}
                >
                  {items.length === eligible.length && eligible.length ? 'Clear all' : `All ${eligible.length} items`}
                </button>
              </div>
              <div className="max-h-[260px] overflow-y-auto py-1">
                {(card.items || []).map((i: Row) => (
                  <label key={i.itemId} className={cn('flex items-start gap-2 px-3 py-[6px] text-[12.5px]', !i.eligiblePanels && 'text-[#8b8a81]')}>
                    <input
                      type="checkbox"
                      className="mt-[3px]"
                      disabled={!i.eligiblePanels}
                      checked={items.includes(i.itemId)}
                      onChange={e => setItems(current => (e.target.checked ? [...current, i.itemId] : current.filter(id => id !== i.itemId)))}
                    />
                    <span className="min-w-0 flex-1">
                      {i.label}
                      <span className="block text-[11px] text-[#8b8a81]">
                        {i.eligiblePanels ? `Now ${i.now}${i.panels > 1 ? ` · ${i.eligiblePanels} of ${i.panels} panels` : ''}` : i.notEligible}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-[#edf4eb] px-3 py-2">
            <button type="button" onClick={() => onChange({ outcome: 'Discarded. Nothing was changed.' })} className={cn(btnDanger, 'mr-auto')}>
              Discard change
            </button>
            <button type="button" disabled={!ready || working} onClick={review} className={btnPrimary}>
              {working ? 'Checking...' : 'Review changes'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
