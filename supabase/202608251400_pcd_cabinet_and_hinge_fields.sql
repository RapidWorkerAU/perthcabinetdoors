-- WHOSE CABINET IT IS, AND WHERE THE HINGES GO.
--
-- Five columns, on all three line tables, so the same answer survives the whole
-- journey. A request becomes a quote becomes an order, and today two of these
-- questions can only be answered in prose in the notes, where a person has to
-- read them and type them again on the next screen. That retyping is where a
-- pair becomes two identical doors.
--
--   cabinet_brand         which carcass the front is going on. Per LINE, because
--                         a kitchen is routinely Metod fronts with a custom
--                         panel closing the end of a run. pcd_quote_requests
--                         already has a job level cabinet_brand; that stays and
--                         becomes the default a new line starts from.
--
--   hinge_side            Left or Right, looking at the front. There is no
--                         "pair": a pair is two doors drilled as mirror images,
--                         so it is two lines.
--
--   hinge_from_bottom_mm  the bottom cup, measured up from the bottom edge.
--   hinge_from_top_mm     the top cup, measured DOWN from the top edge, because
--                         that is how a spec sheet reads and how somebody
--                         matching an existing run has it written down.
--
--   hinge_middles_mm      any cups between those two, from the bottom. Worked
--                         out by even spacing unless somebody has typed over
--                         them, which happens when a door is being matched to
--                         one that was not evenly drilled.
--
-- ALL NULLABLE, AND NULL MEANS SOMETHING. A drilled door with no measurements is
-- a door we set the positions on, which is almost all of them. It is not an
-- incomplete line and nothing should treat it as one.
--
-- NOTHING IS BACKFILLED. There is no old value for any of these: they were
-- never asked. Guessing a hinge position from a note would be inventing a
-- measurement, and a measurement nobody gave us is worse than no measurement.

-- ---------------------------------------------------------------------------
-- The three line tables.
-- ---------------------------------------------------------------------------

alter table public.pcd_quote_request_line_items
  add column if not exists cabinet_brand        text,
  add column if not exists hinge_side           text,
  add column if not exists hinge_from_bottom_mm numeric(12,2),
  add column if not exists hinge_from_top_mm    numeric(12,2),
  add column if not exists hinge_middles_mm     numeric(12,2)[];

alter table public.pcd_quote_line_items
  add column if not exists cabinet_brand        text,
  add column if not exists hinge_side           text,
  add column if not exists hinge_from_bottom_mm numeric(12,2),
  add column if not exists hinge_from_top_mm    numeric(12,2),
  add column if not exists hinge_middles_mm     numeric(12,2)[];

alter table public.pcd_order_line_items
  add column if not exists cabinet_brand        text,
  add column if not exists hinge_side           text,
  add column if not exists hinge_from_bottom_mm numeric(12,2),
  add column if not exists hinge_from_top_mm    numeric(12,2),
  add column if not exists hinge_middles_mm     numeric(12,2)[];

-- A VARIATION LINE IS A LINE. It reaches the workshop the same way, gets made
-- the same way, and is exactly as easy to drill the wrong way round.
--
-- This table had NO hinge columns at all, which is worse than it sounds: a door
-- added by a variation arrived on the order with nothing recorded about its
-- drilling, so the workshop label printed "Not recorded" and somebody had to go
-- and ask. hinge_holes and hinge_qty are added here for the same reason as the
-- five: the gap was already there, and adding handing and positions without
-- them would leave a door that says which side it is hinged and not whether it
-- is drilled at all.
alter table public.pcd_order_variation_lines
  add column if not exists cabinet_brand        text,
  add column if not exists hinge_holes          boolean,
  add column if not exists hinge_qty            text,
  add column if not exists hinge_side           text,
  add column if not exists hinge_from_bottom_mm numeric(12,2),
  add column if not exists hinge_from_top_mm    numeric(12,2),
  add column if not exists hinge_middles_mm     numeric(12,2)[];

-- ---------------------------------------------------------------------------
-- Only two answers for handing.
--
-- Checked in the database as well as in the form, because this is the one that
-- costs a remake and because it is exactly the kind of value an import or a
-- spreadsheet can put in sideways. Null is allowed: a door that is not drilled
-- has no handing, and neither does a panel.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'pcd_quote_request_line_items',
    'pcd_quote_line_items',
    'pcd_order_line_items',
    'pcd_order_variation_lines'
  ] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_hinge_side');
    execute format(
      'alter table public.%I add constraint %I check (hinge_side is null or hinge_side in (''Left'', ''Right''))',
      t, t || '_hinge_side'
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Comments, because a column called hinge_from_top_mm is read the wrong way
-- round by anybody who has not been told.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'pcd_quote_request_line_items',
    'pcd_quote_line_items',
    'pcd_order_line_items',
    'pcd_order_variation_lines'
  ] loop
    execute format($c$comment on column public.%I.cabinet_brand is
      'Whose cabinet this front is going on, per line. IKEA Metod / IKEA Besta / IKEA Pax / Kaboodle / Custom panel / Custom carcass / Not applicable, plus any older value already stored. See lib/quote-form-data.js.'$c$, t);
    execute format($c$comment on column public.%I.hinge_side is
      'Left or Right, looking at the front of the door. A matched pair is two lines, not one line hinged both ways.'$c$, t);
    execute format($c$comment on column public.%I.hinge_from_bottom_mm is
      'Centre of the bottom hinge cup, measured UP from the bottom edge. Null means we set the positions.'$c$, t);
    execute format($c$comment on column public.%I.hinge_from_top_mm is
      'Centre of the top hinge cup, measured DOWN from the top edge. Null means we set the positions.'$c$, t);
    execute format($c$comment on column public.%I.hinge_middles_mm is
      'Any cups between the bottom and the top, measured UP from the bottom edge. Empty means space them evenly, which is what lib/pcd-hinges.js does.'$c$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- WHAT THIS DOES NOT DO.
--
-- hinge_supply and its cost columns are left exactly as they are. They are not
-- asked for on the new forms and they are not carried to an order, because
-- supplied hinges are ordered as their own hardware line. Dropping the columns
-- would take the detail off quotes that already priced hinge supply through
-- them, and those are real quotes.
-- ---------------------------------------------------------------------------

-- Anything already stored that the new handing rule would refuse. Should be
-- none: the column did not exist until now.
select 'hinge_side outside Left/Right' as check, count(*) as rows
from (
  select hinge_side from public.pcd_quote_request_line_items
  union all select hinge_side from public.pcd_quote_line_items
  union all select hinge_side from public.pcd_order_line_items
  union all select hinge_side from public.pcd_order_variation_lines
) all_lines
where hinge_side is not null and hinge_side not in ('Left', 'Right');

-- Request lines still holding an answer the dropdown no longer offers. These
-- are left alone on purpose; the query is here so you can see how many.
select cabinet_brand, count(*) as rows
from public.pcd_quote_requests
where cabinet_brand is not null
  and cabinet_brand not in (
    'IKEA Metod', 'IKEA Besta', 'IKEA Pax', 'Kaboodle',
    'Custom panel', 'Custom carcass', 'Not applicable'
  )
group by cabinet_brand
order by rows desc;
