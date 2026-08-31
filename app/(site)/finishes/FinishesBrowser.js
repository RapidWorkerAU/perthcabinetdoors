"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { profileImageSrc, edgeImageSrc } from "@/lib/pcd-profile-images";
import { edgeSupplier, profileSupplier } from "@/lib/pcd-profile-suppliers";
import { LAMINEX_PROFILES } from "@/lib/pcd-laminex-profiles";
import {
  PROFILED_FRONT_MATERIAL_KEY,
  PUBLIC_PRODUCT_TYPES,
  materialKeysForPublicProductType,
  materialLabelForKey,
  normaliseMaterialKey,
  publicProductType,
  publicProductTypesForMaterials,
} from "@/lib/pcd-materials";
import {
  DECORATIVE_BOARD_EDGE_PROFILES,
  PROFILE_NAMES_BY_TYPE,
  THERMOLAMINATE_EDGE_PROFILES,
} from "@/lib/quote-form-data";
import styles from "./finishes.module.css";

// The finishes library: every colour, every door profile, every edge detail.
//
// Built around three constraints the old kitchen-refresh sections could not
// meet. There are 274 colours across 17 finish ranges, so a row of filter pills
// wrapped to three lines - these are two selects instead. There are 97 door
// profiles, so four family cards showing three photos each was 12 of them.
// And the edge images have existed in /public/images/edges all along while this
// was the one page showing them as plain text.
//
// The product type filter came later, out of what people did with the page.
// They browsed the colours, picked one we only press as decorative board, and
// asked for it as a profiled door, which we cannot make. Every tab now answers
// "what am I making" first, so the colours, profiles and edge details left on
// screen are the ones that can actually be supplied that way.

const PAGE_SIZE = 48;
const ALL = "All";

const EDGE_GROUPS = [
  { group: "Thermolaminate", names: THERMOLAMINATE_EDGE_PROFILES },
  { group: "Decorative board", names: DECORATIVE_BOARD_EDGE_PROFILES },
];

const PROFILE_BLURBS = {
  Minimal: "Flat slab faces and fine single grooves. The quietest option.",
  Soft: "Rounded shoulders - the traditional shaker look.",
  Sharp: "Square-shouldered shaker with a crisp step.",
  Detailed: "Layered heritage mouldings with more shadow line.",
  Fluted: "Vertical fluting, available on 21mm board.",
};

const TABS = [
  { id: "colours", label: "Colours" },
  { id: "profiles", label: "Door profiles" },
  { id: "edges", label: "Edge details" },
];

// The boards a colour is pressed in, written out. This is the fact the whole
// product type filter turns on, so it is on the face of every colour tile as
// well: a customer scrolling with no filter set can still see that Ravine
// Chateau Oak is decorative board and will not come back as a profiled door.
function materialsLine(materials = []) {
  return materials
    .map((key) => materialLabelForKey(key))
    .filter(Boolean)
    .join(" + ");
}

export default function FinishesBrowser({
  colours = [],
  initialTab = "colours",
  initialProductType = ALL,
}) {
  const [tab, setTab] = useState(initialTab);
  // Product type sits above the tabs in meaning, so it is the one filter that
  // survives switching tabs. Somebody who has said "profiled doors" is still
  // making profiled doors when they go and look at the edge details.
  const [productType, setProductType] = useState(initialProductType);
  const [supplier, setSupplier] = useState(ALL);
  const [finish, setFinish] = useState(ALL);
  const [family, setFamily] = useState(ALL);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  // Both ranges, in one list. Polytec families are shapes (Minimal, Soft) and
  // Laminex groups are series, which reads oddly only if you look at them
  // together: the Brand filter is above the family filter, so choosing a brand
  // narrows the families to that brand every time.
  //
  // Every door profile in both ranges is pressed as a thermolaminate front, and
  // a front is a door or a drawer front. Saying so on each one is what lets the
  // product type filter reach this tab: choose Panels or Table tops and the
  // honest answer is that none of these apply, rather than 97 profiles that
  // cannot be had on the thing being made.
  const profiles = useMemo(
    () =>
      [
        ...Object.keys(PROFILE_NAMES_BY_TYPE).flatMap((type) =>
          PROFILE_NAMES_BY_TYPE[type].map((name) => ({
            name,
            family: type,
            supplier: profileSupplier(name, type),
            imageUrl: profileImageSrc(type, name),
          }))
        ),
        ...LAMINEX_PROFILES,
      ].map((profile) => ({
        ...profile,
        materials: [PROFILED_FRONT_MATERIAL_KEY],
        productTypes: ["Door", "Drawer front"],
      })),
    []
  );

  const edges = useMemo(
    () =>
      EDGE_GROUPS.flatMap(({ group, names }) =>
        names.map((name) => ({
          name: name.replace(/^EM\d+\s/, ""),
          code: (name.match(/^EM\d+/) || [""])[0],
          family: group,
          // The group IS the board it goes on, so the product type filter reads
          // the same fact the Board type dropdown reads rather than a second
          // copy of it kept alongside.
          materials: [normaliseMaterialKey(group)],
          supplier: edgeSupplier(name),
          imageUrl: edgeImageSrc(name),
        }))
      ),
    []
  );


  const dataset = tab === "profiles" ? profiles : tab === "edges" ? edges : colours;

  const chosenProduct = productType === ALL ? null : publicProductType(productType);
  const allowedMaterials = useMemo(
    () => (chosenProduct ? materialKeysForPublicProductType(chosenProduct.id) : []),
    [chosenProduct]
  );

  // Can this colour, profile or edge detail be had on the thing being made?
  //
  // Two questions, and an item only has to answer the ones it carries. The
  // material says which board it is pressed in, which is the whole point of the
  // filter: a decorative board colour cannot become a profiled door. The
  // product types, which only the door profiles carry, say what the item goes
  // ON, so the profiles drop away on Panels and Table tops.
  //
  // An item with neither is kept. A colour that reached us with a blank
  // material is a gap in the library, not a reason to hide it from a customer.
  const matchesProduct = useCallback(
    (item) => {
      if (!chosenProduct) return true;
      const materials = (item.materials || []).filter(Boolean);
      if (materials.length && !materials.some((key) => allowedMaterials.includes(key))) return false;
      if (item.productTypes && !item.productTypes.some((type) => chosenProduct.productTypes.includes(type))) {
        return false;
      }
      return true;
    },
    [chosenProduct, allowedMaterials]
  );

  // Everything below reads this rather than the raw dataset, so the brand,
  // finish and family lists offer what is left after the product type, and the
  // counts beside them match what lands on screen.
  const scoped = useMemo(() => dataset.filter(matchesProduct), [dataset, matchesProduct]);

  // Finish options narrow to the chosen brand, so picking Laminex does not
  // leave you scrolling past fourteen Polytec ranges that would return nothing.
  const finishes = useMemo(() => {
    const counts = new Map();
    scoped.forEach((colour) => {
      if (!colour.finish) return;
      if (supplier !== ALL && colour.supplier !== supplier) return;
      counts.set(colour.finish, (counts.get(colour.finish) || 0) + 1);
    });
    return [...counts.entries()];
  }, [scoped, supplier]);

  // Narrowed to the chosen brand, so picking Laminex does not leave the customer
  // scrolling past Polytec families that would return nothing, and the counts
  // beside each one match what is actually on screen.
  const families = useMemo(() => {
    const counts = new Map();
    scoped.forEach((item) => {
      if (!item.family) return;
      if (supplier !== ALL && item.supplier !== supplier) return;
      counts.set(item.family, (counts.get(item.family) || 0) + 1);
    });
    return [...counts.entries()];
  }, [scoped, supplier]);

  // Read from whatever is on screen, not only from the colours. On the profiles
  // tab a brand list built from colours would offer brands that say nothing
  // about what is being looked at.
  const suppliers = useMemo(() => {
    const found = [];
    scoped.forEach((item) => {
      if (item.supplier && !found.includes(item.supplier)) found.push(item.supplier);
    });
    return found;
  }, [scoped]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q)) return false;
      if (supplier !== ALL && item.supplier !== supplier) return false;
      if (tab === "colours" && finish !== ALL && item.finish !== finish) return false;
      if (tab === "profiles" && family !== ALL && item.family !== family) return false;
      if (tab === "edges" && family !== ALL && item.family !== family) return false;
      return true;
    });
  }, [scoped, query, tab, supplier, finish, family]);

  // What the chosen product type leaves on each tab, for the number on the tab
  // itself. Somebody making table tops should see that there are no door
  // profiles before they click it, not 97 and then an empty grid.
  const tabCounts = useMemo(
    () => ({
      colours: colours.filter(matchesProduct).length,
      profiles: profiles.filter(matchesProduct).length,
      edges: edges.filter(matchesProduct).length,
    }),
    [colours, profiles, edges, matchesProduct]
  );

  const visible = results.slice(0, shown);
  const isFiltered =
    productType !== ALL || supplier !== ALL || finish !== ALL || family !== ALL || Boolean(query.trim());

  // The product type is deliberately not reset here. It is the answer to what
  // you are making, and that does not change because you went to look at the
  // edge details.
  function switchTab(next) {
    setTab(next);
    setSupplier(ALL);
    setFinish(ALL);
    setFamily(ALL);
    setQuery("");
    setShown(PAGE_SIZE);
  }

  // Product type is the top of the chain, so changing it clears the three
  // filters under it, the same way changing the brand clears the two under it.
  function chooseProductType(next) {
    setProductType(next);
    setSupplier(ALL);
    setFinish(ALL);
    setFamily(ALL);
    setShown(PAGE_SIZE);
  }

  function clearFilters() {
    setProductType(ALL);
    setSupplier(ALL);
    setFinish(ALL);
    setFamily(ALL);
    setQuery("");
    setShown(PAGE_SIZE);
  }

  // Arrowing past the loaded slice should pull more in rather than dead-ending.
  function step(direction) {
    setLightboxIndex((current) => {
      if (current < 0 || !results.length) return current;
      const next = (current + direction + results.length) % results.length;
      if (next >= shown) setShown(Math.ceil((next + 1) / PAGE_SIZE) * PAGE_SIZE);
      return next;
    });
  }

  const active = lightboxIndex >= 0 ? results[lightboxIndex] : null;

  return (
    <div className={styles.browser}>
      <div className={styles.tabs} role="tablist" aria-label="What to browse">
        {TABS.map((entry) => {
          const count = tabCounts[entry.id];
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={`${styles.tab} ${tab === entry.id ? styles.tabActive : ""}`}
              onClick={() => switchTab(entry.id)}
            >
              {entry.label}
              <em>{count}</em>
            </button>
          );
        })}
      </div>

      <div className={styles.filters}>
        <label className={styles.field}>
          <span>Product type</span>
          <select
            className="pcdSelect"
            value={productType}
            onChange={(event) => chooseProductType(event.target.value)}
          >
            <option value={ALL}>All products ({dataset.length})</option>
            {PUBLIC_PRODUCT_TYPES.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        {suppliers.length > 1 ? (
          <label className={styles.field}>
            <span>Brand</span>
            <select className="pcdSelect"
              value={supplier}
              onChange={(event) => {
                setSupplier(event.target.value);
                setFinish(ALL);
                setFamily(ALL);
                setShown(PAGE_SIZE);
              }}
            >
              <option value={ALL}>All brands ({scoped.length})</option>
              {suppliers.map((name) => (
                <option key={name} value={name}>
                  {name} ({scoped.filter((item) => item.supplier === name).length})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {tab === "colours" ? (
          <>
            <label className={styles.field}>
              <span>Finish</span>
              <select className="pcdSelect"
                value={finish}
                onChange={(event) => {
                  setFinish(event.target.value);
                  setShown(PAGE_SIZE);
                }}
              >
                <option value={ALL}>All finishes</option>
                {finishes.map(([name, count]) => (
                  <option key={name} value={name}>
                    {name} ({count})
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {tab === "profiles" ? (
          <label className={styles.field}>
            <span>Profile family</span>
            <select className="pcdSelect"
              value={family}
              onChange={(event) => {
                setFamily(event.target.value);
                setShown(PAGE_SIZE);
              }}
            >
              <option value={ALL}>All families ({families.reduce((total, [, count]) => total + count, 0)})</option>
              {families.map(([name, count]) => (
                <option key={name} value={name}>
                  {name} ({count})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {tab === "edges" ? (
          <label className={styles.field}>
            <span>Board type</span>
            <select className="pcdSelect"
              value={family}
              onChange={(event) => {
                setFamily(event.target.value);
                setShown(PAGE_SIZE);
              }}
            >
              <option value={ALL}>All ({scoped.length})</option>
              {/* Built from what the product type left, so choosing profiled
                  fronts and then opening this list does not offer a board the
                  fronts cannot be made from. */}
              {families.map(([name, count]) => (
                <option key={name} value={name}>
                  {name} ({count})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className={`${styles.field} ${styles.fieldSearch}`}>
          <span>Search by name</span>
          <input
            type="search"
            value={query}
            placeholder={tab === "colours" ? "e.g. Notaio Walnut" : tab === "profiles" ? "e.g. Bendigo" : "e.g. Roman"}
            onChange={(event) => {
              setQuery(event.target.value);
              setShown(PAGE_SIZE);
            }}
          />
        </label>
      </div>

      <div className={styles.resultBar}>
        <span>
          Showing {visible.length} of {results.length}{" "}
          {tab === "colours" ? "colours" : tab === "profiles" ? "profiles" : "edge details"}
        </span>
        {isFiltered ? (
          <button type="button" className={styles.clear} onClick={clearFilters}>
            Clear filters
          </button>
        ) : null}
      </div>

      {chosenProduct ? <p className={styles.familyNote}>{chosenProduct.note}</p> : null}

      {tab === "profiles" && family !== ALL && PROFILE_BLURBS[family] ? (
        <p className={styles.familyNote}>{PROFILE_BLURBS[family]}</p>
      ) : null}

      <div className={`${styles.grid} ${styles[tab]}`}>
        {visible.length === 0 ? (
          <p className={styles.empty}>
            {chosenProduct
              ? `Nothing here can be supplied as ${chosenProduct.label.toLowerCase()} with those filters. Try clearing the brand or the search, or ask us: we can often get something that is not listed here.`
              : "Nothing matches that. Try clearing the search, or ask us - we can often get a colour that is not listed here."}
          </p>
        ) : (
          visible.map((item, index) => (
            <Tile key={`${item.family || item.finish}-${item.name}`} item={item} tab={tab} onOpen={() => setLightboxIndex(index)} />
          ))
        )}
      </div>

      {visible.length < results.length ? (
        <div className={styles.moreWrap}>
          <button type="button" className={styles.more} onClick={() => setShown((current) => current + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, results.length - visible.length)} more
          </button>
        </div>
      ) : null}

      {active ? (
        <Lightbox
          item={active}
          tab={tab}
          position={`${lightboxIndex + 1} of ${results.length}`}
          onClose={() => setLightboxIndex(-1)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
        />
      ) : null}
    </div>
  );
}

function Tile({ item, tab, onOpen }) {
  const [failed, setFailed] = useState(false);
  const showImage = item.imageUrl && !failed;

  return (
    <button type="button" className={styles.tile} onClick={onOpen}>
      <span className={`${styles.thumb} ${styles[`thumb_${tab}`]}`}>
        {showImage ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className={styles.noImage} aria-hidden="true">
            No image yet
          </span>
        )}
        {item.thickness ? <span className={styles.badge}>{item.thickness}</span> : null}
        <span className={styles.zoom} aria-hidden="true">
          <span>View larger</span>
        </span>
      </span>
      <span className={styles.tileName}>
        {item.name}
        <em>
          {tab === "colours"
            ? `${item.supplier} · ${item.finish}`
            : [item.supplier, item.code || item.family].filter(Boolean).join(" · ")}
        </em>
        {tab === "colours" && materialsLine(item.materials) ? (
          <i className={styles.tileMaterials}>{materialsLine(item.materials)}</i>
        ) : null}
      </span>
    </button>
  );
}

function Lightbox({ item, tab, position, onClose, onPrev, onNext }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector("button")?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onPrev();
      if (event.key === "ArrowRight") onNext();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, onPrev, onNext]);

  // The answer to the question people were emailing us instead of finding
  // here. Worked out from the boards the colour is pressed in, so it cannot
  // drift from what the product type filter does.
  const madeAs = tab === "colours" ? publicProductTypesForMaterials(item.materials || []) : [];

  const meta =
    tab === "colours"
      ? [item.supplier, item.finish, item.thickness ? `available in ${item.thickness}` : null]
          .filter(Boolean)
          .join(" · ")
      : tab === "profiles"
        ? `${item.family} family · thermolaminate doors and drawer fronts`
        : `${item.code ? `${item.code} · ` : ""}${item.family}`;

  return (
    <div
      className={styles.lightbox}
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      ref={panelRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button type="button" className={styles.lbClose} onClick={onClose} aria-label="Close">
        &times;
      </button>
      <button type="button" className={`${styles.lbNav} ${styles.lbPrev}`} onClick={onPrev} aria-label="Previous">
        &#8249;
      </button>

      <figure className={styles.lbFigure}>
        <div className={`${styles.lbImage} ${styles[`lbImage_${tab}`]}`}>
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} />
          ) : (
            <span className={styles.noImage}>No image yet</span>
          )}
        </div>
        <figcaption>
          <b>{item.name}</b>
          <span>{meta}</span>
          {madeAs.length ? (
            <span>
              We can make this as: {madeAs.map((type) => type.label.toLowerCase()).join(", ")}
            </span>
          ) : null}
          <em>{position}, use the arrow keys</em>
        </figcaption>
      </figure>

      <button type="button" className={`${styles.lbNav} ${styles.lbNext}`} onClick={onNext} aria-label="Next">
        &#8250;
      </button>
    </div>
  );
}
