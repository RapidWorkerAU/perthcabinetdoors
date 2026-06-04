"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { optionsFromColourFamily } from "../../lib/pcd-colour-library";
import styles from "../contact/contact.module.css";
import {
  CABINET_BRANDS,
  EDGE_PROFILES,
  MATERIALS_BY_TYPE,
  PRODUCT_TYPES,
  PROFILE_NAMES_BY_TYPE,
  PROFILE_TYPES,
  colourOptionsForMaterial,
} from "./quote-form-data";

function emptyItem(id) {
  return {
    id,
    type: "",
    material: "",
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
  return Boolean(item.type || item.material || item.width || item.height || item.colour || item.edgeMould || item.profile);
}

function sizeText(item) {
  if (!item.width && !item.height) return "";
  return `${item.width || "-"} x ${item.height || "-"}`;
}

function ColourCombobox({ item, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(item.colour || "");
  const [menuStyle, setMenuStyle] = useState({});
  const [databaseOptions, setDatabaseOptions] = useState(null);
  const wrapRef = useRef(null);
  const fallbackOptions = useMemo(() => colourOptionsForMaterial(item.material), [item.material]);
  const options = databaseOptions?.length ? databaseOptions : fallbackOptions;
  const cleanedQuery = query.trim().toLowerCase();
  const visibleOptions =
    cleanedQuery.length >= 3
      ? options.filter((option) => option.label.toLowerCase().includes(cleanedQuery))
      : options;

  useEffect(() => {
    setQuery(item.colour || "");
  }, [item.colour, item.material]);

  useEffect(() => {
    let cancelled = false;

    async function loadDatabaseColours() {
      setDatabaseOptions(null);
      if (!item.material) return;

      try {
        const response = await fetch(`/api/colour-library?material=${encodeURIComponent(item.material)}`);
        const payload = await response.json();
        if (!cancelled && payload?.colourFamily?.groups?.length) {
          setDatabaseOptions(optionsFromColourFamily(payload.colourFamily));
        }
      } catch (error) {
        if (!cancelled) setDatabaseOptions(null);
      }
    }

    loadDatabaseColours();
    return () => {
      cancelled = true;
    };
  }, [item.material]);

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
      finish: option.finish,
      colourSrc: option.src,
    });
    setOpen(false);
  }

  return (
    <div className={styles.colourCombo} ref={wrapRef}>
      <input
        disabled={!item.material}
        placeholder={item.material ? "Colour" : "Select material first"}
        type="text"
        value={query}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setOpen(true);
          onChange({ colour: nextQuery, finish: "", colourSrc: "" });
        }}
        onFocus={() => item.material && setOpen(true)}
      />
      <button
        aria-label="Open colour options"
        className={styles.colourComboButton}
        disabled={!item.material}
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          if (item.material) setOpen((current) => !current);
        }}
      />
      {open && item.material ? (
        <div className={styles.colourMenu} style={menuStyle}>
          {visibleOptions.length ? (
            visibleOptions.map((option) => (
              <button className={styles.colourOption} key={`${option.finish}-${option.name}-${option.src}`} type="button" onMouseDown={() => choose(option)}>
                <img alt="" src={option.src} />
                <span>
                  <strong>{option.name}</strong>
                  <small>{option.finish}</small>
                </span>
              </button>
            ))
          ) : (
            <div className={styles.colourEmpty}>No colour match</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function RequestQuoteFormClient() {
  const [items, setItems] = useState([emptyItem("item-1")]);
  const [editingId, setEditingId] = useState("item-1");
  const [nextId, setNextId] = useState(2);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const savedCount = items.filter((item) => item.saved).length;

  function updateItem(id, patch) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };

        if (Object.prototype.hasOwnProperty.call(patch, "type")) {
          next.material = "";
          next.finish = "";
          next.colour = "";
          next.colourSrc = "";
          next.profileType = "";
          next.profile = "";
          if (patch.type !== "Door") {
            next.preDrill = false;
            next.hinges = false;
            next.hingeQty = "";
          }
        }

        if (Object.prototype.hasOwnProperty.call(patch, "material")) {
          next.finish = "";
          next.colour = "";
          next.colourSrc = "";
          if (patch.material !== "Thermolaminate") {
            next.profileType = "";
            next.profile = "";
          }
        }

        if (Object.prototype.hasOwnProperty.call(patch, "profileType")) {
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
      return next.length ? next : [emptyItem("item-1")];
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
    setSubmitting(true);
    setStatus(null);

    const formData = new FormData(event.currentTarget);
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

      event.currentTarget.reset();
      setItems([emptyItem("item-1")]);
      setEditingId("item-1");
      setNextId(2);
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
        <div className={styles.productTableScroller}>
          <div className={`${styles.productGrid} ${styles.productTableHead}`}>
            <div>#</div><div>Type</div><div>Material</div><div>W x H (mm)</div><div>Colour</div><div>Qty</div><div>Edge profile</div><div>Profile type</div><div>Profile name</div><div>Drill holes?</div><div>Hinge supply?</div><div>Hinge qty</div><div>Actions</div>
          </div>
          {items.map((item, index) => {
            const editing = editingId === item.id;
            const materialOptions = MATERIALS_BY_TYPE[item.type] || [];
            const showProfiles = item.material === "Thermolaminate" && item.type !== "Panel" && item.type !== "Table top";
            const profileNames = PROFILE_NAMES_BY_TYPE[item.profileType] || [];
            const hingesApplicable = item.type === "Door";

            return (
              <div className={`${styles.productGrid} ${styles.productRow} ${editing ? styles.productRowEditing : ""}`} key={item.id}>
                <div><span className={styles.productRowNum}>{index + 1}</span></div>
                {editing ? (
                  <>
                    <div className={styles.inlineField}>
                      <select value={item.type} onChange={(event) => updateItem(item.id, { type: event.target.value })}>
                        <option value="" disabled>Type</option>
                        {PRODUCT_TYPES.map((type) => <option key={type}>{type}</option>)}
                      </select>
                    </div>
                    <div className={styles.inlineField}>
                      <select disabled={!item.type} value={item.material} onChange={(event) => updateItem(item.id, { material: event.target.value })}>
                        <option value="" disabled>{item.type ? "Material" : "Select type first"}</option>
                        {materialOptions.map((material) => <option key={material}>{material}</option>)}
                      </select>
                    </div>
                    <div className={styles.inlineSize}>
                      <input min="1" placeholder="W" type="number" value={item.width} onChange={(event) => updateItem(item.id, { width: event.target.value })} />
                      <input min="1" placeholder="H" type="number" value={item.height} onChange={(event) => updateItem(item.id, { height: event.target.value })} />
                    </div>
                    <div className={styles.inlineField}>
                      <ColourCombobox item={item} onChange={(patch) => updateItem(item.id, patch)} />
                    </div>
                    <div className={styles.inlineField}><input min="1" type="number" value={item.qty} onChange={(event) => updateItem(item.id, { qty: event.target.value })} /></div>
                    <div className={styles.inlineField}>
                      <select value={item.edgeMould} onChange={(event) => updateItem(item.id, { edgeMould: event.target.value })}>
                        <option value="">Edge</option>
                        {EDGE_PROFILES.map((edge) => <option key={edge}>{edge}</option>)}
                      </select>
                    </div>
                    <div className={styles.inlineField}>
                      {showProfiles ? (
                        <select value={item.profileType} onChange={(event) => updateItem(item.id, { profileType: event.target.value })}>
                          <option value="">Profile type</option>
                          {PROFILE_TYPES.map((type) => <option key={type}>{type}</option>)}
                        </select>
                      ) : <span className={styles.notApplicable}>N/A</span>}
                    </div>
                    <div className={styles.inlineField}>
                      {showProfiles ? (
                        <select disabled={!item.profileType} value={item.profile} onChange={(event) => updateItem(item.id, { profile: event.target.value })}>
                          <option value="">Profile name</option>
                          {profileNames.map((profile) => <option key={profile}>{profile}</option>)}
                        </select>
                      ) : <span className={styles.notApplicable}>N/A</span>}
                    </div>
                    {hingesApplicable ? (
                      <label className={styles.inlineCheck}><input checked={item.preDrill} type="checkbox" onChange={(event) => updateItem(item.id, { preDrill: event.target.checked, hingeQty: event.target.checked || item.hinges ? item.hingeQty : "" })} /> Yes</label>
                    ) : <span className={styles.notApplicable}>N/A</span>}
                    <div className={styles.inlineHinges}>
                      {hingesApplicable ? (
                        <label className={styles.inlineCheck}><input checked={item.hinges} type="checkbox" onChange={(event) => updateItem(item.id, { hinges: event.target.checked, hingeQty: event.target.checked || item.preDrill ? item.hingeQty : "" })} /> Yes</label>
                      ) : <span className={styles.notApplicable}>N/A</span>}
                    </div>
                    <div className={styles.inlineField}>
                      {hingesApplicable && (item.hinges || item.preDrill) ? (
                        <select value={item.hingeQty} onChange={(event) => updateItem(item.id, { hingeQty: event.target.value })}>
                          <option value="">Per door</option>
                          <option>2 hinges</option>
                          <option>3 hinges</option>
                          <option>4 hinges</option>
                        </select>
                      ) : <span className={styles.notApplicable}>N/A</span>}
                    </div>
                    <div className={styles.productActions}>
                      <button className={styles.saveRowBtn} type="button" onClick={() => saveItem(item.id)}>Save</button>
                      <button className={styles.cancelRowBtn} type="button" onClick={() => cancelEdit(item.id)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>{item.type || <span className={styles.tableEmpty}>-</span>}</div>
                    <div className={styles.tableMuted}>{item.material || "-"}</div>
                    <div className={styles.tableMuted}>{sizeText(item) || "-"}</div>
                    <div className={styles.colourRead}>{item.colourSrc ? <img alt="" src={item.colourSrc} /> : null}<span>{item.colour || "-"}</span></div>
                    <div>{item.qty || "1"}</div>
                    <div className={styles.tableMuted}>{item.edgeMould || "-"}</div>
                    <div className={styles.tableMuted}>{item.profileType || "-"}</div>
                    <div className={styles.tableMuted}>{item.profile || "-"}</div>
                    <div className={styles.tableMuted}>{hingesApplicable ? item.preDrill ? "Yes" : "No" : "N/A"}</div>
                    <div className={styles.tableMuted}>{hingesApplicable ? item.hinges ? "Yes" : "No" : "N/A"}</div>
                    <div className={styles.tableMuted}>{hingesApplicable && (item.hinges || item.preDrill) ? item.hingeQty || "-" : "N/A"}</div>
                    <div className={styles.productActions}>
                      <button className={styles.editRowBtn} type="button" onClick={() => editItem(item.id)}>Edit</button>
                      <button className={styles.deleteRowBtn} type="button" onClick={() => deleteItem(item.id)}>x</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

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
