-- EVERY ANSWER ON A LINE, ALL THE WAY FROM THE WEBSITE TO THE BENCH.
--
-- ── WHAT WAS BEING LOST ─────────────────────────────────────────────────────
--
-- A quote line carries seven answers that change what the workshop does:
--
--   panel_use        a scribe, a filler, a kickboard. All quote as "Panel".
--   banded_edges     which edges get tape, one at a time
--   hole_type        Blum Inserta or a bare 35mm cup: two machine setups
--   edge_finish      the older three phrase answer to the edges question
--   grain_direction  which way the grain runs
--   supplied_by      a hardware line the customer is buying themselves
--   hardware_type    hinge, handle, runner
--
-- None of them had a column on the ORDER line, so all seven stopped at the
-- quote. The order, the production views and the workshop sheet could not see
-- a single one: a scribe reached the bench as a plain Panel, and a door bored
-- for the wrong hinge is scrap.
--
-- hardware_type never reached the quote line either. It was added to
-- 202609031700 after that file had already been run, so the column the quote
-- editor writes has never existed, and every hardware line has been saved
-- without its kind.
--
-- And the website request line kept the name of the hardware somebody picked
-- but not WHICH catalogue item, so a converted hardware line arrived on the
-- quote at no price with nothing to look it up by.
--
-- ── WHAT THIS DOES ──────────────────────────────────────────────────────────
--
--   the order line and the variation line get all seven columns
--   the quote line gets hardware_type
--   the request line gets hardware_catalogue_id
--   orders already raised are filled in from the quote line they came from
--
-- No check constraints. Panel uses are editable in Settings, Lists, and the
-- other vocabularies live in lib/pcd-line-details.js and are validated on the
-- way in, the same as the quote line beside them.
--
-- The code is safe to deploy before this runs: each new column is on a retry
-- list, so a missing one costs that answer rather than the order.
--
-- One block, so an error anywhere undoes the lot. Safe to run twice.

do $$
begin

  -- ── The quote line ───────────────────────────────────────────────────────

  alter table public.pcd_quote_line_items
    add column if not exists hardware_type text;

  comment on column public.pcd_quote_line_items.hardware_type is
    'What kind of hardware: hinge, handle, drawer_runner and the rest. Only on a hardware line.';

  -- ── The request line ─────────────────────────────────────────────────────

  alter table public.pcd_quote_request_line_items
    add column if not exists hardware_catalogue_id uuid;

  comment on column public.pcd_quote_request_line_items.hardware_catalogue_id is
    'The pcd_hardware row the customer picked. The conversion prices the quote line from it. No foreign key: a catalogue row retired later must not stop an old request being read.';

  -- ── The order line ───────────────────────────────────────────────────────

  alter table public.pcd_order_line_items
    add column if not exists panel_use       text,
    add column if not exists banded_edges    text[],
    add column if not exists hole_type       text,
    add column if not exists edge_finish     text,
    add column if not exists grain_direction text,
    add column if not exists supplied_by     text,
    add column if not exists hardware_type   text;

  comment on column public.pcd_order_line_items.panel_use is
    'What the panel is: Scribe, Filler, Kickboard and the rest. Copied from the quote line when the order is raised.';
  comment on column public.pcd_order_line_items.banded_edges is
    'Which edges get tape, any of Top, Bottom, Left, Right. Null means nobody was asked, which is not the same as none.';
  comment on column public.pcd_order_line_items.hole_type is
    'Blum Inserta or 35mm cup only. Only on a drilled line.';
  comment on column public.pcd_order_line_items.edge_finish is
    'The older three phrase edges answer, kept because the Excel order form still asks it.';
  comment on column public.pcd_order_line_items.grain_direction is
    'Standard, Vertical, Horizontal or No grain.';
  comment on column public.pcd_order_line_items.supplied_by is
    'We supply, Customer supplies, or Not sure. Hardware only.';
  comment on column public.pcd_order_line_items.hardware_type is
    'What kind of hardware. Only on a hardware line.';

  -- ── The variation line ───────────────────────────────────────────────────
  --
  -- A variation writes order lines too, so it has to be able to carry them.

  alter table public.pcd_order_variation_lines
    add column if not exists panel_use       text,
    add column if not exists banded_edges    text[],
    add column if not exists hole_type       text,
    add column if not exists edge_finish     text,
    add column if not exists grain_direction text,
    add column if not exists supplied_by     text,
    add column if not exists hardware_type   text;

  -- ── Orders already raised ────────────────────────────────────────────────
  --
  -- Filled in from the quote line each order line came from. Only where the
  -- order line is still blank, so running this twice changes nothing and an
  -- answer somebody has since set on the order is never overwritten.

  update public.pcd_order_line_items o
     set panel_use       = coalesce(o.panel_use, q.panel_use),
         banded_edges    = coalesce(o.banded_edges, q.banded_edges),
         hole_type       = coalesce(o.hole_type, q.hole_type),
         edge_finish     = coalesce(o.edge_finish, q.edge_finish),
         grain_direction = coalesce(o.grain_direction, q.grain_direction),
         supplied_by     = coalesce(o.supplied_by, q.supplied_by)
    from public.pcd_quote_line_items q
   where o.quote_line_item_id = q.id
     and (o.panel_use is null or o.banded_edges is null or o.hole_type is null
          or o.edge_finish is null or o.grain_direction is null or o.supplied_by is null);

end $$;
