-- WHICH EDGES ARE BANDED, AND WHICH BORING THE HINGE NEEDS.
--
-- ── BANDED EDGES ─────────────────────────────────────────────────────────────
--
-- edge_finish already exists and holds one of three phrases: "All four edges",
-- "Leave one edge raw, see notes", or "Not sure". That was as much as the order
-- form could ask, and "see notes" is where the actual answer went.
--
-- The website can ask exactly, one edge at a time, so this stores exactly:
-- which of top, bottom, left and right get tape. edge_finish is KEPT and is
-- derived from it, so the PDF, the order form import and every screen reading
-- edge_finish today carry on working untouched. This is more information in a
-- new column, not a replacement for an old one.
--
-- Decorative board only. A thermolaminate front is a vinyl skin wrapped round
-- the edges and a compact laminate panel is solid through the thickness;
-- neither is taped, so neither is ever asked and both stay null.
--
-- ── HOLE TYPE ────────────────────────────────────────────────────────────────
--
-- A 35mm cup on its own, or a Blum Inserta boring, which is the cup plus two
-- 8mm dowel holes on 45mm centres. They are different machine setups and a door
-- bored for one will not take a hinge made for the other. Nothing anywhere
-- recorded which, so it was a sentence in the notes or a phone call.
--
-- Both columns land on the request AND on the quote line, because a fact that
-- stops at the request is a fact the workshop never sees.

begin;

-- ── What the customer asked for ──────────────────────────────────────────────

alter table public.pcd_quote_request_line_items
  add column if not exists banded_edges text[],
  add column if not exists hole_type    text;

comment on column public.pcd_quote_request_line_items.banded_edges is
  'Which edges get tape, any of Top, Bottom, Left, Right. Decorative board only. Null means nobody was asked, which is not the same as none.';
comment on column public.pcd_quote_request_line_items.hole_type is
  'Blum Inserta, or 35mm cup only. Null on anything not drilled.';

-- ── What we are going to make ────────────────────────────────────────────────

alter table public.pcd_quote_line_items
  add column if not exists banded_edges text[],
  add column if not exists hole_type    text;

comment on column public.pcd_quote_line_items.banded_edges is
  'Which edges get tape, any of Top, Bottom, Left, Right. edge_finish is derived from this when it is set, and is still the column every existing screen reads.';
comment on column public.pcd_quote_line_items.hole_type is
  'Blum Inserta, or 35mm cup only. Different machine setups, so a door bored for one will not take the other hinge.';

-- No check constraint on either. Both vocabularies live in
-- lib/pcd-line-details.js and are validated on the way in, the same as
-- edge_finish and grain_direction beside them, so adding an option later is a
-- code change rather than a migration and a rejected save.

commit;
