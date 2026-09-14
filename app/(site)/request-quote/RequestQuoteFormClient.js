"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  edgeImageSrc as sharedEdgeImageSrc,
  profileImageSrc as sharedProfileImageSrc,
} from "../../../lib/pcd-profile-images";
import { asSelectionRows, useProfileLibrary } from "@/lib/use-profile-library";
import { fieldsForProductType } from "@/lib/pcd-product-fields";
import { asksFor, quoteItemTypes, stepsForLine } from "@/lib/pcd-quote-steps";
import DoorDrawing from "@/components/public/DoorDrawing";
import { materialsForProductType } from "@/lib/pcd-materials";
import { SHOP_ENABLED } from "@/lib/pcd-site-flags";
// THE ONE CONFIGURATOR. The questions the shop's product pages ask are these
// same components, so a colour, a size, an edge or a hinge is asked the same
// way whichever path somebody is on. See app/(site)/_builder.
import Tabs from "../_builder/Tabs";
import ColourTiles from "../_builder/ColourTiles";
import SizeFields from "../_builder/SizeFields";
import BandedEdgesField from "../_builder/BandedEdgesField";
import HingeFields from "../_builder/HingeFields";
import QtyStepper from "../_builder/QtyStepper";
import { cupsForDrawing } from "../_builder/builder-utils";
import SupplierSelect from "./SupplierSelect";
import {
  edgesForSupplier,
  profileCategoriesForSupplier,
  profilesForSupplier,
  supplierOffersEdges,
} from "@/lib/pcd-supplier-selection";
import { clearList as clearQuoteList, entriesToQuoteLines, readQuoteList } from "@/lib/pcd-quote-list";
import { readQuoteDraft, writeQuoteLines } from "@/lib/pcd-quote-draft";
// What goes to the endpoint lives in one module, because /request-quote/send
// is what actually sends it now. Two answers to "what do we send" would mean
// the one that got fixed was not the one that ran. The drawing reads the same
// module's hingeMiddlesFor (through cupsForDrawing), so it shows the cups in
// the same places we are going to bore them.
import { hasLineValue } from "@/lib/pcd-quote-request-payload";
import { describeGaps, lineGaps, missingFields } from "@/lib/pcd-quote-ready";
import { checkSize, sizeLimitFor, sizeLimitRange, sizeProblems } from "@/lib/pcd-size-limits";
// Handing and cup positions. Shared so the form, the quote editor, the order
// and the Excel sheet cannot come to different answers about the same door.
import { hingeCount, hingeProblems } from "@/lib/pcd-hinges";
import styles from "../contact/contact.module.css";
import {
  cabinetBrandOptions,
  edgeProfilesForMaterial,
  isEdgeProfileSelectionAvailable,
  MATERIAL_OPTIONS,
  MATERIALS_BY_TYPE,
  isProfileSelectionAvailable,
  materialKey,
  thicknessOptionsForMaterial,
} from "../../../lib/quote-form-data";

// The fields a line cannot be quoted without, marked on the label so it is
// clear before somebody fills the row in rather than after they try to save it.
// Which ones they are comes from lib/pcd-quote-ready.js, so the mark and the
// rule are the same list.
function Required() {
  return <abbr title="Needed before we can price this line" style={{ color: "#b42318", textDecoration: "none", marginLeft: 3 }}>*</abbr>;
}

// WHICH BLOCKS CARRY THE MARK.
//
// Each question is now a numbered block with its title where the field label
// used to be, so the mark moved to the title with it. These are the same fields
// lib/pcd-quote-ready.js will stop a line for; the rest are genuinely optional
// and marking them would be asking for work nobody has to do.
//
// Size covers a height AND a width, so one mark on the block stands for both.
const REQUIRED_STEPS = new Set(["hardwareType", "material", "supplier", "thickness", "colour", "size"]);

// Every number box on this page is in the shared components under
// app/(site)/_builder, and every one of them ignores the scroll wheel there.
// See ignoreWheel in builder-utils.js for the 75mm hinge it was written for.

function emptyItem(id) {
  return {
    id,
    type: "",
    // WHICH KIND OF PANEL. A scribe is a Panel that says it is a scribe, and
    // the quote line has held this for a while. The form never asked, so every
    // panel arrived on the bench as a plain Panel.
    panelUse: "",
    // WHICH EDGES GET TAPE. Null, not [], because nobody asked yet is not the
    // same as none of the four and only one of them is an instruction.
    bandedEdges: null,
    // A bare 35mm cup or a Blum Inserta boring. Two machine setups, and a door
    // bored for one will not take the other hinge.
    holeType: "",
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

function assetSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Where a profile photo lives. Asked of lib/pcd-profile-images.js for the same
// reason the edge photo below it is: this page had its own copy, and the copy
// did not know the files moved under profiles/polytec/ when the Laminex range
// arrived and needed a folder of its own. So every profile photo on this page
// was a broken tile, and the one under the drawing was a broken tile with the
// word "Hamilton profile" sitting in it.
function profileImageSrc(profileType, profileName) {
  return sharedProfileImageSrc(profileType, profileName) || "";
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
  // "Panel :: Scribe" is one answer that sets two fields. The card knows the
  // whole value; the caller splits it.
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

/**
 * The colour, as finish tabs then colour tiles, from this material, thickness
 * and brand. The same picker the shop's product pages use (ColourTiles), fed
 * from the colour library rather than from a list of its own.
 *
 * It was a finish dropdown and a search box, which made the quote form look
 * like a different website from the shop the moment somebody reached colour.
 */
function ColourControls({ item, onChange, invalid = false }) {
  const [colourFamily, setColourFamily] = useState(null);
  const supplier = String(item.supplierName || "").trim();
  const sameBrand = (value) => String(value || "").trim().toLowerCase() === supplier.toLowerCase();
  // Only this brand's colours, and only the finishes that still have one. A
  // finish with nothing left under it would open onto an empty grid, which
  // reads as broken rather than as a filter doing its job.
  const groups = (colourFamily?.groups || [])
    .map((group) => ({
      label: group.label,
      colours: (group.colours || [])
        .filter((colour) => !supplier || sameBrand(colour.supplier))
        .map((colour) => ({ ...colour, key: colour.id || `${group.label}-${colour.name}` })),
    }))
    .filter((group) => group.colours.length);
  // null while it has not been asked for or is still coming back; an object with
  // no groups once we know there is genuinely nothing in this thickness.
  const nothingStocked = Boolean(item.material && item.thickness && colourFamily && !groups.length);
  const chosenKey =
    groups
      .find((group) => group.label === item.finish)
      ?.colours.find((colour) => (item.colourLibraryId ? colour.id === item.colourLibraryId : colour.name === item.colour))?.key || "";

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

  if (!item.material || !item.thickness) return <span className={styles.notApplicable}>Select a thickness first</span>;
  if (!colourFamily) return <span className={styles.notApplicable}>Loading the colours...</span>;
  if (nothingStocked) {
    return (
      <p className={styles.fieldError} style={{ margin: 0 }}>
        {supplier
          ? `${supplier} has no ${String(item.material).toLowerCase()} colours in ${item.thickness}. Try another thickness, or another brand.`
          : `We do not stock a colour in ${item.material} ${item.thickness}. Please choose another thickness.`}
      </p>
    );
  }

  return (
    <ColourTiles
      groups={groups}
      finish={item.finish}
      colourKey={chosenKey}
      invalid={invalid}
      // The brand is NOT cleared on a change of finish. It is chosen first and
      // it is what narrowed this list; clearing it here would wipe an answer
      // two questions up and empty the grid.
      onFinish={(finish) => onChange({ finish, colour: "", colourSrc: "", colourLibraryId: "" })}
      onColour={(option, group) =>
        onChange({
          colour: option.name,
          finish: group.label,
          colourSrc: option.src,
          // Keep the identity of the board, not just its name. This is what
          // lets the quote be priced without anyone re-picking the colour.
          colourLibraryId: option.id || "",
          supplierName: supplier || option.supplier || "",
        })
      }
    />
  );
}

export default function RequestQuoteFormClient() {
  const [items, setItems] = useState(() => [emptyItem("item-1")]);
  const [editingId, setEditingId] = useState("item-1");
  // What each row is still missing, keyed by row id. Set when someone tries to
  // save a half-filled row or send the form, and cleared as they fix it.
  const [lineErrors, setLineErrors] = useState({});
  const [nextId, setNextId] = useState(2);
  const [colourAvailability, setColourAvailability] = useState(null);
  // Which brands stock which material, from the same request. The brand a
  // customer picks decides every option below it, so it has to know which
  // brands actually stock the material they chose.
  const [supplierColourRows, setSupplierColourRows] = useState([]);
  const [importedCount, setImportedCount] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState("");

  // The catalogue every line picks from. One fetch for the form, not one per
  // row, and it carries a status so an empty list can be told apart from a
  // failed read. See lib/use-profile-library.js.
  const profileLibrary = useProfileLibrary();

  const savedCount = items.filter((item) => item.saved).length;
  const editingItem = items.find((item) => item.id === editingId) || null;

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

    // WHAT THEY HAD LAST TIME, before anything is imported on top of it.
    //
    // The list, the review and the send pages are separate routes, so coming
    // back here to change a size is a fresh mount of this component with an
    // empty items array. Without this, walking to the list and pressing edit
    // would show them an empty builder and their line gone.
    //
    // Before the import, because an imported cabinet is NEW and belongs after
    // what is already on the list.
    const params = new URLSearchParams(window.location.search);
    const kept = readQuoteDraft().lines;
    if (kept.length) {
      setItems(kept.map((line) => ({ ...emptyItem(line.id), ...line, saved: true })));
      setNextId(kept.length + 1);
      // ?edit=ID is the Edit link on the list page. Without it the builder
      // opens on a blank row and somebody who pressed Edit on one particular
      // door has to find that door again, on a page that no longer lists it.
      const editing = params.get("edit");
      setEditingId(kept.some((line) => line.id === editing) ? editing : null);
    }

    // ?list=CODE means they saved the list on another device and followed the
    // link. That wins over whatever this browser happens to be holding.
    const code = params.get("list");
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
  }

  /**
   * Answer step one and move to step two.
   *
   * Changing the type takes the old type's answers with it. A door drilled for
   * hinges that becomes a table top must not still be drilled, and hardware
   * has no board at all, so keeping a colour on it would send a spec we cannot
   * act on. Only what the new type can still use survives.
   */
  function chooseType(id, value) {
    // "Panel :: Scribe" is ONE answer that sets TWO fields, the same way the
    // admin picker does it. Neither can be left stale: a door that used to be a
    // scribe must not still say scribe.
    const [type, panelUse = ""] = String(value).split(" :: ");
    setItems((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        if (row.type === type && row.panelUse === panelUse) return row;
        const next = fieldsForProductType(type);
        const keepsBoard = next.board && materialsForProductType(type).includes(row.material);
        return {
          ...row,
          type,
          panelUse,
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
          holeType: next.hinges ? row.holeType : "",
          // Only a taped board is asked which edges, and only a type with edges
          // at all. Null rather than [], so "not asked" stays distinguishable.
          bandedEdges: next.edge && keepsBoard ? row.bandedEdges : null,
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
  useEffect(() => {
    if (restoring) return;
    if (items.some((row) => !row.saved)) return;
    addItem();
    // addItem is stable enough for this: it only reads editingId, which is null
    // whenever this fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, restoring]);

  // ── HANDING THE LIST TO THE OTHER TWO PAGES ────────────────────────────────
  //
  // The list and the send page are separate routes reading lib/pcd-quote-draft,
  // so every saved line has to reach it. Only the saved ones: the half typed
  // row somebody is in the middle of is not on their list yet, and showing it
  // there as an item would be counting a question as an answer.
  //
  // THE TRAP THIS AVOIDS. On the first commit this component holds one blank
  // starter row, and the effect that restores the stored list has not run yet.
  // An unguarded mirror would fire in that gap and write an empty list over the
  // one on disk, so somebody who walked to the list page and pressed back would
  // find their request gone.
  //
  // The guard is the array itself rather than a flag, because a flag depends on
  // which effect happens to be declared first. The first run records the array
  // it was mounted with and writes nothing. Every run after that has a
  // different array, whether the restore put it there or the customer did, and
  // that is exactly when there is something worth keeping.
  const mountedItemsRef = useRef(null);
  useEffect(() => {
    if (mountedItemsRef.current === null) {
      mountedItemsRef.current = items;
      return;
    }
    if (items === mountedItemsRef.current) return;
    if (restoring) return;
    writeQuoteLines(items.filter((row) => row.saved).map(({ saved, ...line }) => line));
  }, [items, restoring]);

  function saveItem(id) {
    const item = items.find((candidate) => candidate.id === id);
    const gaps = lineGaps(item);
    if (gaps.length) {
      setLineErrors((current) => ({ ...current, [id]: gaps }));
      return;
    }
    // A SIZE WE CANNOT MAKE IS A DIFFERENT PROBLEM FROM A MISSING ONE: a line
    // can be complete and still be unmakeable. See lib/pcd-size-limits.js.
    //
    // No message is set here because one is already on screen. The sentence
    // above this button shows the size problem from the moment it is typed, so
    // storing a second copy to render somewhere else only risks the two of them
    // disagreeing.
    if (sizeProblems(item).length) return;
    setLineErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setItems((current) => current.map((row) => (row.id === id ? { ...row, saved: true } : row)));
    setEditingId(null);
  }

  function cancelEdit(id) {
    const item = items.find((candidate) => candidate.id === id);
    if (item && !item.saved && items.length > 1) {
      deleteItem(id);
    } else {
      setEditingId(null);
    }
  }

  return (
    <div className={styles.quoteFormTable}>
      {/* WHAT HAPPENED, AND WHERE THEIR LIST IS.
          Adding a line leaves somebody on the same page looking at a blank
          form, which reads as though nothing happened. This says it did.

          It used to be a table of everything on the request, sitting under the
          builder. That was the old page showing through: the list is a page of
          its own now, and two of them means the one somebody edits is not
          necessarily the one they are looking at. */}
      {restoring ? <p className={styles.importedNote}>Loading your saved list...</p> : null}
      {restoreError ? <p className={styles.importedError}>{restoreError}</p> : null}
      {importedCount ? (
        <p className={styles.importedNote}>
          {importedCount} {importedCount === 1 ? "line has" : "lines have"} come across from your list.
          They are on your quote list with everything else.
        </p>
      ) : null}
      {savedCount ? (
        <div className={styles.builderStrip}>
          <div>
            <strong>
              {savedCount} {savedCount === 1 ? "item is" : "items are"} on your list
            </strong>
            <span>Keep adding below, or go and send it. Nothing is priced or charged yet.</span>
          </div>
          <Link className={styles.builderStripBtn} href="/request-quote/list">
            See my list
          </Link>
        </div>
      ) : null}

      {editingItem ? (() => {
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

        // ── THE QUESTIONS, AND WHO DECIDES THEM ──────────────────────────────
        //
        // stepsForLine decides which questions this line is asked and in what
        // order. This page decides only how each one looks. Two of them are
        // dropped here on top of that, and only for a reason the rules cannot
        // see: whether the brand they picked has anything to offer. Laminex
        // makes no edges at all, and until a brand is chosen there are no
        // profiles to list. A step with an empty dropdown under it is a
        // question somebody tries to answer and cannot.
        const steps = editingItem.type
          ? stepsForLine({
              productType: editingItem.type,
              panelUse: editingItem.panelUse,
              material: editingItem.material,
              thickness: editingItem.thickness,
            }).filter((step) => {
              if (step.key === "frontProfile") return showProfiles;
              if (step.key === "edgeMould") return showEdges;
              return true;
            })
          : [{ key: "itemType", label: "What is it" }];

        const limit = sizeLimitFor(editingItem.material, editingItem.supplierName);
        const range = sizeLimitRange(limit);
        const outOfRange = checkSize(editingItem);

        function stepBody(key) {
          if (key === "itemType") {
            return (
              <ProductTypeChooser
                types={quoteItemTypes()}
                current={editingItem.panelUse ? `Panel :: ${editingItem.panelUse}` : editingItem.type}
                onChoose={(value) => chooseType(editingItem.id, value)}
              />
            );
          }

          if (key === "cabinetBrand") {
            return (
              <div className={styles.field}>
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
                <p className={styles.fieldHint}>
                  Only if it is going on a cabinet you have already bought. Skip it otherwise.
                </p>
              </div>
            );
          }

          if (key === "hardwareType") {
            return (
              <div className={styles.field}>
                <label>Which hardware?<Required /></label>
                <HardwarePicker
                  item={editingItem}
                  invalid={flagged.has("hardware")}
                  onChange={(patch) => updateItem(editingItem.id, patch)}
                />
              </div>
            );
          }

          if (key === "material") {
            return (
              <>
                <Tabs
                  options={materialOptions}
                  value={editingItem.material}
                  cols={materialOptions.length > 3 ? 3 : materialOptions.length}
                  invalid={flagged.has("material")}
                  onChoose={(value) => updateItem(editingItem.id, { material: value })}
                />
                {/* A rule worth saying out loud, because it is the one somebody
                    is most likely to be surprised by. */}
                {editingItem.type === "Table top" ? (
                  <p className={styles.fieldHint}>
                    No thermolaminate on a work surface. It is a vinyl skin pressed over a routed face,
                    made for a door, and it will not take the heat or the moisture.
                  </p>
                ) : null}
                {/* THE CROSSOVER, SAID AND NEVER MERGED. A flat decorative board
                    front can be bought outright with a live price, which is
                    quicker than waiting for us. Said here, where somebody has
                    just picked the one material the shop sells, and linked
                    across rather than added to this list. */}
                {SHOP_ENABLED &&
                editingItem.material === "Decorative Board" &&
                ["Door", "Drawer front", "Panel"].includes(editingItem.type) ? (
                  <div className={styles.shopNudge}>
                    <strong>You can buy this one now</strong>
                    <p>
                      Polytec decorative board doors, drawer fronts and panels are on our shop with a live
                      price on them. Quicker than waiting for us to come back to you.
                    </p>
                    <Link className={styles.shopNudgeBtn} href="/products">
                      Take me to the shop
                    </Link>
                  </div>
                ) : null}
              </>
            );
          }

          if (key === "supplier") {
            return (
              <div className={styles.field}>
                <SupplierSelect
                  item={editingItem}
                  profileRows={profileRows}
                  colourRows={supplierColourRows}
                  className={flag("supplierName", "pcdSelect")}
                  onChange={(patch) => updateItem(editingItem.id, patch)}
                />
              </div>
            );
          }

          if (key === "thickness") {
            // A field that is empty for a reason nobody can see is the failure
            // this whole chain is about, so the reason is the answer.
            if (!editingItem.material || !supplier || !thicknessOptions.length) {
              return (
                <p className={styles.notApplicable}>
                  {!editingItem.material ? "Choose a material first" : "Choose a brand first"}
                </p>
              );
            }
            return (
              <Tabs
                options={thicknessOptions}
                value={editingItem.thickness}
                cols={Math.min(4, thicknessOptions.length)}
                invalid={flagged.has("thickness")}
                onChoose={(value) => updateItem(editingItem.id, { thickness: value })}
              />
            );
          }

          if (key === "colour") {
            return (
              <div className={`${styles.field} ${styles.productModalColourField}`}>
                {supplier ? (
                  <ColourControls
                    item={editingItem}
                    invalid={flagged.has("colour")}
                    onChange={(patch) => updateItem(editingItem.id, patch)}
                  />
                ) : (
                  <span className={styles.notApplicable}>Choose a brand first</span>
                )}
              </div>
            );
          }

          if (key === "frontProfile") {
            return (
              <div className={styles.stepStack}>
                <div className={styles.stepWide}>
                  <span className={styles.fieldLabel}>Profile family</span>
                  <Tabs
                    options={profileTypes}
                    value={editingItem.profileType}
                    cols={Math.min(4, profileTypes.length)}
                    onChoose={(value) => updateItem(editingItem.id, { profileType: value, profile: "" })}
                  />
                </div>
                <div className={styles.stepWide}>
                  <span className={styles.fieldLabel}>
                    {editingItem.profileType ? `${editingItem.profileType} profiles` : "Profile"}
                  </span>
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
              </div>
            );
          }

          if (key === "edgeMould") {
            return (
              <div className={styles.field}>
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
            );
          }

          if (key === "size") {
            // WHAT WE CAN PRESS, SAID BEFORE IT IS TYPED. A board we have not
            // set limits for shows no range rather than a made up one. See
            // lib/pcd-size-limits.js.
            return (
              <SizeFields
                item={editingItem}
                limit={limit}
                range={range}
                errors={outOfRange}
                invalid={{ height: flagged.has("height"), width: flagged.has("width") }}
                required={<Required />}
                onChange={(patch) => updateItem(editingItem.id, patch)}
              />
            );
          }

          if (key === "bandedEdges") {
            return (
              <BandedEdgesField
                value={editingItem.bandedEdges}
                onChange={(bandedEdges) => updateItem(editingItem.id, { bandedEdges })}
              />
            );
          }

          if (key === "hinges") {
            return <HingeFields item={editingItem} onChange={(patch) => updateItem(editingItem.id, patch)} />;
          }

          if (key === "qty") {
            return (
              <QtyStepper
                value={editingItem.qty}
                hint="All the same size, colour and drilling. Add a different door as a second item."
                onChange={(qty) => updateItem(editingItem.id, { qty })}
              />
            );
          }

          if (key === "notes") {
            // PER LINE, not per request. The request already has a notes box at
            // the bottom, and a remark about ONE door was going in it with
            // nothing to say which door it meant. The field it writes to has
            // been carried to the endpoint all along; there was simply nowhere
            // on this page to type it.
            return (
              <div className={styles.field}>
                <textarea
                  rows={2}
                  value={editingItem.note}
                  placeholder="Anything about this item in particular"
                  onChange={(event) => updateItem(editingItem.id, { note: event.target.value })}
                />
              </div>
            );
          }

          return null;
        }

        // ── WHAT THEY HAVE SPECIFIED SO FAR ──────────────────────────────────
        //
        // Only what has been answered. A row reading "Colour: not chosen yet" is
        // a gap dressed up as a fact, and the sentence under the button is the
        // place that says what is still missing.
        const specRows = [
          ["Item", editingItem.panelUse ? `Panel, ${String(editingItem.panelUse).toLowerCase()}` : fields.label],
          fields.hardware ? ["Hardware", editingItem.hardwareName] : null,
          fields.board && editingItem.material ? ["Material", `${editingItem.thickness} ${editingItem.material}`.trim()] : null,
          fields.board ? ["Brand", editingItem.supplierName] : null,
          fields.board ? ["Colour", editingItem.colour] : null,
          editingItem.profile ? ["Front profile", [editingItem.profileType, editingItem.profile].filter(Boolean).join(", ")] : null,
          editingItem.edgeMould ? ["Edge profile", editingItem.edgeMould] : null,
          // Height before width, the same way round as the form above it.
          fields.size && editingItem.height && editingItem.width
            ? ["Size", `${editingItem.height} x ${editingItem.width} mm`]
            : null,
          asksFor({ productType: editingItem.type, material: editingItem.material }, "bandedEdges")
            ? [
                "Banded edges",
                Array.isArray(editingItem.bandedEdges)
                  ? editingItem.bandedEdges.length
                    ? editingItem.bandedEdges.join(", ")
                    : "None, all four raw"
                  : "All four",
              ]
            : null,
          fields.hinges && editingItem.preDrill
            ? ["Hinges", [editingItem.hingeQty, editingItem.hingeSide ? `hinged ${String(editingItem.hingeSide).toLowerCase()}` : ""].filter(Boolean).join(", ") || "Drilled"]
            : null,
          Number(editingItem.qty) > 1 ? ["Quantity", String(editingItem.qty)] : null,
          editingItem.cabinetBrand ? ["Going on", editingItem.cabinetBrand] : null,
        ].filter((row) => row && row[1]);

        // ── WHETHER IT CAN BE SENT ───────────────────────────────────────────
        //
        // Shown from the moment the line is opened and updated as it is filled
        // in, so pressing the button is never the first anyone hears of a
        // missing field.
        const readiness = (() => {
          const unmakeable = sizeProblems(editingItem);
          if (unmakeable.length) return unmakeable[0];
          const gaps = lineGaps(editingItem);
          const drilling = hingeProblems({
            hinge_holes: editingItem.type === "Door" && editingItem.preDrill,
            hinge_qty: editingItem.hingeQty,
            hinge_side: editingItem.hingeSide,
            hole_type: editingItem.holeType,
            hinge_from_bottom_mm: editingItem.hingeFromBottomMm,
            hinge_from_top_mm: editingItem.hingeFromTopMm,
            height_mm: editingItem.height,
          });
          if (!gaps.length && drilling.length) {
            return `We can price this line. Before we make it we will need ${describeGaps(drilling.map((message) => ({ message })))}.`;
          }
          if (!gaps.length) return "This line has everything we need to price it.";
          return `Still needs ${describeGaps(gaps)} before we can price it.`;
        })();

        return (
          <div className={styles.builder}>
            {/* THE DRAWING, sticky, so it stays beside the questions while the
                right hand column scrolls. Nothing to draw for hardware: it is
                picked off a shelf rather than cut to a size. */}
            <div className={styles.builderStage}>
              {fields.size ? (
                <DoorDrawing
                  styles={styles}
                  id={`line-${editingItem.id}`}
                  heightMm={editingItem.height}
                  widthMm={editingItem.width}
                  material={editingItem.material}
                  colourTile={editingItem.colourSrc}
                  colourName={editingItem.colour}
                  profile={editingItem.profile}
                  bandedEdges={editingItem.bandedEdges}
                  hingeHoles={fields.hinges && editingItem.preDrill}
                  hingeCount={hingeCount(editingItem.hingeQty)}
                  cupsMm={cupsForDrawing(editingItem)}
                  hingeSide={editingItem.hingeSide}
                  holeType={editingItem.holeType}
                  profileImage={profileImageSrc(editingItem.profileType, editingItem.profile)}
                />
              ) : (
                <div className={styles.builderNoDraw}>
                  <strong>Nothing to draw</strong>
                  <p>Hardware is picked off our range rather than cut to a size, so there is no piece to show you.</p>
                </div>
              )}
            </div>

            <div className={styles.builderPanel}>
              <div className={styles.builderHead}>
                <span className={styles.sectionLabel}>
                  {editingItem.saved ? "Editing an item" : `Item ${items.filter((row) => row.saved).length + 1}`}
                </span>
                <h2 id="product-line-modal-title">Tell us what you need</h2>
                <p className={styles.builderLede}>
                  One item at a time. Add as many as you like and we price the lot together.
                </p>
              </div>

              {/* ONE NUMBERED BLOCK PER QUESTION, IN THE ORDER THE RULES ASK IT.
                  The order and the membership are stepsForLine's, not this
                  page's: it is the same function the admin side narrows with,
                  so a compact laminate panel loses its edge step here for the
                  same reason and at the same moment it loses it there.

                  This page used to hold its own copy of the sequence, laid out
                  as one grid of every field with the ones that did not apply
                  turned off. That is how a thermolaminate front came to be
                  asked which of its edges to band, and it is why the questions
                  are no longer written down twice. */}
              <div className={styles.builderCard}>
                {steps.map((step, index) => (
                  <section
                    key={step.key}
                    className={index ? styles.stepRuled : undefined}
                  >
                    <div className={styles.stepHead}>
                      <span className={styles.stepNum}>{index + 1}</span>
                      <h3>{step.label}{REQUIRED_STEPS.has(step.key) ? <Required /> : null}</h3>
                    </div>
                    {stepBody(step.key)}
                  </section>
                ))}
              </div>

              {/* WHAT THEY HAVE SPECIFIED, AND WHERE THE PRICE WOULD BE.
                  The shop's product page puts a running total in this spot. So
                  does this, in the same card, in the same place, and the answer
                  is a sentence rather than a number. Leaving the block out
                  entirely would be quieter and worse: somebody who has used the
                  shop looks here for the money, and finding nothing reads as a
                  page that has not finished loading. */}
              {editingItem.type ? (
                <div className={styles.specCard}>
                  <div className={styles.specRows}>
                    <span className={styles.sectionLabel}>This item</span>
                    {specRows.map((row) => (
                      <div className={styles.specRow} key={row[0]}>
                        <span>{row[0]}</span>
                        <span>{row[1]}</span>
                      </div>
                    ))}
                  </div>

                  <div className={styles.specPrice}>
                    <div className={styles.specPriceHead}>
                      <span>Total inc GST</span>
                      <strong>Priced by hand</strong>
                    </div>
                    <p>
                      Nothing on a quote request carries a price. We work them out together and
                      email you, usually the same day.
                    </p>

                    {/* The one sentence that says whether this line can be sent,
                        kept against the button rather than floating above it,
                        because it is the answer to why the button is worded the
                        way it is. */}
                    {readiness ? <p className={styles.specReady}>{readiness}</p> : null}

                    <div className={styles.builderFooter}>
                      {editingItem.saved ? (
                        <button className={styles.cancelRowBtn} type="button" onClick={() => cancelEdit(editingItem.id)}>
                          Cancel
                        </button>
                      ) : null}
                      <button className={styles.saveRowBtn} type="button" onClick={() => saveItem(editingItem.id)}>
                        {editingItem.saved ? "Save changes" : "Add to my list"}
                      </button>
                    </div>
                    <p className={styles.specFoot}>Nothing is charged until you accept the quote</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        );
      })() : null}


    </div>
  );
}
