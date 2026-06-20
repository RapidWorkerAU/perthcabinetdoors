"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../admin-content.module.css";

export const ADMIN_TABLE_PAGE_SIZE = 7;

export function useAdminTablePagination(items, resetKey = "") {
  const [page, setPage] = useState(1);
  const totalItems = items.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / ADMIN_TABLE_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), pageCount);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [page, safePage]);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * ADMIN_TABLE_PAGE_SIZE;
    return items.slice(start, start + ADMIN_TABLE_PAGE_SIZE);
  }, [items, safePage]);

  return {
    page: safePage,
    pageCount,
    pageItems,
    setPage,
    totalItems,
  };
}

export function AdminTablePagination({ label = "records", page, pageCount, totalItems, onPageChange }) {
  const isPaginated = totalItems > ADMIN_TABLE_PAGE_SIZE;
  const start = totalItems ? (page - 1) * ADMIN_TABLE_PAGE_SIZE + 1 : 0;
  const end = totalItems ? Math.min(page * ADMIN_TABLE_PAGE_SIZE, totalItems) : 0;

  return (
    <div className={`${styles.tablePagination} ${!isPaginated ? styles.tablePaginationMuted : ""}`}>
      <p className={styles.tablePaginationMeta}>
        {totalItems ? `Showing ${start}-${end} of ${totalItems} ${label}` : `No ${label}`}
      </p>
      <div className={styles.tablePaginationControls} aria-label={`Paginate ${label}`}>
        <button
          type="button"
          className={styles.tablePaginationButton}
          onClick={() => onPageChange(page - 1)}
          disabled={!isPaginated || page <= 1}
        >
          Prev
        </button>
        <span className={styles.tablePaginationPage}>
          {page} / {pageCount}
        </span>
        <button
          type="button"
          className={styles.tablePaginationButton}
          onClick={() => onPageChange(page + 1)}
          disabled={!isPaginated || page >= pageCount}
        >
          Next
        </button>
      </div>
    </div>
  );
}

