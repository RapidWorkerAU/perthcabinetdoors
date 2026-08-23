-- Which colour library row a cabinet's carcass and shelves were picked from.
--
-- WHY. A colour name is not unique across suppliers: two brands stock a
-- "Classic White" at two different prices. Everything else in a design already
-- records the row behind the swatch, because fronts and panels keep their board
-- in a JSON column and whatever the picker returns is stored whole. The carcass
-- and the shelves are older and live in flat columns, so they kept the name and
-- nothing else, and could only ever be matched back to the library by name.
--
-- The board cost resolver refuses to guess between two rows at two prices, and
-- rightly so, but that means a carcass in one of those colours could not be
-- priced at all without somebody picking the supplier by hand on the quote.
--
-- The supplier name is here for the same reason: it is what the resolver falls
-- back to when the id is missing, on a design drawn before this migration.

alter table public.pcd_design_items
  add column if not exists colour_library_id uuid references public.pcd_colour_library(id) on delete set null,
  add column if not exists supplier_name text,
  add column if not exists shelf_colour_library_id uuid references public.pcd_colour_library(id) on delete set null,
  add column if not exists shelf_supplier_name text;

comment on column public.pcd_design_items.colour_library_id is
  'The colour library row the carcass board was picked from. Null on a design drawn before this existed, or where the carcass is deliberately unspecified (a cabinet the customer already owns).';
comment on column public.pcd_design_items.supplier_name is
  'Brand of the carcass board, used to resolve its price when colour_library_id is not set.';
comment on column public.pcd_design_items.shelf_colour_library_id is
  'The colour library row the shelf board was picked from.';
comment on column public.pcd_design_items.shelf_supplier_name is
  'Brand of the shelf board, used to resolve its price when shelf_colour_library_id is not set.';

create index if not exists pcd_design_items_colour_library_id_idx
  on public.pcd_design_items(colour_library_id);
create index if not exists pcd_design_items_shelf_colour_library_id_idx
  on public.pcd_design_items(shelf_colour_library_id);
