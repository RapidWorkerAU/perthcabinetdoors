-- Rangehood cabinet support — a wall cabinet with a boxed-out recess at the
-- bottom to house the rangehood unit itself, and a boxed vertical channel
-- above it (running full cabinet depth) to house the flue/ducting. Shelves
-- either side of the channel are cut as a matching pair, not a single board.
ALTER TABLE pcd_design_items
  ADD COLUMN IF NOT EXISTS has_rangehood boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rangehood_housing_height_mm integer,
  ADD COLUMN IF NOT EXISTS rangehood_channel_width_mm integer;
