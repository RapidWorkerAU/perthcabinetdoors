'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconEdit, IconExternalLink, IconPlus, IconTrash } from '@tabler/icons-react'
import { ActionMenu, ActionMenuItem } from '@/components/ui/ActionMenu'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { cn } from '@/lib/utils'
import { AdminDataTable, type AdminDataTableColumn } from '@/components/ui/AdminDataTable'
import DuplicatesPanel from './DuplicatesPanel'
import LinkedContactsPanel from './LinkedContactsPanel'
import NewSendersPanel from './NewSendersPanel'
import { AdminPageHeader } from '@/components/ui/AdminPageHeader'
import { BulkActionBar } from '@/components/ui/BulkActionBar'
import { StatusPill } from '@/components/ui/StatusPill'
import { ADDRESS_FIELDS, addressColumns, addressFromRecord } from '../../../lib/pcd-contact-details';
import { useToast } from '@/components/ui/Toast'
import { AdminPagination, useAdminPagination } from '../_components/AdminPagination'

interface Customer {
  id:            string
  name?:         string
  company_name?: string
  email?:        string
  phone?:        string
  site_address?:  string
  site_street?:   string
  site_suburb?:   string
  site_postcode?: string
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
  site_address:   string
  site_street:    string
  site_suburb:    string
  site_postcode:  string
  notes:         string
  is_active:     boolean
}

const emptyForm: CustomerForm = {
  id:           '',
  name:         '',
  company_name: '',
  email:        '',
  phone:        '',
  site_address:  '',
  site_street:   '',
  site_suburb:   '',
  site_postcode: '',
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
    ...addressColumns(addressFromRecord(customer)),
    notes:        customer.notes        || '',
    is_active:    customer.is_active    ?? true,
  }
}

export default function CustomersManager() {
  const router = useRouter()
  const [customers,           setCustomers]           = React.useState<Customer[]>([])
  const [form,                setForm]                = React.useState<CustomerForm>(emptyForm)
  const [isLoading,           setIsLoading]           = React.useState(true)
  const [isSaving,            setIsSaving]            = React.useState(false)
  const [setupRequired,       setSetupRequired]       = React.useState(false)
  const [search,              setSearch]              = React.useState('')
  const [isCustomerModalOpen, setIsCustomerModalOpen] = React.useState(false)
  const [selectedCustomerIds, setSelectedCustomerIds] = React.useState<string[]>([])
  const [confirmDeleteIds,    setConfirmDeleteIds]    = React.useState<string[]>([])

  // THREE LISTS, ONE AT A TIME.
  //
  // Possible duplicates and undecided senders used to sit as blocks above the
  // customer table and push it down the page. Neither is something you look at
  // every day, and both grow: fifty duplicates would have buried the list this
  // page is for. They are their own views now, with a count on the tab so a
  // queue is never invisible just because it is not on screen.
  const [view, setView] = React.useState<'customers' | 'duplicates' | 'senders' | 'linked'>('customers')
  const [duplicateCount, setDuplicateCount] = React.useState(0)
  const [senderCount, setSenderCount] = React.useState(0)
  // Not a queue. Linked contacts are the ones that are already right, and the
  // list only ever grows, so it gets its own tab and its own pages rather than
  // sitting under the duplicates table where fifty of them would bury it.
  const [linkedCount, setLinkedCount] = React.useState(0)
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

  // The three parts and the joined one-liner move together. Everything that
  // reads a customer address still reads site_address, so a screen that wrote
  // only the parts would show the old address everywhere else.
  function updateAddress(key: string, value: string) {
    setForm(current => ({
      ...current,
      ...addressColumns({ ...addressFromRecord(current), [key]: value }),
    }))
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

  // Who each linked record belongs to, so the list can say so rather than
  // showing what looks like a second person with almost no history.
  const primaryById = React.useMemo(() => {
    const byId = new Map(customers.map(c => [c.id, c]))
    return (customer: Customer) => {
      const parentId = (customer as { merged_into_id?: string | null }).merged_into_id
      return parentId ? byId.get(parentId) || null : null
    }
  }, [customers])

  const customerColumns = React.useMemo<AdminDataTableColumn<Customer>[]>(() => [
    {
      id: 'customer',
      header: 'Customer',
      cell: customer => {
        const parent = primaryById(customer)
        return (
          <span className="flex flex-col">
            <Link
              href={`/admin/customers/${parent?.id || customer.id}`}
              className="font-medium text-[#1a1a18] underline-offset-2 hover:text-[#2d5e28] hover:underline"
            >
              {customer.name || customer.email || 'Customer'}
            </Link>
            {parent && (
              <span className="text-[11px] text-[#8b8a81]">
                Contact of {parent.name || parent.email}
              </span>
            )}
          </span>
        )
      },
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
            <ActionMenuItem icon={<IconExternalLink size={14} />} onClick={() => { window.location.href = `/admin/customers/${customer.id}` }}>
              Open customer desk
            </ActionMenuItem>
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
  ], [isSaving, primaryById])

  function renderCustomerMobileCard(customer: Customer) {
    return (
      <article className="rounded-[8px] border border-[#dbd8cc] bg-white p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/admin/customers/${customer.id}`}
              className="text-[14px] font-semibold text-[#1a1a18] underline-offset-2 hover:text-[#2d5e28] hover:underline"
            >
              {customer.name || customer.email || 'Customer'}
            </Link>
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
            <ActionMenuItem icon={<IconExternalLink size={14} />} onClick={() => { window.location.href = `/admin/customers/${customer.id}` }}>
              Open customer desk
            </ActionMenuItem>
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

      <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-[#dbd8cc]">
        {([
          ['customers', 'Customers', 0, false],
          ['duplicates', 'Possible duplicates', duplicateCount, true],
          ['senders', 'New senders', senderCount, true],
          ['linked', 'Linked contacts', linkedCount, false],
        ] as const).map(([key, label, count, isQueue]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-current={view === key ? 'page' : undefined}
            className={cn(
              'relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
              view === key
                ? 'border-[#1c2b1e] text-[#1a1a18]'
                : 'border-transparent text-[#8b8a81] hover:text-[#1a1a18]'
            )}
          >
            {label}
            {count > 0 && (
              <span
                className={cn(
                  'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold',
                  view === key
                    ? 'bg-[#1c2b1e] text-white'
                    // Amber says "somebody has to look at this". A list that is
                    // already sorted out gets a plain grey count instead.
                    : isQueue ? 'bg-[#f0e4cc] text-[#7a5a2a]' : 'bg-[#f0efe9] text-[#5a5a52]'
                )}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* All three stay mounted so their counts are live and switching back does
          not refetch. Only one is ever on screen. */}
      <div className={view === 'duplicates' ? '' : 'hidden'}>
        <DuplicatesPanel onCount={setDuplicateCount} />
      </div>

      <div className={view === 'senders' ? '' : 'hidden'}>
        <NewSendersPanel onCount={setSenderCount} />
      </div>

      <div className={view === 'linked' ? '' : 'hidden'}>
        <LinkedContactsPanel onCount={setLinkedCount} />
      </div>

      <div className={view === 'customers' ? '' : 'hidden'}>
      <AdminDataTable
        rows={pageItems}
        columns={customerColumns}
        getRowId={customer => customer.id}
        getRowLabel={customer => customer.name || 'customer'}
        onRowClick={customer => router.push(`/admin/customers/${customer.id}`)}
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
      </div>

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
          {ADDRESS_FIELDS.map(field => (
            <Input
              key={field.key}
              label={field.label}
              placeholder={field.placeholder}
              autoComplete={field.autoComplete}
              inputMode={field.inputMode}
              value={(form as unknown as Record<string, string>)[`site_${field.key}`] || ''}
              onChange={event => updateAddress(field.key, event.target.value)}
              optional
              containerClassName={field.key === 'street' ? 'md:col-span-2' : undefined}
            />
          ))}
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
