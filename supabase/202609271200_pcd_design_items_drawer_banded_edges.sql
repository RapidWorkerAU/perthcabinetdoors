-- THE DRAWER FRONTS' OWN BANDED EDGES.
--
-- A cabinet's doors and drawer fronts shared one banded_edges setting. They are
-- regularly taped differently, so the drawer fronts now have their own.
--
--   drawer_banded_edges  the edges taped on this cabinet's drawer fronts. Null
--                        means nobody set them, and they follow banded_edges
--                        (the doors), which is exactly what every existing
--                        design already does. No data changes.
--
-- The design tool is safe to deploy before this runs: the column is on the
-- retry list in lib/pcd-design-item-io.js, so a save drops it rather than
-- failing.
--
-- One block, so an error anywhere undoes the lot. Safe to run twice.

do $$
begin
  alter table public.pcd_design_items
    add column if not exists drawer_banded_edges text[];

  comment on column public.pcd_design_items.drawer_banded_edges is
    'Edges taped on this cabinet''s drawer fronts. Any of Top, Bottom, Left, Right. Null follows banded_edges (the doors).';
end $$;
