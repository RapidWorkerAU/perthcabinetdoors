'use client'

// THE ALFRED PAGE: THE CHAT, AND NOTHING ELSE.
//
// Alfred answers questions about our records and proposes changes a person
// approves. He drafts no emails and runs nothing on a clock. A change needs a
// person's name; the admin is one shared login, so the name is picked once per
// browser and remembered.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { tableStyles as t } from '@/components/ui/table-styles'
import { Modal } from '@/components/ui/Modal'
import { AlfredMark } from '@/components/admin/AlfredMark'
import AskAlfred from './AskAlfred'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

const APPROVER_KEY = 'pcd.alfred.approver'

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

const pill = 'inline-flex items-center rounded-full border px-2 py-[2px] text-[10.5px] font-semibold whitespace-nowrap'

export default function AlfredClient() {
  const [data, setData] = useState<Row | null>(null)
  const [loadError, setLoadError] = useState('')
  const [approver, setApprover] = useState('')
  const [picking, setPicking] = useState<null | (() => void)>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/alfred', { cache: 'no-store' })
      const payload = await res.json()
      if (!payload.ok) {
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
  }, [load])

  /** Run something that needs a person's name, asking for it first if needed. */
  function asApprover(then: (name: string) => void) {
    const name = approver || readApprover()
    if (name) return then(name)
    setPicking(() => () => then(readApprover()))
  }

  const settings = data?.settings
  const usage = data?.usage

  return (
    <div className="min-h-full bg-[#f5f8f4] p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-bold text-[#1a1a18]">
            Ask Alfred <AlfredMark />
          </h1>
          <p className="mt-[2px] text-[13px] text-[#5a5a52]">Questions about our records, and changes for you to approve.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {settings ? (
            <span className={cn(pill, settings.enabled ? 'border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28]' : 'border-[#dbd8cc] bg-[#f5f5f4] text-[#5a5a52]')}>
              {settings.enabled ? 'On' : 'Switched off'}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setPicking(() => () => setApprover(readApprover()))}
            className="h-[32px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium text-[#5a5a52] hover:bg-[#f5f8f4]"
          >
            {approver ? <>Approving as <b className="text-[#1a1a18]">{approver}</b></> : 'Choose who is approving'}
          </button>
          <Link href="/admin/settings?tab=alfred" className="h-[32px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium leading-[32px] text-[#1a1a18] hover:bg-[#f5f8f4]">
            Alfred settings
          </Link>
        </div>
      </div>

      {usage && settings ? (
        <p className="mb-4 text-[11.5px] text-[#8b8a81]">
          This month US${Number(usage.spentThisMonth).toFixed(2)} of US${settings.monthly_spend_cap_usd}
        </p>
      ) : null}

      {loadError ? (
        <div className="mb-4 rounded-[8px] border border-[#fca5a5] bg-[#fef2f2] px-4 py-3 text-[13px] text-[#991b1b]">{loadError}</div>
      ) : null}

      {!data && !loadError ? <div className={cn(t.card, t.empty)}>Loading...</div> : null}

      {data ? <AskAlfred asApprover={asApprover} enabled={Boolean(settings?.enabled)} /> : null}

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
    </div>
  )
}

function ApproverModal({ names, current, onPick, onClose }: { names: string[]; current: string; onPick: (n: string) => void; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} size="sm" title="Who is approving?" subtitle="This browser remembers it. Anything you approve records your name.">
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
