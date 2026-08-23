"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { addEntry, removeEntry, useQuoteList } from "@/lib/pcd-quote-list";
import PcdLoader from "@/components/public/PcdLoader";
import { profileImageSrc } from "@/lib/pcd-profile-images";
import { profilesForSupplier } from "@/lib/pcd-supplier-selection";
import { THICKNESS_BY_MATERIAL } from "@/lib/quote-form-data";
import { asSelectionRows, useProfileLibrary } from "@/lib/use-profile-library";
import {
  CABINETS,
  frontLayoutsFor,
  layoutPriceIncGst,
  PROFILE_TIERS,
  SYSTEMS,
  TIER_LABELS,
} from "./cabinet-data";
import styles from "./configurator.module.css";

// three.js is a large dependency and this is a public page, so the preview is
// its own chunk, fetched only once someone actually reaches the configurator.
// ssr:false because WebGL has no meaning on the server - same treatment
// Design3DView gets everywhere it is used.
const CabinetPreview3D = dynamic(() => import("./CabinetPreview3D"), {
  ssr: false,
  loading: () => <PcdLoader variant="inline" label="Loading the preview" steps={["Loading preview", "Almost there"]} />,
});

// Two-panel configurator: the six steps run down the left as an accordion, the
// door preview and the running list stay pinned on the right. Each step filters
// the next, so an invalid combination cannot be built - a colour that is not
// made in the chosen thickness is hidden rather than greyed out, and profiles
// restricted to 21mm board disappear when 18mm is selected.

// Steps 5 and 7 belong to the profiled path only. A flat door has no thickness
// question, because 16 and 18mm decorative board take the same flat face and the
// colour tile settles it, and it has no profile to pick. They are hidden rather
// than greyed out, and the number on screen is the position in the VISIBLE list,
// so a flat door still counts 1 to 5 with no gap where a hidden step used to be.
const STEPS = [
  { id: 1, title: "Which cabinets have you got?" },
  { id: 2, title: "Which cabinet size?" },
  { id: 3, title: "How is that cabinet fronted?" },
  { id: 4, title: "Flat or profiled?" },
  { id: 5, title: "Which board thickness?" },
  { id: 6, title: "Pick your colour" },
  { id: 7, title: "Pick your door profile" },
];

const MATERIAL_CHOICES = [
  {
    key: "decorative_board",
    label: "Flat",
    material: "Decorative Board",
    blurb: "A flat slab face with no routing. Clean and contemporary.",
    profiled: false,
  },
  {
    key: "thermolaminate",
    label: "Profiled",
    material: "Thermolaminate",
    blurb: "Shaker and routed profiles with a wrapped edge.",
    profiled: true,
  },
];

const PROFILE_SAMPLE_CLASS = {
  Minimal: styles.faceMinimal,
  Soft: styles.faceSoft,
  Sharp: styles.faceSharp,
  Detailed: styles.faceDetailed,
  Fluted: styles.faceFluted,
};

function formatMoney(value) {
  return `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

// A cabinet elevation, drawn in the same visual language as the design tool's
// FrontElevationView so the two read as the same product:
//
//   door         outline + a dashed V swing converging on the OPENING edge
//                (the standard elevation symbol) - see DoorBankSwing
//   drawer front outline + a short pull line across the middle 35-65% of the
//                width, sitting near the top of its own front - see DrawerBank
//   panel        outline only, since a panel has no opening
//
// Everything is in millimetre space via the viewBox, so the drawing is to true
// scale and needs no proportion clamp: preserveAspectRatio letterboxes it, so a
// 200x800 base reads tall and narrow and a 1200x380 Besta wide and short.
// Strokes use non-scaling-stroke so they stay hairlines whatever the scale.
function LayoutDrawing({ option, cabinet }) {
  const { width: W, height: H } = cabinet;
  const inColumns = option.arrangement === "columns";
  const span = option.pieces.reduce((sum, p) => sum + (inColumns ? p.width : p.height), 0) || 1;
  // The reveal between fronts, so adjacent outlines read as two fronts rather
  // than one doubled line.
  const reveal = Math.max(W, H) * 0.014;

  let cursor = 0;
  const fronts = option.pieces.map((piece, index) => {
    const extent = (inColumns ? piece.width : piece.height) / span;
    const box = inColumns
      ? { x: cursor * W, y: 0, w: extent * W, h: H }
      : { x: 0, y: cursor * H, w: W, h: extent * H };
    cursor += extent;

    // A pair of doors side by side opens from the centre: the left one hinges
    // left, the right one hinges right. Everything else hinges left.
    const hingeRight = inColumns && option.pieces.length === 2 && index === 1;
    return { piece, box, hingeRight, key: `${piece.type}-${index}` };
  });

  return (
    <span className={styles.layoutFigure} aria-hidden="true">
      <svg
        className={styles.layoutSvg}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="presentation"
      >
        <rect className={styles.svgCarcass} x="0" y="0" width={W} height={H} />
        {fronts.map(({ piece, box, hingeRight, key }) => {
          const x = box.x + reveal;
          const y = box.y + reveal;
          const w = Math.max(0, box.w - reveal * 2);
          const h = Math.max(0, box.h - reveal * 2);
          return (
            <g key={key}>
              <rect className={styles.svgFront} x={x} y={y} width={w} height={h} />
              {piece.type === "Drawer front" ? (
                // Pull sits near the top of its own front, like DrawerBank.
                <line
                  className={styles.svgPull}
                  x1={x + w * 0.35}
                  x2={x + w * 0.65}
                  y1={y + Math.min(h * 0.3, H * 0.045)}
                  y2={y + Math.min(h * 0.3, H * 0.045)}
                />
              ) : null}
              {piece.type === "Door" ? <DoorSwing x={x} y={y} w={w} h={h} hingeRight={hingeRight} /> : null}
            </g>
          );
        })}
      </svg>
    </span>
  );
}

// The dashed V from the hinged edge to the mid-point of the opening edge.
function DoorSwing({ x, y, w, h, hingeRight }) {
  const baseX = hingeRight ? x + w : x;
  const tipX = hingeRight ? x : x + w;
  const midY = y + h / 2;
  return (
    <>
      <line className={styles.svgSwing} x1={baseX} y1={y} x2={tipX} y2={midY} />
      <line className={styles.svgSwing} x1={baseX} y1={y + h} x2={tipX} y2={midY} />
    </>
  );
}

// One profile tile.
//
// The photo comes off the library row, so a profile shows its own photo whichever
// brand it belongs to. profileImageSrc is the fallback for a row with no photo
// recorded, and the drawn placeholder is the fallback for that - handled on error
// as well as up front, so dropping a photo in is all it takes to light it up.
//
// The $ tier is a Polytec idea: it is keyed on their five families. A Laminex
// series has no tier, so no tier is shown rather than a made-up one.
function ProfileTile({ entry, selected, onSelect }) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = entry.imageUrl || profileImageSrc(entry.type, entry.name);
  const showImage = src && !imageFailed;
  const tier = PROFILE_TIERS[entry.type]?.tier;

  return (
    <button
      type="button"
      className={`${styles.profile} ${selected ? styles.profileActive : ""}`}
      onClick={onSelect}
    >
      <span className={styles.profileDrawing}>
        {showImage ? (
          <img
            src={src}
            alt={`${entry.name} door profile`}
            loading="lazy"
            decoding="async"
            className={styles.profileImage}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className={`${styles.profileFace} ${PROFILE_SAMPLE_CLASS[entry.type] || ""}`} aria-hidden="true" />
        )}
      </span>
      {tier ? <span className={styles.profileTier}>{TIER_LABELS[tier]}</span> : null}
      <strong>{entry.name}</strong>
      <span>{entry.type}</span>
    </button>
  );
}

// THE TWO FILTERS OVER THE COLOUR GRID: whose board, and which finish.
//
// The brand is a filter here rather than a step of its own. Every tile already
// says whose board it is, so choosing a colour settles the brand on its own, and
// the profile step reads the brand off the colour rather than asking twice. That
// is what stops a Laminex colour ending up on a Polytec shape without a separate
// question to answer.
//
// Polytec alone carries 14 finishes, so a row of pills ran to three lines and
// read as clutter. Both controls open a panel instead, and the finish list is
// scoped to the chosen brand: a Polytec finish under a Laminex filter is a tick
// that can only empty the grid.
function ColourFilters({
  brands,
  brand,
  onBrand,
  groups,
  selected,
  onToggle,
  onClear,
  total,
  poolTotal,
}) {
  const [openPanel, setOpenPanel] = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!openPanel) return undefined;

    function handlePointerDown(event) {
      if (!wrapRef.current?.contains(event.target)) setOpenPanel("");
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setOpenPanel("");
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPanel]);

  const finishLabel = selected.length
    ? `${selected.length} finish${selected.length === 1 ? "" : "es"} selected`
    : "All finishes";
  const toggle = (panel) => setOpenPanel((current) => (current === panel ? "" : panel));

  return (
    <div className={styles.filterRow} ref={wrapRef}>
      {/* One brand is not a choice, it is the answer, so the control only
          appears when there is something to choose between. */}
      {brands.length > 1 ? (
        <div className={styles.filterWrap}>
          <button
            type="button"
            className={`${styles.filterButton} ${openPanel === "brand" ? styles.filterButtonOpen : ""}`}
            aria-expanded={openPanel === "brand"}
            aria-haspopup="true"
            onClick={() => toggle("brand")}
          >
            <span>{brand || "All brands"}</span>
            <span className={styles.filterCaret} aria-hidden="true" />
          </button>

          {openPanel === "brand" ? (
            <div className={styles.filterPanel} role="group" aria-label="Filter colours by brand">
              <label className={styles.filterOption}>
                <input
                  type="radio"
                  name="colour-brand"
                  checked={!brand}
                  onChange={() => {
                    onBrand("");
                    setOpenPanel("");
                  }}
                />
                <span>All brands</span>
                <em>{poolTotal}</em>
              </label>
              {brands.map((entry) => (
                <label className={styles.filterOption} key={entry.name}>
                  <input
                    type="radio"
                    name="colour-brand"
                    checked={brand === entry.name}
                    onChange={() => {
                      onBrand(entry.name);
                      setOpenPanel("");
                    }}
                  />
                  <span>{entry.name}</span>
                  <em>{entry.count}</em>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.filterWrap}>
        <button
          type="button"
          className={`${styles.filterButton} ${openPanel === "finish" ? styles.filterButtonOpen : ""}`}
          aria-expanded={openPanel === "finish"}
          aria-haspopup="true"
          onClick={() => toggle("finish")}
        >
          <span>{finishLabel}</span>
          <span className={styles.filterCaret} aria-hidden="true" />
        </button>

        {openPanel === "finish" ? (
          <div className={styles.filterPanel} role="group" aria-label="Filter colours by finish">
            {groups.map((group) => (
              <div className={styles.filterGroup} key={group.supplier}>
                <p className={styles.filterGroupTitle}>{group.supplier}</p>
                {group.finishes.map((finish) => (
                  <label className={styles.filterOption} key={`${group.supplier}-${finish.name}`}>
                    <input
                      type="checkbox"
                      checked={selected.includes(finish.name)}
                      onChange={() => onToggle(finish.name)}
                    />
                    <span>{finish.name}</span>
                    <em>{finish.count}</em>
                  </label>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {selected.length || brand ? (
        <button type="button" className={styles.filterClear} onClick={onClear}>
          Clear filters
        </button>
      ) : (
        <span className={styles.filterHint}>{total} colours available</span>
      )}
    </div>
  );
}

// pricingEnabled comes from PUBLIC_PRICE_ESTIMATES_ENABLED. When it is off the
// server has already sent every colour at a rate of 0, so nothing here can
// price itself and the list quotes by hand on its own. The flag is only used
// for the couple of lines of copy that assume some items carry a price.
export default function ConfiguratorClient({ colours, pricingEnabled = true }) {
  const [openStep, setOpenStep] = useState(1);
  const [systemId, setSystemId] = useState(null);
  const [cabinet, setCabinet] = useState(null);
  const [layout, setLayout] = useState(null);
  const [materialKey, setMaterialKey] = useState(null);
  // Finishes the customer has ticked in the filter. Empty means "show all" , 
  // there are 19 finishes across the three brands, so this is a grouped
  // multi-select rather than a row of pills.
  const [selectedFinishes, setSelectedFinishes] = useState([]);
  // Whose board. A filter over the same grid rather than a step of its own,
  // because every tile already carries the brand. "" is every brand.
  const [brandFilter, setBrandFilter] = useState("");
  // 18mm or 21mm, asked BEFORE the colour and on the profiled path only. Nearly
  // every thermolaminate colour is stocked in both, so without this the same
  // colour appeared in the grid twice and whichever tile somebody happened to
  // tap decided, silently, whether the fluted and the deeper routed shapes were
  // available to them at all.
  const [thicknessChoice, setThicknessChoice] = useState("");
  const [colour, setColour] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [profile, setProfile] = useState(null);
  const [quantity, setQuantity] = useState(1);
  // Set the moment something is added, so the add row can confirm it landed and
  // offer the obvious next move. Cleared as soon as any choice changes.
  const [justAdded, setJustAdded] = useState(null);
  const stepsRef = useRef(null);
  const items = useQuoteList();

  const material = MATERIAL_CHOICES.find((choice) => choice.key === materialKey) || null;

  const needsProfile = Boolean(material?.profiled);

  // THE DOOR PROFILE CATALOGUE, from the library the admin manages rather than a
  // list in code. Each row carries the brand that makes the shape, its photo and
  // whether it can be routed into 18mm or 21mm board, so the ranges cannot be
  // crossed and a Laminex profile appears here the day its colours are added,
  // with nothing in this file to change.
  //
  // The status matters as much as the rows: "this brand makes none" and "the
  // library could not be read" both arrive as an empty list, and only one of
  // them is an answer. See lib/use-profile-library.js.
  const profileLibrary = useProfileLibrary();
  const profileRows = useMemo(
    () => asSelectionRows(profileLibrary.profiles),
    [profileLibrary.profiles]
  );

  // FLAT: there is no thickness question. A customer at this point has no idea
  // whether they want 16 or 18mm, both take the same flat face, so every colour
  // is listed with its thickness badged on the tile and picking the colour is
  // what settles it.
  //
  // PROFILED: the thickness is asked first, in step 5, because it decides which
  // shapes can be routed at all.
  const thickness = needsProfile ? thicknessChoice : colour?.thickness || null;

  const materialPool = useMemo(
    () => colours.filter((entry) => entry.material === materialKey),
    [colours, materialKey]
  );

  const colourPool = useMemo(() => {
    if (!needsProfile) return materialPool;
    if (!thicknessChoice) return [];
    return materialPool.filter((entry) => entry.thickness === thicknessChoice);
  }, [materialPool, needsProfile, thicknessChoice]);

  // The thicknesses this board is really stocked in, in the order the materials
  // file lists them, each with what it actually buys: the colours behind it and
  // the shapes that can be routed into it. Counted rather than described, so the
  // step cannot claim a range we do not have.
  const thicknessOptions = useMemo(() => {
    if (!material) return [];
    const stocked = new Set(materialPool.map((entry) => entry.thickness));
    return (THICKNESS_BY_MATERIAL[material.material] || [])
      .filter((value) => stocked.has(value))
      .map((value) => ({
        value,
        colours: materialPool.filter((entry) => entry.thickness === value).length,
        // Only shapes from brands that actually sell this board at this
        // thickness. Counting a brand with profiles but no colours would promise
        // a range nothing can be made in.
        profiles: [...new Set(materialPool.filter((entry) => entry.thickness === value).map((entry) => entry.supplier))]
          .reduce(
            (total, supplier) =>
              total + profilesForSupplier(profileRows, { supplier, thickness: value }).length,
            0
          ),
      }));
  }, [material, materialPool, profileRows]);

  // WHICH BRANDS TO OFFER. On the profiled path a brand only counts if it also
  // makes a door profile in this thickness: every Laminex shape is 18mm only, so
  // offering Laminex board at 21mm would walk somebody into a last step with
  // nothing in it. Same rule as the rest of the site - a combination we cannot
  // build is not shown, rather than shown and refused at the end.
  //
  // While the library is still loading every brand is offered. Hiding one on the
  // strength of rows we have not read yet would be guessing.
  const brandOptions = useMemo(() => {
    const counts = new Map();
    colourPool.forEach((entry) => {
      const name = entry.supplier || "Other";
      counts.set(name, (counts.get(name) || 0) + 1);
    });

    const order = ["Polytec", "Laminex", "Formica"];
    return [...counts.entries()]
      .filter(([name]) => {
        if (!needsProfile || !profileLibrary.isReady) return true;
        return profilesForSupplier(profileRows, { supplier: name, thickness: thicknessChoice }).length > 0;
      })
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        const ai = order.indexOf(a.name);
        const bi = order.indexOf(b.name);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.name.localeCompare(b.name);
      });
  }, [colourPool, needsProfile, profileLibrary.isReady, profileRows, thicknessChoice]);

  const brandNames = useMemo(() => brandOptions.map((entry) => entry.name), [brandOptions]);

  // A brand that did not survive that rule is out of the GRID as well as out of
  // the dropdown. Leaving its colours on show while its name is gone is the same
  // dead end one click further along.
  const brandPool = useMemo(
    () => colourPool.filter((entry) => brandNames.includes(entry.supplier || "Other")),
    [colourPool, brandNames]
  );

  const shownColours = useMemo(() => {
    const byBrand = brandFilter
      ? brandPool.filter((entry) => (entry.supplier || "Other") === brandFilter)
      : brandPool;
    return selectedFinishes.length
      ? byBrand.filter((entry) => selectedFinishes.includes(entry.finish))
      : byBrand;
  }, [brandPool, brandFilter, selectedFinishes]);

  // Finishes grouped by the brand that makes them, scoped to the brand filter
  // when one is on.
  const finishGroups = useMemo(() => {
    const bySupplier = new Map();
    brandPool.forEach((entry) => {
      if (!entry.finish) return;
      const supplier = entry.supplier || "Other";
      if (brandFilter && supplier !== brandFilter) return;
      if (!bySupplier.has(supplier)) bySupplier.set(supplier, new Map());
      const finishes = bySupplier.get(supplier);
      finishes.set(entry.finish, (finishes.get(entry.finish) || 0) + 1);
    });

    return brandNames
      .filter((name) => bySupplier.has(name))
      .map((supplier) => ({
        supplier,
        finishes: [...bySupplier.get(supplier).entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count })),
      }));
  }, [brandPool, brandFilter, brandNames]);

  // THE SHAPES THIS COLOUR CAN BE ROUTED INTO: its own brand's, in the thickness
  // chosen above. Both rules are read off the row rather than restated here,
  // which is what lets them run in opposite directions between the ranges -
  // thirteen Polytec shapes are 21mm only, every Laminex shape is 18mm only.
  const availableProfiles = useMemo(() => {
    if (!needsProfile || !colour?.supplier || !thickness) return [];
    return profilesForSupplier(profileRows, { supplier: colour.supplier, thickness }).map((row) => ({
      name: row.name,
      type: row.category,
      imageUrl: row.image_url || "",
    }));
  }, [needsProfile, colour, thickness, profileRows]);

  // How many more this brand makes that this board cannot take, so the note can
  // say it as a fact about the range rather than naming Polytec's families.
  const profilesInOtherThickness = useMemo(() => {
    if (!needsProfile || !colour?.supplier) return 0;
    return profilesForSupplier(profileRows, { supplier: colour.supplier }).length - availableProfiles.length;
  }, [needsProfile, colour, profileRows, availableProfiles.length]);

  const profileCategories = useMemo(() => {
    const found = [];
    availableProfiles.forEach((entry) => {
      if (!found.includes(entry.type)) found.push(entry.type);
    });
    return found;
  }, [availableProfiles]);

  const shownProfiles =
    categoryFilter === "All"
      ? availableProfiles
      : availableProfiles.filter((entry) => entry.type === categoryFilter);

  // Flat fronts price themselves off the chosen colour's rate. Profiled fronts
  // never do - the rate is 0 on them by design, so they fall through to Quote.
  // The rate arrives already marked up and GST-inclusive from the server.
  const ratePerSqm = needsProfile ? 0 : Number(colour?.ratePerSqm) || 0;
  const isPriced = ratePerSqm > 0;

  const unitPrice = useMemo(
    () => (isPriced && layout ? layoutPriceIncGst(layout, ratePerSqm) : 0),
    [isPriced, layout, ratePerSqm]
  );

  // A library we could not read is the one case where a profiled front goes on
  // the list without a shape on it. The alternative is a dead end on the last
  // step, so the line says "profile to confirm" and we settle it when we price
  // it. Everything else still has to be answered.
  const profileStepBlocked = needsProfile && profileLibrary.hasFailed;
  const isComplete = Boolean(
    layout && material && thickness && colour && (!needsProfile || profile || profileStepBlocked)
  );

  function resetFrom(step) {
    // Any change to the configuration means the "added" confirmation no longer
    // describes what is on screen.
    setJustAdded(null);
    if (step <= 2) { setCabinet(null); setLayout(null); }
    if (step <= 3) setLayout(null);
    if (step <= 5) { setThicknessChoice(""); setBrandFilter(""); setSelectedFinishes([]); }
    if (step <= 6) { setColour(null); setCategoryFilter("All"); }
    if (step <= 7) setProfile(null);
  }

  function chooseSystem(id) {
    setSystemId(id);
    resetFrom(2);
    setOpenStep(2);
  }

  function chooseCabinet(group, item, depth) {
    // Depth is carried on the group rather than each size, and the 3D preview
    // needs it to build the carcass.
    setCabinet({ ...item, group, depth });
    resetFrom(3);
    setOpenStep(3);
  }

  function chooseLayout(next) {
    setLayout(next);
    setJustAdded(null);
    setOpenStep(4);
  }

  function chooseMaterial(choice) {
    setMaterialKey(choice.key);
    resetFrom(5);
    // Profiled asks the thickness first, because it decides which shapes can be
    // routed. Flat has nothing to ask and goes straight to the colours.
    setOpenStep(choice.profiled ? 5 : 6);
  }

  function chooseThickness(value) {
    setThicknessChoice(value);
    resetFrom(6);
    setOpenStep(6);
  }

  // A finish belongs to a brand, so a tick left over from the old one can only
  // empty the grid, and a colour from the old brand can only be the wrong brand.
  // Both go, rather than being left to look chosen when they are not.
  function chooseBrand(name) {
    setBrandFilter(name);
    setSelectedFinishes([]);
    setJustAdded(null);
    if (name && colour && (colour.supplier || "Other") !== name) {
      setColour(null);
      setProfile(null);
      setCategoryFilter("All");
    }
  }

  function toggleFinish(name) {
    setSelectedFinishes((current) =>
      current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name]
    );
  }

  function chooseColour(next) {
    setColour(next);
    setJustAdded(null);
    // The shape belongs to the brand behind the colour, so a colour from another
    // brand cannot keep the one already chosen. Its family may not exist in the
    // new range either, so the category filter goes back to All.
    if (next?.supplier !== colour?.supplier) {
      setProfile(null);
      setCategoryFilter("All");
    }
    // A flat door has no profile step, so stay on the colour grid rather than
    // collapsing the whole accordion and leaving nothing open.
    if (needsProfile) setOpenStep(7);
  }

  // Writes into the site-wide list rather than a private array, so the header
  // badge updates, the drawer can show it, and it is still there after they
  // wander off to the kitchen refresh page and come back.
  function addToList() {
    if (!isComplete) return;
    addEntry({
      kind: "configured",
      qty: quantity,
      title: `${layout.name}, ${cabinet.height} × ${cabinet.width}mm`,
      detail: `${SYSTEMS.find((s) => s.id === systemId)?.name} · ${colour.supplier} ${material.material} ${thickness} · ${colour.name}${
        profile ? ` · ${profile.name}` : needsProfile ? " · profile to confirm" : " · flat slab"
      }`,
      source: "ikea-kaboodle",
      cabinet: { width: cabinet.width, height: cabinet.height },
      arrangement: layout.arrangement,
      pieces: layout.pieces.map((piece) => ({
        width: Math.round(piece.width),
        height: Math.round(piece.height),
        type: piece.type,
      })),
      material: material.material,
      thickness,
      finish: colour.finish,
      colour: colour.name,
      // The exact library row behind the swatch, so the quote request that this
      // list eventually becomes can be priced without anyone re-picking it.
      colourLibraryId: colour.id || "",
      supplierName: colour.supplier || "",
      profileType: profile ? profile.type : "",
      profile: profile ? profile.name : "",
      // 0 means this line goes on the list as "Quote" - a profiled front, or a
      // colour we have no rate for yet.
      price: unitPrice,
    });
    setJustAdded({ title: `${layout.name}, ${cabinet.height} × ${cabinet.width}mm`, qty: quantity });
    setQuantity(1);
  }

  // Clears the six steps and goes back to the top, leaving the list alone.
  // Without this, adding a second item in a different colour means walking back
  // up the accordion and undoing each answer by hand.
  function startAnotherItem() {
    setSystemId(null);
    setCabinet(null);
    setLayout(null);
    setMaterialKey(null);
    setThicknessChoice("");
    setBrandFilter("");
    setColour(null);
    setProfile(null);
    setSelectedFinishes([]);
    setCategoryFilter("All");
    setQuantity(1);
    setJustAdded(null);
    setOpenStep(1);
    // The panel is sticky on desktop and the steps are long, so land them on
    // step 1 rather than wherever they happened to be scrolled to.
    requestAnimationFrame(() => {
      stepsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // A list can hold both kinds at once - a flat door that priced itself and a
  // profiled one that did not - so the total is "what we can price so far" and
  // the count of the rest is shown beside it rather than hidden.
  const itemIsPriced = (item) => item.kind !== "custom" && (Number(item.price) || 0) > 0;
  const listTotal = items.reduce(
    (total, item) => total + (itemIsPriced(item) ? item.price * item.qty : 0),
    0
  );
  const pricedCount = items.filter(itemIsPriced).length;
  const toQuoteCount = items.length - pricedCount;

  const summaries = {
    1: SYSTEMS.find((s) => s.id === systemId)?.name || "",
    2: cabinet ? `${cabinet.height} × ${cabinet.width}mm` : "",
    3: layout?.name || "",
    4: material ? material.label : "",
    5: thicknessChoice,
    // The brand belongs in the summary now that it is a real choice: two brands
    // both sell something called Snow, and they are different boards.
    6: colour ? `${colour.supplier} ${colour.name}` : "",
    7: profile
      ? [profile.name, TIER_LABELS[PROFILE_TIERS[profile.type]?.tier]].filter(Boolean).join(" ")
      : "",
  };

  function isStepReachable(step) {
    if (step === 1) return true;
    if (step === 2) return Boolean(systemId);
    if (step === 3) return Boolean(cabinet);
    if (step === 4) return Boolean(layout);
    if (step === 5) return Boolean(material && needsProfile);
    // Flat settles the thickness with the colour tile, so the grid opens as soon
    // as the board is chosen. Profiled has to know the thickness first, because
    // the grid is narrowed to it.
    if (step === 6) return Boolean(needsProfile ? thicknessChoice : material);
    return Boolean(needsProfile && colour);
  }

  function renderStepBody(step) {
    switch (step) {
      case 1:
        return (
          <div className={styles.tileGrid}>
            {SYSTEMS.map((system) => (
              <button
                type="button"
                key={system.id}
                className={`${styles.tile} ${systemId === system.id ? styles.tileActive : ""}`}
                onClick={() => chooseSystem(system.id)}
              >
                <strong>{system.name}</strong>
                <span>{system.note}</span>
              </button>
            ))}
          </div>
        );

      case 2:
        return (
          <div className={styles.cabinetGroups}>
            {(CABINETS[systemId] || []).map((group) => (
              <div key={group.group}>
                <p className={styles.groupTitle}>
                  {group.group}
                  {group.note ? <em>{group.note}</em> : null}
                </p>
                <div className={styles.cabinetRow}>
                  {group.items.map((item) => {
                    const active =
                      cabinet &&
                      cabinet.width === item.width &&
                      cabinet.height === item.height &&
                      cabinet.group === group.group;
                    return (
                      <button
                        type="button"
                        key={`${group.group}-${item.width}-${item.height}`}
                        className={`${styles.cabinet} ${active ? styles.cabinetActive : ""}`}
                        onClick={() => chooseCabinet(group.group, item, group.depth)}
                      >
                        <strong>
                          {item.height} × {item.width}
                        </strong>
                        {/* Panels are boards, not carcasses, so the group says
                            what its sizes actually are. */}
                        <span>{group.sizeLabel || "mm frame"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );

      case 3:
        return (
          <div className={styles.layoutGrid}>
            {frontLayoutsFor(systemId, cabinet).map((option) => (
              <button
                type="button"
                key={option.name}
                className={`${styles.layout} ${layout?.name === option.name ? styles.layoutActive : ""}`}
                onClick={() => chooseLayout(option)}
              >
                <LayoutDrawing option={option} cabinet={cabinet} />
                <strong>{option.name}</strong>
                <span>
                  {option.pieces.map((piece) => `${Math.round(piece.width)}×${Math.round(piece.height)}`).join(", ")} mm
                </span>
              </button>
            ))}
          </div>
        );

      case 4:
        return (
          <div className={styles.tileGrid}>
            {MATERIAL_CHOICES.map((choice) => (
              <button
                type="button"
                key={choice.key}
                className={`${styles.tile} ${materialKey === choice.key ? styles.tileActive : ""}`}
                onClick={() => chooseMaterial(choice)}
              >
                <strong>{choice.label}</strong>
                <span>{choice.blurb}</span>
              </button>
            ))}
          </div>
        );

      case 5:
        return (
          <>
            <div className={styles.tileGrid}>
              {thicknessOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={`${styles.tile} ${thicknessChoice === option.value ? styles.tileActive : ""}`}
                  onClick={() => chooseThickness(option.value)}
                >
                  <strong>{option.value} board</strong>
                  {/* Counted off the library rather than described, so this
                      cannot promise a range we do not hold. */}
                  <span>
                    {option.colours} colours
                    {profileLibrary.isReady ? `, ${option.profiles} door profiles` : ""}
                  </span>
                </button>
              ))}
            </div>
            <p className={styles.stepNote}>
              Nearly every profiled colour is made in both, so this is about the shape you want rather than
              the colour. The deeper routed shapes and the fluted range need 21mm board to cut into.
            </p>
          </>
        );

      case 6:
        return (
          <>
            <ColourFilters
              brands={brandOptions}
              brand={brandFilter}
              onBrand={chooseBrand}
              groups={finishGroups}
              selected={selectedFinishes}
              onToggle={toggleFinish}
              onClear={() => {
                setSelectedFinishes([]);
                chooseBrand("");
              }}
              total={brandFilter ? shownColours.length : brandPool.length}
              poolTotal={brandPool.length}
            />
            <div className={styles.colourGrid}>
              {shownColours.map((entry) => (
                <button
                  type="button"
                  key={`${entry.supplier}-${entry.finish}-${entry.name}-${entry.thickness}`}
                  className={`${styles.colour} ${
                    colour?.name === entry.name && colour?.finish === entry.finish && colour?.thickness === entry.thickness
                      ? styles.colourActive
                      : ""
                  }`}
                  onClick={() => chooseColour(entry)}
                >
                  <span
                    className={styles.colourSwatch}
                    style={
                      entry.imageUrl
                        ? { backgroundImage: `url(${entry.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                        : { background: "#dbd8cc" }
                    }
                  />
                  <span className={styles.colourBadge}>{entry.thickness}</span>
                  <span className={styles.colourName}>
                    {entry.name}
                    <em>
                      {entry.supplier} {entry.finish}
                    </em>
                  </span>
                </button>
              ))}
            </div>
            <p className={styles.stepNote}>
              Showing {shownColours.length} of {brandPool.length} colours
              {brandFilter ? ` from ${brandFilter}` : ""}.{" "}
              {needsProfile
                ? `All ${thicknessChoice} board, because that is the thickness you chose above.`
                : "The badge on each tile is the board thickness that colour comes in. You do not need to choose one, picking the colour settles it."}
            </p>
          </>
        );

      case 7:
        // Three different empty states, and they are not the same thing. A
        // library we could not read is our problem, a brand with no shape in
        // this board is a real answer, and neither should look like the other.
        if (profileLibrary.hasFailed) {
          return (
            <p className={styles.stepNote}>
              We could not load the door profiles just now. Reload the page to try again, or add this front
              to your list as it is and we will go through the profiles with you when we price it.
            </p>
          );
        }
        if (!profileLibrary.isReady) {
          return (
            <PcdLoader variant="inline" label="Loading the profiles" steps={["Loading profiles"]} />
          );
        }
        if (!availableProfiles.length) {
          return (
            <p className={styles.stepNote}>
              {colour?.supplier} does not make a routed door in {thickness} board. Go back a step and choose
              another brand, or change the thickness.
            </p>
          );
        }
        return (
          <>
            <div className={styles.chipRow}>
              <button
                type="button"
                className={`${styles.chip} ${categoryFilter === "All" ? styles.chipActive : ""}`}
                onClick={() => setCategoryFilter("All")}
              >
                All <em>{availableProfiles.length}</em>
              </button>
              {profileCategories.map((type) => (
                <button
                  type="button"
                  key={type}
                  className={`${styles.chip} ${categoryFilter === type ? styles.chipActive : ""}`}
                  onClick={() => setCategoryFilter(type)}
                >
                  {type}{" "}
                  {PROFILE_TIERS[type] ? <em>{TIER_LABELS[PROFILE_TIERS[type].tier]}</em> : null}
                </button>
              ))}
            </div>
            <div className={styles.profileGrid}>
              {shownProfiles.map((entry) => (
                <ProfileTile
                  key={`${entry.type}-${entry.name}`}
                  entry={entry}
                  selected={profile?.name === entry.name && profile?.type === entry.type}
                  onSelect={() => {
                    setProfile(entry);
                    setJustAdded(null);
                  }}
                />
              ))}
            </div>
            <p className={styles.stepNote}>
              Showing {shownProfiles.length} of {availableProfiles.length} {colour?.supplier} profiles in{" "}
              {thickness} board.{" "}
              {profilesInOtherThickness > 0
                ? `${profilesInOtherThickness} more ${colour?.supplier} shapes are cut too deep for ${thickness} board.`
                : ""}
            </p>
          </>
        );

      default:
        return null;
    }
  }

  // The thickness and the profile are the profiled path's own two steps.
  const visibleSteps = STEPS.filter((step) => (step.id !== 5 && step.id !== 7) || needsProfile);

  return (
    <div className={styles.configurator}>
      <div className={styles.steps} ref={stepsRef}>
        {visibleSteps.map((step, index) => {
          const reachable = isStepReachable(step.id);
          const open = openStep === step.id && reachable;
          return (
            <section
              key={step.id}
              className={`${styles.step} ${reachable ? "" : styles.stepLocked} ${open ? styles.stepOpen : ""}`}
            >
              <button
                type="button"
                className={styles.stepHead}
                onClick={() => reachable && setOpenStep(open ? 0 : step.id)}
                aria-expanded={open}
                disabled={!reachable}
              >
                {/* Position in the visible list, not the step's id, so a flat
                    door counts 1 to 5 rather than skipping the two profiled
                    steps and leaving gaps in the numbering. */}
                <span className={styles.stepNumber}>{index + 1}</span>
                <span className={styles.stepTitle}>{step.title}</span>
                {summaries[step.id] ? (
                  <span className={styles.stepSummary}>{summaries[step.id]}</span>
                ) : null}
                <span className={styles.stepToggle} aria-hidden="true">
                  {open ? "−" : "+"}
                </span>
              </button>
              {open ? <div className={styles.stepBody}>{renderStepBody(step.id)}</div> : null}
            </section>
          );
        })}

        {justAdded ? (
          /* The add row becomes a confirmation. Adding a second item in a
             different colour otherwise meant walking back up the accordion and
             undoing every answer by hand. */
          <div className={`${styles.addRow} ${styles.addedRow}`}>
            <div>
              <strong>
                Added: {justAdded.qty} × {justAdded.title}
              </strong>
              <span>It is on your list. Start another item, or send the list when you are done.</span>
            </div>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              onClick={startAnotherItem}
            >
              Add another item
            </button>
          </div>
        ) : (
        <div className={styles.addRow}>
          <div>
            <strong>
              {isComplete
                ? isPriced
                  ? `${layout.name}, ${formatMoney(unitPrice)} each`
                  : `${layout.name}, we will price this for you`
                : "Finish the steps above to add this to your list"}
            </strong>
            <span>
              {isComplete
                ? `${cabinet.height}×${cabinet.width}mm · ${colour.supplier} ${material.material} ${thickness} · ${colour.name}${
                    profile ? ` · ${profile.name}` : needsProfile ? " · profile to confirm" : ""
                  }`
                : !systemId
                  ? "Nothing selected yet"
                  : !cabinet
                    ? "Pick a cabinet size"
                    : !layout
                      ? "Pick a front layout"
                      : !material
                        ? "Flat or profiled?"
                        : needsProfile && !thicknessChoice
                          ? "Pick 18mm or 21mm board"
                          : !colour
                            ? "Pick a colour"
                            : "Pick a profile"}
            </span>
          </div>
          <div className={styles.quantity}>
            <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Fewer">
              &minus;
            </button>
            <input
              value={quantity}
              inputMode="numeric"
              aria-label="Quantity"
              onChange={(event) => setQuantity(Math.max(1, parseInt(event.target.value, 10) || 1))}
            />
            <button type="button" onClick={() => setQuantity((q) => q + 1)} aria-label="More">
              +
            </button>
          </div>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={addToList}
            disabled={!isComplete}
          >
            Add to my list
          </button>
        </div>
        )}

        {/* Always available, not just after an add, someone halfway through a
            cabinet may simply want to start over. Hidden until they have chosen
            something, since there is nothing to clear before that. */}
        {!justAdded && systemId ? (
          <button type="button" className={styles.startOver} onClick={startAnotherItem}>
            Start these steps again
          </button>
        ) : null}
      </div>

      <aside className={styles.panel}>
        <div className={styles.preview}>
          <div className={styles.previewStage}>
            {cabinet ? (
              <CabinetPreview3D
                cabinet={cabinet}
                layout={layout}
                colourSrc={colour?.imageUrl || ""}
                colourHex="#efece5"
              />
            ) : (
              <p className={styles.previewEmpty}>Pick a cabinet to see it here</p>
            )}
            {/* The wording splits on pointer type in CSS: a mouse scrolls, a
                finger pinches, and telling a phone to scroll is no help. */}
            {cabinet ? (
              <span className={styles.previewHint}>
                Drag to rotate
                <span className={styles.hintMouse}> · scroll to zoom</span>
                <span className={styles.hintTouch}> · pinch to zoom</span>
              </span>
            ) : null}
          </div>
          <p className={styles.previewMeta}>
            {[
              cabinet ? `${cabinet.height} × ${cabinet.width}mm` : null,
              layout?.name,
              colour?.name,
              material ? `${material.material} ${thickness}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Nothing selected yet"}
          </p>
          {/* The preview is a true-to-size model of the cabinet and its fronts,
              but it cannot render a routed profile - the fronts are flat solids.
              Saying so here stops someone reading a flat slab as the Bendigo
              they just chose. */}
          <p className={styles.previewNote}>
            Sizes, layout and colour are shown to scale. Door profiles cannot be shown on the 3D model.
          </p>
        </div>

        <div className={styles.listBox}>
          <div className={styles.listHead}>
            <h3>Your list</h3>
            <span>
              {items.length} {items.length === 1 ? "item" : "items"}
              {pricingEnabled && toQuoteCount ? ` · ${toQuoteCount} to quote` : ""}
            </span>
          </div>

          <div className={styles.listItems}>
            {items.length === 0 ? (
              <p className={styles.listEmpty}>
                Add fronts as you go. You can mix cabinets, colours and profiles in one list.
              </p>
            ) : (
              items.map((item) => (
                <div className={styles.listItem} key={item.id}>
                  <div>
                    <strong>
                      {item.qty} × {item.title}
                    </strong>
                    <em>{item.detail}</em>
                  </div>
                  {itemIsPriced(item) ? (
                    <span className={styles.listAmount}>{formatMoney(item.price * item.qty)}</span>
                  ) : (
                    <span className={styles.listQuote}>Quote</span>
                  )}
                  <button type="button" onClick={() => removeEntry(item.id)} aria-label={`Remove ${item.title}`}>
                    &times;
                  </button>
                </div>
              ))
            )}
          </div>

          {pricedCount ? (
            <div className={styles.listTotal}>
              <span>Estimate incl. GST</span>
              <strong>{formatMoney(listTotal)}</strong>
            </div>
          ) : null}

          {pricedCount ? (
            <p className={styles.listNote}>
              {toQuoteCount
                ? `Covers the ${pricedCount} ${pricedCount === 1 ? "item" : "items"} we can price on the spot. The other ${toQuoteCount} ${toQuoteCount === 1 ? "item is" : "items are"} priced by hand. `
                : ""}
              Fronts only. Hinge drilling and delivery are added when we quote.
            </p>
          ) : (
            <p className={styles.listNote}>
              We price your list by hand so you get the real number for your exact sizes and finish, not a
              rounded-up estimate.
            </p>
          )}

          <Link className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonFull}`} href="/request-quote">
            Review &amp; Submit Quote Request
          </Link>

          {/* Custom items are added on the quote request page, which already has
              a full line-item builder. Offering a second way to add them here
              would be one more surface to keep in step with it. This note is the
              signpost, so nobody assumes the tool only handles IKEA sizes. */}
          <div className={styles.extras}>
            <p className={styles.extrasNote}>
              Custom cabinets and anything that is not a standard IKEA or Kaboodle size get added on the
              quote request page, alongside this list.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
