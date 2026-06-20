"use client";

import { useEffect, useState } from "react";
import {
  COLOUR_MATERIALS,
  thicknessOptionsForMaterial,
} from "../../../../lib/pcd-colour-library";
import styles from "../design.module.css";

/**
 * Controlled material/colour picker backed by the colour library.
 * Props: material, thickness, finish, colour (all strings)
 * onChange({ material, thickness, finish, colour, costPerSqmExGst })
 */
export default function MaterialColourPicker({
  label,
  material,
  thickness,
  finish,
  colour,
  onChange,
}) {
  const [colourFamily, setColourFamily] = useState(null);
  const [loading, setLoading]           = useState(false);

  const thicknessOptions = thicknessOptionsForMaterial(material || "");

  // Fetch colour family whenever material or thickness changes
  useEffect(() => {
    if (!material) { setColourFamily(null); return; }
    setLoading(true);
    const p = new URLSearchParams({ material });
    if (thickness) p.set("thickness", thickness);
    fetch(`/api/colour-library?${p}`)
      .then((r) => r.json())
      .then((d) => setColourFamily(d.colourFamily || null))
      .catch(() => setColourFamily(null))
      .finally(() => setLoading(false));
  }, [material, thickness]);

  const finishGroups  = colourFamily?.groups || [];
  const selectedGroup = finishGroups.find((g) => g.label === finish) || null;
  const colourItems   = selectedGroup?.colours || [];
  const selectedItem  = colourItems.find((c) => c.name === colour) || null;

  function emit(patch) { onChange(patch); }

  return (
    <div className={styles.pickerSection}>
      {label && <p className={styles.pickerLabel}>{label}</p>}

      {/* Material type */}
      <label className={styles.fieldLabel}>
        Material
        <select
          className={styles.fieldSelect}
          value={material || ""}
          onChange={(e) => emit({ material: e.target.value, thickness: "", finish: "", colour: "", costPerSqmExGst: 0 })}
        >
          <option value="">— Select material —</option>
          {COLOUR_MATERIALS.map((m) => (
            <option key={m.key} value={m.value}>{m.label}</option>
          ))}
        </select>
      </label>

      {/* Thickness */}
      {thicknessOptions.length > 0 && (
        <label className={styles.fieldLabel}>
          Thickness
          <select
            className={styles.fieldSelect}
            value={thickness || ""}
            onChange={(e) => emit({ material, thickness: e.target.value, finish: "", colour: "", costPerSqmExGst: 0 })}
          >
            <option value="">— Thickness —</option>
            {thicknessOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      )}

      {/* Finish group */}
      {loading && <p className={styles.pickerLoading}>Loading colours…</p>}
      {!loading && finishGroups.length > 0 && (
        <label className={styles.fieldLabel}>
          Finish
          <select
            className={styles.fieldSelect}
            value={finish || ""}
            onChange={(e) => emit({ material, thickness, finish: e.target.value, colour: "", costPerSqmExGst: 0 })}
          >
            <option value="">— Finish —</option>
            {finishGroups.map((g) => (
              <option key={g.label} value={g.label}>{g.label}</option>
            ))}
          </select>
        </label>
      )}

      {/* Colour */}
      {selectedGroup && (
        <label className={styles.fieldLabel}>
          Colour
          <select
            className={styles.fieldSelect}
            value={colour || ""}
            onChange={(e) => {
              const c = colourItems.find((x) => x.name === e.target.value);
              emit({ material, thickness, finish, colour: e.target.value, costPerSqmExGst: c?.costPerSqmExGst || 0 });
            }}
          >
            <option value="">— Colour —</option>
            {colourItems.map((c) => (
              <option key={c.id || c.name} value={c.name}>
                {c.name}{c.costPerSqmExGst ? ` · $${c.costPerSqmExGst.toFixed(2)}/sqm` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Cost display */}
      {selectedItem?.costPerSqmExGst > 0 && (
        <p className={styles.pickerCost}>
          ${selectedItem.costPerSqmExGst.toFixed(2)} / sqm ex GST
          {selectedItem.supplier ? ` · ${selectedItem.supplier}` : ""}
        </p>
      )}
    </div>
  );
}
