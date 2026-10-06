'use client'

// SETTINGS > ALFRED.
//
// The switch at the top, each job, and the limits. Every job reads these before
// it does anything, so switching Alfred off stops everything at once.
//
// THERE IS NO "SEND WITHOUT APPROVAL" SWITCH. It is shown, locked, so nobody
// goes looking for it. Every customer email needs a person.

import { useEffect, useState } from 'react'
import { AlfredMark } from '@/components/admin/AlfredMark'

/* eslint-disable @typescript-eslint/no-explicit-any */
const tw = {
  card: 'overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white',
  head: 'border-b border-[#edf4eb] bg-[#f5f8f4] px-4 py-[10px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]',
  row: 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 border-b border-[#edf4eb] last:border-b-0',
  label: 'block text-[13px] font-medium text-[#1a1a18]',
  hint: 'mt-[2px] block text-[11px] leading-snug text-[#8b8a81]',
  num: 'h-[36px] w-[96px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-right font-mono text-[13px] outline-none focus:border-[#6b9e61]',
  primary: 'h-[36px] rounded-[6px] border border-[#1c2b1e] bg-[#1c2b1e] px-4 text-[13px] font-medium text-white hover:bg-[#2d3f2f] disabled:opacity-50',
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[22px] w-[38px] flex-none rounded-full transition-colors ${on ? 'bg-[#6b9e61]' : 'bg-[#d6d3c8]'}`}
    >
      <span className={`absolute top-[3px] h-[16px] w-[16px] rounded-full bg-white transition-[left] ${on ? 'left-[19px]' : 'left-[3px]'}`} />
    </button>
  )
}

export default function AlfredSettingsCard() {
  const [settings, setSettings] = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/admin/alfred/settings', { cache: 'no-store' })
      .then(r => r.json())
      .then(p => {
        setSettings(p.settings)
        if (!p.ok) setError(p.error || 'Alfred is not set up yet.')
      })
      .catch(e => setError(e?.message || 'Could not load Alfred settings.'))
  }, [])

  const set = (patch: Record<string, unknown>) => {
    setMessage('')
    setSettings((s: any) => ({ ...s, ...patch }))
  }

  async function save() {
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/admin/alfred/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      const p = await res.json()
      if (!res.ok || !p.ok) throw new Error(p.error || 'Could not save.')
      setSettings(p.settings)
      setMessage('Alfred settings saved.')
    } catch (e: any) {
      setMessage(e?.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  if (!settings) return <div className={tw.card}><p className="p-4 text-[13px] text-[#8b8a81]">{error || 'Loading...'}</p></div>

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-[8px] border border-[#fca5a5] bg-[#fef2f2] px-4 py-3 text-[13px] text-[#991b1b]">{error}</div>
      ) : null}

      <div className={tw.card}>
        <div className="flex items-center gap-2 border-b border-[#edf4eb] px-5 py-4">
          <h3 className="text-[15px] font-semibold text-[#1a1a18]">Alfred</h3>
          <AlfredMark />
          <p className="ml-2 text-[12px] text-[#5a5a52]">What Alfred prepares for you. Nothing is sent without a person approving it.</p>
        </div>
        <div className={tw.head}>Main switch</div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Alfred on</span>
            <span className={tw.hint}>Off stops every job at once. Drafts already made stay where they are.</span>
          </span>
          <Toggle on={settings.enabled} label="Alfred on" onChange={v => set({ enabled: v })} />
        </div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Sending without approval</span>
            <span className={tw.hint}>Not available. Every customer email needs a person.</span>
          </span>
          <span className="text-[11px] font-bold text-[#b42318]">Locked off</span>
        </div>

        <div className={tw.head}>Jobs</div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Draft replies to customer emails</span>
            <span className={tw.hint}>Checked every hour through the working day. The draft waits on the Alfred page and in the customer&apos;s reply box.</span>
          </span>
          <Toggle on={settings.jobs?.replies} label="Draft replies" onChange={v => set({ jobs: { ...settings.jobs, replies: v } })} />
        </div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Keep active orders updated</span>
            <span className={tw.hint}>Active and on hold orders. Checked at 6:30am. Alfred drafts an update two days before the gap below runs out, or asks you if nothing has changed.</span>
          </span>
          <Toggle on={settings.jobs?.updates} label="Keep orders updated" onChange={v => set({ jobs: { ...settings.jobs, updates: v } })} />
        </div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Longest gap between updates, days</span>
            <span className={tw.hint}>Counted from the last email a person wrote or approved, or the Customer Updates report. Quotes, invoices and automatic emails do not count.</span>
          </span>
          <input id="alfred-gap-days" type="number" min={3} max={60} className={tw.num} value={settings.update_gap_days} onChange={e => set({ update_gap_days: Number(e.target.value) })} />
        </div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Draft quotes from requests</span>
            <span className={tw.hint}>A request nobody has quoted after the wait below becomes a draft quote, made by the same Convert to quote you use. Nothing is sent. Lines that need a price carry Alfred&apos;s note.</span>
          </span>
          <Toggle on={settings.jobs?.quotes} label="Draft quotes" onChange={v => set({ jobs: { ...settings.jobs, quotes: v } })} />
        </div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Wait before drafting a quote, hours</span>
            <span className={tw.hint}>Counted from when the request came in.</span>
          </span>
          <input id="alfred-quote-wait" type="number" min={4} max={168} className={tw.num} value={settings.quote_wait_hours} onChange={e => set({ quote_wait_hours: Number(e.target.value) })} />
        </div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Draft replies to website enquiries</span>
            <span className={tw.hint}>After the automatic &ldquo;we got your message&rdquo; email. Checked every hour through the working day.</span>
          </span>
          <Toggle on={settings.jobs?.enquiries} label="Draft enquiry replies" onChange={v => set({ jobs: { ...settings.jobs, enquiries: v } })} />
        </div>

        <div className={tw.head}>Morning summary</div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Email a summary at 6:30am</span>
            <span className={tw.hint}>Drafts and questions waiting, and orders due an update. Monday to Saturday.</span>
          </span>
          <Toggle on={settings.summary_enabled} label="Morning summary" onChange={v => set({ summary_enabled: v })} />
        </div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Send the summary to</span>
          </span>
          <input
            id="alfred-summary-email"
            type="email"
            className="h-[36px] w-[260px] rounded-[6px] border border-[#dbd8cc] px-3 text-[13px] outline-none focus:border-[#6b9e61]"
            value={settings.summary_email || ''}
            onChange={e => set({ summary_email: e.target.value })}
          />
        </div>

        <div className={tw.head}>Limits</div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Most drafts in a day</span>
            <span className={tw.hint}>A ceiling in case something goes wrong.</span>
          </span>
          <input id="alfred-daily-cap" type="number" min={1} max={200} className={tw.num} value={settings.daily_draft_cap} onChange={e => set({ daily_draft_cap: Number(e.target.value) })} />
        </div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Monthly spend limit, US$</span>
            <span className={tw.hint}>Alfred stops drafting for the month when it is reached. Set a limit in the Anthropic console as well.</span>
          </span>
          <input id="alfred-monthly-cap" type="number" min={1} max={1000} className={tw.num} value={settings.monthly_spend_cap_usd} onChange={e => set({ monthly_spend_cap_usd: Number(e.target.value) })} />
        </div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Remake a draft after this many days</span>
            <span className={tw.hint}>A draft nobody approved is withdrawn and made again from fresh facts, so last week&apos;s news is never sent.</span>
          </span>
          <input id="alfred-stale-days" type="number" min={1} max={14} className={tw.num} value={settings.stale_after_days} onChange={e => set({ stale_after_days: Number(e.target.value) })} />
        </div>

        <div className={tw.head}>Who can approve</div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Names on the approve button</span>
            <span className={tw.hint}>Separated by commas. Picked once per browser on the shared login.</span>
          </span>
          <input
            id="alfred-approvers"
            className="h-[36px] w-[240px] rounded-[6px] border border-[#dbd8cc] px-3 text-[13px] outline-none focus:border-[#6b9e61]"
            value={(settings.approvers || []).join(', ')}
            onChange={e => set({ approvers: e.target.value.split(',').map(s => s.trim()) })}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className={tw.primary} onClick={save} disabled={busy}>
          {busy ? 'Saving...' : 'Save Alfred settings'}
        </button>
        {message ? <span className="text-[13px] text-[#5a5a52]">{message}</span> : null}
      </div>
    </div>
  )
}
