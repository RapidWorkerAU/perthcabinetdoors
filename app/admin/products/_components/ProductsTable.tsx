'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconFileText, IconPlus, IconTrash } from '@tabler/icons-react'
import { createSupabaseBrowserClient } from '../../../../lib/supabase/client'
import { AdminPagination, useAdminPagination } from '../../_components/AdminPagination'
import { ActionMenu, ActionMenuItem } from '@/components/ui/ActionMenu'
import { AdminPageHeader } from '@/components/ui/AdminPageHeader'
import { BulkActionBar } from '@/components/ui/BulkActionBar'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/Modal'
import { StatusPill } from '@/components/ui/StatusPill'
import { useToast } from '@/components/ui/Toast'
import { tableStyles as t } from '@/components/ui/table-styles'
import { cn } from '@/lib/utils'

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

  const emptyMessage = 'No products yet. Click Add product to create your first product.'

  function thumbnail(product: Product) {
    const thumbnailSrc = resolveImageSrc(product.primary_image_url)
    return thumbnailSrc ? (
      <img
        src={thumbnailSrc}
        alt={product.card_title || product.name || 'Product image'}
        className="w-[40px] h-[40px] flex-shrink-0 object-cover rounded-[4px] block"
      />
    ) : (
      <div className="w-[40px] h-[40px] flex-shrink-0 rounded-[4px] bg-[#f5f5f4] border border-[#dbd8cc] flex items-center justify-center text-[9px] text-[#8b8a81] text-center leading-tight">
        No image
      </div>
    )
  }

  function statusPill(product: Product) {
    return (
      <StatusPill tone={product.is_active ? 'active' : 'neutral'} status={product.is_active ? 'active' : 'draft'}>
        {product.is_active ? 'Active' : 'Draft'}
      </StatusPill>
    )
  }

  // One menu for the table and the phone card, so they cannot offer different things.
  function actionMenu(product: Product) {
    return (
      <ActionMenu label={`Open actions for product ${product.card_title || product.name || 'product'}`}>
        {/* Edit was here and repeated the row: clicking the row
            already opens the editor. */}
        <ActionMenuItem icon={<IconFileText size={14} />} onClick={() => router.push(`/admin/products/${product.id}/quote`)}>
        Quote
        </ActionMenuItem>
        <ActionMenuItem icon={<IconTrash size={14} />} variant="danger" disabled={isDeleting} onClick={() => setConfirmDeleteIds([product.id])}>
        Delete
        </ActionMenuItem>
      </ActionMenu>
    )
  }

  function selectBox(product: Product) {
    return (
      <input
        type="checkbox"
        checked={selectedProductIds.includes(product.id)}
        onChange={() => toggleSelectedProduct(product.id)}
        aria-label={`Select ${product.name}`}
        className={t.checkbox}
      />
    )
  }

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

      {/* Built from the shared tokens rather than AdminDataTable, which has no
          way to let a row be opened from the keyboard, and this one can be. */}
      <div className={cn(t.card, t.desktopOnly)}>
        <div className={t.sideScroll}>
          <table className={t.tableWide}>
            <thead>
              <tr>
                <th className={cn(t.th, 'w-[40px]')}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={e => toggleSelectedPage(e.target.checked)}
                    aria-label="Select all visible products"
                    className={t.checkbox}
                  />
                </th>
                {['Image', 'Name', 'Status', 'Images', 'Category', 'Actions'].map(col => (
                  <th key={col} className={t.th}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={t.body}>
              {pageItems.map(product => (
                <tr
                  key={product.id}
                  className={t.rowClickable}
                  onClick={() => router.push(`/admin/products/${product.id}/edit`)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      router.push(`/admin/products/${product.id}/edit`)
                    }
                  }}
                  tabIndex={0}
                >
                  <td className={t.td} onClick={e => e.stopPropagation()}>
                    {selectBox(product)}
                  </td>
                  <td className={t.td}>{thumbnail(product)}</td>
                  <td className={cn(t.td, 'font-medium')}>
                    {product.card_title || product.name}
                  </td>
                  <td className={t.td}>{statusPill(product)}</td>
                  <td className={cn(t.td, t.num)}>{product.image_count || 0}</td>
                  <td className={t.td}>{prettyCategory(product.category)}</td>
                  <td className={t.td} onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end">{actionMenu(product)}</div>
                  </td>
                </tr>
              ))}
              {!sorted.length && (
                <tr>
                  <td colSpan={7} className={t.empty}>{emptyMessage}</td>
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

      {/* Below md the rows become cards. The name links to the same editor the row opens. */}
      <div className={t.mobileList}>
        {!sorted.length && <div className={cn(t.card, t.empty)}>{emptyMessage}</div>}
        {pageItems.map(product => (
          <article key={product.id} className={t.mobileCard}>
            <div className="flex items-start gap-3">
              {selectBox(product)}
              {thumbnail(product)}
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => router.push(`/admin/products/${product.id}/edit`)}
                  className="text-left text-[14px] font-semibold text-[#1a1a18]"
                >
                  {product.card_title || product.name}
                </button>
                <p className="text-[12px] text-[#5a5a52]">{prettyCategory(product.category)}</p>
              </div>
              {statusPill(product)}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#edf4eb] pt-3 text-[12px]">
              <span>
                <span className="text-[#8b8a81]">Images </span>
                <span className={cn(t.num, 'text-[#1a1a18]')}>{product.image_count || 0}</span>
              </span>
              {actionMenu(product)}
            </div>
          </article>
        ))}
        {sorted.length > 0 && (
          <AdminPagination
            label="products"
            page={page}
            pageCount={pageCount}
            totalItems={totalItems}
            onPageChange={setPage}
          />
        )}
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
