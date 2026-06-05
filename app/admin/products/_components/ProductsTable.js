"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";
import styles from "../../admin-shell.module.css";
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
  const [target, setTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState("");

  const sorted = useMemo(
    () => [...products].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [products]
  );
  const productPagination = useAdminTablePagination(sorted);

  async function handleDeleteConfirmed() {
    if (!target) return;

    setIsDeleting(true);
    setFeedback("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("products").delete().eq("id", target.id);

      if (error) {
        setFeedback(error.message || "Could not delete product.");
        return;
      }

      setProducts((previous) => previous.filter((p) => p.id !== target.id));
      setTarget(null);
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className={styles.productsSection}>
      <div className={styles.productsHeaderBar}>
        <span className={styles.tableMeta}>{sorted.length} products</span>
        <Link href="/admin/products/new" className={styles.addProductButton}>
          Add product
        </Link>
      </div>

      <div className={styles.productsTableWrap}>
        <table className={styles.productsTable}>
          <thead>
            <tr>
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
                  <td>
                    <div className={styles.rowActions}>
                      <Link
                        href={`/admin/products/${product.id}/edit`}
                        className={`${styles.rowEditButton} ${styles.rowIconButton} ${styles.rowEditIconButton}`}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Edit ${product.name}`}
                        title="Edit"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/admin/products/${product.id}/quote`}
                        className={styles.rowEditButton}
                        onClick={(event) => event.stopPropagation()}
                      >
                        Quote
                      </Link>
                      <button
                        type="button"
                        className={`${styles.rowDeleteButton} ${styles.rowIconButton} ${styles.rowDeleteIconButton}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setTarget(product);
                        }}
                        aria-label={`Delete ${product.name}`}
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!sorted.length ? (
              <tr>
                <td colSpan={6} className={styles.emptyCell}>
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

      {target ? (
        <div className={styles.fullscreenOverlay} role="dialog" aria-modal="true">
          <div className={styles.overlayCard}>
            <h2 className={styles.overlayTitle}>Delete product?</h2>
            <p className={styles.overlayText}>
              Are you sure you want to delete <strong>{target.card_title || target.name}</strong>? This will
              also delete all associated product images and related data.
            </p>
            <div className={styles.overlayActions}>
              <button
                type="button"
                className={styles.overlayCancelButton}
                onClick={() => setTarget(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.overlayDeleteButton}
                onClick={handleDeleteConfirmed}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete product"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
