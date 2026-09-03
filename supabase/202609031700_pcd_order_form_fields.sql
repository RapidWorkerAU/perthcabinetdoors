-- WHAT A MEASURE KNOWS THAT A BOARD SIZE DOES NOT.
--
-- ── WHAT THIS TURNS ON ───────────────────────────────────────────────────────
--
-- The Excel order form is now four measuring tabs rather than one sheet, and
-- four of its questions had nowhere to land. Each one changes what the workshop
-- does or whether a line is priced, so each gets a column rather than a
-- sentence appended to the notes that nothing can filter on:
--
--   panel_use        an end panel, a filler, a kickboard and a bulkhead all
--                    quote as "Panel", and are all made differently
--   grain_direction  which way the grain runs, on a woodgrain refresh and on
--                    any wide drawer front
--   edge_finish      a panel scribed into a wall does not get all four edges
--   supplied_by      a hardware line the customer is buying themselves is
--                    recorded, and not priced
--
-- And two on the quote itself, asked once for the whole job:
--
--   existing_hinge_brand  what the new doors are going onto, on a refresh
--   door_overlay          full, half or inset
--
-- ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────
--
-- The room and the cabinet reference. They are asked on every measuring tab and
-- they arrive on the front of the line's notes, which is enough to find a line
-- again but not enough to group or filter by. Making them real columns is a
-- bigger change than this: the quote editor, the workshop sheet and the order
-- all show a line, and a column nothing displays is a column nobody fills in.
--
-- ── EVERYTHING IS NULLABLE AND NOTHING IS BACKFILLED ─────────────────────────
--
-- Every existing line predates the question. A default would be an answer
-- nobody gave, and on grain direction that is the difference between "run it
-- the way we always do" and "somebody looked at it and said vertical".
--
-- ── ONE DO BLOCK ─────────────────────────────────────────────────────────────
--
-- The Supabase SQL editor pools connections, and a script that errors part way
-- through has already committed what ran before it. One block means an error
-- anywhere undoes the lot. Safe to run twice.

do $$
begin

  -- ── The line ──────────────────────────────────────────────────────────────

  alter table public.pcd_quote_line_items
    add column if not exists panel_use       text,
    add column if not exists grain_direction text,
    add column if not exists edge_finish     text,
    add column if not exists supplied_by     text,
    add column if not exists hardware_type   text;

  comment on column public.pcd_quote_line_items.panel_use is
    'What the panel actually is: End panel, Filler, Kickboard, Bulkhead, Shelf, Back panel, Upstand, Other. Only meaningful where product_type is Panel.';
  comment on column public.pcd_quote_line_items.grain_direction is
    'Standard, Vertical, Horizontal or No grain. Blank means nobody was asked; Standard means somebody was and chose the way we always run it.';
  comment on column public.pcd_quote_line_items.edge_finish is
    'How many edges are finished. Blank means the standard, which is all four.';
  comment on column public.pcd_quote_line_items.supplied_by is
    'We supply, Customer supplies, or Not sure. A hardware line the customer supplies is recorded but not priced.';
  comment on column public.pcd_quote_line_items.hardware_type is
    'What kind of hardware: hinge, handle, drawer_runner and the rest. The catalogue row knows it, but the line did not, so the quote viewer could only say the bare word Hardware.';

  -- ── The job ───────────────────────────────────────────────────────────────

  alter table public.pcd_quotes
    add column if not exists existing_hinge_brand text,
    add column if not exists door_overlay         text;

  comment on column public.pcd_quotes.existing_hinge_brand is
    'On a refresh, the hinges already hanging on the customer''s carcasses. Tells the workshop what cup and plate the new doors are going onto.';
  comment on column public.pcd_quotes.door_overlay is
    'Full overlay, Half overlay, Inset or Not sure. How the existing doors sit on the carcass.';

  -- ── The two vocabularies somebody can now add to ──────────────────────────
  --
  -- Rooms and panel uses join the lists in Settings, Lists. Seeded with the
  -- built-in words in the order they appear in lib/pcd-line-details.js, so
  -- nothing changes on any screen until somebody deliberately changes it here.
  --
  -- Skipped entirely when the lists table has not been created yet: this
  -- migration is about the columns above, and it must not fail on a database
  -- that has not run 202608281000_pcd_list_items.sql.

  if to_regclass('public.pcd_list_items') is not null then
    insert into public.pcd_list_items (list_key, item_key, label, sort_order, is_active, is_builtin)
    select 'room_areas', word, word, (ordinality - 1) * 10, true, true
    from unnest(array[
      'Kitchen', 'Butler''s pantry', 'Scullery', 'Laundry', 'Bathroom', 'Ensuite',
      'Powder room', 'Robe', 'Bedroom', 'Office', 'Living', 'Garage', 'Other'
    ]) with ordinality as t(word, ordinality)
    on conflict (list_key, item_key) do nothing;

    insert into public.pcd_list_items (list_key, item_key, label, sort_order, is_active, is_builtin)
    select 'panel_uses', word, word, (ordinality - 1) * 10, true, true
    from unnest(array[
      'End panel', 'Filler', 'Kickboard', 'Bulkhead', 'Shelf', 'Back panel', 'Upstand', 'Other'
    ]) with ordinality as t(word, ordinality)
    on conflict (list_key, item_key) do nothing;
  end if;

end $$;
