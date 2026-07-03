"use client";

import { useMemo, useState } from "react";
import PortalModal from "@/components/PortalModal";
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
  // default (everything selected) state — matches what "Reset all filters"
  // resets back to.
  const activeFilterCount =
    (DEFAULT_TYPES.length - types.length) + (ALL_MATERIALS.length - materials.length);

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderInner}>
          <div className={styles.breadcrumb}><a href="/">Home</a> &rsaquo; Products</div>
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
              <select id="sort" value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="default">Featured</option>
                <option value="price-asc">Starting price: low to high</option>
                <option value="price-desc">Starting price: high to low</option>
              </select>
            </div>
          </div>

          <div className={styles.productGrid}>
            {visibleProducts.map((product) => (
              <article className={styles.tile} key={product.id}>
                <div className={styles.tileImage}>
                  {product.galleryImages?.[0] ? (
                    <img className={styles.tileProductImage} src={product.galleryImages[0]} alt={product.name} />
                  ) : (
                    <div className={styles.tileImagePlaceholder}>
                      <div className={styles.tileImageIcon} />
                      <span className={styles.tileImageLabel}>Product photo</span>
                    </div>
                  )}
                  <div className={styles.tileBadges}>
                    {product.compatLabel ? <span className={`${styles.badge} ${styles.badgeCompat}`}>{product.compatLabel}</span> : null}
                    <span className={`${styles.badge} ${styles.badgeMaterial}`}>{product.materialLabel}</span>
                  </div>
                </div>
                <div className={styles.tileBody}>
                  <div className={styles.tileType}>{product.typeLabel}</div>
                  <h2 className={styles.tileName}>{product.name}</h2>
                  <p className={styles.tileDesc}>{product.desc}</p>
                  <div className={styles.tileFooter}>
                    <div>
                      <div className={styles.tilePriceLabel}>Starting from</div>
                      <div className={styles.tilePriceAmount}>${product.price}</div>
                      <div className={styles.tilePriceSize}>{product.size}</div>
                    </div>
                    <a href={`/products/${product.slug || product.id}`} className={styles.tileBtn}>View details</a>
                  </div>
                </div>
              </article>
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

      <footer>
        <div className={styles.siteFooter}>
          <p>Copyright 2026 Perth Cabinet Doors. All rights reserved.</p>
          <p>
            Perth, Western Australia &nbsp;&middot;&nbsp; <a href="tel:0408906784">0408 906 784</a>{" "}
            &nbsp;&middot;&nbsp; <a href="mailto:sales@perthcabinetdoors.com.au">sales@perthcabinetdoors.com.au</a>
          </p>
        </div>
      </footer>

      <PortalModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        ariaLabel="Filter products"
        title="Filter products"
        footer={
          <>
            <button className={styles.modalFilterReset} type="button" onClick={resetFilters}>
              Reset all filters
            </button>
            <button
              className={styles.mobileFilterApplyBtn}
              type="button"
              onClick={() => setFiltersOpen(false)}
            >
              Show {visibleProducts.length} results
            </button>
          </>
        }
      >
        <FilterGroups
          types={types}
          materials={materials}
          onToggleType={handleToggleType}
          onToggleMaterial={handleToggleMaterial}
        />
      </PortalModal>
    </main>
  );
}
