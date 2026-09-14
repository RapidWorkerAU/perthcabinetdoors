-- WHICH EDGES ARE BANDED, AND WHICH HINGE BORING, ON A DESIGN.
--
-- The quote builder, the quote editor and the order all carry which edges of a
-- decorative board piece get tape and whether a door is bored for a Blum
-- Inserta or a bare 35mm cup. The design tool had neither, so a design
-- imported into a quote arrived with no edges and no boring on any line.
--
--   banded_edges  on a cabinet, the edges taped on its doors and drawer fronts;
--                 on a standalone panel or scribe, that piece's own edges.
--                 Null means nobody changed it, which the design tool reads as
--                 all four, our standard. Each finishing panel on a cabinet
--                 keeps its own in panel_options, beside its reach and profile.
--   hole_type     Blum Inserta or 35mm cup only, for the cabinet's doors.
--
-- No check constraints: both vocabularies live in lib/pcd-line-details.js and
-- are checked on the way in, the same as the quote line.
--
-- The design tool is safe to deploy before this runs: both columns are on the
-- retry list in lib/pcd-design-item-io.js, so a save drops them rather than
-- failing.
--
-- One block, so an error anywhere undoes the lot. Safe to run twice.

do $$
begin
  alter table public.pcd_design_items
    add column if not exists banded_edges text[],
    add column if not exists hole_type    text;

  comment on column public.pcd_design_items.banded_edges is
    'Edges taped: on a cabinet, its doors and drawer fronts; on a standalone panel or scribe, the piece itself. Any of Top, Bottom, Left, Right. Null reads as all four.';
  comment on column public.pcd_design_items.hole_type is
    'Blum Inserta or 35mm cup only, for the doors on this cabinet.';
end $$;
