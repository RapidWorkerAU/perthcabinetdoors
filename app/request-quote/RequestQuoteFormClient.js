"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "../contact/contact.module.css";
import {
  CABINET_BRANDS,
  edgeProfilesForMaterial,
  isEdgeProfileSelectionAvailable,
  MATERIAL_OPTIONS,
  MATERIALS_BY_TYPE,
  PRODUCT_TYPES,
  isProfileSelectionAvailable,
  profileNamesForSelection,
  profileTypesForSelection,
  thicknessOptionsForMaterial,
} from "./quote-form-data";

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
    edgeMould: "",
    profileType: "",
    profile: "",
    preDrill: false,
    hinges: false,
    hingeQty: "",
    saved: false,
  };
}

function value(formData, key) {
  return String(formData.get(key) || "").trim();
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
  return `${item.width || "-"} x ${item.height || "-"}`;
}

function materialText(item) {
  return [item.material, item.thickness].filter(Boolean).join(" / ");
}

function colourText(item) {
  return [item.finish, item.colour].filter(Boolean).join(" - ");
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

function edgeImageSrc(edgeName) {
  return edgeName ? `/images/edges/${assetSlug(edgeName)}.png` : "";
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

function ColourControls({ item, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(item.colour || "");
  const [menuStyle, setMenuStyle] = useState({});
  const [colourFamily, setColourFamily] = useState(null);
  const wrapRef = useRef(null);
  const finishGroups = colourFamily?.groups || [];
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
    });
    setOpen(false);
  }

  function chooseFinish(finish) {
    setQuery("");
    setOpen(false);
    onChange({ finish, colour: "", colourSrc: "" });
  }

  return (
    <>
      <div className={styles.inlineField}>
        <select
          disabled={!item.material || !item.thickness || !finishGroups.length}
          value={item.finish}
          onChange={(event) => chooseFinish(event.target.value)}
        >
          <option value="">{item.material && item.thickness ? "Finish" : "Select thickness first"}</option>
          {finishGroups.map((group) => (
            <option key={group.label} value={group.label}>
              {group.label}
            </option>
          ))}
        </select>
      </div>
      <div className={`${styles.inlineField} ${styles.colourCombo}`} ref={wrapRef}>
        <input
          disabled={!item.material || !item.thickness || !item.finish}
          placeholder={item.finish ? "Colour" : "Select finish first"}
          type="text"
          value={query}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setOpen(true);
            onChange({ colour: nextQuery, colourSrc: "" });
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
                    <small>{item.finish}</small>
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
  const [nextId, setNextId] = useState(1);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const savedCount = items.filter((item) => item.saved).length;
  const editingItem = items.find((item) => item.id === editingId) || null;
  const visibleItems = items.filter((item) => item.saved || hasLineValue(item));

  function updateItem(id, patch) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };

        if (Object.prototype.hasOwnProperty.call(patch, "type")) {
          if (patch.type !== "Door") {
            next.preDrill = false;
            next.hinges = false;
            next.hingeQty = "";
          }
        }

        if (Object.prototype.hasOwnProperty.call(patch, "material")) {
          next.thickness = "";
          next.finish = "";
          next.colour = "";
          next.colourSrc = "";
          if (!isEdgeProfileSelectionAvailable(next.edgeMould, next.material)) {
            next.edgeMould = "";
          }
          if (patch.material !== "Thermolaminate") {
            next.profileType = "";
            next.profile = "";
          }
        }

        if (Object.prototype.hasOwnProperty.call(patch, "thickness")) {
          next.finish = "";
          next.colour = "";
          next.colourSrc = "";
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

  function deleteItem(id) {
    setItems((current) => {
      const next = current.filter((item) => item.id !== id);
      return next;
    });
    if (editingId === id) setEditingId(null);
  }

  function saveItem(id) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, saved: true } : item)));
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

  function editItem(id) {
    if (editingId) {
      setStatus({ type: "error", message: "Please save or cancel the current line item before editing another." });
      return;
    }
    setStatus(null);
    setEditingId(id);
  }

  async function submitQuote(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    setStatus(null);

    const formData = new FormData(form);
    const firstName = value(formData, "firstName");
    const lastName = value(formData, "lastName");
    const name = [firstName, lastName].filter(Boolean).join(" ");
    const notes = value(formData, "notes");
    const cabinetBrand = value(formData, "cabinetBrand");
    const quoteRows = items.filter(hasLineValue);

    const lines = quoteRows.map((item) => ({
      productType: item.type,
      productName: item.type || "Cabinetry item",
      material: item.material,
      thickness: item.thickness,
      finish: item.finish || item.material,
      colour: item.finish && item.colour ? `${item.finish} - ${item.colour}` : item.colour,
      profileType: item.profileType,
      profile: item.profile || item.type,
      edgeMould: item.edgeMould,
      width: numberOrUndefined(item.width),
      height: numberOrUndefined(item.height),
      qty: numberOrUndefined(item.qty) || 1,
      hingeHoles: item.type === "Door" && item.preDrill,
      hingeSupply: item.type === "Door" && item.hinges,
      hingeQty: item.type === "Door" && (item.hinges || item.preDrill) ? item.hingeQty : "",
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
      setStatus({ type: "success", message: "Thanks. Your quote request has been sent and we will come back to you within 1-3 business days." });
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
            <div className={styles.field}><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" type="text" placeholder="Sarah" /></div>
            <div className={styles.field}><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" type="text" placeholder="Jones" /></div>
          </div>
          <div className={styles.quoteFieldGrid}>
            <div className={styles.field}><label htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" placeholder="0400 000 000" /></div>
            <div className={styles.field}><label htmlFor="email">Email</label><input id="email" name="email" type="email" placeholder="sarah@email.com" /></div>
          </div>
          <div className={styles.quoteFieldGrid}>
            <div className={styles.field}><label htmlFor="suburb">Delivery suburb</label><input id="suburb" name="suburb" type="text" placeholder="e.g. Subiaco" /></div>
            <div className={styles.field}>
              <label htmlFor="cabinetBrand">Cabinet brand</label>
              <select id="cabinetBrand" name="cabinetBrand" defaultValue="">
                <option value="" disabled>Select if relevant</option>
                {CABINET_BRANDS.map((brand) => <option key={brand}>{brand}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className={styles.quoteCard}>
          <span className={styles.sectionLabel}>Contact us directly</span>
          <div className={styles.quoteInfoRow}><span>Phone</span><strong><a href="tel:0408906784">0408 906 784</a></strong><small>Best for urgent enquiries</small></div>
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
                <span>Hinges</span><strong>{item.type === "Door" ? item.hinges ? "Supply" : item.preDrill ? "Drill only" : "No" : "N/A"}</strong>
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
        const materialOptions = MATERIALS_BY_TYPE[editingItem.type] || MATERIAL_OPTIONS;
        const thicknessOptions = thicknessOptionsForMaterial(editingItem.material);
        const edgeOptions = edgeProfilesForMaterial(editingItem.material);
        const showEdges = edgeOptions.length > 0;
        const showProfiles = editingItem.material === "Thermolaminate";
        const profileTypes = profileTypesForSelection(editingItem.material, editingItem.thickness);
        const profileNames = profileNamesForSelection(editingItem.profileType, editingItem.material, editingItem.thickness);
        const hingesApplicable = editingItem.type === "Door";

        return (
          <div className={styles.productModalOverlay} role="dialog" aria-modal="true" aria-labelledby="product-line-modal-title" onMouseDown={() => cancelEdit(editingItem.id)}>
            <div className={styles.productModal} onMouseDown={(event) => event.stopPropagation()}>
              <div className={styles.productModalHeader}>
                <div>
                  <span className={styles.sectionLabel}>Product line</span>
                  <h2 id="product-line-modal-title">{editingItem.saved ? "Edit product" : "Add product"}</h2>
                </div>
                <button className={styles.productModalClose} type="button" aria-label="Close product editor" onClick={() => cancelEdit(editingItem.id)}>x</button>
              </div>

              <div className={styles.productModalGrid}>
                <div className={styles.field}>
                  <label>Type</label>
                  <select value={editingItem.type} onChange={(event) => updateItem(editingItem.id, { type: event.target.value })}>
                    <option value="" disabled>Type</option>
                    {PRODUCT_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Material</label>
                  <select value={editingItem.material} onChange={(event) => updateItem(editingItem.id, { material: event.target.value })}>
                    <option value="" disabled>Material</option>
                    {materialOptions.map((material) => <option key={material}>{material}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Thickness</label>
                  <select disabled={!editingItem.material} value={editingItem.thickness} onChange={(event) => updateItem(editingItem.id, { thickness: event.target.value })}>
                    <option value="" disabled>{editingItem.material ? "Thickness" : "Select material first"}</option>
                    {thicknessOptions.map((thickness) => <option key={thickness}>{thickness}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Quantity</label>
                  <input min="1" type="number" value={editingItem.qty} onChange={(event) => updateItem(editingItem.id, { qty: event.target.value })} />
                </div>
                <div className={styles.field}>
                  <label>Width (mm)</label>
                  <input min="1" placeholder="400" type="number" value={editingItem.width} onChange={(event) => updateItem(editingItem.id, { width: event.target.value })} />
                </div>
                <div className={styles.field}>
                  <label>Height (mm)</label>
                  <input min="1" placeholder="700" type="number" value={editingItem.height} onChange={(event) => updateItem(editingItem.id, { height: event.target.value })} />
                </div>
                <div className={`${styles.field} ${styles.productModalColourField}`}>
                  <label>Finish / colour</label>
                  <ColourControls item={editingItem} onChange={(patch) => updateItem(editingItem.id, patch)} />
                </div>
                <div className={styles.field}>
                  <label>Edge profile</label>
                  {showEdges ? (
                    <ImageSelect
                      placeholder="Edge"
                      value={editingItem.edgeMould}
                      options={edgeOptions.map((edge) => ({
                        value: edge,
                        label: edge,
                        image: edgeImageSrc(edge),
                      }))}
                      onChange={(value) => updateItem(editingItem.id, { edgeMould: value })}
                    />
                  ) : <span className={styles.notApplicable}>N/A</span>}
                </div>
                <div className={styles.field}>
                  <label>Profile type</label>
                  {showProfiles ? (
                    <select value={editingItem.profileType} onChange={(event) => updateItem(editingItem.id, { profileType: event.target.value })}>
                      <option value="">Profile type</option>
                      {profileTypes.map((type) => <option key={type}>{type}</option>)}
                    </select>
                  ) : <span className={styles.notApplicable}>N/A</span>}
                </div>
                <div className={styles.field}>
                  <label>Profile name</label>
                  {showProfiles ? (
                    <ImageSelect
                      disabled={!editingItem.profileType}
                      placeholder="Profile name"
                      value={editingItem.profile}
                      options={profileNames.map((profile) => ({
                        value: profile,
                        label: profile,
                        image: profileImageSrc(editingItem.profileType, profile),
                      }))}
                      onChange={(value) => updateItem(editingItem.id, { profile: value })}
                    />
                  ) : <span className={styles.notApplicable}>N/A</span>}
                </div>
                <div className={styles.productModalChecks}>
                  {hingesApplicable ? (
                    <>
                      <label className={styles.inlineCheck}><input checked={editingItem.preDrill} type="checkbox" onChange={(event) => updateItem(editingItem.id, { preDrill: event.target.checked, hingeQty: event.target.checked || editingItem.hinges ? editingItem.hingeQty : "" })} /> Drill hinge holes</label>
                      <label className={styles.inlineCheck}><input checked={editingItem.hinges} type="checkbox" onChange={(event) => updateItem(editingItem.id, { hinges: event.target.checked, hingeQty: event.target.checked || editingItem.preDrill ? editingItem.hingeQty : "" })} /> Supply hinges</label>
                    </>
                  ) : <span className={styles.notApplicable}>Hinge options only apply to doors.</span>}
                </div>
                <div className={styles.field}>
                  <label>Hinge quantity</label>
                  {hingesApplicable && (editingItem.hinges || editingItem.preDrill) ? (
                    <select value={editingItem.hingeQty} onChange={(event) => updateItem(editingItem.id, { hingeQty: event.target.value })}>
                      <option value="">Per door</option>
                      <option>2 hinges</option>
                      <option>3 hinges</option>
                      <option>4 hinges</option>
                    </select>
                  ) : <span className={styles.notApplicable}>N/A</span>}
                </div>
              </div>

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
      <p className={styles.submitNote}>We will come back within 1-3 business days. For urgent enquiries call <a href="tel:0408906784">0408 906 784</a>.</p>
      {status ? <p className={`${styles.formStatus} ${status.type === "error" ? styles.formStatusError : ""}`}>{status.message}</p> : null}
    </form>
  );
}
