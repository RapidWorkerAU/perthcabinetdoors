-- SUPPLY OR MADE TO ORDER, ON EVERY BOARD LINE.
--
-- Answered after the colour on a quote line and a variation line: do we buy
-- the board and cut it (supply), or does the supplier make the piece (mto)?
-- It decides the price and, when the quote becomes an order, whether the line
-- lands as made in house or supplier made. See lib/pcd-made-by.js.
--
--   made_by   'supply', 'mto', or null. Null is a line saved before the
--             question existed, or one that is not a board (hardware, a
--             benchtop, a cabinet). It reads as the way the line was always
--             priced, so no existing quote moves.
--
-- The order line already has its answer in fulfilment_method, so it needs no
-- column of its own.
--
-- One block, so an error anywhere undoes the lot. Safe to run twice.

do $$
begin
  alter table public.pcd_quote_line_items
    add column if not exists made_by text;
  alter table public.pcd_order_variation_lines
    add column if not exists made_by text;

  alter table public.pcd_quote_line_items
    drop constraint if exists pcd_quote_line_items_made_by_check;
  alter table public.pcd_quote_line_items
    add constraint pcd_quote_line_items_made_by_check check (made_by in ('supply', 'mto'));

  alter table public.pcd_order_variation_lines
    drop constraint if exists pcd_order_variation_lines_made_by_check;
  alter table public.pcd_order_variation_lines
    add constraint pcd_order_variation_lines_made_by_check check (made_by in ('supply', 'mto'));

  comment on column public.pcd_quote_line_items.made_by is
    'supply (we cut it from board) or mto (the supplier makes it). Null reads as the way the line was priced before the question existed. See lib/pcd-made-by.js.';
  comment on column public.pcd_order_variation_lines.made_by is
    'supply (we cut it from board) or mto (the supplier makes it). Null reads as the way the line was priced before the question existed. See lib/pcd-made-by.js.';
end $$;
