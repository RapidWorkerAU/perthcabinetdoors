// Freestanding appliance footprints — the default size and mount height for
// each kind, applied when an appliance is added or its kind is switched, since
// a fridge, a dishwasher and a wall rangehood are wildly different objects.
//
// Lives in lib/ (framework-free) because BOTH design tools need it: the admin
// picker offers every kind, the public planner offers only the fridge. Keeping
// one copy means a size correction reaches both rather than drifting.

export const APPLIANCE_KIND_DEFAULTS = {
  fridge:          { width_mm: 700, height_mm: 1750, depth_mm: 700, mount_height_mm: 0 },
  freezer:         { width_mm: 700, height_mm: 1750, depth_mm: 700, mount_height_mm: 0 },
  dishwasher:      { width_mm: 600, height_mm: 850,  depth_mm: 600, mount_height_mm: 0 },
  rangehood:       { width_mm: 900, height_mm: 400,  depth_mm: 500, mount_height_mm: 1500 },
  washing_machine: { width_mm: 600, height_mm: 850,  depth_mm: 600, mount_height_mm: 0 },
  oven:            { width_mm: 600, height_mm: 600,  depth_mm: 560, mount_height_mm: 0 },
  cooktop:         { width_mm: 600, height_mm: 60,   depth_mm: 520, mount_height_mm: 900 },
  microwave:       { width_mm: 500, height_mm: 300,  depth_mm: 400, mount_height_mm: 1400 },
  other:           { width_mm: 600, height_mm: 850,  depth_mm: 600, mount_height_mm: 0 },
};

export function applianceKindDefaults(kind) {
  return APPLIANCE_KIND_DEFAULTS[kind] || APPLIANCE_KIND_DEFAULTS.other;
}
