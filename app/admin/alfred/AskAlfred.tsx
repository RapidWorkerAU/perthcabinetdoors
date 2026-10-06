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

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { AlfredApproval, AlfredMark, ALFRED } from '@/components/admin/AlfredMark'
import { deskReplyEmailHtml } from '../../../lib/pcd-desk-email'
import { toTermsHtml } from '../../../lib/pcd-terms-html'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
type Turn = {
  role: 'you' | 'alfred'
  text: string
  kind?: 'answer' | 'plan' | 'confirm' | 'cannot' | 'unclear' | 'problem' | 'change' | 'batch'
  options?: string[]
  facts?: string[]
  email?: { customerId: string; subject: string; body: string; toName?: string; toEmail?: string }
  sent?: { by: string; edited: boolean; saved?: boolean } | null
  cancelled?: boolean
  card?: Row
  batch?: { customerIds: string[]; instruction: string; customers?: { id: string; name: string; email: string }[] }
  outcome?: string
}

const STORE = 'pcd.alfred.chat'
const APPROVER_KEY = 'pcd.alfred.approver'
const EXAMPLES = [
  'What is waiting for us today?',
  'Who owes us money?',
  'What is still waiting on Polytec?',
  'Mark the doors on PCD-1042 as ordered',
]

const readLocal = (): Turn[] => {
  try {
    const raw = window.sessionStorage.getItem(STORE)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
const writeLocal = (turns: Turn[]) => {
  try {
    window.sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-40)))
  } catch {
    /* The chat still works for this visit. */
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

  const loadChats = useCallback(async () => {
    try {
      const p = await (await fetch('/api/admin/alfred/chats', { cache: 'no-store' })).json()
      if (!p.ok) {
        setShared(false)
        return
      }
      setChats(p.chats || [])
    } catch {
      setShared(false)
    }
  }, [])

  useEffect(() => {
    setTurns(readLocal())
    loadChats()
  }, [loadChats])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [turns, looking])

  /** Keep the chat: in the shared list when it exists, in this tab otherwise. */
  const keep = useCallback(
    (next: Turn[]) => {
      writeLocal(next)
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
        body: JSON.stringify({ action: 'ask', turns: next.filter(t => t.kind !== 'problem').map(t => ({ role: t.role, text: t.outcome ? `${t.text}\n(${t.outcome})` : t.text, email: t.email })) }),
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
      idRef.current = id
      setChatId(id)
      setTurns(p.chat.turns || [])
      writeLocal(p.chat.turns || [])
    } catch {
      /* Stays on the current chat. */
    }
  }
  function newChat() {
    idRef.current = null
    setChatId(null)
    setTurns([])
    writeLocal([])
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
            <button
              key={c.id}
              type="button"
              onClick={() => openChat(c.id)}
              className={cn('block w-full border-b border-[#f0eee6] px-3 py-2 text-left hover:bg-[#f5f8f4]', c.id === chatId && 'bg-[#fbefe6]')}
            >
              <span className="line-clamp-2 text-[12.5px] text-[#1a1a18]">{c.title}</span>
              <span className="text-[10.5px] text-[#8b8a81]">
                {when(c.updated_at)}
                {c.started_by ? ` · ${c.started_by}` : ''}
              </span>
            </button>
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

      {turn.kind === 'plan' && turn.email ? <EmailCard turn={turn} signature={signature} onChange={onChange} asApprover={asApprover} request={request} /> : null}
      {turn.kind === 'change' && turn.card ? <ChangeCard turn={turn} onChange={onChange} asApprover={asApprover} /> : null}
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
