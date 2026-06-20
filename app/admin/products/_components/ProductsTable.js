"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";
import styles from "../../admin-content.module.css";
import { AdminActionDropdown, AdminBulkDeleteButton, AdminConfirmDeleteAction } from "../../_components/AdminActionDropdown";
import { AdminTablePagination, useAdminTablePagination } from "../../_components/AdminTablePagination";

function prettyCategory(category) {
  if (!category) return "-";
  return category
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveImageSrc(imageUrl) {
  if (!imageUrl) return "";
  const value = imageUrl.trim();

  if (
    value.startsWith("/") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return value;
  }

  return `/${value.replace(/^\.\//, "")}`;
}

export default function ProductsTable({ initialProducts }) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts || []);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState([]);

  const sorted = useMemo(
    () => [...products].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [products]
  );
  const productPagination = useAdminTablePagination(sorted);

  async function deleteProducts(ids) {
    if (!ids.length) return;

    setIsDeleting(true);
    setFeedback("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("products").delete().in("id", ids);

      if (error) {
        setFeedback(error.message || "Could not delete product.");
        return;
      }

      setProducts((previous) => previous.filter((p) => !ids.includes(p.id)));
      setSelectedProductIds((current) => current.filter((id) => !ids.includes(id)));
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  }

  function toggleSelectedProduct(id) {
    setSelectedProductIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectedPage(checked) {
    const pageIds = productPagination.pageItems.map((product) => product.id);
    setSelectedProductIds((current) => {
      if (!checked) return current.filter((id) => !pageIds.includes(id));
      return Array.from(new Set([...current, ...pageIds]));
    });
  }

  return (
    <section className={styles.productsSection}>
      <div className={`${styles.productsHeaderBar} ${styles.tableToolbar}`}>
        <div className={styles.tableToolbarFilters}>
          <AdminBulkDeleteButton count={selectedProductIds.length} disabled={isDeleting} onConfirm={() => deleteProducts(selectedProductIds)} />
        </div>
        <Link href="/admin/products/new" className={styles.addProductButton}>
          Add product
        </Link>
      </div>

      <div className={styles.productsTableWrap}>
        <table className={styles.productsTable}>
          <thead>
            <tr>
              <th className={styles.rowSelectCol}>
                <input
                  type="checkbox"
                  checked={productPagination.pageItems.length > 0 && productPagination.pageItems.every((product) => selectedProductIds.includes(product.id))}
                  onChange={(event) => toggleSelectedPage(event.target.checked)}
                  aria-label="Select all visible products"
                />
              </th>
              <th className={styles.imageCol}>Image</th>
              <th>Name</th>
              <th>Status</th>
              <th>Images</th>
              <th>Category</th>
              <th className={styles.actionsCol}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {productPagination.pageItems.map((product) => {
              const active = product.is_active;
              const thumbnailSrc = resolveImageSrc(product.primary_image_url);
              return (
                <tr
                  key={product.id}
                  className={styles.rowClickable}
                  onClick={() => router.push(`/admin/products/${product.id}/edit`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/admin/products/${product.id}/edit`);
                    }
                  }}
                  tabIndex={0}
                >
                  <td className={styles.rowSelectCol} onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(product.id)}
                      onChange={() => toggleSelectedProduct(product.id)}
                      aria-label={`Select ${product.name}`}
                    />
                  </td>
                  <td>
                    {thumbnailSrc ? (
                      <img
                        className={styles.productThumb}
                        src={thumbnailSrc}
                        alt={product.card_title || product.name || "Product image"}
                      />
                    ) : (
                      <div className={styles.thumbPlaceholder}>No image</div>
                    )}
                  </td>
                  <td>
                    <div className={styles.productNameCell}>{product.card_title || product.name}</div>
                  </td>
                  <td>
                    <span
                      className={`${styles.statusPill} ${
                        active ? styles.statusPillActive : styles.statusPillDraft
                      }`}
                    >
                      {active ? "Active" : "Draft"}
                    </span>
                  </td>
                  <td>{product.image_count || 0}</td>
                  <td>{prettyCategory(product.category)}</td>
                  <td className={styles.actionsCol}>
                    <AdminActionDropdown label={`Open actions for ${product.name}`}>
                      <Link href={`/admin/products/${product.id}/edit`} className={styles.tableActionMenuItem}>
                        Edit
                      </Link>
                      <Link href={`/admin/products/${product.id}/quote`} className={styles.tableActionMenuItem}>
                        Quote
                      </Link>
                      <AdminConfirmDeleteAction onConfirm={() => deleteProducts([product.id])} />
                    </AdminActionDropdown>
                  </td>
                </tr>
              );
            })}
            {!sorted.length ? (
              <tr>
                <td colSpan={7} className={styles.emptyCell}>
                  No products yet. Click Add product to create your first product.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <AdminTablePagination
        label="products"
        page={productPagination.page}
        pageCount={productPagination.pageCount}
        totalItems={productPagination.totalItems}
        onPageChange={productPagination.setPage}
      />

      {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
    </section>
  );
}

