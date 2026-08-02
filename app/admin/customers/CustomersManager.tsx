'use client'

import * as React from 'react'
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react'
import { ActionMenu, ActionMenuItem } from '@/components/ui/ActionMenu'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { AdminDataTable, type AdminDataTableColumn } from '@/components/ui/AdminDataTable'
import { AdminPageHeader } from '@/components/ui/AdminPageHeader'
import { BulkActionBar } from '@/components/ui/BulkActionBar'
import { StatusPill } from '@/components/ui/StatusPill'
import { useToast } from '@/components/ui/Toast'
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
  const [setupRequired,       setSetupRequired]       = React.useState(false)
  const [search,              setSearch]              = React.useState('')
  const [isCustomerModalOpen, setIsCustomerModalOpen] = React.useState(false)
  const [selectedCustomerIds, setSelectedCustomerIds] = React.useState<string[]>([])
  const [confirmDeleteIds,    setConfirmDeleteIds]    = React.useState<string[]>([])
  const { toast } = useToast()

  const filteredCustomers = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return customers
    return customers.filter(customer =>
      [customer.name, customer.company_name, customer.email, customer.phone, customer.site_address]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle))
    )
  }, [customers, search])

  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(filteredCustomers, search)

  const loadCustomers = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const res     = await fetch('/api/admin/customers', { cache: 'no-store' })
      const payload = await res.json()
      setSetupRequired(!!payload.setupRequired)
      setCustomers(payload.customers || [])
      if (payload.error) toast({ title: payload.error, variant: 'error' })
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not load customers.', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  React.useEffect(() => { loadCustomers() }, [loadCustomers])

  function updateForm(field: keyof CustomerForm, value: string | boolean) {
    setForm(current => ({ ...current, [field]: value }))
  }

  function openNewCustomerModal() {
    setForm(emptyForm)
    setIsCustomerModalOpen(true)
  }

  function openEditCustomerModal(customer: Customer) {
    setForm(formFromCustomer(customer))
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
        toast({ title: payload.error || 'Could not save customer.', variant: 'error' })
        return
      }

      const message = form.id ? 'Customer updated.' : 'Customer added.'
      setCustomers(current => {
        if (form.id) return current.map(customer => customer.id === payload.customer.id ? payload.customer : customer)
        return [payload.customer, ...current]
      })
      setForm(emptyForm)
      setIsCustomerModalOpen(false)
      toast({ title: message, variant: 'success' })
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not save customer.', variant: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteCustomers(ids: string[]) {
    if (!ids.length) return
    setIsSaving(true)
    try {
      for (const id of ids) {
        const res     = await fetch(`/api/admin/customers/${id}`, { method: 'DELETE' })
        const payload = await res.json()
        if (!res.ok || !payload.ok) throw new Error(payload.error || 'Could not delete customer.')
      }
      setCustomers(current => current.filter(customer => !ids.includes(customer.id)))
      setSelectedCustomerIds(current => current.filter(id => !ids.includes(id)))
      toast({ title: `${ids.length} customer${ids.length === 1 ? '' : 's'} deleted.`, variant: 'success' })
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not delete selected customers.', variant: 'error' })
    } finally {
      setIsSaving(false)
      setConfirmDeleteIds([])
    }
  }

  const customerColumns = React.useMemo<AdminDataTableColumn<Customer>[]>(() => [
    {
      id: 'customer',
      header: 'Customer',
      cell: customer => <span className="font-medium">{customer.name || '-'}</span>,
    },
    {
      id: 'company',
      header: 'Company',
      cell: customer => customer.company_name || '-',
    },
    {
      id: 'email',
      header: 'Email',
      cell: customer => customer.email || '-',
    },
    {
      id: 'phone',
      header: 'Phone',
      cell: customer => customer.phone || '-',
    },
    {
      id: 'address',
      header: 'Address',
      cell: customer => customer.site_address || '-',
    },
    {
      id: 'status',
      header: 'Status',
      cell: customer => (
        <StatusPill tone={customer.is_active ? 'active' : 'neutral'} status={customer.is_active ? 'active' : 'inactive'}>
          {customer.is_active ? 'Active' : 'Inactive'}
        </StatusPill>
      ),
    },
    {
      id: 'updated',
      header: 'Updated',
      className: 'whitespace-nowrap',
      cell: customer => formatDate(customer.updated_at || customer.created_at),
    },
    {
      id: 'actions',
      header: '',
      className: 'text-right',
      cell: customer => (
        <div className="flex justify-end">
          <ActionMenu label={`Open actions for customer ${customer.name || 'customer'}`}>
            <ActionMenuItem icon={<IconEdit size={14} />} onClick={() => openEditCustomerModal(customer)}>
              Edit
            </ActionMenuItem>
            <ActionMenuItem icon={<IconTrash size={14} />} variant="danger" disabled={isSaving} onClick={() => setConfirmDeleteIds([customer.id])}>
            Delete
            </ActionMenuItem>
          </ActionMenu>
        </div>
      ),
    },
  ], [isSaving])

  function renderCustomerMobileCard(customer: Customer) {
    return (
      <article className="rounded-[8px] border border-[#dbd8cc] bg-white p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-[#1a1a18]">{customer.name || '-'}</p>
            <p className="text-[12px] text-[#5a5a52]">{customer.company_name || '-'}</p>
          </div>
          <StatusPill tone={customer.is_active ? 'active' : 'neutral'} status={customer.is_active ? 'active' : 'inactive'}>
            {customer.is_active ? 'Active' : 'Inactive'}
          </StatusPill>
        </div>
        <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <div>
            <dt className="text-[#8b8a81]">Email</dt>
            <dd className="text-[#1a1a18]">{customer.email || '-'}</dd>
          </div>
          <div>
            <dt className="text-[#8b8a81]">Phone</dt>
            <dd className="text-[#1a1a18]">{customer.phone || '-'}</dd>
          </div>
          {customer.site_address && (
            <div className="col-span-2">
              <dt className="text-[#8b8a81]">Address</dt>
              <dd className="text-[#1a1a18]">{customer.site_address}</dd>
            </div>
          )}
        </dl>
        <div className="mt-3 flex items-center justify-end border-t border-[#edf4eb] pt-3">
          <ActionMenu label={`Open actions for customer ${customer.name || 'customer'}`}>
            <ActionMenuItem icon={<IconEdit size={14} />} onClick={() => openEditCustomerModal(customer)}>
              Edit
            </ActionMenuItem>
            <ActionMenuItem icon={<IconTrash size={14} />} variant="danger" disabled={isSaving} onClick={() => setConfirmDeleteIds([customer.id])}>
            Delete
            </ActionMenuItem>
          </ActionMenu>
        </div>
      </article>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title="Customers" subtitle="Manage customer records" />

      {setupRequired && (
        <div className="mb-4 rounded-[6px] border border-[#dcbf55] bg-[#fff8df] px-4 py-3 text-[13px] text-[#5c4200]">
          Run the updated <code>supabase/quote_project_workflow_setup.sql</code> before saving customers.
        </div>
      )}

      <AdminDataTable
        rows={pageItems}
        columns={customerColumns}
        getRowId={customer => customer.id}
        getRowLabel={customer => customer.name || 'customer'}
        onRowClick={openEditCustomerModal}
        loading={isLoading}
        emptyTitle="No customers found."
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search customers..."
        selectedIds={selectedCustomerIds}
        onSelectedIdsChange={setSelectedCustomerIds}
        bulkActions={selectedCustomerIds.length > 0 ? (
          <BulkActionBar
            selectedCount={selectedCustomerIds.length}
            noun="customer"
            variant="inline"
            onClear={() => setSelectedCustomerIds([])}
            onDelete={() => setConfirmDeleteIds(selectedCustomerIds)}
            deleting={isSaving}
          />
        ) : undefined}
        primaryAction={(
          <Button
            variant="primary"
            size="sm"
            iconLeft={<IconPlus size={14} />}
            onClick={openNewCustomerModal}
            aria-label="Add customer"
            className="max-sm:w-10 max-sm:px-0"
          >
            <span className="max-sm:hidden">Add customer</span>
          </Button>
        )}
        mobileCard={renderCustomerMobileCard}
        pagination={totalItems > 0 ? (
          <AdminPagination
            label="customers"
            page={page}
            pageCount={pageCount}
            totalItems={totalItems}
            onPageChange={setPage}
          />
        ) : undefined}
      />

      <ConfirmModal
        open={confirmDeleteIds.length > 0}
        onClose={() => setConfirmDeleteIds([])}
        title={confirmDeleteIds.length === 1 ? 'Delete customer?' : 'Delete customers?'}
        description={
          confirmDeleteIds.length === 1
            ? 'This customer will be permanently removed.'
            : `${confirmDeleteIds.length} customers will be permanently removed.`
        }
        variant="danger"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => deleteCustomers(confirmDeleteIds)}
        loading={isSaving}
      />

      <Modal
        open={isCustomerModalOpen}
        onClose={closeCustomerModal}
        title={form.id ? 'Edit customer' : 'Add customer'}
        footer={(
          <>
            <Button variant="neutral" onClick={closeCustomerModal} disabled={isSaving}>Cancel</Button>
            <Button variant="primary" onClick={saveCustomer} loading={isSaving} loadingText="Saving...">
              {form.id ? 'Save customer' : 'Add customer'}
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="Contact name" value={form.name} onChange={event => updateForm('name', event.target.value)} required />
          <Input label="Company" value={form.company_name} onChange={event => updateForm('company_name', event.target.value)} optional />
          <Input label="Email" type="email" value={form.email} onChange={event => updateForm('email', event.target.value)} optional />
          <Input label="Phone" value={form.phone} onChange={event => updateForm('phone', event.target.value)} optional />
          <Input label="Site / delivery address" value={form.site_address} onChange={event => updateForm('site_address', event.target.value)} optional containerClassName="md:col-span-2" />
          <Textarea label="Notes" value={form.notes} onChange={event => updateForm('notes', event.target.value)} optional containerClassName="md:col-span-2" rows={3} />
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#1a1a18] md:col-span-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={event => updateForm('is_active', event.target.checked)}
              className="h-4 w-4 accent-[#6b9e61]"
            />
            Active customer
          </label>
        </div>
      </Modal>
    </div>
  )
}
