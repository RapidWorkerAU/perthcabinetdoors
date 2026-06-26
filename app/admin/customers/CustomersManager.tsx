'use client'

import * as React from 'react'
import { IconPlus, IconSearch } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { AdminPagination, useAdminPagination } from '../_components/AdminPagination'

interface Customer {
  id:            string
  name?:         string
  company_name?: string
  email?:        string
  phone?:        string
  site_address?: string
  notes?:        string
  is_active?:    boolean
  updated_at?:   string
  created_at?:   string
}

interface CustomerForm {
  id:            string
  name:          string
  company_name:  string
  email:         string
  phone:         string
  site_address:  string
  notes:         string
  is_active:     boolean
}

const emptyForm: CustomerForm = {
  id:           '',
  name:         '',
  company_name: '',
  email:        '',
  phone:        '',
  site_address: '',
  notes:        '',
  is_active:    true,
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function formFromCustomer(customer: Customer): CustomerForm {
  return {
    ...emptyForm,
    ...customer,
    name:         customer.name         || '',
    company_name: customer.company_name || '',
    email:        customer.email        || '',
    phone:        customer.phone        || '',
    site_address: customer.site_address || '',
    notes:        customer.notes        || '',
    is_active:    customer.is_active    ?? true,
  }
}

export default function CustomersManager() {
  const [customers,           setCustomers]           = React.useState<Customer[]>([])
  const [form,                setForm]                = React.useState<CustomerForm>(emptyForm)
  const [isLoading,           setIsLoading]           = React.useState(true)
  const [isSaving,            setIsSaving]            = React.useState(false)
  const [feedback,            setFeedback]            = React.useState('')
  const [setupRequired,       setSetupRequired]       = React.useState(false)
  const [search,              setSearch]              = React.useState('')
  const [isCustomerModalOpen, setIsCustomerModalOpen] = React.useState(false)
  const [selectedCustomerIds, setSelectedCustomerIds] = React.useState<string[]>([])

  const filteredCustomers = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return customers
    return customers.filter(c =>
      [c.name, c.company_name, c.email, c.phone, c.site_address]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(needle))
    )
  }, [customers, search])

  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(filteredCustomers, search)

  async function loadCustomers() {
    setIsLoading(true)
    setFeedback('')
    try {
      const res     = await fetch('/api/admin/customers', { cache: 'no-store' })
      const payload = await res.json()
      setSetupRequired(!!payload.setupRequired)
      setCustomers(payload.customers || [])
      if (payload.error) setFeedback(payload.error)
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Could not load customers.')
    } finally {
      setIsLoading(false)
    }
  }

  React.useEffect(() => { loadCustomers() }, [])

  function updateForm(field: keyof CustomerForm, value: string | boolean) {
    setForm(current => ({ ...current, [field]: value }))
  }

  function openNewCustomerModal() {
    setForm(emptyForm)
    setFeedback('')
    setIsCustomerModalOpen(true)
  }

  function openEditCustomerModal(customer: Customer) {
    setForm(formFromCustomer(customer))
    setFeedback('')
    setIsCustomerModalOpen(true)
  }

  function closeCustomerModal() {
    if (isSaving) return
    setIsCustomerModalOpen(false)
    setForm(emptyForm)
  }

  async function saveCustomer(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault()
    setIsSaving(true)
    setFeedback('')

    const endpoint = form.id ? `/api/admin/customers/${form.id}` : '/api/admin/customers'
    const method   = form.id ? 'PATCH' : 'POST'

    try {
      const res     = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const payload = await res.json()

      if (!res.ok || !payload.ok) {
        setFeedback(payload.error || 'Could not save customer.')
        return
      }

      const message = form.id ? 'Customer updated.' : 'Customer added.'
      setCustomers(current => {
        if (form.id) return current.map(c => c.id === payload.customer.id ? payload.customer : c)
        return [payload.customer, ...current]
      })
      setForm(emptyForm)
      setIsCustomerModalOpen(false)
      setFeedback(message)
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Could not save customer.')
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteCustomers(ids: string[]) {
    if (!ids.length) return
    setIsSaving(true)
    setFeedback('')
    try {
      for (const id of ids) {
        const res     = await fetch(`/api/admin/customers/${id}`, { method: 'DELETE' })
        const payload = await res.json()
        if (!res.ok || !payload.ok) throw new Error(payload.error || 'Could not delete customer.')
      }
      setCustomers(current => current.filter(c => !ids.includes(c.id)))
      setSelectedCustomerIds(current => current.filter(id => !ids.includes(id)))
      setFeedback(`${ids.length} customer${ids.length === 1 ? '' : 's'} deleted.`)
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Could not delete selected customers.')
    } finally {
      setIsSaving(false)
    }
  }

  function toggleSelectedCustomer(id: string) {
    setSelectedCustomerIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  function toggleSelectedCustomerPage(checked: boolean) {
    const pageIds = pageItems.map(c => c.id)
    setSelectedCustomerIds(current => {
      if (!checked) return current.filter(id => !pageIds.includes(id))
      return Array.from(new Set([...current, ...pageIds]))
    })
  }

  const allPageSelected = pageItems.length > 0 && pageItems.every(c => selectedCustomerIds.includes(c.id))

  return (
    <div className="p-4 md:p-6 max-w-[1400px]">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1a18]">Customers</h1>
          <p className="text-[13px] text-[#5a5a52] mt-[2px]">Manage customer records</p>
        </div>
      </div>

      {setupRequired && (
        <div className="mb-4 px-4 py-3 rounded-[6px] bg-[#fff8df] border border-[#dcbf55] text-[13px] text-[#5c4200]">
          Run the updated <code>supabase/quote_project_workflow_setup.sql</code> before saving customers.
        </div>
      )}

      {feedback && (
        <div className="mb-4 px-4 py-3 rounded-[6px] bg-[#edf4eb] border border-[#a8c5a0] text-[13px] text-[#2d5e28]">
          {feedback}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#edf4eb]">
          <div className="flex items-center gap-3">
            {selectedCustomerIds.length > 0 ? (
              <button
                type="button"
                onClick={() => deleteCustomers(selectedCustomerIds)}
                disabled={isSaving}
                className="text-[13px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
              >
                Delete {selectedCustomerIds.length} selected
              </button>
            ) : (
              <div className="relative">
                <IconSearch size={14} className="absolute left-[10px] top-1/2 -translate-y-1/2 text-[#8b8a81] pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-[36px] border border-[#dbd8cc] rounded-[6px] pl-[32px] pr-3 text-[13px] outline-none focus:border-[#6b9e61] w-[220px] transition-colors"
                />
              </div>
            )}
          </div>
          <Button variant="primary" size="sm" iconLeft={<IconPlus size={14} />} onClick={openNewCustomerModal}>
            Add customer
          </Button>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
              <th className="w-[40px] px-4 py-[9px]">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={e => toggleSelectedCustomerPage(e.target.checked)}
                  aria-label="Select all visible customers"
                  className="accent-[#6b9e61]"
                />
              </th>
              {['Customer', 'Company', 'Email', 'Phone', 'Address', 'Status', 'Updated', ''].map(col => (
                <th key={col} className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="py-12 text-center text-[13px] text-[#8b8a81]">Loading...</td></tr>
            )}
            {!isLoading && !filteredCustomers.length && (
              <tr><td colSpan={9} className="py-12 text-center text-[13px] text-[#8b8a81]">No customers found.</td></tr>
            )}
            {pageItems.map(customer => (
              <tr key={customer.id} className="border-b border-[#edf4eb] hover:bg-[#f5f8f4] transition-colors last:border-b-0">
                <td className="px-4 py-[11px]">
                  <input
                    type="checkbox"
                    checked={selectedCustomerIds.includes(customer.id)}
                    onChange={() => toggleSelectedCustomer(customer.id)}
                    aria-label={`Select ${customer.name || 'customer'}`}
                    className="accent-[#6b9e61]"
                  />
                </td>
                <td className="px-4 py-[11px] text-[13px] font-medium text-[#1a1a18]">{customer.name || '-'}</td>
                <td className="px-4 py-[11px] text-[13px] text-[#1a1a18]">{customer.company_name || '-'}</td>
                <td className="px-4 py-[11px] text-[13px] text-[#1a1a18]">{customer.email || '-'}</td>
                <td className="px-4 py-[11px] text-[13px] text-[#1a1a18]">{customer.phone || '-'}</td>
                <td className="px-4 py-[11px] text-[13px] text-[#1a1a18]">{customer.site_address || '-'}</td>
                <td className="px-4 py-[11px]">
                  <span className={cn(
                    'inline-flex items-center px-2 py-[2px] rounded-full text-[11px] font-medium',
                    customer.is_active ? 'bg-[#edf4eb] text-[#2d5e28]' : 'bg-[#f1efe8] text-[#5a5a52]'
                  )}>
                    {customer.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-[11px] text-[13px] text-[#1a1a18] whitespace-nowrap">{formatDate(customer.updated_at || customer.created_at)}</td>
                <td className="px-4 py-[11px] text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => openEditCustomerModal(customer)}
                      className="text-[12px] font-medium text-[#6b9e61] hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCustomers([customer.id])}
                      disabled={isSaving}
                      className="text-[12px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <AdminPagination
          label="customers"
          page={page}
          pageCount={pageCount}
          totalItems={totalItems}
          onPageChange={setPage}
        />
      </div>

      {/* Mobile toolbar */}
      <div className="md:hidden flex items-center justify-between gap-3 mb-3">
        <div className="relative flex-1">
          <IconSearch size={14} className="absolute left-[10px] top-1/2 -translate-y-1/2 text-[#8b8a81] pointer-events-none" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-[36px] border border-[#dbd8cc] rounded-[6px] pl-[32px] pr-3 text-[13px] outline-none focus:border-[#6b9e61]"
          />
        </div>
        <Button variant="primary" size="sm" iconLeft={<IconPlus size={14} />} onClick={openNewCustomerModal}>
          Add
        </Button>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {isLoading && (
          <div className="py-12 text-center text-[13px] text-[#8b8a81]">Loading...</div>
        )}
        {!isLoading && !filteredCustomers.length && (
          <div className="py-12 text-center text-[13px] text-[#8b8a81]">No customers found.</div>
        )}
        {pageItems.map(customer => (
          <div key={customer.id} className="bg-white border border-[#dbd8cc] rounded-[8px] p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[14px] font-semibold text-[#1a1a18]">{customer.name || '—'}</p>
                <p className="text-[12px] text-[#5a5a52]">{customer.company_name || '—'}</p>
              </div>
              <span className={cn(
                'inline-flex items-center px-2 py-[2px] rounded-full text-[11px] font-medium',
                customer.is_active ? 'bg-[#edf4eb] text-[#2d5e28]' : 'bg-[#f1efe8] text-[#5a5a52]'
              )}>
                {customer.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] mb-3">
              <div><span className="text-[#8b8a81]">Email</span><p className="text-[#1a1a18]">{customer.email || '—'}</p></div>
              <div><span className="text-[#8b8a81]">Phone</span><p className="text-[#1a1a18]">{customer.phone || '—'}</p></div>
              {customer.site_address && <div className="col-span-2"><span className="text-[#8b8a81]">Address</span><p className="text-[#1a1a18]">{customer.site_address}</p></div>}
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-[#edf4eb] mt-3">
              <button
                type="button"
                onClick={() => openEditCustomerModal(customer)}
                className="text-[12px] font-medium text-[#6b9e61] hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => deleteCustomers([customer.id])}
                disabled={isSaving}
                className="text-[12px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {totalItems > 0 && (
          <AdminPagination
            label="customers"
            page={page}
            pageCount={pageCount}
            totalItems={totalItems}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* Customer modal */}
      <Modal
        open={isCustomerModalOpen}
        onClose={closeCustomerModal}
        title={form.id ? 'Edit customer' : 'Add customer'}
        footer={
          <>
            <Button variant="neutral" onClick={closeCustomerModal} disabled={isSaving}>Cancel</Button>
            <Button variant="primary" onClick={saveCustomer} loading={isSaving} loadingText="Saving...">
              {form.id ? 'Save customer' : 'Add customer'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Contact name" value={form.name} onChange={e => updateForm('name', e.target.value)} required />
          <Input label="Company" value={form.company_name} onChange={e => updateForm('company_name', e.target.value)} optional />
          <Input label="Email" type="email" value={form.email} onChange={e => updateForm('email', e.target.value)} optional />
          <Input label="Phone" value={form.phone} onChange={e => updateForm('phone', e.target.value)} optional />
          <Input label="Site / delivery address" value={form.site_address} onChange={e => updateForm('site_address', e.target.value)} optional containerClassName="md:col-span-2" />
          <Textarea label="Notes" value={form.notes} onChange={e => updateForm('notes', e.target.value)} optional containerClassName="md:col-span-2" rows={3} />
          <label className="flex items-center gap-2 text-[13px] text-[#1a1a18] md:col-span-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => updateForm('is_active', e.target.checked)}
              className="w-4 h-4 accent-[#6b9e61]"
            />
            Active customer
          </label>
        </div>
      </Modal>
    </div>
  )
}
