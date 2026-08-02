export const FRONT_PROFILE_PRESETS = [
  { value: "slab", label: "Slab" },
  { value: "shaker", label: "Shaker" },
  { value: "bevel", label: "Bevel" },
];

export function normaliseFrontProfile(value) {
  const key = String(value || "").trim();
  return FRONT_PROFILE_PRESETS.some((profile) => profile.value === key) ? key : "slab";
}

export function frontProfileLabel(value) {
  return FRONT_PROFILE_PRESETS.find((profile) => profile.value === normaliseFrontProfile(value))?.label || "Slab";
}
