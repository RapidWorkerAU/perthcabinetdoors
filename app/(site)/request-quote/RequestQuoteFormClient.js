"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { edgeImageSrc as sharedEdgeImageSrc } from "../../../lib/pcd-profile-images";
import { asSelectionRows, useProfileLibrary } from "@/lib/use-profile-library";
import { fieldsForProductType, productTypeChoices } from "@/lib/pcd-product-fields";
import { materialsForProductType } from "@/lib/pcd-materials";
import SupplierSelect from "./SupplierSelect";
import {
  edgesForSupplier,
  profileCategoriesForSupplier,
  profilesForSupplier,
  supplierOffersEdges,
  suppliersForMaterial,
} from "@/lib/pcd-supplier-selection";
import { clearList as clearQuoteList, entriesToQuoteLines, readQuoteList } from "@/lib/pcd-quote-list";
import { describeGaps, lineGaps, missingFields } from "@/lib/pcd-quote-ready";
// Handing and cup positions. Shared so the form, the quote editor, the order
// and the Excel sheet cannot come to different answers about the same door.
import { HINGE_SIDES, evenMiddles, hingeCount, hingeProblems } from "@/lib/pcd-hinges";
import styles from "../contact/contact.module.css";
import {
  CABINET_BRANDS,
  cabinetBrandOptions,
  edgeProfilesForMaterial,
  isEdgeProfileSelectionAvailable,
  MATERIAL_OPTIONS,
  MATERIALS_BY_TYPE,
  PRODUCT_TYPES,
  isProfileSelectionAvailable,
  materialKey,
  profileNamesForSelection,
  profileTypesForSelection,
  thicknessOptionsForMaterial,
} from "../../../lib/quote-form-data";

// The fields a line cannot be quoted without, marked on the label so it is
// clear before somebody fills the row in rather than after they try to save it.
// Which ones they are comes from lib/pcd-quote-ready.js, so the mark and the
// rule are the same list.
function Required() {
  return <abbr title="Needed before we can price this line" style={{ color: "#b42318", textDecoration: "none", marginLeft: 3 }}>*</abbr>;
}

function emptyItem(id) {
  return {
    id,
    type: "",
    material: "",
    thickness: "",
    width: "",
    height: "",
    qty: "1",
    finish: "",
    colour: "",
    colourSrc: "",
    // The colour library row behind the swatch they picked. Carried so the back
    // end can price the line off the exact board rather than guessing from a
    // colour name, which is not unique across suppliers.
    colourLibraryId: "",
    supplierName: "",
    // Which catalogue item a Hardware line is for. Hardware has no board, so
    // this is the whole of its spec: an id we can price against, and the name
    // so the row reads as something rather than an id.
    hardwareId: "",
    hardwareName: "",
    note: "",
    edgeMould: "",
    profileType: "",
    profile: "",
    preDrill: false,
    hingeQty: "",
    // WHERE THE HINGES GO. Blank throughout means our standard positions, which
    // is what almost every door wants. A number means they are matching an
    // existing run, and that is the only case where any of this matters.
    hingeSide: "",
    hingeFromBottomMm: "",
    hingeFromTopMm: "",
    // The cups between the bottom and the top. Spaced evenly unless somebody
    // types over one, which is what hingeMiddlesTouched marks: once they have,
    // the number stays put while the others move around it.
    hingeMiddlesMm: [],
    hingeMiddlesTouched: false,
    // Whose cabinet this front is going on. Per line, because a kitchen is
    // routinely Metod fronts with a custom panel closing the end of a run.
    cabinetBrand: "",
    saved: false,
  };
}

function value(formData, key) {
  return String(formData.get(key) || "").trim();
}

/**
 * The middle cups for a line: whatever was typed, or evenly spaced.
 *
 * Even spacing is what the workshop does anyway, so a customer who has given
 * us the two ends has already told us where the rest go. Asking again would be
 * asking them to do our arithmetic.
 */
function hingeMiddlesFor(item) {
  if (item.hingeMiddlesTouched && item.hingeMiddlesMm.length) {
    return item.hingeMiddlesMm.map((mm) => Number(mm) || 0).filter((mm) => mm > 0);
  }
  return evenMiddles({
    height: item.height,
    count: hingeCount(item.hingeQty),
    fromBottom: item.hingeFromBottomMm,
    fromTop: item.hingeFromTopMm,
  });
}

function numberOrUndefined(raw) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function hasLineValue(item) {
  return Boolean(item.type || item.material || item.thickness || item.width || item.height || item.colour || item.edgeMould || item.profile);
}

function sizeText(item) {
  if (!item.width && !item.height) return "";
  return `${item.height || "-"} x ${item.width || "-"}`;
}

function materialText(item) {
  // A hardware line has no board, and its name is its entire spec. This column
  // is "what is this line for", which for a door is the board and for a handle
  // is the handle. Showing "-" made the one line whose spec is its name the
  // only line that did not show it.
  if (item.hardwareName) return item.hardwareName;
  return [item.material, item.thickness].filter(Boolean).join(" / ");
}

function colourText(item) {
  return [item.finish, item.colour].filter(Boolean).join(" - ");
}

function colourOptionMetaLabel(finish, option, supplier) {
  // The brand is only worth repeating on a row that predates the brand step and
  // has none set on the line yet. Otherwise it is the same word on every row.
  return [finish || "", supplier ? "" : option?.supplier || ""].filter(Boolean).join(" - ");
}

/**
 * The thicknesses on offer, for this material and this brand.
 *
 * The brand is chosen first, so its own list is the right one: somebody who
 * wants Laminex should never be shown 21mm and left to find out later that
 * their brand disappeared because of it.
 *
 * Falls back to the material-wide list when no brand is chosen yet, and to
 * the built-in list when the library has not loaded, so the field is never
 * empty for a reason nobody can see.
 */
function thicknessOptionsForSelection(material, availability, brandPairs, supplier) {
  const key = materialKey(material);
  if (supplier && Array.isArray(brandPairs)) {
    const pair = brandPairs.find(
      (entry) =>
        materialKey(entry.material_type) === key &&
        String(entry.supplier_name || "").trim().toLowerCase() === supplier.trim().toLowerCase()
    );
    if (pair?.thicknesses?.length) return pair.thicknesses;
  }
  if (availability && key) return availability[key] || [];
  return thicknessOptionsForMaterial(material);
}

function materialOptionsForSelection(productType, availability) {
  const options = MATERIALS_BY_TYPE[productType] || MATERIAL_OPTIONS;
  if (!availability) return options;
  return options.filter((material) => (availability[materialKey(material)] || []).length > 0);
}

function itemTitle(item) {
  return [item.type || "Product", materialText(item), sizeText(item)].filter(Boolean).join(" - ");
}

function assetSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function profileImageSrc(profileType, profileName) {
  return profileType && profileName ? `/images/profiles/${assetSlug(profileType)}/${assetSlug(profileName)}.jpg` : "";
}

// Where an edge photo lives. Asked of lib/pcd-profile-images.js rather than
// worked out here: the rule has exceptions, and a copy of it that does not
// know them is how the 1mm Bevel Edge showed a broken tile while the square
// edge beside it was fine.
function edgeImageSrc(edgeName) {
  return edgeName ? sharedEdgeImageSrc(edgeName) : "";
}

function ImageSelect({ disabled = false, placeholder, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const wrapRef = useRef(null);
  const selected = options.find((option) => option.value === value) || null;

  useEffect(() => {
    if (!open || !wrapRef.current) return;

    function positionMenu() {
      const rect = wrapRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const preferredWidth = Math.max(rect.width, 320);
      const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2);
      const left = Math.min(
        Math.max(rect.left, viewportPadding),
        window.innerWidth - width - viewportPadding,
      );
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(160, Math.min(420, availableHeight - 4));

      setMenuStyle({
        left: `${left}px`,
        maxHeight: `${maxHeight}px`,
        top: `${openAbove ? rect.top - maxHeight - 4 : rect.bottom + 4}px`,
        width: `${width}px`,
      });
    }

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);

    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  function choose(option) {
    onChange(option.value);
    setOpen(false);
  }

  return (
    <div className={styles.imageSelect} ref={wrapRef}>
      <button
        className={styles.imageSelectControl}
        disabled={disabled}
        type="button"
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onClick={() => !disabled && setOpen((current) => !current)}
      >
        <span>{selected?.label || placeholder}</span>
      </button>
      {open && !disabled ? (
        <div className={styles.imageSelectMenu} style={menuStyle}>
          {options.length ? options.map((option) => (
            <button className={styles.imageSelectOption} key={option.value} type="button" onMouseDown={() => choose(option)}>
              {option.image ? <img alt="" src={option.image} onError={(event) => { event.currentTarget.parentElement?.classList.add(styles.imageSelectOptionNoImage); event.currentTarget.remove(); }} /> : null}
              <span>{option.label}</span>
            </button>
          )) : (
            <div className={styles.colourEmpty}>No options available</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * STEP ONE: what are we making?
 *
 * A grid of what we do rather than a dropdown, because the answer decides every
 * question after it and half the people filling this in have never ordered a
 * cabinet door before. A line of plain words under each one is worth more than
 * a tidier control.
 */
function ProductTypeChooser({ types, current, onChoose }) {
  return (
    <div className={styles.typeChooser}>
      {types.map((entry) => {
        const on = current === entry.value;
        return (
          <button
            key={entry.value}
            type="button"
            className={on ? `${styles.typeCard} ${styles.typeCardOn}` : styles.typeCard}
            aria-pressed={on}
            onClick={() => onChoose(entry.value)}
          >
            <strong>{entry.label}</strong>
            <span>{entry.blurb}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The hardware catalogue, for a Hardware line.
 *
 * Picking the actual item is the point: "handles" on a request means somebody
 * has to email and ask which ones, which is the question this form already had
 * the chance to ask.
 *
 * Costs are stripped by the endpoint. What it costs us is not part of choosing.
 */
/**
 * The hardware catalogue, chosen the way a profile is chosen.
 *
 * Type first, then the item, both as dropdowns, with photographs in the second
 * one. It was a wall of cards, which reads fine at eight items and not at all at
 * fifty: everything on screen at once, no way to narrow it, and the page growing
 * with the range.
 *
 * It also looked nothing like the two pickers directly above it. Profiles and
 * colours are a category then a picture list, so hardware is too, and somebody
 * who has learned one has learned all three.
 *
 * Costs are stripped by the endpoint. What it costs us is not part of choosing.
 */
function HardwarePicker({ item, onChange, invalid }) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading");
  // The type they are browsing. Not stored on the line: it is a way of finding
  // the item, and the item already knows its own type.
  const [browsing, setBrowsing] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/hardware", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        if (!payload?.ok) {
          setStatus("failed");
          return;
        }
        setRows(payload.hardware || []);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chosen = useMemo(() => rows.find((row) => row.id === item.hardwareId) || null, [rows, item.hardwareId]);
  // What is already chosen decides which type is showing, so reopening a saved
  // line lands on the right list rather than back at the top.
  const type = browsing || chosen?.type || "";

  const types = useMemo(() => {
    const found = [];
    rows.forEach((row) => {
      if (row.type && !found.includes(row.type)) found.push(row.type);
    });
    return found.sort((a, b) => hardwareTypeLabel(a).localeCompare(hardwareTypeLabel(b)));
  }, [rows]);

  const options = useMemo(
    () =>
      rows
        .filter((row) => !type || row.type === type)
        .map((row) => ({ value: row.id, label: hardwareLabel(row), image: row.imageUrl || "" })),
    [rows, type]
  );

  // An empty list and a failed read look identical, so they are never both shown
  // as "nothing here".
  if (status === "failed") {
    return (
      <p className={styles.fieldError}>
        We could not load our hardware list just now. Please add the rest of your products and mention what you need in
        the notes at the bottom, and we will follow up.
      </p>
    );
  }
  if (status === "loading") return <span className={styles.notApplicable}>Loading our hardware range...</span>;
  if (!rows.length) {
    return <span className={styles.notApplicable}>We have no hardware listed online at the moment.</span>;
  }

  return (
    <div className={styles.hardwareFields}>
      <div className={styles.field}>
        <label>Hardware type</label>
        <select
          className="pcdSelect"
          value={type}
          onChange={(event) => {
            const next = event.target.value;
            setBrowsing(next);
            // A chosen item that is not in the new type would sit there naming
            // something the list below no longer offers.
            if (chosen && next && chosen.type !== next) onChange({ hardwareId: "", hardwareName: "" });
          }}
        >
          <option value="">All hardware</option>
          {types.map((name) => (
            <option key={name} value={name}>
              {hardwareTypeLabel(name)}
            </option>
          ))}
        </select>
      </div>
      <div className={`${styles.field} ${invalid ? styles.hardwarePickerError : ""}`}>
        <label>Which one?<Required /></label>
        <ImageSelect
          value={item.hardwareId}
          placeholder={type ? `Select a ${hardwareTypeLabel(type).toLowerCase()}` : "Select hardware"}
          options={options}
          onChange={(value) => {
            const row = rows.find((entry) => entry.id === value);
            onChange({ hardwareId: value, hardwareName: row ? hardwareLabel(row) : "" });
          }}
        />
      </div>
    </div>
  );
}

function hardwareTypeLabel(type) {
  return String(type || "")
    .replace(/_/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function hardwareLabel(row) {
  return [row.brand, row.name].filter(Boolean).join(" ");
}

function ColourControls({ item, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(item.colour || "");
  const [menuStyle, setMenuStyle] = useState({});
  const [colourFamily, setColourFamily] = useState(null);
  const wrapRef = useRef(null);
  const supplier = String(item.supplierName || "").trim();
  const sameBrand = (value) => String(value || "").trim().toLowerCase() === supplier.toLowerCase();
  // Only this brand's colours, and only the finishes that still have one. A
  // finish with nothing left under it would open onto an empty list, which
  // reads as broken rather than as a filter doing its job.
  const finishGroups = (colourFamily?.groups || [])
    .map((group) => ({ ...group, colours: (group.colours || []).filter((colour) => !supplier || sameBrand(colour.supplier)) }))
    .filter((group) => group.colours.length);
  // null while it has not been asked for or is still coming back; an object with
  // no groups once we know there is genuinely nothing in this thickness.
  const nothingStocked = Boolean(item.material && item.thickness && colourFamily && !finishGroups.length);
  const selectedFinish = finishGroups.find((group) => group.label === item.finish) || null;
  const options = selectedFinish?.colours || [];
  const cleanedQuery = query.trim().toLowerCase();
  const visibleOptions =
    cleanedQuery.length >= 3
      ? options.filter((option) => option.name.toLowerCase().includes(cleanedQuery))
      : options;

  useEffect(() => {
    setQuery(item.colour || "");
  }, [item.colour, item.material, item.thickness]);

  useEffect(() => {
    let cancelled = false;

    async function loadDatabaseColours() {
      setColourFamily(null);
      if (!item.material || !item.thickness) return;

      try {
        const response = await fetch(`/api/colour-library?material=${encodeURIComponent(item.material)}&thickness=${encodeURIComponent(item.thickness)}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!cancelled) {
          setColourFamily(payload?.colourFamily?.groups?.length ? payload.colourFamily : { groups: [] });
        }
      } catch (error) {
        if (!cancelled) setColourFamily({ groups: [] });
      }
    }

    loadDatabaseColours();
    return () => {
      cancelled = true;
    };
  }, [item.material, item.thickness]);

  useEffect(() => {
    if (!open || !wrapRef.current) return;

    function positionMenu() {
      const rect = wrapRef.current.getBoundingClientRect();
      setMenuStyle({
        left: `${rect.left}px`,
        top: `${rect.bottom + 4}px`,
        width: `${Math.max(rect.width, 320)}px`,
      });
    }

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);

    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  function choose(option) {
    setQuery(option.name);
    onChange({
      colour: option.name,
      finish: item.finish,
      colourSrc: option.src,
      // Keep the identity of the board, not just its name. This is what lets
      // the quote be priced without anyone re-picking the colour by hand.
      colourLibraryId: option.id || "",
      // The list is already this brand's colours only, so this agrees with
      // what is on the line. Kept from the option for a row that predates the
      // brand step and has none recorded yet.
      supplierName: supplier || option.supplier || "",
    });
    setOpen(false);
  }

  function chooseFinish(finish) {
    setQuery("");
    setOpen(false);
    // The brand is NOT cleared here. It was, back when the brand was read off
    // whichever colour got picked, so changing the finish invalidated it. Now
    // the brand is chosen first and narrows this list, and clearing it from
    // here wiped the answer two fields up and locked the colour box again.
    onChange({ finish, colour: "", colourSrc: "", colourLibraryId: "" });
  }

  // Typing filters the list; it does not choose anything. Leaving typed text in
  // the box after that made the row read as if a colour had been chosen when
  // none had, so an abandoned search snaps back to whatever is actually set.
  function handleBlur() {
    window.setTimeout(() => {
      setOpen(false);
      setQuery(item.colour || "");
    }, 120);
  }

  return (
    <>
      <div className={styles.inlineField}>
        <select className="pcdSelect"
          disabled={!item.material || !item.thickness || !finishGroups.length}
          value={item.finish}
          onChange={(event) => chooseFinish(event.target.value)}
        >
          <option value="">
            {!item.material || !item.thickness
              ? "Select thickness first"
              : nothingStocked
                ? (supplier ? `None from ${supplier}` : "None in this thickness")
                : "Finish"}
          </option>
          {finishGroups.map((group) => (
            <option key={group.label} value={group.label}>
              {group.label}
            </option>
          ))}
        </select>
      </div>
      {nothingStocked ? (
        <p className={styles.fieldError} style={{ gridColumn: "1 / -1", margin: 0 }}>
          {supplier
            ? `${supplier} has no ${String(item.material).toLowerCase()} colours in ${item.thickness}. Try another thickness, or another brand.`
            : `We do not stock a colour in ${item.material} ${item.thickness}. Please choose another thickness.`}
        </p>
      ) : null}
      <div className={`${styles.inlineField} ${styles.colourCombo}`} ref={wrapRef}>
        <input
          disabled={!item.material || !item.thickness || !item.finish}
          placeholder={item.finish ? "Colour" : "Select finish first"}
          type="text"
          value={query}
          onBlur={handleBlur}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setOpen(true);
          }}
          onFocus={() => item.material && item.thickness && item.finish && setOpen(true)}
        />
        <button
          aria-label="Open colour options"
          className={styles.colourComboButton}
          disabled={!item.material || !item.thickness || !item.finish}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            if (item.material && item.thickness && item.finish) setOpen((current) => !current);
          }}
        />
        {open && item.material && item.thickness && item.finish ? (
          <div className={styles.colourMenu} style={menuStyle}>
            {visibleOptions.length ? (
              visibleOptions.map((option) => (
                <button className={styles.colourOption} key={option.id || `${item.finish}-${option.name}-${option.src}`} type="button" onMouseDown={() => choose(option)}>
                  {option.src ? <img alt="" src={option.src} /> : <span className={styles.colourOptionNoImage} aria-hidden="true" />}
                  <span>
                    <strong>{option.name}</strong>
                    <small>{colourOptionMetaLabel(item.finish, option, supplier)}</small>
                  </span>
                </button>
              ))
            ) : (
              <div className={styles.colourEmpty}>No colour match</div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}

export default function RequestQuoteFormClient() {
  const [items, setItems] = useState([]);
  const [editingId, setEditingId] = useState(null);
  // Step one asks what they are ordering, because the answer decides every
  // question after it. A saved line opens straight on step two: the type is
  // already answered, and making somebody re-answer it to change a size would
  // be a step for nothing.
  const [pickingTypeState, setPickingType] = useState(false);
  // What each row is still missing, keyed by row id. Set when someone tries to
  // save a half-filled row or send the form, and cleared as they fix it.
  const [lineErrors, setLineErrors] = useState({});
  const [nextId, setNextId] = useState(1);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [colourAvailability, setColourAvailability] = useState(null);
  // Which brands stock which material, from the same request. The brand a
  // customer picks decides every option below it, so it has to know which
  // brands actually stock the material they chose.
  const [supplierColourRows, setSupplierColourRows] = useState([]);
  const [errors, setErrors] = useState({});
  const [importedCount, setImportedCount] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState("");

  // The catalogue every line picks from. One fetch for the form, not one per
  // row, and it carries a status so an empty list can be told apart from a
  // failed read. See lib/use-profile-library.js.
  const profileLibrary = useProfileLibrary();

  const savedCount = items.filter((item) => item.saved).length;
  const editingItem = items.find((item) => item.id === editingId) || null;
  const visibleItems = items.filter((item) => item.saved || hasLineValue(item));

  // Anything built in the IKEA & Kaboodle configurator, or added as a custom
  // item from the drawer, arrives here as ordinary saved line items - same
  // fields, same editing, same submit. This is what stops the site carrying two
  // item builders that cannot see each other. Runs once: after they land, the
  // lines belong to this form, so re-importing on every render would duplicate
  // them and fight anyone editing a row.
  const importedRef = useRef(false);
  useEffect(() => {
    if (importedRef.current) return;
    importedRef.current = true;

    let cancelled = false;

    function seed(entries) {
      const incoming = entriesToQuoteLines(entries);
      if (!incoming.length || cancelled) return;

      setItems((current) => {
        const seeded = incoming.map((line, index) => ({
          ...emptyItem(`imported-${index + 1}`),
          ...line,
          saved: true,
        }));
        // Drop the blank starter row the form opens with, so an imported list
        // does not begin with an empty line.
        const existing = current.filter((item) => item.saved || hasLineValue(item));
        return [...seeded, ...existing];
      });
      setNextId((current) => current + incoming.length);
      setImportedCount(incoming.length);
      clearQuoteList();
    }

    // ?list=CODE means they saved the list on another device and followed the
    // link. That wins over whatever this browser happens to be holding.
    const code = new URLSearchParams(window.location.search).get("list");
    if (code) {
      setRestoring(true);
      fetch(`/api/quote-list/${encodeURIComponent(code)}`, { cache: "no-store" })
        .then((response) => response.json())
        .then((payload) => {
          if (cancelled) return;
          if (payload?.ok && Array.isArray(payload.entries) && payload.entries.length) seed(payload.entries);
          else setRestoreError(payload?.error || "We could not find that list.");
        })
        .catch(() => {
          if (!cancelled) setRestoreError("We could not load that list. Please try the link again.");
        })
        .finally(() => {
          if (!cancelled) setRestoring(false);
        });
      return () => {
        cancelled = true;
      };
    }

    seed(readQuoteList());
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadColourAvailability() {
      try {
        const response = await fetch("/api/colour-library?availability=1", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled && response.ok && payload?.ok) {
          setColourAvailability(payload.availability || {});
          setSupplierColourRows(payload.brandPairs || []);
        }
      } catch {
        if (!cancelled) setColourAvailability(null);
      }
    }

    loadColourAvailability();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateItem(id, patch) {
    setLineErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };

        if (Object.prototype.hasOwnProperty.call(patch, "type")) {
          if (patch.type !== "Door") {
            next.preDrill = false;
            next.hingeQty = "";
          }
        }

        if (Object.prototype.hasOwnProperty.call(patch, "material")) {
          // The brand DOES go here, unlike on a thickness change: which brands
          // stock a board differs by board, so a brand chosen for one material
          // says nothing about another.
          next.thickness = "";
          next.finish = "";
          next.colour = "";
          next.colourSrc = "";
          next.colourLibraryId = "";
          next.supplierName = "";
          if (!isEdgeProfileSelectionAvailable(next.edgeMould, next.material)) {
            next.edgeMould = "";
          }
          if (patch.material !== "Thermolaminate") {
            next.profileType = "";
            next.profile = "";
          }
        }

        if (Object.prototype.hasOwnProperty.call(patch, "thickness")) {
          // The brand is NOT cleared here. It is chosen a step earlier and it is
          // what produced this thickness list, so clearing it undoes the answer
          // that made the choice possible and locks the colour field behind it.
          next.finish = "";
          next.colour = "";
          next.colourSrc = "";
          next.colourLibraryId = "";
        }

        if (Object.prototype.hasOwnProperty.call(patch, "profileType")) {
          next.profile = "";
        }

        if (
          (Object.prototype.hasOwnProperty.call(patch, "thickness") ||
            Object.prototype.hasOwnProperty.call(patch, "material")) &&
          !isProfileSelectionAvailable(next.profileType, next.profile, next.material, next.thickness)
        ) {
          next.profileType = "";
          next.profile = "";
        }

        return next;
      })
    );
  }

  function addItem() {
    if (editingId) return;
    const id = `item-${nextId}`;
    setItems((current) => [...current, emptyItem(id)]);
    setNextId((current) => current + 1);
    setEditingId(id);
    setPickingType(true);
  }

  /**
   * Answer step one and move to step two.
   *
   * Changing the type takes the old type's answers with it. A door drilled for
   * hinges that becomes a table top must not still be drilled, and hardware
   * has no board at all, so keeping a colour on it would send a spec we cannot
   * act on. Only what the new type can still use survives.
   */
  function chooseType(id, type) {
    setItems((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        if (row.type === type) return row;
        const next = fieldsForProductType(type);
        const keepsBoard = next.board && materialsForProductType(type).includes(row.material);
        return {
          ...row,
          type,
          // A material the new type cannot be made from goes, and the colour,
          // brand and thickness go with it: they were all chosen under it.
          material: keepsBoard ? row.material : "",
          supplierName: keepsBoard ? row.supplierName : "",
          thickness: keepsBoard ? row.thickness : "",
          finish: keepsBoard ? row.finish : "",
          colour: keepsBoard ? row.colour : "",
          colourSrc: keepsBoard ? row.colourSrc : "",
          colourLibraryId: keepsBoard ? row.colourLibraryId : "",
          height: next.size ? row.height : "",
          width: next.size ? row.width : "",
          edgeMould: next.edge ? row.edgeMould : "",
          profileType: next.profile ? row.profileType : "",
          profile: next.profile ? row.profile : "",
          preDrill: next.hinges ? row.preDrill : false,
          hingeQty: next.hinges ? row.hingeQty : "",
          hardwareId: next.hardware ? row.hardwareId : "",
          hardwareName: next.hardware ? row.hardwareName : "",
        };
      })
    );
    // The errors were about the old type's questions.
    setLineErrors((current) => {
      const rest = { ...current };
      delete rest[id];
      return rest;
    });
    setPickingType(false);
  }

  function deleteItem(id) {
    setItems((current) => {
      const next = current.filter((item) => item.id !== id);
      return next;
    });
    if (editingId === id) setEditingId(null);
  }

  // A row can only be saved once we could actually price it. Board prices are
  // held per material, thickness, finish and colour, and the cost needs a size,
  // so a row missing any of those is one we would have to email back about
  // before we could quote it. The rule is lib/pcd-quote-ready.js, the same one
  // the API applies, so the form cannot send something the API will reject.
  function saveItem(id) {
    const item = items.find((candidate) => candidate.id === id);
    const gaps = lineGaps(item);
    if (gaps.length) {
      setLineErrors((current) => ({ ...current, [id]: gaps }));
      return;
    }
    setLineErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setItems((current) => current.map((row) => (row.id === id ? { ...row, saved: true } : row)));
    setEditingId(null);
    setPickingType(false);
  }

  function cancelEdit(id) {
    const item = items.find((candidate) => candidate.id === id);
    setPickingType(false);
    if (item && !item.saved && items.length > 1) {
      deleteItem(id);
    } else {
      setEditingId(null);
    }
  }

  function editItem(id) {
    if (editingId) {
      setStatus({ type: "error", message: "Please save or cancel the current line item before editing another." });
      return;
    }
    setStatus(null);
    setEditingId(id);
    // Straight to step two. The type is answered, and the way back to it is
    // the link at the top of the panel.
    setPickingType(false);
  }

  async function submitQuote(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus(null);

    const formData = new FormData(form);
    const firstName = value(formData, "firstName");
    const lastName = value(formData, "lastName");
    const name = [firstName, lastName].filter(Boolean).join(" ");
    const notes = value(formData, "notes");
    const cabinetBrand = value(formData, "cabinetBrand");
    const quoteRows = items.filter(hasLineValue);

    const nextErrors = {};
    if (!firstName) nextErrors.firstName = "Please enter your first name.";
    if (!value(formData, "email")) nextErrors.email = "Please enter your email address.";
    if (!value(formData, "phone")) nextErrors.phone = "Please enter your phone number.";

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    // Rows that came across from the configurator or the list drawer arrive
    // already saved, so they never passed through saveItem's check.
    const incomplete = quoteRows.map((item) => ({ item, gaps: lineGaps(item) })).filter((entry) => entry.gaps.length);
    if (incomplete.length) {
      setLineErrors(Object.fromEntries(incomplete.map((entry) => [entry.item.id, entry.gaps])));
      setErrors({});
      setStatus({
        type: "error",
        message: incomplete.length === 1
          ? `One line is missing ${describeGaps(incomplete[0].gaps)}. Please complete it so we can price it.`
          : `${incomplete.length} lines are missing details we need to price them. Open each one and finish it.`,
      });
      return;
    }

    setErrors({});
    setSubmitting(true);

    // Every field goes across as its own field. The finish used to be glued onto
    // the front of the colour here ("Matt - Classic White"), which is what put
    // the finish in the colour column all the way through to the quote editor —
    // where the colour picker then could not match it back to a library row, so
    // the line arrived unpriced and unselectable. The finish already has its own
    // key one line up; it never needed repeating inside the colour.
    //
    // colourLibraryId and supplier come from the row the customer actually
    // clicked, so the back end can price the line exactly rather than matching
    // on a name that two suppliers might share.
    const lines = quoteRows.map((item) => ({
      productType: item.type,
      // The hardware name, so the line reads as what they picked rather than
      // the word "Hardware", which is what it said before and what somebody
      // then had to email and ask about.
      productName: item.hardwareName || item.type || "Cabinetry item",
      hardwareCatalogueId: item.hardwareId || undefined,
      material: item.material,
      thickness: item.thickness,
      finish: item.finish,
      colour: item.colour,
      colourLibraryId: item.colourLibraryId || undefined,
      supplierName: item.supplierName || undefined,
      profileType: item.profileType,
      profile: item.profile,
      edgeMould: item.edgeMould,
      width: numberOrUndefined(item.width),
      height: numberOrUndefined(item.height),
      qty: numberOrUndefined(item.qty) || 1,
      hingeHoles: item.type === "Door" && item.preDrill,
      // Supplying hinges is deliberately not asked. We drill for them and do not
      // supply them, and a quote line cannot carry it either: hinge_supply is
      // forced to false and its cost to zero on every write path. Asking a
      // customer for something no part of the system can act on only sets an
      // expectation nobody meant to set.
      hingeQty: item.type === "Door" && item.preDrill ? item.hingeQty : "",
      // Only sent when the line is actually drilled. An untick that left a
      // measurement behind would put one on a workshop sheet for a door that
      // has no holes in it.
      hingeSide: item.type === "Door" && item.preDrill ? item.hingeSide : "",
      hingeFromBottomMm: item.type === "Door" && item.preDrill ? item.hingeFromBottomMm : "",
      hingeFromTopMm: item.type === "Door" && item.preDrill ? item.hingeFromTopMm : "",
      hingeMiddlesMm: item.type === "Door" && item.preDrill ? hingeMiddlesFor(item) : [],
      cabinetBrand: item.cabinetBrand || "",
      notes: item.note || "",
    }));

    const payload = {
      source: "request_quote",
      customerName: name,
      customerEmail: value(formData, "email"),
      customerPhone: value(formData, "phone"),
      deliverySuburb: value(formData, "suburb"),
      cabinetBrand,
      notes,
      lines,
    };

    try {
      const response = await fetch("/api/quote-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not send quote request.");

      form.reset();
      setItems([]);
      setEditingId(null);
      setNextId(1);
      setStatus({
        type: "success",
        message: [
          "Thanks. Your quote request has been sent and we will come back to you within 1-3 business days.",
          result.notice,
        ]
          .filter(Boolean)
          .join(" "),
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Could not send quote request." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.quoteFormTable} onSubmit={submitQuote}>
      <div className={styles.quoteTopStrip}>
        <div className={styles.quoteCard}>
          <span className={styles.sectionLabel}>Your details</span>
          <div className={styles.quoteFieldGrid}>
            <div className={styles.field}>
              <label htmlFor="firstName">First name</label>
              <input id="firstName" name="firstName" type="text" placeholder="Sarah" className={errors.firstName ? styles.fieldInputError : ""} />
              {errors.firstName ? <span className={styles.fieldError}>{errors.firstName}</span> : null}
            </div>
            <div className={styles.field}><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" type="text" placeholder="Jones" /></div>
          </div>
          <div className={styles.quoteFieldGrid}>
            <div className={styles.field}>
              <label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" type="tel" placeholder="0400 000 000" className={errors.phone ? styles.fieldInputError : ""} />
              {errors.phone ? <span className={styles.fieldError}>{errors.phone}</span> : null}
            </div>
            <div className={styles.field}>
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" placeholder="sarah@email.com" className={errors.email ? styles.fieldInputError : ""} />
              {errors.email ? <span className={styles.fieldError}>{errors.email}</span> : null}
            </div>
          </div>
          <div className={styles.quoteFieldGrid}>
            <div className={styles.field}><label htmlFor="suburb">Delivery suburb</label><input id="suburb" name="suburb" type="text" placeholder="e.g. Subiaco" /></div>
            <div className={styles.field}>
              <label htmlFor="cabinetBrand">Cabinet brand</label>
              <select className="pcdSelect" id="cabinetBrand" name="cabinetBrand" defaultValue="">
                <option value="" disabled>Select if relevant</option>
                {CABINET_BRANDS.map((brand) => <option key={brand}>{brand}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className={styles.quoteCard}>
          <span className={styles.sectionLabel}>Contact us directly</span>
          <div className={styles.quoteInfoRow}><span>Phone</span><strong><a href="tel:0437750990">0437 750 990</a></strong><small>Best for urgent enquiries</small></div>
          <div className={styles.quoteInfoRow}><span>Email</span><strong><a href="mailto:sales@perthcabinetdoors.com.au">sales@perthcabinetdoors.com.au</a></strong></div>
          <div className={styles.quoteInfoRow}><span>Response time</span><strong>Within 1-3 business days</strong></div>
        </div>

        <div className={styles.quoteCardDark}>
          <span className={styles.sectionLabel}>What happens next</span>
          {[
            "We review your request within 1-3 business days.",
            "We confirm all dimensions and specs before anything is made.",
            "You receive a clear itemised quote with no hidden costs.",
            "Once approved we confirm your lead time and keep you updated.",
          ].map((text) => (
            <div className={styles.promiseItem} key={text}><span className={styles.promiseDot}></span><span>{text}</span></div>
          ))}
        </div>
      </div>

      <span className={styles.sectionLabel}>Products</span>
      {restoring ? <p className={styles.importedNote}>Loading your saved list…</p> : null}
      {restoreError ? <p className={styles.importedError}>{restoreError}</p> : null}
      {importedCount ? (
        <p className={styles.importedNote}>
          {importedCount} {importedCount === 1 ? "line has" : "lines have"} come across from your list. Edit
          or remove any of them below, and add anything else you need.
        </p>
      ) : null}
      <div className={styles.productTableWrap}>
        <div className={styles.productTableBar}>
          <span>Line items - {savedCount} added</span>
          <button className={styles.productAddBtn} disabled={Boolean(editingId)} type="button" onClick={addItem}>Add product</button>
        </div>
        <div className={styles.productSummaryTable}>
          <div className={styles.productSummaryHead}>
            <div>Item</div><div>Material</div><div>Size</div><div>Finish / colour</div><div>Qty</div><div>Actions</div>
          </div>
          {visibleItems.length ? visibleItems.map((item, index) => (
            <div className={styles.productSummaryRow} key={item.id}>
              <div>
                <span className={styles.productRowNum}>{index + 1}</span>
                <strong>{item.type || "Product"}</strong>
                {lineErrors[item.id] ? (
                  <span className={styles.fieldError} style={{ display: "block" }}>Needs {describeGaps(lineErrors[item.id])}</span>
                ) : null}
              </div>
              <div>{materialText(item) || "-"}</div>
              <div>{sizeText(item) || "-"}</div>
              <div className={styles.colourRead}>{item.colourSrc ? <img alt="" src={item.colourSrc} /> : null}<span>{colourText(item) || "-"}</span></div>
              <div>{item.qty || "1"}</div>
              <div className={styles.productActions}>
                <button className={styles.editRowBtn} type="button" onClick={() => editItem(item.id)}>Edit</button>
                <button className={styles.deleteRowBtn} type="button" onClick={() => deleteItem(item.id)}>x</button>
              </div>
            </div>
          )) : (
            <div className={styles.productEmptyState}>
              <strong>No products added yet.</strong>
              <span>Add each door, drawer front, panel, or table top you would like quoted.</span>
            </div>
          )}
        </div>

        <div className={styles.productCardList}>
          {visibleItems.length ? visibleItems.map((item, index) => (
            <div className={styles.productLineCard} key={item.id}>
              <div className={styles.productLineCardHead}>
                <span className={styles.productRowNum}>{index + 1}</span>
                <div>
                  <strong>{itemTitle(item)}</strong>
                  <small>Qty {item.qty || "1"}</small>
                </div>
              </div>
              <div className={styles.productLineCardMeta}>
                <span>Finish</span><strong>{item.finish || "-"}</strong>
                <span>Colour</span><strong>{item.colour || "-"}</strong>
                <span>Edge</span><strong>{item.edgeMould || "-"}</strong>
                <span>Hinge holes</span><strong>{item.type === "Door" ? (item.preDrill ? item.hingeQty || "Drilled" : "No") : "N/A"}</strong>
              </div>
              <div className={styles.productActions}>
                <button className={styles.editRowBtn} type="button" onClick={() => editItem(item.id)}>Edit</button>
                <button className={styles.deleteRowBtn} type="button" onClick={() => deleteItem(item.id)}>Remove</button>
              </div>
            </div>
          )) : (
            <div className={styles.productEmptyState}>
              <strong>No products added yet.</strong>
              <span>Tap Add product to add your first line item.</span>
            </div>
          )}
        </div>
      </div>

      {editingItem ? (() => {
        // A line with no type yet has nothing to show on step two, so step one
        // stands whether or not the back link was used.
        const pickingType = pickingTypeState || !editingItem.type;
        const materialOptions = materialOptionsForSelection(editingItem.type, colourAvailability);
        // Supplier first. Until one is chosen there is nothing to offer, because
        // an unfiltered list is exactly how a Laminex colour ended up next to a
        // Polytec profile.
        const supplier = editingItem.supplierName || "";
        // Which questions this type gets asked at all. Everything below narrows
        // further once the material and the brand are known.
        const fields = fieldsForProductType(editingItem.type);
        const thicknessOptions = thicknessOptionsForSelection(
          editingItem.material,
          colourAvailability,
          supplierColourRows,
          supplier
        );
        const profileRows = asSelectionRows(profileLibrary.profiles);

        // Edges are a property of the RANGE, not of the board. Laminex makes
        // none, so the field is hidden rather than shown empty: an empty
        // dropdown reads as "we could not load it", where no field at all reads
        // as "this brand does not do edges", which is the truth.
        const edgeOptions = edgesForSupplier(profileRows, {
          supplier,
          material: editingItem.material,
        }).map((row) => ({ name: row.name, image: row.image_url || "" }));
        const showEdges =
          Boolean(supplier) &&
          profileLibrary.isReady &&
          supplierOffersEdges(profileRows, supplier) &&
          edgeProfilesForMaterial(editingItem.material).length > 0;
        // After a failed save, the specific fields that are short, from the
        // same rule that stopped the save. Marking the row without marking the
        // field leaves someone hunting for which one.
        const flagged = new Set(lineErrors[editingItem.id] ? missingFields(editingItem) : []);
        const flag = (field, base) => `${base}${flagged.has(field) ? ` ${styles.fieldInputError}` : ""}`;
        // The thickness rules run in OPPOSITE directions between the ranges, so
        // they are read off each library row rather than inferred from the brand:
        // thirteen Polytec profiles are 21mm only, every Laminex profile is 18mm
        // only.
        const profileTypes = profileCategoriesForSupplier(profileRows, {
          supplier,
          thickness: editingItem.thickness,
        });
        const profileNames = profilesForSupplier(profileRows, { supplier, thickness: editingItem.thickness })
          .filter((row) => !editingItem.profileType || row.category === editingItem.profileType)
          .map((row) => ({ name: row.name, image: row.image_url || "" }));
        const showProfiles =
          Boolean(supplier) && editingItem.material === "Thermolaminate" && profileTypes.length > 0;
        const hingesApplicable = editingItem.type === "Door";
        // The cups between the two ends. Shown only once there are two ends to
        // space between, so a door with three hinges and no measurements does
        // not sprout a row of empty boxes nobody has to fill in.
        const middleCupsReady =
          Number(editingItem.height) > 0 &&
          Number(editingItem.hingeFromBottomMm) > 0 &&
          Number(editingItem.hingeFromTopMm) > 0;
        const evenly = evenMiddles({
          height: editingItem.height,
          count: hingeCount(editingItem.hingeQty),
          fromBottom: editingItem.hingeFromBottomMm,
          fromTop: editingItem.hingeFromTopMm,
        });
        const middleCount = Math.max(0, hingeCount(editingItem.hingeQty) - 2);
        const middleCups = Array.from({ length: middleCount }, (unused, index) =>
          editingItem.hingeMiddlesTouched
            ? editingItem.hingeMiddlesMm[index] ?? ""
            : evenly[index] ?? ""
        );

        return (
          <div className={styles.productModalOverlay} role="dialog" aria-modal="true" aria-labelledby="product-line-modal-title" onMouseDown={() => cancelEdit(editingItem.id)}>
            <div className={styles.productModal} onMouseDown={(event) => event.stopPropagation()}>
              <div className={styles.productModalHeader}>
                <div>
                  <span className={styles.sectionLabel}>
                    {pickingType ? "Step 1 of 2" : `Step 2 of 2 - ${fields.label}`}
                  </span>
                  <h2 id="product-line-modal-title">
                    {pickingType
                      ? "What would you like?"
                      : `${editingItem.saved ? "Edit" : "Add"} ${String(fields.label).toLowerCase()}`}
                  </h2>
                </div>
                <button className={styles.productModalClose} type="button" aria-label="Close product editor" onClick={() => cancelEdit(editingItem.id)}>x</button>
              </div>

              {pickingType ? (
                <ProductTypeChooser
                  types={productTypeChoices(PRODUCT_TYPES)}
                  current={editingItem.type}
                  onChoose={(type) => chooseType(editingItem.id, type)}
                />
              ) : (
                <>
                  {/* A way back, because the type decides everything below it and
                      picking the wrong one otherwise means starting the line again. */}
                  <button type="button" className={styles.typeBackLink} onClick={() => setPickingType(true)}>
                    Not a {String(fields.label).toLowerCase()}? Choose something else
                  </button>

                  <div className={styles.productModalGrid}>
                    {/* HARDWARE IS A BOUGHT ITEM. No board, no size, no finish.
                        Asking it those anyway, and greying them out, is what left
                        this unfinishable: the material list was empty because
                        hardware has no material, and there was nothing else to
                        fill in. */}
                    {/* WHOSE CABINET. First, because it is the thing a customer
                        already knows before they know anything else, and because
                        it decides nothing below it so it is safe to answer or
                        skip. Defaults to whatever they told us for the job. */}
                    <div className={styles.productModalWide}>
                      <label>Which cabinet is this for?</label>
                      <select
                        className="pcdSelect"
                        value={editingItem.cabinetBrand}
                        onChange={(event) => updateItem(editingItem.id, { cabinetBrand: event.target.value })}
                      >
                        <option value="">Not applicable</option>
                        {cabinetBrandOptions(editingItem.cabinetBrand).map((brand) => (
                          <option key={brand}>{brand}</option>
                        ))}
                      </select>
                    </div>

                    {fields.hardware ? (
                      <div className={styles.productModalWide}>
                        <label>Which hardware?<Required /></label>
                        <HardwarePicker
                          item={editingItem}
                          invalid={flagged.has("hardware")}
                          onChange={(patch) => updateItem(editingItem.id, patch)}
                        />
                      </div>
                    ) : null}

                    {fields.board ? (
                      <>
                        <div className={styles.field}>
                          <label>Material<Required /></label>
                          <select className={flag("material", "pcdSelect")} value={editingItem.material} onChange={(event) => updateItem(editingItem.id, { material: event.target.value })}>
                            <option value="" disabled>Material</option>
                            {materialOptions.map((material) => <option key={material}>{material}</option>)}
                          </select>
                        </div>
                        <div className={styles.field}>
                          <label>Brand<Required /></label>
                          <SupplierSelect
                            item={editingItem}
                            profileRows={profileRows}
                            colourRows={supplierColourRows}
                            className={flag("supplierName", "pcdSelect")}
                            onChange={(patch) => updateItem(editingItem.id, patch)}
                          />
                        </div>
                        <div className={styles.field}>
                          <label>Thickness<Required /></label>
                          <select className={flag("thickness", "pcdSelect")} disabled={!editingItem.material || !supplier} value={editingItem.thickness} onChange={(event) => updateItem(editingItem.id, { thickness: event.target.value })}>
                            <option value="" disabled>
                              {!editingItem.material ? "Select material first" : !supplier ? "Choose a brand first" : "Thickness"}
                            </option>
                            {thicknessOptions.map((thickness) => <option key={thickness}>{thickness}</option>)}
                          </select>
                        </div>
                      </>
                    ) : null}

                    <div className={styles.field}>
                      <label>Quantity</label>
                      <input min="1" type="number" value={editingItem.qty} onChange={(event) => updateItem(editingItem.id, { qty: event.target.value })} />
                    </div>

                    {fields.size ? (
                      <>
                        {/* Height before width, the same way round as every other
                            screen and every cut list we print. */}
                        <div className={styles.field}>
                          <label>Height (mm)<Required /></label>
                          <input className={flag("height", "")} min="1" placeholder="700" type="number" value={editingItem.height} onChange={(event) => updateItem(editingItem.id, { height: event.target.value })} />
                        </div>
                        <div className={styles.field}>
                          <label>Width (mm)<Required /></label>
                          <input className={flag("width", "")} min="1" placeholder="400" type="number" value={editingItem.width} onChange={(event) => updateItem(editingItem.id, { width: event.target.value })} />
                        </div>
                      </>
                    ) : null}

                    {fields.board ? (
                      <div className={`${styles.field} ${styles.productModalColourField}`}>
                        <label>Finish / colour<Required /></label>
                        {supplier ? (
                          <ColourControls item={editingItem} onChange={(patch) => updateItem(editingItem.id, patch)} />
                        ) : (
                          <span className={styles.notApplicable}>Choose a brand first</span>
                        )}
                      </div>
                    ) : null}

                    {/* Edges belong to the RANGE, not the board, and Laminex makes
                        none. A brand that does not do them gets no field rather
                        than an empty one: an empty dropdown reads as "we could not
                        load it", where nothing at all reads as the truth. */}
                    {fields.edge && showEdges ? (
                      <div className={styles.field}>
                        <label>Edge profile</label>
                        <ImageSelect
                          value={editingItem.edgeMould}
                          placeholder="Select an edge"
                          options={edgeOptions.map((edge) => ({
                            value: edge.name,
                            label: edge.name,
                            image: edge.image || edgeImageSrc(edge.name),
                          }))}
                          onChange={(value) => updateItem(editingItem.id, { edgeMould: value })}
                        />
                      </div>
                    ) : null}

                    {fields.profile && showProfiles ? (
                      <>
                        <div className={styles.field}>
                          <label>Profile type</label>
                          <select className="pcdSelect" value={editingItem.profileType} onChange={(event) => updateItem(editingItem.id, { profileType: event.target.value, profile: "" })}>
                            <option value="">Select a profile type</option>
                            {profileTypes.map((type) => <option key={type}>{type}</option>)}
                          </select>
                        </div>
                        <div className={styles.field}>
                          <label>Profile name</label>
                          {editingItem.profileType ? (
                            <ImageSelect
                              value={editingItem.profile}
                              placeholder="Select a profile"
                              options={profileNames.map((profile) => ({
                                value: profile.name,
                                label: profile.name,
                                image: profile.image || profileImageSrc(editingItem.profileType, profile.name),
                              }))}
                              onChange={(value) => updateItem(editingItem.id, { profile: value })}
                            />
                          ) : <span className={styles.notApplicable}>Pick a profile type first</span>}
                        </div>
                      </>
                    ) : null}

                    {fields.hinges ? (
                      <>
                        <div className={styles.productModalChecks}>
                          <label className={styles.inlineCheck}>
                            <input checked={editingItem.preDrill} type="checkbox" onChange={(event) => updateItem(editingItem.id, { preDrill: event.target.checked, hingeQty: event.target.checked ? editingItem.hingeQty : "" })} />
                            {" "}Drill hinge holes
                          </label>
                        </div>
                        {editingItem.preDrill ? (
                          <>
                            <div className={styles.field}>
                              <label>Hinge quantity</label>
                              <select
                                className="pcdSelect"
                                value={editingItem.hingeQty}
                                onChange={(event) =>
                                  updateItem(editingItem.id, {
                                    hingeQty: event.target.value,
                                    // A different number of cups means the ones
                                    // in between move. Anything typed for the
                                    // old count is not an answer for the new one.
                                    hingeMiddlesMm: [],
                                    hingeMiddlesTouched: false,
                                  })
                                }
                              >
                                <option value="">Per door</option>
                                <option>2 hinges</option>
                                <option>3 hinges</option>
                                <option>4 hinges</option>
                              </select>
                            </div>

                            {/* HANDING. Left or right, and nothing else: a pair
                                is two doors drilled as mirror images, so it is
                                two lines. Said under the field, because getting
                                it wrong is what turns a pair into two identical
                                doors and nobody finds out until they are made. */}
                            <div className={styles.field}>
                              <label>Hinge side</label>
                              <select
                                className="pcdSelect"
                                value={editingItem.hingeSide}
                                onChange={(event) => updateItem(editingItem.id, { hingeSide: event.target.value })}
                              >
                                <option value="" disabled>Which side</option>
                                {HINGE_SIDES.map((side) => <option key={side}>{side}</option>)}
                              </select>
                              <small className={styles.fieldNote}>
                                Ordering a matched pair? Add it as two lines, one hinged left and one hinged right.
                              </small>
                            </div>

                            {/* THE POSITIONS. Both blank is the normal answer and
                                means we set them, so neither is required and the
                                placeholder says so rather than looking unfinished. */}
                            <div className={styles.field}>
                              <label>Bottom hinge (mm from bottom)</label>
                              <input
                                type="number"
                                min="1"
                                placeholder="Leave blank for our standard"
                                value={editingItem.hingeFromBottomMm}
                                onChange={(event) => updateItem(editingItem.id, { hingeFromBottomMm: event.target.value, hingeMiddlesTouched: false })}
                              />
                            </div>
                            <div className={styles.field}>
                              <label>Top hinge (mm from top)</label>
                              <input
                                type="number"
                                min="1"
                                placeholder="Leave blank for our standard"
                                value={editingItem.hingeFromTopMm}
                                onChange={(event) => updateItem(editingItem.id, { hingeFromTopMm: event.target.value, hingeMiddlesTouched: false })}
                              />
                            </div>

                            {middleCups.map((mm, index) => (
                              <div className={styles.field} key={"middle-" + index}>
                                <label>{index === 0 ? "2nd" : "3rd"} hinge (mm from bottom)</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={mm}
                                  disabled={!middleCupsReady}
                                  placeholder={middleCupsReady ? "" : "Fill in the two above first"}
                                  onChange={(event) => {
                                    const next = middleCups.slice();
                                    next[index] = event.target.value;
                                    updateItem(editingItem.id, { hingeMiddlesMm: next, hingeMiddlesTouched: true });
                                  }}
                                />
                              </div>
                            ))}

                            {middleCups.length ? (
                              <p className={styles.productModalWide} style={{ margin: 0, fontSize: 12, color: "#7a766c" }}>
                                {!middleCupsReady
                                  ? "Give us the bottom and the top and we will space the rest evenly."
                                  : editingItem.hingeMiddlesTouched
                                    ? "Set by hand, so these will not move when the others do."
                                    : "Spaced evenly between the bottom and the top. Type over one to set it yourself."}
                              </p>
                            ) : null}
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  {(() => {
                    // Shown from the moment the row is opened and updated as it is
                    // filled in, so pressing Save is never the first anyone hears
                    // of a missing field. Turns green when the line is complete.
                    const gaps = lineGaps(editingItem);
                    const drilling = hingeProblems({
                      hinge_holes: editingItem.type === "Door" && editingItem.preDrill,
                      hinge_qty: editingItem.hingeQty,
                      hinge_side: editingItem.hingeSide,
                      hinge_from_bottom_mm: editingItem.hingeFromBottomMm,
                      hinge_from_top_mm: editingItem.hingeFromTopMm,
                      height_mm: editingItem.height,
                    });
                    if (!gaps.length && drilling.length) {
                      return (
                        <p style={{ padding: "0 18px", margin: 0, fontSize: 12.5, color: "#7a766c" }}>
                          We can price this line. Before we make it we will need {describeGaps(drilling.map((message) => ({ message })))}.
                        </p>
                      );
                    }
                    if (!gaps.length) {
                      return (
                        <p style={{ padding: "0 18px", margin: 0, fontSize: 12.5, color: "#2d5e28" }}>
                          This line has everything we need to price it.
                        </p>
                      );
                    }
                    return (
                      <p
                        className={lineErrors[editingItem.id] ? styles.fieldError : undefined}
                        style={{ padding: "0 18px", margin: 0, fontSize: 12.5, color: lineErrors[editingItem.id] ? undefined : "#7a766c" }}
                      >
                        Still needs {describeGaps(gaps)} before we can price it.
                      </p>
                    );
                  })()}
                </>
              )}

              <div className={styles.productModalFooter}>
                <button className={styles.cancelRowBtn} type="button" onClick={() => cancelEdit(editingItem.id)}>Cancel</button>
                <button className={styles.saveRowBtn} type="button" onClick={() => saveItem(editingItem.id)}>Save product</button>
              </div>
            </div>
          </div>
        );
      })() : null}

      <div className={styles.quoteBottomStrip}>
        <div className={styles.quoteCard}>
          <span className={styles.sectionLabel}>Additional notes</span>
          <div className={styles.field}>
            <label htmlFor="notes">Anything else we should know?</label>
            <textarea id="notes" name="notes" placeholder="e.g. timing requirements, special requirements, or anything else that helps us give you an accurate quote" />
          </div>
        </div>
        <div className={styles.tipCard}>
          <span className={styles.sectionLabel}>Measuring tips</span>
          <p>Measure width then height in millimetres. For replacement doors, measure the door itself, not the opening.</p>
          <p>For drawer fronts, measure the existing front: width and height of each drawer.</p>
          <p>Not sure on overlay? Give us the opening size and we will advise.</p>
        </div>
      </div>

      <button className={styles.submitBtn} disabled={submitting} type="submit">{submitting ? "Sending..." : "Send Quote Request"}</button>
      <p className={styles.submitNote}>We will come back within 1-3 business days. For urgent enquiries call <a href="tel:0437750990">0437 750 990</a>.</p>
      {status ? <p className={`${styles.formStatus} ${status.type === "error" ? styles.formStatusError : ""}`}>{status.message}</p> : null}
    </form>
  );
}
