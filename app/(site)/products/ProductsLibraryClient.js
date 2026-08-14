"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import PublicFilterSheet from "@/components/public/PublicFilterSheet";
import PublicFooter from "@/components/public/PublicFooter";
import PublicProductCard from "@/components/public/PublicProductCard";
import { DEFAULT_TYPES, PRODUCTS } from "./product-data";
import styles from "./products.module.css";

const ALL_MATERIALS = ["thermolaminate", "decorative", "compact"];

const TYPE_OPTIONS = [
  ["door", "Door"],
  ["drawer-front", "Drawer front"],
  ["panel", "Panel"],
  ["table-top", "Table top"],
];

const MATERIAL_OPTIONS = [
  ["thermolaminate", "Thermolaminate"],
  ["decorative", "Decorative board"],
  ["compact", "Compact laminate"],
];

function toggleValue(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

// Shared between the desktop sidebar and the mobile full-screen filter
// modal so both stay in sync from the same markup instead of two
// hand-maintained copies.
function FilterGroups({ types, materials, onToggleType, onToggleMaterial }) {
  return (
    <>
      <div className={styles.filterGroup}>
        <div className={styles.filterGroupLabel}>Product type</div>
        {TYPE_OPTIONS.map(([value, label]) => (
          <label className={styles.filterOption} key={value}>
            <input type="checkbox" checked={types.includes(value)} onChange={() => onToggleType(value)} />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <div className={styles.filterGroup}>
        <div className={styles.filterGroupLabel}>Material</div>
        {MATERIAL_OPTIONS.map(([value, label]) => (
          <label className={styles.filterOption} key={value}>
            <input type="checkbox" checked={materials.includes(value)} onChange={() => onToggleMaterial(value)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </>
  );
}

export default function ProductsLibraryClient({ products = PRODUCTS }) {
  const [types, setTypes] = useState(DEFAULT_TYPES);
  const [materials, setMaterials] = useState(ALL_MATERIALS);
  const [sort, setSort] = useState("default");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const matchType = types.includes(product.type);
      const matchMaterial = materials.some((m) => {
        if (m === "decorative") return product.material === "16mm" || product.material === "18mm";
        return product.material === m;
      });

      return matchType && matchMaterial;
    });

    if (sort === "price-asc") {
      return [...filtered].sort((a, b) => a.price - b.price);
    }
    if (sort === "price-desc") {
      return [...filtered].sort((a, b) => b.price - a.price);
    }
    return filtered;
  }, [materials, products, sort, types]);

  function resetFilters() {
    setTypes(DEFAULT_TYPES);
    setMaterials(ALL_MATERIALS);
    setSort("default");
  }

  function handleToggleType(value) {
    setTypes((current) => toggleValue(current, value));
  }

  function handleToggleMaterial(value) {
    setMaterials((current) => toggleValue(current, value));
  }

  // Only counts as "active" once something has been narrowed from the
  // default (everything selected) state, matches what "Reset all filters"
  // resets back to.
  const activeFilterCount =
    (DEFAULT_TYPES.length - types.length) + (ALL_MATERIALS.length - materials.length);

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderInner}>
          <div className={styles.breadcrumb}><Link href="/">Home</Link> &rsaquo; Products</div>
          <h1>Our Products</h1>
          <p>
            Browse our range of Polytec cabinet doors, drawer fronts and panels. All made to your
            measurements, pre-drilled and shipped flat rate across Perth metro. Laminex and Formica
            available on request.
          </p>
        </div>
      </header>

      <div className={styles.catalogue}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeading}>Filter products</div>
          <FilterGroups
            types={types}
            materials={materials}
            onToggleType={handleToggleType}
            onToggleMaterial={handleToggleMaterial}
          />
          <button className={styles.filterReset} type="button" onClick={resetFilters}>
            Reset all filters
          </button>
        </aside>

        <section>
          <button
            type="button"
            className={styles.mobileFilterTrigger}
            onClick={() => setFiltersOpen(true)}
          >
            <span>Filters</span>
            {activeFilterCount > 0 ? (
              <span className={styles.mobileFilterBadge}>{activeFilterCount}</span>
            ) : null}
          </button>

          <div className={styles.toolbar}>
            <p className={styles.resultCount}>Showing <strong>{visibleProducts.length}</strong> products</p>
            <div className={styles.sortWrap}>
              <label htmlFor="sort">Sort by</label>
              <select className="pcdSelect" id="sort" value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="default">Featured</option>
                <option value="price-asc">Starting price: low to high</option>
                <option value="price-desc">Starting price: high to low</option>
              </select>
            </div>
          </div>

          <div className={styles.productGrid}>
            {visibleProducts.map((product) => (
              <PublicProductCard classNames={styles} key={product.id} product={product} />
            ))}

            {visibleProducts.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No products match your selected filters.</p>
                <span>Try adjusting or resetting your filters.</span>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <PublicFooter className={styles.siteFooter} />

      <PublicFilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter products"
        resetClassName={styles.modalFilterReset}
        applyClassName={styles.mobileFilterApplyBtn}
        resultsLabel={`Show ${visibleProducts.length} results`}
        onReset={resetFilters}
        onApply={() => setFiltersOpen(false)}
      >
        <FilterGroups
          types={types}
          materials={materials}
          onToggleType={handleToggleType}
          onToggleMaterial={handleToggleMaterial}
        />
      </PublicFilterSheet>
    </main>
  );
}
