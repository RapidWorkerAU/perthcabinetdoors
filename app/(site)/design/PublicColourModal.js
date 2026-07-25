"use client";

// Thin wrapper over the shared ColourPickerModal in public mode. Kept so the
// planner's call sites don't need to change.

import ColourPickerModal from "../../../components/ColourPickerModal";

export default function PublicColourModal({ surfaceLabel, value, onPick, onClose }) {
  return <ColourPickerModal mode="public" title={surfaceLabel} value={value} onPick={onPick} onClose={onClose} />;
}
