-- WHICH 18MM POLYTEC DECORATIVE BOARD COLOURS POLYTEC MAKES TO ORDER.
--
-- The web shop sells a decorative board colour online only when it is ticked
-- made to order in the colour library, because Polytec makes every piece the
-- shop sells and does not make every colour. Anything not ticked shows in the
-- shop as quote only.
--
-- From the Polytec portal, DECORATIVE 18mm doors & panels, 21 October 2026:
-- 76 colours. These are ticked supply board AND made to order. Every other
-- 18mm Polytec decorative board colour is ticked supply board only.
--
-- Costs are not touched. A colour ticked for both still prices from its cost
-- per m2 everywhere, the same as before.
--
-- One block, so an error anywhere undoes the lot. Stops without changing
-- anything if a colour on the list is not in the library exactly once. Safe to
-- run twice.

do $$
declare
  expected integer;
  matched  integer;
  both_set integer;
  board_set integer;
begin
  create temporary table polytec_18mm_mto (name text, finish text) on commit drop;
  insert into polytec_18mm_mto (name, finish) values
      ('Blonde Oak', 'Woodmatt'),
      ('Ecru Oak', 'Woodmatt'),
      ('Boston Oak', 'Woodmatt'),
      ('Laurel Oak', 'Woodmatt'),
      ('Botany Oak', 'Woodmatt'),
      ('Manor Oak', 'Woodmatt'),
      ('Hazel Oak', 'Woodmatt'),
      ('Society Oak', 'Woodmatt'),
      ('District Oak', 'Woodmatt'),
      ('Bronzed Oak', 'Woodmatt'),
      ('Rubra Oak', 'Woodmatt'),
      ('Blackened Oak', 'Woodmatt'),
      ('Batten Oak', 'Woodmatt'),
      ('Danish Rattan', 'Woodmatt'),
      ('Swiss Rattan', 'Woodmatt'),
      ('Gossamer White', 'Ravine'),
      ('Elemental Grey', 'Ravine'),
      ('Topiary', 'Venette'),
      ('Oasis', 'Venette'),
      ('Forage', 'Venette'),
      ('Habitat', 'Venette'),
      ('Ferro', 'Venette'),
      ('Adriatic', 'Venette'),
      ('Arabica', 'Venette'),
      ('Botanic', 'Venette'),
      ('Oxford', 'Venette'),
      ('Ochre Figured-Wood', 'Gloss'),
      ('Sienna Figured-Wood', 'Gloss'),
      ('Onyx Figured-Wood', 'Gloss'),
      ('White Cement', 'Legato'),
      ('Grey Cement', 'Legato'),
      ('Notaio Walnut', 'Ravine'),
      ('Ultra White', 'Venette'),
      ('New Ultra White', 'Gloss'),
      ('Crisp White', 'Legato'),
      ('Blossom White', 'Ravine'),
      ('Blossom White', 'Venette'),
      ('Bone White', 'Legato'),
      ('Silk', 'Legato'),
      ('Papyrus', 'Legato'),
      ('Montage', 'Legato'),
      ('Greige', 'Ravine'),
      ('Avion Grey', 'Ravine'),
      ('Avion Grey', 'Venette'),
      ('Satra Wood', 'Ravine'),
      ('Natural Oak', 'Ravine'),
      ('Bleached Walnut', 'Ravine'),
      ('Bleached Walnut', 'Legato'),
      ('Soft Walnut', 'Ravine'),
      ('Drifted Oak', 'Ravine'),
      ('Drifted Oak', 'Legato'),
      ('Distressed Wood', 'Ravine'),
      ('Bespoke', 'Legato'),
      ('Castel', 'Legato'),
      ('Tessuto Milan', 'Ravine'),
      ('Maison Oak', 'Ravine'),
      ('Maison Oak', 'Legato'),
      ('Canterbury Grey', 'Ravine'),
      ('Canterbury Grey', 'Venette'),
      ('Artisan Oak', 'Ravine'),
      ('Sepia Oak', 'Ravine'),
      ('Jamaican Walnut', 'Gloss'),
      ('Nouveau Grey', 'Venette'),
      ('Serene', 'Legato'),
      ('Maroso Milan', 'Legato'),
      ('Maroso Milan', 'Ravine'),
      ('Char Oak', 'Ravine'),
      ('Cavia Lini', 'Gloss'),
      ('Cafe Oak', 'Ravine'),
      ('Cinder', 'Gloss'),
      ('Cinder', 'Venette'),
      ('Black Wenge', 'Gloss'),
      ('Black Wenge', 'Venette'),
      ('Black Wenge', 'Ravine'),
      ('Black', 'Venette'),
      ('Black', 'Gloss');

  select count(*) into expected from polytec_18mm_mto;

  select count(*) into matched
  from public.pcd_colour_library c
  join polytec_18mm_mto m
    on lower(trim(c.name)) = lower(m.name) and lower(trim(c.finish_type)) = lower(m.finish)
  where lower(c.material_type) = 'decorative board'
    and c.thickness = '18mm'
    and lower(c.supplier_name) like 'polytec%';

  if matched <> expected then
    raise exception 'Expected % library rows to match the list, found %. Nothing changed.', expected, matched;
  end if;

  update public.pcd_colour_library c
  set order_type  = 'supply board',
      order_types = array['supply board', 'made to order MTO']::text[],
      updated_at  = now()
  from polytec_18mm_mto m
  where lower(trim(c.name)) = lower(m.name) and lower(trim(c.finish_type)) = lower(m.finish)
    and lower(c.material_type) = 'decorative board'
    and c.thickness = '18mm'
    and lower(c.supplier_name) like 'polytec%';
  get diagnostics both_set = row_count;

  update public.pcd_colour_library c
  set order_type  = 'supply board',
      order_types = array['supply board']::text[],
      updated_at  = now()
  where lower(c.material_type) = 'decorative board'
    and c.thickness = '18mm'
    and lower(c.supplier_name) like 'polytec%'
    and not exists (
      select 1 from polytec_18mm_mto m
      where lower(trim(c.name)) = lower(m.name) and lower(trim(c.finish_type)) = lower(m.finish)
    );
  get diagnostics board_set = row_count;

  raise notice '% colours ticked supply board and made to order, % ticked supply board only.', both_set, board_set;
end $$;
