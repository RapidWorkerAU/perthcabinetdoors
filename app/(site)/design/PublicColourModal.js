"use client";

// Thin wrapper over the shared ColourPickerModal in public mode. Kept so the
// planner's call sites don't need to change.

import ColourPickerModal from "../../../components/ColourPickerModal";

export default function PublicColourModal({ surfaceLabel, value, onPick, onClose, wantThicknessMm = 0 }) {
  // wantThicknessMm is the board the part actually needs. The customer never
  // sees it — it only decides which real library row a colour tile stands for,
  // so the piece they choose can be priced.
  return (
    <ColourPickerModal
      mode="public"
      title={surfaceLabel}
      value={value}
      onPick={onPick}
      onClose={onClose}
      wantThicknessMm={wantThicknessMm}
    />
  );
}
