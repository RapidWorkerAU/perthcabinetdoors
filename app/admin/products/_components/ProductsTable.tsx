'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconEdit, IconFileText, IconPlus, IconTrash } from '@tabler/icons-react'
import { createSupabaseBrowserClient } from '../../../../lib/supabase/client'
import { AdminPagination, useAdminPagination } from '../../_components/AdminPagination'
import { ActionMenu, ActionMenuItem } from '@/components/ui/ActionMenu'
import { AdminPageHeader } from '@/components/ui/AdminPageHeader'
import { BulkActionBar } from '@/components/ui/BulkActionBar'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/Modal'
import { StatusPill } from '@/components/ui/StatusPill'
import { useToast } from '@/components/ui/Toast'

function prettyCategory(category?: string | null) {
  if (!category) return '-'
  return category
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function resolveImageSrc(imageUrl?: string | null) {
  if (!imageUrl) return ''
  const value = imageUrl.trim()
  if (
    value.startsWith('/') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:') ||
    value.startsWith('blob:')
  ) {
    return value
  }
  return `/${value.replace(/^\.\//, '')}`
}

interface Product {
  id:                string
  name?:             string
  card_title?:       string
  category?:         string
  is_active?:        boolean
  sort_order?:       number
  image_count?:      number
  primary_image_url?: string | null
}

export default function ProductsTable({ initialProducts }: { initialProducts?: Product[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [products,         setProducts]         = useState<Product[]>(initialProducts || [])
  const [isDeleting,       setIsDeleting]       = useState(false)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[]>([])

  const sorted = useMemo(
    () => [...products].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [products]
  )
  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(sorted)

  async function deleteProducts(ids: string[]) {
    if (!ids.length) return
    setIsDeleting(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.from('products').delete().in('id', ids)
      if (error) {
        toast({ title: error.message || 'Could not delete product.', variant: 'error' })
        return
      }
      setProducts(prev => prev.filter(p => !ids.includes(p.id)))
      setSelectedProductIds(cur => cur.filter(id => !ids.includes(id)))
      router.refresh()
    } finally {
      setIsDeleting(false)
      setConfirmDeleteIds([])
    }
  }

  function toggleSelectedProduct(id: string) {
    setSelectedProductIds(cur => cur.includes(id) ? cur.filter(i => i !== id) : [...cur, id])
  }

  function toggleSelectedPage(checked: boolean) {
    const pageIds = pageItems.map(p => p.id)
    setSelectedProductIds(cur => {
      if (!checked) return cur.filter(id => !pageIds.includes(id))
      return Array.from(new Set([...cur, ...pageIds]))
    })
  }

  const allPageSelected = pageItems.length > 0 && pageItems.every(p => selectedProductIds.includes(p.id))

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title="Products" subtitle="Manage your product catalogue" />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {selectedProductIds.length > 0 ? (
            <BulkActionBar
              selectedCount={selectedProductIds.length}
              noun="product"
              variant="inline"
              onClear={() => setSelectedProductIds([])}
              onDelete={() => setConfirmDeleteIds(selectedProductIds)}
              deleting={isDeleting}
            />
          ) : (
            <span className="text-[13px] text-[#8b8a81]">{sorted.length} {sorted.length === 1 ? 'product' : 'products'}</span>
          )}
        </div>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<IconPlus size={14} />}
          onClick={() => router.push('/admin/products/new')}
          aria-label="Add product"
          className="max-sm:w-10 max-sm:px-0"
        >
          <span className="max-sm:hidden">Add product</span>
        </Button>
      </div>

      <div className="bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
        <div className="overflow-x-auto">
          {/* min-w keeps the columns readable: the wrapper scrolls instead of
              the browser wrapping every cell onto two or three lines. */}
          <table className="w-full min-w-[840px] text-[13px]">
            <thead>
              <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                <th className="w-[40px] px-4 py-[9px]">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={e => toggleSelectedPage(e.target.checked)}
                    aria-label="Select all visible products"
                    className="accent-[#6b9e61]"
                  />
                </th>
                {['Image', 'Name', 'Status', 'Images', 'Category', 'Actions'].map(col => (
                  <th key={col} className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map(product => {
                const active       = product.is_active
                const thumbnailSrc = resolveImageSrc(product.primary_image_url)
                return (
                  <tr
                    key={product.id}
                    className="border-b border-[#edf4eb] hover:bg-[#f5f8f4] transition-colors last:border-b-0 cursor-pointer"
                    onClick={() => router.push(`/admin/products/${product.id}/edit`)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        router.push(`/admin/products/${product.id}/edit`)
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="px-4 py-[11px]" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedProductIds.includes(product.id)}
                        onChange={() => toggleSelectedProduct(product.id)}
                        aria-label={`Select ${product.name}`}
                        className="accent-[#6b9e61]"
                      />
                    </td>
                    <td className="px-4 py-[11px]">
                      {thumbnailSrc ? (
                        <img
                          src={thumbnailSrc}
                          alt={product.card_title || product.name || 'Product image'}
                          className="w-[40px] h-[40px] object-cover rounded-[4px] block"
                        />
                      ) : (
                        <div className="w-[40px] h-[40px] rounded-[4px] bg-[#f5f5f4] border border-[#dbd8cc] flex items-center justify-center text-[9px] text-[#8b8a81] text-center leading-tight">
                          No image
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-[11px] font-medium text-[#1a1a18]">
                      {product.card_title || product.name}
                    </td>
                    <td className="px-4 py-[11px]">
                      <StatusPill tone={active ? 'active' : 'neutral'} status={active ? 'active' : 'draft'}>
                        {active ? 'Active' : 'Draft'}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{product.image_count || 0}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{prettyCategory(product.category)}</td>
                    <td className="px-4 py-[11px]" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <ActionMenu label={`Open actions for product ${product.card_title || product.name || 'product'}`}>
                          <ActionMenuItem icon={<IconEdit size={14} />} onClick={() => router.push(`/admin/products/${product.id}/edit`)}>
                          Edit
                          </ActionMenuItem>
                          <ActionMenuItem icon={<IconFileText size={14} />} onClick={() => router.push(`/admin/products/${product.id}/quote`)}>
                          Quote
                          </ActionMenuItem>
                          <ActionMenuItem icon={<IconTrash size={14} />} variant="danger" disabled={isDeleting} onClick={() => setConfirmDeleteIds([product.id])}>
                          Delete
                          </ActionMenuItem>
                        </ActionMenu>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!sorted.length && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[13px] text-[#8b8a81]">
                    No products yet. Click Add product to create your first product.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <AdminPagination
          label="products"
          page={page}
          pageCount={pageCount}
          totalItems={totalItems}
          onPageChange={setPage}
        />
      </div>

      <ConfirmModal
        open={confirmDeleteIds.length > 0}
        onClose={() => setConfirmDeleteIds([])}
        title={confirmDeleteIds.length === 1 ? 'Delete product?' : 'Delete products?'}
        description={
          confirmDeleteIds.length === 1
            ? 'This product will be permanently removed from the catalogue.'
            : `${confirmDeleteIds.length} products will be permanently removed from the catalogue.`
        }
        variant="danger"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => deleteProducts(confirmDeleteIds)}
        loading={isDeleting}
      />
    </div>
  )
}
