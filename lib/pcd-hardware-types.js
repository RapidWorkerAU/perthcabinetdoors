// WHAT A PIECE OF HARDWARE IS.
//
// One definition. There were four: the hardware manager's dropdown, the quote
// editor's label map, the variation editor's identical label map, and the API
// route's allowlist of what may be saved. Four copies of the same nine words,
// which meant a tenth kind of hardware had to be added in four places or it
// would save and then display as the bare word "Hardware".
//
// The order form's hardware tab would have been the fifth, and a form that
// offered a type the API refuses is a form that loses a line on upload.

export const HARDWARE_TYPES = [
  { value: "handle", label: "Handle" },
  { value: "hinge", label: "Hinge" },
  { value: "drawer_runner", label: "Drawer runner" },
  { value: "push_to_open", label: "Push-to-Open" },
  { value: "cutlery_tray", label: "Cutlery Tray" },
  { value: "wardrobe_hanging_rail", label: "Wardrobe Hanging Rail" },
  { value: "slide_out_bin", label: "Slide Out Bin" },
  { value: "bi_fold_door", label: "Bi-fold Door" },
  { value: "cabinet_inserts", label: "Cabinet Inserts" },
];

/** The stored values, for anywhere that only needs to know what is allowed. */
export const HARDWARE_TYPE_VALUES = HARDWARE_TYPES.map((type) => type.value);

/**
 * A stored type in words.
 *
 * "Hardware" for anything unrecognised, which is what a row saved before its
 * type was retired reads as, rather than an empty cell.
 */
export function hardwareTypeLabel(value) {
  const found = HARDWARE_TYPES.find((type) => type.value === value);
  return found ? found.label : "Hardware";
}

/** A label back to the value behind it, or "" for one we do not offer. */
export function hardwareTypeFromLabel(label) {
  const wanted = String(label || "").trim().toLowerCase();
  if (!wanted) return "";
  const found = HARDWARE_TYPES.find((type) => type.label.toLowerCase() === wanted);
  return found ? found.value : "";
}
