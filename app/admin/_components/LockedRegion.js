"use client";

// IF IT CANNOT BE SAVED, IT MUST NOT BE TYPEABLE.
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// An accepted quote refused to save, correctly, and every field on it stayed
// fully editable. So a person could retype a line, change a colour, add an item,
// press Save, and only then be told none of it was allowed. The work is thrown
// away and the refusal arrives after the effort rather than before it.
//
// A banner saying "this cannot be edited" above fields that accept typing is
// not a control. It is a warning that the screen is lying.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// Wherever editing is not allowed, the fields go read only. Not disabled-looking
// and still typeable, and not typeable-then-rejected. Read only.
//
// ── HOW ──────────────────────────────────────────────────────────────────────
//
// A `fieldset` with the `disabled` attribute disables every native form control
// inside it, however deeply nested and however many are added later. That is the
// whole point of using it: a field somebody adds next year is covered without
// anyone remembering to cover it.
//
// `display: contents` keeps the fieldset out of the layout, so wrapping an
// existing region changes nothing about how it looks.
//
// The combobox triggers are `div`s with role="combobox", not native controls, so
// a fieldset cannot reach them. They are handled by the arbitrary variants
// below: pointer events off so they cannot open, and the same muted treatment
// the Dropdown gives its own disabled state, so a locked screen looks locked
// rather than looking normal and refusing to respond.

const LOCKED_COMBOBOX = [
  "[&_[role=combobox]]:pointer-events-none",
  "[&_[role=combobox]]:cursor-not-allowed",
  "[&_[role=combobox]]:border-[#edf4eb]",
  "[&_[role=combobox]]:bg-[#f5f8f4]",
  "[&_[role=combobox]]:text-[#8b8a81]",
  // Anything else that opens a picker or a drawer from a non-native element.
  "[&_[role=button]]:pointer-events-none",
].join(" ");

/**
 * @param locked    when true, nothing inside can be typed into or clicked
 * @param className extra classes on the wrapper, rarely needed
 */
export default function LockedRegion({ locked = false, className = "", children }) {
  return (
    <fieldset
      disabled={locked}
      // min-w-0 because a fieldset is a flex/grid item like any other and
      // without it a long line item table refuses to shrink.
      className={`contents min-w-0 ${locked ? LOCKED_COMBOBOX : ""} ${className}`.trim()}
    >
      {children}
    </fieldset>
  );
}
