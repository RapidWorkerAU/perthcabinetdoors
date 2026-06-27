'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '../../../../lib/supabase/client'
import { AdminPagination, useAdminPagination } from '../../_components/AdminPagination'
import { cn } from '@/lib/utils'
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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1a18]">Products</h1>
          <p className="text-[13px] text-[#5a5a52] mt-[2px]">Manage your product catalogue</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {selectedProductIds.length > 0 ? (
            <button
              type="button"
              onClick={() => deleteProducts(selectedProductIds)}
              disabled={isDeleting}
              className="text-[13px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
            >
              Delete {selectedProductIds.length} selected
            </button>
          ) : (
            <span className="text-[13px] text-[#8b8a81]">{sorted.length} {sorted.length === 1 ? 'product' : 'products'}</span>
          )}
        </div>
        <Link
          href="/admin/products/new"
          className="h-[34px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] transition-colors inline-flex items-center"
        >
          Add product
        </Link>
      </div>

      <div className="bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
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
                      <span className={cn(
                        'inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border',
                        active
                          ? 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]'
                          : 'bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]'
                      )}>
                        {active ? 'Active' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{product.image_count || 0}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{prettyCategory(product.category)}</td>
                    <td className="px-4 py-[11px]" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/admin/products/${product.id}/edit`}
                          className="text-[12px] font-medium text-[#1c2b1e] hover:underline"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/admin/products/${product.id}/quote`}
                          className="text-[12px] font-medium text-[#1c2b1e] hover:underline"
                        >
                          Quote
                        </Link>
                        <button
                          type="button"
                          onClick={() => deleteProducts([product.id])}
                          disabled={isDeleting}
                          className="text-[12px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
                        >
                          Delete
                        </button>
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
    </div>
  )
}
