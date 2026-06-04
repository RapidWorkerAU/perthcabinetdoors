"use client";

import { useMemo, useState } from "react";
import { DEFAULT_IKEA, DEFAULT_MATERIALS, DEFAULT_TYPES, PRODUCTS } from "./product-data";
import styles from "./products.module.css";

function toggleValue(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function ProductsLibraryClient({ products = PRODUCTS }) {
  const [types, setTypes] = useState(DEFAULT_TYPES);
  const [materials, setMaterials] = useState(DEFAULT_MATERIALS);
  const [compat, setCompat] = useState("all");
  const [ikea, setIkea] = useState(DEFAULT_IKEA);
  const [sort, setSort] = useState("default");

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const matchType = types.includes(product.type);
      const matchMaterial = materials.includes(product.material);

      let matchCompat = true;
      if (compat === "ikea") {
        const tileIsIkea = product.compat === "ikea";
        const subMatch = ikea.length === 0 || ikea.includes(product.ikea);
        matchCompat = tileIsIkea && subMatch;
      } else if (compat === "kaboodle") {
        matchCompat = product.compat === "kaboodle";
      }

      return matchType && matchMaterial && matchCompat;
    });

    if (sort === "price-asc") {
      return [...filtered].sort((a, b) => a.price - b.price);
    }
    if (sort === "price-desc") {
      return [...filtered].sort((a, b) => b.price - a.price);
    }
    return filtered;
  }, [compat, ikea, materials, products, sort, types]);

  function resetFilters() {
    setTypes(DEFAULT_TYPES);
    setMaterials(DEFAULT_MATERIALS);
    setIkea(DEFAULT_IKEA);
    setCompat("all");
    setSort("default");
  }

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

          <div className={styles.filterGroup}>
            <div className={styles.filterGroupLabel}>Product type</div>
            {[
              ["door", "Door"],
              ["drawer-front", "Drawer front"],
              ["panel", "Panel"],
              ["table-top", "Table top"],
            ].map(([value, label]) => (
              <label className={styles.filterOption} key={value}>
                <input type="checkbox" checked={types.includes(value)} onChange={() => setTypes(toggleValue(types, value))} />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className={styles.filterGroup}>
            <div className={styles.filterGroupLabel}>Material</div>
            {[
              ["thermolaminate", "Thermolaminate"],
              ["16mm", "16mm decorative board"],
              ["18mm", "18mm decorative board"],
              ["compact", "Compact laminate"],
            ].map(([value, label]) => (
              <label className={styles.filterOption} key={value}>
                <input type="checkbox" checked={materials.includes(value)} onChange={() => setMaterials(toggleValue(materials, value))} />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className={styles.filterGroup}>
            <div className={styles.filterGroupLabel}>Compatibility</div>
            {[
              ["all", "All products"],
              ["ikea", "IKEA compatible"],
              ["kaboodle", "Kaboodle compatible"],
            ].map(([value, label]) => (
              <label className={styles.filterOption} key={value}>
                <input type="radio" name="compat" checked={compat === value} onChange={() => setCompat(value)} />
                <span>{label}</span>
              </label>
            ))}
            <div className={`${styles.subOptions} ${compat === "ikea" ? styles.visible : ""}`}>
              {[
                ["besta", "Besta compatible"],
                ["pax", "Pax compatible"],
                ["metod", "Metod compatible"],
              ].map(([value, label]) => (
                <label className={styles.subOption} key={value}>
                  <input type="checkbox" checked={ikea.includes(value)} onChange={() => setIkea(toggleValue(ikea, value))} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <button className={styles.filterReset} type="button" onClick={resetFilters}>
            Reset all filters
          </button>
        </aside>

        <section>
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
    </main>
  );
}
