-- Generated from Polytec thermolaminated doors & panels colour screenshots.
-- Inserts Polytec thermolaminate Made to Order rows for both 18mm and 21mm.
-- Image fields and costs are intentionally left blank/defaulted.

begin;

with thicknesses (thickness, thickness_sort_offset) as (
  values
  ('18mm', 0),
  ('21mm', 1000)
),
colour_rows (finish_type, name, base_sort_order) as (
  values
  ('Woodmatt', 'Blonde Oak', 1),
  ('Woodmatt', 'Ecru Oak', 2),
  ('Woodmatt', 'Boston Oak', 3),
  ('Woodmatt', 'Laurel Oak', 4),
  ('Woodmatt', 'Botany Oak', 5),
  ('Woodmatt', 'Manor Oak', 6),
  ('Woodmatt', 'Hazel Oak', 7),
  ('Woodmatt', 'Society Oak', 8),
  ('Woodmatt', 'District Oak', 9),
  ('Woodmatt', 'Bronzed Oak', 10),
  ('Woodmatt', 'Rubra Oak', 11),
  ('Woodmatt', 'Blackened Oak', 12),
  ('Woodmatt', 'Ligurian Walnut', 13),
  ('Woodmatt', 'Coastal Oak', 14),
  ('Woodmatt', 'Tasmanian Oak', 15),
  ('Woodmatt', 'Prime Oak', 16),
  ('Woodmatt', 'Florentine Walnut', 17),
  ('Woodmatt', 'Estella Oak', 18),
  ('Woodmatt', 'Bottega Oak', 19),
  ('Matt', 'Britannia', 20),
  ('Matt', 'Ultra White', 21),
  ('Matt', 'Classic White', 22),
  ('Matt', 'Blossom White', 23),
  ('Matt', 'Antique', 24),
  ('Smooth', 'Aston White', 25),
  ('Smooth', 'Gossamer White', 26),
  ('Smooth', 'Verdelho', 27),
  ('Smooth', 'Pallido', 28),
  ('Smooth', 'Elemental Grey', 29),
  ('Smooth', 'Agave', 30),
  ('Smooth', 'Topiary', 31),
  ('Smooth', 'Oasis', 32),
  ('Smooth', 'Forage', 33),
  ('Smooth', 'Mercurio Grey', 34),
  ('Smooth', 'Habitat', 35),
  ('Smooth', 'Ferro', 36),
  ('Smooth', 'Adriatic', 37),
  ('Smooth', 'Botanic', 38),
  ('Smooth', 'Alabaster', 39),
  ('Smooth', 'Porcelain', 40),
  ('Smooth', 'Cafe Cream', 41),
  ('Smooth', 'Greige', 42),
  ('Smooth', 'Oyster Grey', 43),
  ('Smooth', 'Amaro', 44),
  ('Smooth', 'Malt', 45),
  ('Smooth', 'Taupe', 46),
  ('Smooth', 'Canterbury Grey', 47),
  ('Smooth', 'Nouveau Grey', 48),
  ('Smooth', 'Stone Grey', 49),
  ('Smooth', 'Strata Grey', 50),
  ('Smooth', 'Cinder', 51),
  ('Smooth', 'Black', 52),
  ('Gloss', 'Ultra White', 53),
  ('Gloss', 'Classic White', 54),
  ('Gloss', 'Regal White Pearl', 55),
  ('Gloss', 'Alabaster', 56),
  ('Gloss', 'Porcelain', 57),
  ('Gloss', 'New Antique White', 58),
  ('Gloss', 'Amaro', 59),
  ('Gloss', 'Malt', 60),
  ('Gloss', 'Vittoria Pearl', 61),
  ('Gloss', 'Silver Metallic', 62),
  ('Gloss', 'Stone Grey', 63),
  ('Texture', 'Ultra White', 64),
  ('Texture', 'Designer White', 65),
  ('Texture', 'Classic White', 66),
  ('Texture', 'Porcelain', 67),
  ('Texture', 'Malt', 68),
  ('Ashgrain', 'Classic White', 69),
  ('Ravine', 'Light Oak', 70),
  ('Ravine', 'Chateau Oak', 71),
  ('Natura', 'Grey Oak', 72),
  ('Natura', 'Black', 73),
  ('Woodgrain', 'Tempest', 74)
),
input_rows as (
  select
    'Polytec'::text as supplier_name,
    'thermolaminate'::text as material_type,
    thicknesses.thickness,
    colour_rows.finish_type,
    colour_rows.name,
    'made to order MTO'::text as order_type,
    array['made to order MTO']::text[] as order_types,
    true as is_active,
    colour_rows.base_sort_order + thicknesses.thickness_sort_offset as sort_order
  from colour_rows
  cross join thicknesses
)
insert into public.pcd_colour_library (
  supplier_name,
  material_type,
  thickness,
  finish_type,
  name,
  order_type,
  order_types,
  is_active,
  sort_order
)
select
  supplier_name,
  material_type,
  thickness,
  finish_type,
  name,
  order_type,
  order_types,
  is_active,
  sort_order
from input_rows incoming
where not exists (
  select 1
  from public.pcd_colour_library existing
  where lower(trim(existing.supplier_name)) = lower(trim(incoming.supplier_name))
    and lower(trim(existing.material_type)) = lower(trim(incoming.material_type))
    and lower(trim(coalesce(existing.thickness, ''))) = lower(trim(coalesce(incoming.thickness, '')))
    and lower(trim(existing.finish_type)) = lower(trim(incoming.finish_type))
    and lower(trim(existing.name)) = lower(trim(incoming.name))
);

commit;

-- Unique colour/finish rows prepared per thickness: 74
-- Total rows prepared: 148
