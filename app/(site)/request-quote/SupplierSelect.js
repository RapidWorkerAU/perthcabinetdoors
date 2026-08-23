"use client";

// WHOSE BOARD IS THIS?
//
// ── WHY IT COMES FIRST ───────────────────────────────────────────────────────
//
// A door is one brand's colour pressed onto that brand's profile. The ranges
// cannot be mixed, and Laminex makes no edge profiles at all. Every field below
// this one is narrowed by the answer, so it has to be answered first.
//
// The list is derived from the colours we actually stock, so a brand appears the
// moment its first colour is added and Formica needs no code change.
//
// ── WHY CHANGING IT WARNS ────────────────────────────────────────────────────
//
// Changing brand on a half-filled line invalidates whatever the other brand
// made. Clearing three boxes silently looks like the form losing the work; being
// told what is about to go, and choosing, does not.

import { useEffect, useMemo, useState } from "react";
import {
  fieldsClearedBySupplierChange,
  suppliersForMaterial,
} from "@/lib/pcd-supplier-selection";

export default function SupplierSelect({ item, profileRows = [], colourRows = [], className = "", onChange }) {
  const [pending, setPending] = useState(null);

  const suppliers = useMemo(
    () => suppliersForMaterial(colourRows, item?.material),
    [colourRows, item?.material]
  );

  // A brand that is on the line but no longer stocked still has to be shown, or
  // an older line would silently read as having no brand at all.
  const options = useMemo(() => {
    const current = String(item?.supplierName || "").trim();
    if (current && !suppliers.some((name) => name.toLowerCase() === current.toLowerCase())) {
      return [...suppliers, current];
    }
    return suppliers;
  }, [suppliers, item?.supplierName]);

  useEffect(() => {
    setPending(null);
  }, [item?.id]);

  // Does the new brand stock this material in the thickness already chosen?
  // The brand is picked before the thickness now, but a line can still arrive
  // here with one set, and leaving a thickness the new brand does not make
  // would empty the colour list with nothing on screen to say why.
  function keepsThickness(nextSupplier) {
    const thickness = String(item?.thickness || "").trim();
    if (!thickness) return true;
    const pair = (colourRows || []).find(
      (row) =>
        String(row.supplier_name || "").trim().toLowerCase() === String(nextSupplier).trim().toLowerCase() &&
        String(row.material_type || "").trim().toLowerCase() === String(item?.material || "").trim().toLowerCase()
    );
    // No thicknesses recorded means we cannot tell, and guessing would throw
    // away a choice that may well be fine.
    if (!pair?.thicknesses?.length) return true;
    return pair.thicknesses.some((entry) => String(entry).trim().toLowerCase() === thickness.toLowerCase());
  }

  function choose(next) {
    if (!next || next === item?.supplierName) {
      onChange({ supplierName: next || "" });
      return;
    }

    const losing = fieldsClearedBySupplierChange(
      {
        supplier_name: item?.supplierName,
        colour: item?.colour,
        profile: item?.profile,
        edge_mould: item?.edgeMould,
      },
      next,
      { colourRows, profileRows }
    );

    if (!losing.length && keepsThickness(next)) {
      onChange({ supplierName: next });
      return;
    }
    if (!losing.length) {
      onChange({ supplierName: next, thickness: "" });
      return;
    }
    setPending({ next, losing });
  }

  function confirm() {
    // Everything the new brand cannot make goes, including the identity of the
    // old board: keeping colourLibraryId would price the line off a board the
    // customer is no longer choosing.
    const patch = { supplierName: pending.next, colourLibraryId: "", colourSrc: "" };
    if (!keepsThickness(pending.next)) patch.thickness = "";
    pending.losing.forEach((entry) => {
      if (entry.field === "colour") {
        patch.colour = "";
        // The finish goes with it: a finish the new brand does not offer is not
        // in the narrowed list, so the colour box would open onto nothing.
        patch.finish = "";
      }
      if (entry.field === "profile") {
        patch.profile = "";
        patch.profileType = "";
      }
      if (entry.field === "edge_mould") patch.edgeMould = "";
    });
    setPending(null);
    onChange(patch);
  }

  return (
    <>
      <select
        className={className || "pcdSelect"}
        value={item?.supplierName || ""}
        disabled={!item?.material}
        onChange={(event) => choose(event.target.value)}
      >
        <option value="">{item?.material ? "Choose a brand" : "Pick a material first"}</option>
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      {pending ? (
        <div
          role="alertdialog"
          aria-label="Changing brand"
          style={{
            marginTop: 8,
            border: "1px solid #e8d68f",
            background: "#fffdf0",
            borderRadius: 6,
            padding: "10px 12px",
            fontSize: 13,
            lineHeight: 1.5,
            color: "#8a6d0b",
          }}
        >
          <p style={{ margin: 0 }}>
            <strong>{pending.next} does not make what you have chosen.</strong> Switching clears{" "}
            {pending.losing.map((entry, index) => (
              <span key={entry.field}>
                {index > 0 ? (index === pending.losing.length - 1 ? " and " : ", ") : ""}
                {entry.was}
              </span>
            ))}
            .
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="pcdBtnSecondary" onClick={() => setPending(null)}>
              Keep {item?.supplierName}
            </button>
            <button type="button" className="pcdBtnPrimary" onClick={confirm}>
              Switch to {pending.next}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
