"use client";

import { useEffect, useRef, useState } from "react";
import { DESIGN_NAME_MAX, DESIGN_NAME_PLACEHOLDER, isUsableDesignName } from "../../../lib/pcd-design-name";

// NAMING A DESIGN. One field, used in two places.
//
// ── THE PLACEHOLDER GOES WHEN YOU CLICK IN ───────────────────────────────────
//
// A plain HTML placeholder sits there until the first keystroke, which means it
// is still on screen while the cursor is blinking in front of it, and people
// read that as text they have to delete. This one clears on focus and comes
// back on blur if nothing was typed, so the field is empty the moment it is
// yours and still tells you what it wants when it is not.
//
// ── AND NOTHING IS PRE-FILLED ────────────────────────────────────────────────
//
// The field starts empty on purpose. A suggested name in the box would be
// accepted by most people without reading it, and every design would end up
// sharing one name again, which is the whole thing this was built to fix.

const FIELD = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #d8d3c6",
  backgroundColor: "#fff",
  font: "inherit",
  fontSize: 16,        // 16px or iOS zooms the whole page in on focus
  color: "#2a2925",
  outline: "none",
};

export default function DesignNameField({
  value,
  onChange,
  onSubmit,
  autoFocus = false,
  disabled = false,
  id = "design-name",
  label = "What should we call this design?",
  hint,
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const tooLong = value.length >= DESIGN_NAME_MAX;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <label htmlFor={id} style={{ fontSize: 13.5, fontWeight: 600, color: "#2a2925" }}>
        {label}
      </label>

      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        maxLength={DESIGN_NAME_MAX}
        autoComplete="off"
        // The whole point of the two handlers: gone on click, back if you leave
        // it empty. Never a value, only ever a placeholder.
        placeholder={focused ? "" : DESIGN_NAME_PLACEHOLDER}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onSubmit && isUsableDesignName(value)) {
            event.preventDefault();
            onSubmit();
          }
        }}
        style={{
          ...FIELD,
          borderColor: focused ? "#1f6f4a" : FIELD.border.split(" ").pop(),
          boxShadow: focused ? "0 0 0 3px rgba(31,111,74,0.12)" : "none",
          opacity: disabled ? 0.6 : 1,
        }}
      />

      {hint && (
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "#7a766c" }}>{hint}</p>
      )}

      {/* Only once it matters. A counter under an empty field is clutter; one
          under a field that has stopped accepting letters is an explanation. */}
      {tooLong && (
        <p style={{ margin: 0, fontSize: 12, color: "#7a766c" }}>
          That is as long as a name can be. {DESIGN_NAME_MAX} characters.
        </p>
      )}
    </div>
  );
}
