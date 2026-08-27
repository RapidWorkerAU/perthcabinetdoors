'use client'

import * as React from 'react'
import { useToast } from '@/components/ui/Toast'
import AdminLoading from '@/components/admin/AdminLoading'

// SETTINGS, LISTS: the dropdown vocabularies you can add to yourself.
//
// ── THE ONE RULE THE SCREEN HAS TO MAKE OBVIOUS ──────────────────────────────
//
// There is no delete, and somebody will look for one. So the row says "In use"
// or "Off" rather than offering a bin icon, and switching something off spells
// out what that does: it stops being offered, and every record already using it
// keeps it. Without that sentence, Off reads as "gone" and somebody will avoid
// using it for fear of breaking old orders.
//
// ── WHY THE ORDER IS DRAGGABLE ───────────────────────────────────────────────
//
// These lists are read top down in a dropdown, so position is meaning: the
// common choice belongs first and "Something else" belongs last. Alphabetical
// would put "Something else" in the middle of the issue kinds.
//
// Dragging is keyboard reachable as well, through the two move buttons, because
// a list you can only reorder with a mouse is a list somebody cannot reorder.

interface ListField {
  key:       string
  label:     string
  type:      'text' | 'number' | 'boolean'
  required?: boolean
  hint?:     string
}

interface ListItem {
  id:         string | null
  list_key:   string
  key:        string
  label:      string
  sort_order: number
  is_active:  boolean
  is_builtin: boolean
  extras:     Record<string, unknown>
}

interface ListSpec {
  key:    string
  label:  string
  note:   string
  where:  string
  fields: ListField[]
  items:  ListItem[]
}

const inputClass =
  'w-full h-[34px] rounded-[6px] border border-[#dbd8cc] bg-white px-[9px] text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]'

export default function ListsManager() {
  const { toast } = useToast()
  const [lists, setLists]       = React.useState<ListSpec[]>([])
  const [loading, setLoading]   = React.useState(true)
  const [readOnly, setReadOnly] = React.useState(false)
  const [openKey, setOpenKey]   = React.useState<string>('')
  const [busy, setBusy]         = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lists', { cache: 'no-store' })
      const payload = await res.json()
      if (!res.ok || !payload.ok) throw new Error(payload.error || 'Could not load the lists.')
      setLists(payload.lists || [])
      setReadOnly(Boolean(payload.readOnly))
      setOpenKey(current => current || payload.lists?.[0]?.key || '')
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not load the lists.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => { load() }, [load])

  function replaceItem(listKey: string, item: ListItem) {
    setLists(current =>
      current.map(list =>
        list.key !== listKey
          ? list
          : { ...list, items: list.items.map(row => (row.id === item.id ? item : row)) }
      )
    )
  }

  async function patchItem(listKey: string, id: string, patch: Record<string, unknown>) {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/lists/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      const payload = await res.json()
      if (!res.ok || !payload.ok) throw new Error(payload.error || 'Could not save that.')
      replaceItem(listKey, payload.item)
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not save that.', variant: 'error' })
      // Put the screen back to what is actually stored rather than leaving it
      // showing a change that did not land.
      load()
    } finally {
      setBusy('')
    }
  }

  async function saveOrder(listKey: string, ordered: ListItem[]) {
    setLists(current => current.map(list => (list.key === listKey ? { ...list, items: ordered } : list)))
    try {
      const res = await fetch('/api/admin/lists/order', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ list_key: listKey, ids: ordered.map(item => item.id) }),
      })
      const payload = await res.json()
      if (!res.ok || !payload.ok) throw new Error(payload.error || 'Could not save the new order.')
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not save the new order.', variant: 'error' })
      load()
    }
  }

  function move(list: ListSpec, index: number, by: number) {
    const next = [...list.items]
    const target = index + by
    if (target < 0 || target >= next.length) return
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    saveOrder(list.key, next)
  }

  if (loading && !lists.length) {
    return <AdminLoading steps={['Reading your lists', 'Almost there']} label="Loading lists" />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-[#dbd8cc] rounded-[8px] px-5 py-4">
        <h3 className="text-[15px] font-semibold text-[#1a1a18]">Lists</h3>
        <p className="text-[12.5px] text-[#5a5a52] mt-[3px] max-w-[70ch]">
          The dropdowns you can add your own options to. Nothing here is ever deleted: switch an item off and it
          stops being offered on new records, while everything already using it keeps it exactly as it is.
        </p>
      </div>

      {readOnly && (
        <p className="rounded-[6px] border border-[#fcd34d] bg-[#fffbeb] px-4 py-3 text-[13px] text-[#92400e]">
          These are the built-in options, read from the code. The lists table has not been created yet, so nothing
          on this screen can be saved. Run the migration <code>202608281000_pcd_list_items.sql</code> first.
        </p>
      )}

      {lists.map(list => {
        const open = openKey === list.key
        const liveCount = list.items.filter(item => item.is_active).length

        return (
          <div key={list.key} className="bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenKey(open ? '' : list.key)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-[#f9fbf8] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-semibold text-[#1a1a18]">{list.label}</h3>
                <p className="text-[12px] text-[#5a5a52] mt-[2px]">{list.note}</p>
                <p className="text-[11px] text-[#8b8a81] mt-[3px]">Used on: {list.where}</p>
              </div>
              <span className="whitespace-nowrap text-[12px] tabular-nums text-[#5a5a52]">
                {liveCount} in use
                {list.items.length > liveCount && (
                  <span className="text-[#8b8a81]"> · {list.items.length - liveCount} off</span>
                )}
              </span>
              <span className="text-[15px] text-[#8b8a81]">{open ? '−' : '+'}</span>
            </button>

            {open && (
              <div className="border-t border-[#edf4eb]">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                      <th className="w-[70px] px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">Order</th>
                      <th className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">Name</th>
                      {list.fields.map(field => (
                        <th key={field.key} className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                          {field.label}
                        </th>
                      ))}
                      <th className="w-[150px] px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">Offered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.items.map((item, index) => (
                      <tr key={item.id || item.key} className={`border-b border-[#edf4eb] last:border-b-0 ${item.is_active ? '' : 'bg-[#fafaf8]'}`}>
                        <td className="px-4 py-[9px]">
                          <div className="flex gap-[3px]">
                            <button
                              type="button"
                              onClick={() => move(list, index, -1)}
                              disabled={index === 0 || readOnly}
                              aria-label={`Move ${item.label} up`}
                              className="h-[22px] w-[22px] rounded-[4px] border border-[#dbd8cc] text-[11px] text-[#5a5a52] hover:bg-[#f5f8f4] disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => move(list, index, 1)}
                              disabled={index === list.items.length - 1 || readOnly}
                              aria-label={`Move ${item.label} down`}
                              className="h-[22px] w-[22px] rounded-[4px] border border-[#dbd8cc] text-[11px] text-[#5a5a52] hover:bg-[#f5f8f4] disabled:opacity-30"
                            >
                              ↓
                            </button>
                          </div>
                        </td>

                        <td className="px-4 py-[9px]">
                          <input
                            className={inputClass}
                            defaultValue={item.label}
                            disabled={readOnly || busy === item.id}
                            aria-label={`Name for ${item.label}`}
                            onBlur={e => {
                              const next = e.target.value.trim()
                              if (next && next !== item.label && item.id) patchItem(list.key, item.id, { label: next })
                            }}
                          />
                          {/* The stored value, shown because it is what every
                              record holds and renaming above never changes it. */}
                          <span className="mt-[3px] block font-mono text-[10.5px] text-[#8b8a81]">
                            {item.key}
                            {item.is_builtin ? ' · built in' : ''}
                          </span>
                        </td>

                        {list.fields.map(field => (
                          <td key={field.key} className="px-4 py-[9px] align-top">
                            {field.type === 'boolean' ? (
                              <label className="flex items-center gap-2 text-[12.5px] text-[#5a5a52]">
                                <input
                                  type="checkbox"
                                  className="accent-[#6b9e61]"
                                  checked={Boolean(item.extras?.[field.key])}
                                  disabled={readOnly || busy === item.id}
                                  onChange={e => item.id && patchItem(list.key, item.id, { extras: { [field.key]: e.target.checked } })}
                                />
                                Yes
                              </label>
                            ) : (
                              <input
                                className={inputClass}
                                type={field.type === 'number' ? 'number' : 'text'}
                                defaultValue={String(item.extras?.[field.key] ?? '')}
                                disabled={readOnly || busy === item.id}
                                aria-label={`${field.label} for ${item.label}`}
                                onBlur={e => {
                                  const next = field.type === 'number' ? Number(e.target.value) : e.target.value.trim()
                                  if (item.id && String(next) !== String(item.extras?.[field.key] ?? '')) {
                                    patchItem(list.key, item.id, { extras: { [field.key]: next } })
                                  }
                                }}
                              />
                            )}
                          </td>
                        ))}

                        <td className="px-4 py-[9px]">
                          <button
                            type="button"
                            disabled={readOnly || busy === item.id || !item.id}
                            onClick={() => item.id && patchItem(list.key, item.id, { is_active: !item.is_active })}
                            className={`rounded-[6px] border px-[10px] py-[5px] text-[12px] font-medium transition-colors disabled:opacity-40 ${
                              item.is_active
                                ? 'border-[#a8c5a0] bg-[#f5fff5] text-[#2d5e28] hover:bg-[#edf4eb]'
                                : 'border-[#dbd8cc] bg-white text-[#8b8a81] hover:bg-[#f5f8f4]'
                            }`}
                          >
                            {item.is_active ? 'In use' : 'Off'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <AddItem list={list} disabled={readOnly} onAdded={load} />

                <p className="border-t border-[#edf4eb] bg-[#f5f8f4] px-4 py-[9px] text-[11.5px] text-[#8b8a81]">
                  Switching an item off stops it being offered on anything new. Every record already using it keeps
                  it and still shows it. Nothing on this screen deletes anything.
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function AddItem({ list, disabled, onAdded }: { list: ListSpec; disabled: boolean; onAdded: () => void }) {
  const { toast } = useToast()
  const [label, setLabel] = React.useState('')
  const [extras, setExtras] = React.useState<Record<string, unknown>>({})
  const [saving, setSaving] = React.useState(false)

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/lists', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ list_key: list.key, label, extras }),
      })
      const payload = await res.json()
      if (!res.ok || !payload.ok) throw new Error(payload.error || 'Could not add that item.')
      setLabel('')
      setExtras({})
      toast({ title: `${payload.item.label} added to ${list.label}.`, variant: 'success' })
      onAdded()
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not add that item.', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={add} className="flex flex-wrap items-end gap-3 border-t border-[#edf4eb] px-4 py-4">
      <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">
        Add to {list.label}
        <input
          className={inputClass}
          value={label}
          disabled={disabled || saving}
          placeholder="What it should be called"
          onChange={e => setLabel(e.target.value)}
        />
      </label>

      {list.fields.map(field => (
        <label key={field.key} className="flex min-w-[150px] flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">
          {field.label}
          {field.type === 'boolean' ? (
            <span className="flex h-[34px] items-center gap-2 text-[12.5px] font-normal normal-case tracking-normal text-[#5a5a52]">
              <input
                type="checkbox"
                className="accent-[#6b9e61]"
                disabled={disabled || saving}
                checked={Boolean(extras[field.key])}
                onChange={e => setExtras(current => ({ ...current, [field.key]: e.target.checked }))}
              />
              Yes
            </span>
          ) : (
            <input
              className={inputClass}
              type={field.type === 'number' ? 'number' : 'text'}
              disabled={disabled || saving}
              value={String(extras[field.key] ?? '')}
              onChange={e =>
                setExtras(current => ({
                  ...current,
                  [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                }))
              }
            />
          )}
        </label>
      ))}

      <button
        type="submit"
        disabled={disabled || saving || label.trim().length < 2}
        className="h-[34px] rounded-[6px] bg-[#1c2b1e] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#2d3f2f] disabled:opacity-40"
      >
        {saving ? 'Adding' : 'Add'}
      </button>

      {list.fields.some(field => field.hint) && (
        <p className="w-full text-[11.5px] text-[#8b8a81]">
          {list.fields.filter(field => field.hint).map(field => `${field.label}: ${field.hint}`).join(' ')}
        </p>
      )}
    </form>
  )
}
