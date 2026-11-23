'use client'

// SETTINGS > ALFRED.
//
// The switch, the monthly limit and who can approve. Alfred is the chat and
// nothing else: off means the chat stops answering.

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
          <p className="ml-2 text-[12px] text-[#5a5a52]">The chat on the Alfred page. Nothing is changed without a person approving it.</p>
        </div>
        <div className={tw.head}>Main switch</div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Alfred on</span>
            <span className={tw.hint}>Off stops the chat answering.</span>
          </span>
          <Toggle on={settings.enabled} label="Alfred on" onChange={v => set({ enabled: v })} />
        </div>
        <div className={tw.head}>Limits</div>
        <div className={tw.row}>
          <span>
            <span className={tw.label}>Monthly spend limit, US$</span>
            <span className={tw.hint}>Alfred stops answering for the month when it is reached. Set a limit in the Anthropic console as well.</span>
          </span>
          <input id="alfred-monthly-cap" type="number" min={1} max={1000} className={tw.num} value={settings.monthly_spend_cap_usd} onChange={e => set({ monthly_spend_cap_usd: Number(e.target.value) })} />
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
