"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { addEntry, removeEntry, useQuoteList } from "@/lib/pcd-quote-list";
import PcdLoader from "@/components/public/PcdLoader";
import { profileImageSrc } from "@/lib/pcd-profile-images";
import { profileNamesForSelection, profileTypesForSelection } from "@/lib/quote-form-data";
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

const STEPS = [
  { id: 1, title: "Which cabinets have you got?" },
  { id: 2, title: "Which cabinet size?" },
  { id: 3, title: "How is that cabinet fronted?" },
  { id: 4, title: "Flat or profiled?" },
  { id: 5, title: "Pick your colour" },
  { id: 6, title: "Pick your door profile" },
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

// One profile tile, showing the real photo of the routed door from
// /public/images/profiles. The 21mm-only profiles have no photo yet, and a
// missing file should degrade to the drawn placeholder rather than a broken
// image icon, handled on error as well as up front, so adding the photo later
// is the only step needed to light it up.
function ProfileTile({ entry, selected, onSelect }) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = profileImageSrc(entry.type, entry.name);
  const showImage = src && !imageFailed;

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
      <span className={styles.profileTier}>{TIER_LABELS[entry.tier]}</span>
      <strong>{entry.name}</strong>
      <span>{entry.type}</span>
    </button>
  );
}

// Polytec alone carries 14 finishes, so a row of pills ran to three lines and
// read as clutter. A single control that opens a checklist grouped by brand
// keeps the colour grid as the thing you look at, and lets someone tick two
// finishes at once rather than flicking between them one at a time.
function FinishFilter({ groups, selected, onToggle, onClear, total }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const label = selected.length
    ? `${selected.length} finish${selected.length === 1 ? "" : "es"} selected`
    : "All finishes";

  return (
    <div className={styles.filterRow}>
      <div className={styles.filterWrap} ref={wrapRef}>
        <button
          type="button"
          className={`${styles.filterButton} ${open ? styles.filterButtonOpen : ""}`}
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((current) => !current)}
        >
          <span>{label}</span>
          <span className={styles.filterCaret} aria-hidden="true" />
        </button>

        {open ? (
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

      {selected.length ? (
        <button type="button" className={styles.filterClear} onClick={onClear}>
          Clear filter
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

  // There is no thickness question any more. A customer at this point has no
  // idea whether they want 16mm or 21mm board, so asking them to choose was a
  // dead end. Every colour the material is made in is listed instead, once per
  // thickness, with the thickness badged on the tile, picking the colour is
  // what settles the thickness.
  const thickness = colour?.thickness || null;

  const colourPool = useMemo(
    () => colours.filter((entry) => entry.material === materialKey),
    [colours, materialKey]
  );

  // Finishes grouped by the brand that makes them, for the filter dropdown.
  const finishGroups = useMemo(() => {
    const bySupplier = new Map();
    colourPool.forEach((entry) => {
      if (!entry.finish) return;
      const supplier = entry.supplier || "Other";
      if (!bySupplier.has(supplier)) bySupplier.set(supplier, new Map());
      const finishes = bySupplier.get(supplier);
      finishes.set(entry.finish, (finishes.get(entry.finish) || 0) + 1);
    });

    const order = ["Polytec", "Laminex", "Formica"];
    return [...bySupplier.entries()]
      .sort((a, b) => {
        const ai = order.indexOf(a[0]);
        const bi = order.indexOf(b[0]);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
      .map(([supplier, finishes]) => ({
        supplier,
        finishes: [...finishes.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count })),
      }));
  }, [colourPool]);

  const shownColours = selectedFinishes.length
    ? colourPool.filter((entry) => selectedFinishes.includes(entry.finish))
    : colourPool;

  // Fluted and the 21mm-only names come out of the list at 18mm. These are the
  // same helpers the quote editor and design tool use, so the public page can
  // never offer a combination we would have to ring the customer back about.
  const availableProfiles = useMemo(() => {
    if (!material?.profiled || !thickness) return [];
    return profileTypesForSelection(material.material, thickness).flatMap((type) =>
      profileNamesForSelection(type, material.material, thickness).map((name) => ({
        name,
        type,
        tier: PROFILE_TIERS[type]?.tier ?? 1,
      }))
    );
  }, [material, thickness]);

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

  const needsProfile = Boolean(material?.profiled);

  // Flat fronts price themselves off the chosen colour's rate. Profiled fronts
  // never do - the rate is 0 on them by design, so they fall through to Quote.
  // The rate arrives already marked up and GST-inclusive from the server.
  const ratePerSqm = needsProfile ? 0 : Number(colour?.ratePerSqm) || 0;
  const isPriced = ratePerSqm > 0;

  const unitPrice = useMemo(
    () => (isPriced && layout ? layoutPriceIncGst(layout, ratePerSqm) : 0),
    [isPriced, layout, ratePerSqm]
  );

  const isComplete = Boolean(layout && material && thickness && colour && (!needsProfile || profile));

  function resetFrom(step) {
    // Any change to the configuration means the "added" confirmation no longer
    // describes what is on screen.
    setJustAdded(null);
    if (step <= 2) { setCabinet(null); setLayout(null); }
    if (step <= 3) setLayout(null);
    if (step <= 4) { setColour(null); setProfile(null); setSelectedFinishes([]); setCategoryFilter("All"); }
    if (step <= 5) setColour(null);
    if (step <= 6) setProfile(null);
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
    setSelectedFinishes([]);
    setCategoryFilter("All");
    setOpenStep(5);
  }

  function toggleFinish(name) {
    setSelectedFinishes((current) =>
      current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name]
    );
  }

  function chooseColour(next) {
    setColour(next);
    setJustAdded(null);
    // A flat door has no step 6, so stay on the colour grid rather than
    // collapsing the whole accordion and leaving nothing open.
    if (needsProfile) setOpenStep(6);
  }

  // Writes into the site-wide list rather than a private array, so the header
  // badge updates, the drawer can show it, and it is still there after they
  // wander off to the kitchen refresh page and come back.
  function addToList() {
    if (!isComplete) return;
    addEntry({
      kind: "configured",
      qty: quantity,
      title: `${layout.name}, ${cabinet.width} × ${cabinet.height}mm`,
      detail: `${SYSTEMS.find((s) => s.id === systemId)?.name} · ${material.material} ${thickness} · ${colour.name}${profile ? ` · ${profile.name}` : " · flat slab"}`,
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
      profileType: profile ? profile.type : "",
      profile: profile ? profile.name : "",
      // 0 means this line goes on the list as "Quote" - a profiled front, or a
      // colour we have no rate for yet.
      price: unitPrice,
    });
    setJustAdded({ title: `${layout.name}, ${cabinet.width} × ${cabinet.height}mm`, qty: quantity });
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
    2: cabinet ? `${cabinet.width} × ${cabinet.height}mm` : "",
    3: layout?.name || "",
    4: material ? material.label : "",
    5: colour?.name || "",
    6: profile ? `${profile.name} ${TIER_LABELS[profile.tier]}` : "",
  };

  function isStepReachable(step) {
    if (step === 1) return true;
    if (step === 2) return Boolean(systemId);
    if (step === 3) return Boolean(cabinet);
    if (step === 4) return Boolean(layout);
    // Thickness now comes FROM the colour picked in this step, so requiring it
    // here would make step 5 permanently unreachable.
    if (step === 5) return Boolean(material);
    return Boolean(colour && needsProfile);
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
                          {item.width} × {item.height}
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
            <FinishFilter
              groups={finishGroups}
              selected={selectedFinishes}
              onToggle={toggleFinish}
              onClear={() => setSelectedFinishes([])}
              total={colourPool.length}
            />
            <div className={styles.colourGrid}>
              {shownColours.map((entry) => (
                <button
                  type="button"
                  key={`${entry.finish}-${entry.name}-${entry.thickness}`}
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
              Showing {shownColours.length} of {colourPool.length} colours. The badge on each tile is the
              board thickness that colour comes in. You do not need to choose one, picking the colour
              settles it.
            </p>
          </>
        );

      case 6:
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
                  {type} <em>{TIER_LABELS[PROFILE_TIERS[type]?.tier ?? 1]}</em>
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
              Showing {shownProfiles.length} of {availableProfiles.length} profiles.{" "}
              {thickness === "18mm"
                ? "Fluted and the 21mm-only profiles are hidden because you chose 18mm board."
                : "Every profile family is available at 21mm."}
            </p>
          </>
        );

      default:
        return null;
    }
  }

  const visibleSteps = STEPS.filter((step) => step.id !== 6 || needsProfile);

  return (
    <div className={styles.configurator}>
      <div className={styles.steps} ref={stepsRef}>
        {visibleSteps.map((step) => {
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
                <span className={styles.stepNumber}>{step.id}</span>
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
                ? `${cabinet.width}×${cabinet.height}mm · ${material.material} ${thickness} · ${colour.name}${profile ? ` · ${profile.name} (${TIER_LABELS[profile.tier]})` : ""}`
                : !systemId
                  ? "Nothing selected yet"
                  : !cabinet
                    ? "Pick a cabinet size"
                    : !layout
                      ? "Pick a front layout"
                      : !material
                        ? "Flat or profiled?"
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
            {cabinet ? <span className={styles.previewHint}>Drag to rotate</span> : null}
          </div>
          <p className={styles.previewMeta}>
            {[
              cabinet ? `${cabinet.width} × ${cabinet.height}mm` : null,
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
