-- WHICH 16MM POLYTEC DECORATIVE BOARD COLOURS POLYTEC MAKES TO ORDER.
--
-- The web shop sells a decorative board colour online only when it is ticked
-- made to order in the colour library. See the 18mm file before this one.
--
-- From the Polytec portal, DECORATIVE 16mm doors & panels, 21 October 2026:
-- 134 colours. 128 of them are in the library and are ticked supply board AND
-- made to order here. Every other 16mm Polytec decorative board colour is
-- ticked supply board only, except Raw MDF, which stays as it is.
--
-- Six portal colours are not in the library at all, so there is nothing to
-- tick: Nomad, Solara, Wild Clay, Wispwood, Dawnshade and Lightstone, all
-- Matt. Add them in the Board Library, with a cost, and tick both.
--
-- Classic White Ashgrain is on the list but switched off in the library. It is
-- ticked anyway, and stays off the shop until it is switched back on.
--
-- Costs are not touched. One block, so an error anywhere undoes the lot.
-- Stops without changing anything if a colour on the list is not in the
-- library exactly once. Safe to run twice.

do $$
declare
  expected integer;
  matched  integer;
  both_set integer;
  board_set integer;
begin
  create temporary table polytec_16mm_mto (name text, finish text) on commit drop;
  insert into polytec_16mm_mto (name, finish) values
      ('Australian Native', 'Woodmatt'),
      ('Boston Oak', 'Woodmatt'),
      ('Aston White', 'Smooth'),
      ('Gossamer White', 'Smooth'),
      ('Verdelho', 'Smooth'),
      ('Pallido', 'Smooth'),
      ('Elemental Grey', 'Smooth'),
      ('Agave', 'Smooth'),
      ('Topiary', 'Smooth'),
      ('Oasis', 'Smooth'),
      ('Forage', 'Smooth'),
      ('Mercurio Grey', 'Smooth'),
      ('Habitat', 'Smooth'),
      ('Ferro', 'Matt'),
      ('Adriatic', 'Smooth'),
      ('Arabica', 'Smooth'),
      ('Botanic', 'Smooth'),
      ('Oxford', 'Matt'),
      ('Quartiera Maple', 'Woodmatt'),
      ('Natural Ply', 'Woodmatt'),
      ('Plantation Ash', 'Woodmatt'),
      ('Ligurian Walnut', 'Woodmatt'),
      ('Palomera Oak', 'Woodmatt'),
      ('Arcadia Oak', 'Woodmatt'),
      ('Black Ply', 'Woodmatt'),
      ('Ochre Figured-Wood', 'Smooth'),
      ('Sienna Figured-Wood', 'Smooth'),
      ('Onyx Figured-Wood', 'Smooth'),
      ('Platinum Leaf', 'Matt'),
      ('Light Brass Leaf', 'Matt'),
      ('Pure Gold Leaf', 'Matt'),
      ('Rose Gold Leaf', 'Matt'),
      ('Copper Leaf', 'Matt'),
      ('Bronze Gold Leaf', 'Matt'),
      ('Nordic Oak', 'Woodmatt'),
      ('Angora Oak', 'Woodmatt'),
      ('Coastal Oak', 'Woodmatt'),
      ('Casentino Beech', 'Woodmatt'),
      ('Palace Teak', 'Woodmatt'),
      ('Tasmanian Oak', 'Woodmatt'),
      ('Tasmanian Oak', 'Matt'),
      ('Prime Oak', 'Woodmatt'),
      ('Prime Oak', 'Matt'),
      ('Antico Oak', 'Woodmatt'),
      ('Notaio Walnut', 'Woodmatt'),
      ('Notaio Walnut', 'Matt'),
      ('Florentine Walnut', 'Woodmatt'),
      ('Rojo Walnut', 'Woodmatt'),
      ('Havana Oak', 'Woodmatt'),
      ('Empire Oak', 'Woodmatt'),
      ('Empire Oak', 'Matt'),
      ('Estella Oak', 'Woodmatt'),
      ('Bottega Oak', 'Woodmatt'),
      ('Perugian Walnut', 'Woodmatt'),
      ('Designer White', 'Texture'),
      ('Polar White', 'Matt'),
      ('Polar White', 'Sheen'),
      ('Classic White', 'Texture'),
      ('Classic White', 'Sheen'),
      ('Classic White', 'Matt'),
      ('Classic White', 'Ashgrain'),
      ('White Cotton', 'Matt'),
      ('Blossom White', 'Matt'),
      ('Blossom White', 'Sheen'),
      ('Blossom White', 'Woodmatt'),
      ('White Mist', 'Matt'),
      ('White Mist', 'Sheen'),
      ('Whitewood', 'Matt'),
      ('Alabaster', 'Sheen'),
      ('Alabaster', 'Matt'),
      ('Parchment', 'Matt'),
      ('Porcelain', 'Matt'),
      ('Porcelain', 'Sheen'),
      ('New Antique White', 'Matt'),
      ('Antique', 'Matt'),
      ('Cafe Cream', 'Matt'),
      ('Silk', 'Woodmatt'),
      ('Silk', 'Matt'),
      ('Husk', 'Matt'),
      ('Moss Grey', 'Matt'),
      ('Moss Grey', 'Sheen'),
      ('Greige', 'Matt'),
      ('Avion Grey', 'Matt'),
      ('Oyster Grey', 'Matt'),
      ('Gesso Lini', 'Matt'),
      ('Crema Lini', 'Matt'),
      ('Tuross Oak', 'Matt'),
      ('Natural Oak', 'Matt'),
      ('Amaro', 'Matt'),
      ('Amaro', 'Sheen'),
      ('Malt', 'Matt'),
      ('Marni Lini', 'Matt'),
      ('Soft Walnut', 'Matt'),
      ('Bespoke', 'Woodmatt'),
      ('Marina Grey', 'Matt'),
      ('Tessuto Milan', 'Matt'),
      ('Maison Oak', 'Matt'),
      ('Rocco Lini', 'Matt'),
      ('Taupe', 'Matt'),
      ('Canterbury Grey', 'Matt'),
      ('Combat Teak', 'Matt'),
      ('Artisan Oak', 'Matt'),
      ('European Walnut', 'Matt'),
      ('Jamaican Walnut', 'Matt'),
      ('Belgian Oak', 'Matt'),
      ('Nouveau Grey', 'Matt'),
      ('Serene', 'Woodmatt'),
      ('Aluminium', 'Matt'),
      ('Nickel', 'Matt'),
      ('Stone Grey', 'Matt'),
      ('Stone Grey', 'Sheen'),
      ('Strata Grey', 'Matt'),
      ('Strata Grey', 'Sheen'),
      ('Titanium', 'Matt'),
      ('Char Oak', 'Matt'),
      ('Cavia Lini', 'Sheen'),
      ('Cavia Lini', 'Matt'),
      ('Feldspar Shimmer', 'Matt'),
      ('Truffle Lini', 'Matt'),
      ('Truffle Lini', 'Sheen'),
      ('Cinder', 'Matt'),
      ('Cinder', 'Woodmatt'),
      ('Graphite', 'Matt'),
      ('Shannon Oak', 'Matt'),
      ('Black Wenge', 'Matt'),
      ('Black', 'Texture'),
      ('Black', 'Matt'),
      ('Black', 'Woodmatt');

  select count(*) into expected from polytec_16mm_mto;

  select count(*) into matched
  from public.pcd_colour_library c
  join polytec_16mm_mto m
    on lower(trim(c.name)) = lower(m.name) and lower(trim(c.finish_type)) = lower(m.finish)
  where lower(c.material_type) = 'decorative board'
    and c.thickness = '16mm'
    and lower(c.supplier_name) like 'polytec%';

  if matched <> expected then
    raise exception 'Expected % library rows to match the list, found %. Nothing changed.', expected, matched;
  end if;

  update public.pcd_colour_library c
  set order_type  = 'supply board',
      order_types = array['supply board', 'made to order MTO']::text[],
      updated_at  = now()
  from polytec_16mm_mto m
  where lower(trim(c.name)) = lower(m.name) and lower(trim(c.finish_type)) = lower(m.finish)
    and lower(c.material_type) = 'decorative board'
    and c.thickness = '16mm'
    and lower(c.supplier_name) like 'polytec%';
  get diagnostics both_set = row_count;

  update public.pcd_colour_library c
  set order_type  = 'supply board',
      order_types = array['supply board']::text[],
      updated_at  = now()
  where lower(c.material_type) = 'decorative board'
    and c.thickness = '16mm'
    and lower(c.supplier_name) like 'polytec%'
    and lower(trim(c.finish_type)) <> 'raw'
    and not exists (
      select 1 from polytec_16mm_mto m
      where lower(trim(c.name)) = lower(m.name) and lower(trim(c.finish_type)) = lower(m.finish)
    );
  get diagnostics board_set = row_count;

  raise notice '% colours ticked supply board and made to order, % ticked supply board only.', both_set, board_set;
end $$;
