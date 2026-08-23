-- WHAT THE ORDER SHOULD HAVE BEEN CARRYING ALL ALONG.
--
-- WHY. An order line is a copy of a quote line, taken when the quote is
-- accepted. The copy left three things behind, and every one of them is
-- something the workshop then had to guess or do without.
--
--   supplier_name        which brand of board. The quote records it exactly.
--                        Without it the order page and the workshop label guess
--                        the brand back from the colour NAME, twelve attempts,
--                        first hit wins. Two suppliers stocking the same colour
--                        name is normal, so the label can name the wrong brand
--                        and nothing says so.
--
--   hinge_holes          whether to drill, and how many. These live only on the
--   hinge_qty            quote line, so the sheet reads back through the link.
--                        A line a VARIATION added has no link and prints
--                        drilling as "Not recorded" for ever. A door that needed
--                        drilling and did not get it is scrap.
--
--   unit_cost_source_id  which colour library row priced the line. Without it a
--   unit_cost_source_    reprice has nothing to match on but five loose strings
--   label                that change the moment somebody tidies the library.
--
-- The variation path already copies all five (lib/pcd-order-variations.js), so
-- a line added by a variation carried more information than the line the order
-- was raised from. This makes the two agree.
--
-- Prices, totals and statuses are NOT touched. Nothing here changes what
-- anything costs.

alter table public.pcd_order_line_items
  add column if not exists hinge_holes boolean,
  add column if not exists hinge_qty text;

comment on column public.pcd_order_line_items.hinge_holes is
  'Whether this piece is drilled for hinges. Copied from the quote line when the order is raised. Null means nobody recorded it, which the workshop label prints as "Not recorded" rather than guessing "No".';
comment on column public.pcd_order_line_items.hinge_qty is
  'Free text hinge count, e.g. "2 hinges". Copied from the quote line when the order is raised.';

-- The other three already exist: the variation path writes them today.
alter table public.pcd_order_line_items
  add column if not exists supplier_name text,
  add column if not exists unit_cost_source_id uuid references public.pcd_colour_library(id) on delete set null,
  add column if not exists unit_cost_source_label text;

-- ---------------------------------------------------------------------------
-- BACKFILL. Every existing order line that still has a quote line behind it.
--
-- Only fills what is BLANK. A value already on the order line was either put
-- there by a variation or typed by a person, and either way it is newer than
-- the quote and must win.
-- ---------------------------------------------------------------------------
update public.pcd_order_line_items l
   set hinge_holes = ql.hinge_holes
  from public.pcd_quote_line_items ql
 where ql.id = l.quote_line_item_id
   and l.hinge_holes is null
   and ql.hinge_holes is not null;

update public.pcd_order_line_items l
   set hinge_qty = ql.hinge_qty
  from public.pcd_quote_line_items ql
 where ql.id = l.quote_line_item_id
   and nullif(btrim(coalesce(l.hinge_qty, '')), '') is null
   and nullif(btrim(coalesce(ql.hinge_qty, '')), '') is not null;

update public.pcd_order_line_items l
   set supplier_name = ql.supplier_name
  from public.pcd_quote_line_items ql
 where ql.id = l.quote_line_item_id
   and nullif(btrim(coalesce(l.supplier_name, '')), '') is null
   and nullif(btrim(coalesce(ql.supplier_name, '')), '') is not null;

update public.pcd_order_line_items l
   set unit_cost_source_id = ql.unit_cost_source_id
  from public.pcd_quote_line_items ql
 where ql.id = l.quote_line_item_id
   and l.unit_cost_source_id is null
   and ql.unit_cost_source_id is not null;

update public.pcd_order_line_items l
   set unit_cost_source_label = ql.unit_cost_source_label
  from public.pcd_quote_line_items ql
 where ql.id = l.quote_line_item_id
   and nullif(btrim(coalesce(l.unit_cost_source_label, '')), '') is null
   and nullif(btrim(coalesce(ql.unit_cost_source_label, '')), '') is not null;

-- ---------------------------------------------------------------------------
-- Say what is left, so running this is not something you have to take on trust.
-- ---------------------------------------------------------------------------
do $$
declare
  still_guessing int;
  still_unknown  int;
  no_quote_line  int;
begin
  select count(*) into still_guessing
    from public.pcd_order_line_items l
    join public.pcd_quote_line_items ql on ql.id = l.quote_line_item_id
   where nullif(btrim(coalesce(l.supplier_name, '')), '') is null;

  select count(*) into still_unknown
    from public.pcd_order_line_items l
    join public.pcd_quote_line_items ql on ql.id = l.quote_line_item_id
   where l.hinge_holes is null;

  select count(*) into no_quote_line
    from public.pcd_order_line_items
   where quote_line_item_id is null;

  raise notice 'Order lines whose brand is still unknown (the quote had none either): %', still_guessing;
  raise notice 'Order lines whose drilling is still unrecorded (the quote had none either): %', still_unknown;
  raise notice 'Lines added by a variation, which never had a quote line to copy from: %', no_quote_line;
end $$;
