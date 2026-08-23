-- THE PROFILE LIBRARY.
--
-- WHY. Door profiles and edge profiles were hardcoded lists in the application:
-- lib/quote-form-data.js for the Polytec range and lib/pcd-laminex-profiles.js
-- for the Laminex one. Adding a profile, retiring one, or fixing a photo meant a
-- code change and a deploy, which is not how the colour library works and not
-- how this should either.
--
-- This is the same shape as pcd_colour_library: a row per profile, with the
-- supplier, the category it belongs to, its name and its image.
--
-- ── DOOR PROFILES AND EDGE PROFILES IN ONE TABLE ─────────────────────────────
--
-- `kind` separates them. They are the same kind of record with the same four
-- facts, so two near-identical tables and two near-identical screens would be
-- two places to keep in step for no gain.
--
-- ── WHICH BOARD A PROFILE CAN BE MADE IN ─────────────────────────────────────
--
-- Both thicknesses are recorded per profile, because the two ranges restrict in
-- OPPOSITE directions and neither restriction can be inferred from the other.
--
--   Polytec  Thirteen profiles are 21mm ONLY: the ten Detailed names and the
--            three Fluted ones. That has always been real business data living
--            in a hardcoded object.
--
--   Laminex  Every profile is 18mm ONLY. The FormWrap technical data sheet
--            (version 2, 08/2019) gives a nominal thickness of 18mm and lists
--            no other, so none of the 27 can be quoted in 21mm.
--
-- WORTH CHECKING: that data sheet covers FormWrap. Several Laminex profiles are
-- also offered in ColourTech, and no ColourTech sheet was seen when this was
-- written. All 27 are seeded 18mm only on the FormWrap figure. If ColourTech
-- offers 21mm, tick it on those profiles in the admin, which is the whole reason
-- this is a library row and not a hardcoded list.
--
-- ── WHAT IS SEEDED ───────────────────────────────────────────────────────────
--
-- All 150 rows, generated from the code that is live today, so the library and
-- the site agree from the first minute rather than after somebody reconciles
-- them. 137 Polytec door profiles, 27 Laminex door profiles are inside that
-- count, plus 11 Polytec thermolaminate edges and 2 decorative board edges.
--
-- Laminex has no edge profiles. That is a fact about the range, not a gap.

create table if not exists public.pcd_profile_library (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'door' check (kind in ('door', 'edge')),
  supplier_name  text not null default 'Polytec',
  category       text not null,
  name           text not null,
  image_url      text,
  -- Uploaded images live in storage; a seeded one points at /public. Kept apart
  -- so a re-seed cannot orphan a file somebody uploaded by hand.
  image_path     text,
  -- Which board a profile can be routed into. Both true is the normal case.
  available_18mm boolean not null default true,
  available_21mm boolean not null default true,
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  notes          text,
  created_at     timestamptz not null default timezone('utc', now()),
  updated_at     timestamptz not null default timezone('utc', now())
);

-- One profile of one kind per supplier. "Country Square" exists in BOTH the
-- Polytec and the Laminex ranges, so the name alone cannot be unique: it is the
-- supplier that separates them, which is the whole reason this table records it.
create unique index if not exists pcd_profile_library_unique_idx
  on public.pcd_profile_library(kind, supplier_name, name);

create index if not exists pcd_profile_library_active_idx
  on public.pcd_profile_library(kind, supplier_name, category)
  where is_active;

comment on column public.pcd_profile_library.kind is
  'door or edge. Both are profiles with a supplier, a category, a name and an image, so they share one table rather than two that have to be kept in step.';
comment on column public.pcd_profile_library.category is
  'The group the profile belongs to. Polytec doors use shape families (Minimal, Soft, Sharp, Detailed, Fluted); Laminex doors use its published series; edges use the board type they suit.';
comment on column public.pcd_profile_library.available_18mm is
  'False for the thirteen Polytec profiles only made in 21mm board. Real business data that used to be hardcoded.';

drop trigger if exists trg_pcd_profile_library_updated_at on public.pcd_profile_library;
create trigger trg_pcd_profile_library_updated_at
  before update on public.pcd_profile_library
  for each row execute function public.set_updated_at_timestamp();

-- ---------------------------------------------------------------------------
-- SEED. Safe to run twice: an existing row is left exactly as it is, so a photo
-- swapped or a profile retired in the admin is never undone by re-running this.
-- ---------------------------------------------------------------------------
insert into public.pcd_profile_library
  (kind, supplier_name, category, name, image_url, available_18mm, available_21mm, is_active, sort_order)
values
  ('door', 'Polytec', 'Minimal', 'Brussels', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/minimal/brussels.jpg', true, true, true, 0),
  ('door', 'Polytec', 'Minimal', 'Guilford', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/minimal/guilford.jpg', true, true, true, 1),
  ('door', 'Polytec', 'Minimal', 'Hamilton', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/minimal/hamilton.jpg', true, true, true, 2),
  ('door', 'Polytec', 'Minimal', 'Kiama', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/minimal/kiama.jpg', true, true, true, 3),
  ('door', 'Polytec', 'Minimal', 'Kunda', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/minimal/kunda.jpg', true, true, true, 4),
  ('door', 'Polytec', 'Minimal', 'Manchester', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/minimal/manchester.jpg', true, true, true, 5),
  ('door', 'Polytec', 'Minimal', 'Munich', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/minimal/munich.jpg', true, true, true, 6),
  ('door', 'Polytec', 'Minimal', 'Napoli', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/minimal/napoli.jpg', true, true, true, 7),
  ('door', 'Polytec', 'Minimal', 'Paterson', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/minimal/paterson.jpg', true, true, true, 8),
  ('door', 'Polytec', 'Minimal', 'Sanda', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/minimal/sanda.jpg', true, true, true, 9),
  ('door', 'Polytec', 'Minimal', 'Softline', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/minimal/softline.jpg', true, true, true, 10),
  ('door', 'Polytec', 'Minimal', 'Vienna', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/minimal/vienna.jpg', true, true, true, 11),
  ('door', 'Polytec', 'Soft', 'Albury', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/albury.jpg', true, true, true, 12),
  ('door', 'Polytec', 'Soft', 'Auckland', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/auckland.jpg', true, true, true, 13),
  ('door', 'Polytec', 'Soft', 'Bathurst', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/bathurst.jpg', true, true, true, 14),
  ('door', 'Polytec', 'Soft', 'Bega', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/bega.jpg', true, true, true, 15),
  ('door', 'Polytec', 'Soft', 'Bendigo', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/bendigo.jpg', true, true, true, 16),
  ('door', 'Polytec', 'Soft', 'Calcutta', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/calcutta.jpg', true, true, true, 17),
  ('door', 'Polytec', 'Soft', 'Cleveland', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/cleveland.jpg', true, true, true, 18),
  ('door', 'Polytec', 'Soft', 'Cooma', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/cooma.jpg', true, true, true, 19),
  ('door', 'Polytec', 'Soft', 'Croydon', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/croydon.jpg', true, true, true, 20),
  ('door', 'Polytec', 'Soft', 'Dorrigo', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/dorrigo.jpg', true, true, true, 21),
  ('door', 'Polytec', 'Soft', 'Hanoi', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/hanoi.jpg', true, true, true, 22),
  ('door', 'Polytec', 'Soft', 'Lithgow', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/lithgow.jpg', true, true, true, 23),
  ('door', 'Polytec', 'Soft', 'Longreach', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/longreach.jpg', true, true, true, 24),
  ('door', 'Polytec', 'Soft', 'Madrid', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/madrid.jpg', true, true, true, 25),
  ('door', 'Polytec', 'Soft', 'Maroochydore', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/maroochydore.jpg', true, true, true, 26),
  ('door', 'Polytec', 'Soft', 'Mildura', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/mildura.jpg', true, true, true, 27),
  ('door', 'Polytec', 'Soft', 'Molong', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/molong.jpg', true, true, true, 28),
  ('door', 'Polytec', 'Soft', 'Mona Vale', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/mona-vale.jpg', true, true, true, 29),
  ('door', 'Polytec', 'Soft', 'Monterey', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/monterey.jpg', true, true, true, 30),
  ('door', 'Polytec', 'Soft', 'Mudgee', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/mudgee.jpg', true, true, true, 31),
  ('door', 'Polytec', 'Soft', 'Parkes', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/parkes.jpg', true, true, true, 32),
  ('door', 'Polytec', 'Soft', 'Portsea', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/portsea.jpg', true, true, true, 33),
  ('door', 'Polytec', 'Soft', 'Preston', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/preston.jpg', true, true, true, 34),
  ('door', 'Polytec', 'Soft', 'Swan', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/swan.jpg', true, true, true, 35),
  ('door', 'Polytec', 'Soft', 'Teralba', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/teralba.jpg', true, true, true, 36),
  ('door', 'Polytec', 'Soft', 'Torino', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/torino.jpg', true, true, true, 37),
  ('door', 'Polytec', 'Soft', 'Wellington', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/wellington.jpg', true, true, true, 38),
  ('door', 'Polytec', 'Soft', 'Yass', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/soft/yass.jpg', true, true, true, 39),
  ('door', 'Polytec', 'Sharp', 'Amsterdam', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/amsterdam.jpg', true, true, true, 40),
  ('door', 'Polytec', 'Sharp', 'Argentina', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/argentina.jpg', true, true, true, 41),
  ('door', 'Polytec', 'Sharp', 'Atlanta', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/atlanta.jpg', true, true, true, 42),
  ('door', 'Polytec', 'Sharp', 'Bali', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/bali.jpg', true, true, true, 43),
  ('door', 'Polytec', 'Sharp', 'Bari', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/bari.jpg', true, true, true, 44),
  ('door', 'Polytec', 'Sharp', 'Beirut', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/beirut.jpg', true, true, true, 45),
  ('door', 'Polytec', 'Sharp', 'Broadway', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/broadway.jpg', true, true, true, 46),
  ('door', 'Polytec', 'Sharp', 'Calcutta 35', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/calcutta-35.jpg', true, true, true, 47),
  ('door', 'Polytec', 'Sharp', 'Cambridge', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/cambridge.jpg', true, true, true, 48),
  ('door', 'Polytec', 'Sharp', 'Carlton', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/carlton.jpg', true, true, true, 49),
  ('door', 'Polytec', 'Sharp', 'Chesterfield', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/chesterfield.jpg', true, true, true, 50),
  ('door', 'Polytec', 'Sharp', 'Christchurch', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/christchurch.jpg', true, true, true, 51),
  ('door', 'Polytec', 'Sharp', 'Colombo', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/colombo.jpg', true, true, true, 52),
  ('door', 'Polytec', 'Sharp', 'Copenhagen', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/copenhagen.jpg', true, true, true, 53),
  ('door', 'Polytec', 'Sharp', 'Dublin', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/dublin.jpg', true, true, true, 54),
  ('door', 'Polytec', 'Sharp', 'Edinburgh', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/edinburgh.jpg', true, true, true, 55),
  ('door', 'Polytec', 'Sharp', 'Leon', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/leon.jpg', true, true, true, 56),
  ('door', 'Polytec', 'Sharp', 'Lima', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/lima.jpg', true, true, true, 57),
  ('door', 'Polytec', 'Sharp', 'Prague', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/prague.jpg', true, true, true, 58),
  ('door', 'Polytec', 'Sharp', 'Rio', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/rio.jpg', true, true, true, 59),
  ('door', 'Polytec', 'Sharp', 'Seoul', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/seoul.jpg', true, true, true, 60),
  ('door', 'Polytec', 'Sharp', 'Tokyo', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/tokyo.jpg', true, true, true, 61),
  ('door', 'Polytec', 'Sharp', 'Valencia', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/valencia.jpg', true, true, true, 62),
  ('door', 'Polytec', 'Sharp', 'Washington', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/sharp/washington.jpg', true, true, true, 63),
  ('door', 'Polytec', 'Detailed', 'Ascot', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/ascot.jpg', true, true, true, 64),
  ('door', 'Polytec', 'Detailed', 'Ballarat', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/ballarat.jpg', true, true, true, 65),
  ('door', 'Polytec', 'Detailed', 'Bayswater', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/bayswater.jpg', true, true, true, 66),
  ('door', 'Polytec', 'Detailed', 'Berrilee', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/berrilee.jpg', true, true, true, 67),
  ('door', 'Polytec', 'Detailed', 'Berrima', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/berrima.jpg', true, true, true, 68),
  ('door', 'Polytec', 'Detailed', 'Bowral', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/bowral.jpg', true, true, true, 69),
  ('door', 'Polytec', 'Detailed', 'Broome', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/broome.jpg', true, true, true, 70),
  ('door', 'Polytec', 'Detailed', 'Calcutta 10', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/calcutta-10.jpg', true, true, true, 71),
  ('door', 'Polytec', 'Detailed', 'Calcutta 25', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/calcutta-25.jpg', true, true, true, 72),
  ('door', 'Polytec', 'Detailed', 'Cammeray', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/cammeray.jpg', true, true, true, 73),
  ('door', 'Polytec', 'Detailed', 'Casino', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/casino.jpg', true, true, true, 74),
  ('door', 'Polytec', 'Detailed', 'Chifley', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/chifley.jpg', true, true, true, 75),
  ('door', 'Polytec', 'Detailed', 'Classic Square', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/classic-square.jpg', true, true, true, 76),
  ('door', 'Polytec', 'Detailed', 'Country Square', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/country-square.jpg', true, true, true, 77),
  ('door', 'Polytec', 'Detailed', 'Dural', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/dural.jpg', true, true, true, 78),
  ('door', 'Polytec', 'Detailed', 'Farmhouse', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/farmhouse.jpg', true, true, true, 79),
  ('door', 'Polytec', 'Detailed', 'Farnborough', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/farnborough.jpg', true, true, true, 80),
  ('door', 'Polytec', 'Detailed', 'Federation', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/federation.jpg', true, true, true, 81),
  ('door', 'Polytec', 'Detailed', 'Gerroa', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/gerroa.jpg', true, true, true, 82),
  ('door', 'Polytec', 'Detailed', 'Grafton', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/grafton.jpg', true, true, true, 83),
  ('door', 'Polytec', 'Detailed', 'Hampton', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/hampton.jpg', true, true, true, 84),
  ('door', 'Polytec', 'Detailed', 'Jersey', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/jersey.jpg', true, true, true, 85),
  ('door', 'Polytec', 'Detailed', 'Lismore', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/lismore.jpg', true, true, true, 86),
  ('door', 'Polytec', 'Detailed', 'Macquarie', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/macquarie.jpg', true, true, true, 87),
  ('door', 'Polytec', 'Detailed', 'Mallee', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/mallee.jpg', true, true, true, 88),
  ('door', 'Polytec', 'Detailed', 'Manhattan', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/manhattan.jpg', true, true, true, 89),
  ('door', 'Polytec', 'Detailed', 'Oberon', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/oberon.jpg', true, true, true, 90),
  ('door', 'Polytec', 'Detailed', 'Patonga', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/patonga.jpg', true, true, true, 91),
  ('door', 'Polytec', 'Detailed', 'Stratford', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/stratford.jpg', true, true, true, 92),
  ('door', 'Polytec', 'Detailed', 'Sussex', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/sussex.jpg', true, true, true, 93),
  ('door', 'Polytec', 'Detailed', 'Tamworth', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/tamworth.jpg', true, true, true, 94),
  ('door', 'Polytec', 'Detailed', 'Valla', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/valla.jpg', true, true, true, 95),
  ('door', 'Polytec', 'Detailed', 'Woongarrah', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-profiles/detailed/woongarrah.jpg', true, true, true, 96),
  ('door', 'Polytec', 'Detailed', 'Allandale', null, false, true, true, 97),
  ('door', 'Polytec', 'Detailed', 'Branxton', null, false, true, true, 98),
  ('door', 'Polytec', 'Detailed', 'Briar', null, false, true, true, 99),
  ('door', 'Polytec', 'Detailed', 'Chiswick 12', null, false, true, true, 100),
  ('door', 'Polytec', 'Detailed', 'Chiswick 6', null, false, true, true, 101),
  ('door', 'Polytec', 'Detailed', 'Hampshire', null, false, true, true, 102),
  ('door', 'Polytec', 'Detailed', 'Keimbah', null, false, true, true, 103),
  ('door', 'Polytec', 'Detailed', 'Malabar', null, false, true, true, 104),
  ('door', 'Polytec', 'Detailed', 'Pokolbin', null, false, true, true, 105),
  ('door', 'Polytec', 'Detailed', 'Rothbury', null, false, true, true, 106),
  ('door', 'Polytec', 'Fluted', 'Cove 25', null, false, true, true, 107),
  ('door', 'Polytec', 'Fluted', 'Cove 50', null, false, true, true, 108),
  ('door', 'Polytec', 'Fluted', 'Peak', null, false, true, true, 109),
  ('door', 'Laminex', 'Series 1: Flat Face Doors', 'Classic', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-1/Classic-Square-Edge.png', true, false, true, 110),
  ('door', 'Laminex', 'Series 1: Flat Face Doors', 'Soft Bevelled Edge', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-1/CT-Soft-Bevelled-Edge.jpg', true, false, true, 111),
  ('door', 'Laminex', 'Series 2: Recessed Handles and Face Routered Doors', 'Finger Pull', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-2/Finger-Pull.png', true, false, true, 112),
  ('door', 'Laminex', 'Series 2: Recessed Handles and Face Routered Doors', 'Chicago', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-2/Chicago.jpg', true, false, true, 113),
  ('door', 'Laminex', 'Series 2: Recessed Handles and Face Routered Doors', 'Colonial Square', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-2/Colonial-Square-FW.png', true, false, true, 114),
  ('door', 'Laminex', 'Series 2: Recessed Handles and Face Routered Doors', 'Country Square', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-2/Country-Square-FW.jpg', true, false, true, 115),
  ('door', 'Laminex', 'Series 2: Recessed Handles and Face Routered Doors', 'Country V', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-2/Country-V.jpg', true, false, true, 116),
  ('door', 'Laminex', 'Series 2: Recessed Handles and Face Routered Doors', 'Homestead', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-2/Homestead.png', true, false, true, 117),
  ('door', 'Laminex', 'Series 2: Recessed Handles and Face Routered Doors', 'Metro', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-2/Metro.jpg', true, false, true, 118),
  ('door', 'Laminex', 'Series 2: Recessed Handles and Face Routered Doors', 'Newport', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-2/Newport-CT.jpg', true, false, true, 119),
  ('door', 'Laminex', 'Series 3: Pocket Routered Doors', 'Nostalgia Soft Arch', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-3/Nostalgia-Soft-Arch.png', true, false, true, 120),
  ('door', 'Laminex', 'Series 3: Pocket Routered Doors', 'Nostalgia Square', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-3/Nostalgia-Square.png', true, false, true, 121),
  ('door', 'Laminex', 'Series 3: Pocket Routered Doors', 'Nouvo', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-3/Nouvo.jpg', true, false, true, 122),
  ('door', 'Laminex', 'Series 3: Pocket Routered Doors', 'Settler', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-3/Settler-FW.png', true, false, true, 123),
  ('door', 'Laminex', 'Series 3: Pocket Routered Doors', 'Settler Planked', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-3/Settler-Planked-FW.png', true, false, true, 124),
  ('door', 'Laminex', 'Series 3: Pocket Routered Doors', 'Settler 10', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-3/settler-10mm.jpg', true, false, true, 125),
  ('door', 'Laminex', 'Series 3: Pocket Routered Doors', 'Settler 20', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-3/settler-20mm.jpg', true, false, true, 126),
  ('door', 'Laminex', 'Series 3: Pocket Routered Doors', 'Settler 40', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-3/settler-40mm.jpg', true, false, true, 127),
  ('door', 'Laminex', 'Series 3: Pocket Routered Doors', 'Shaker', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series-3/Shaker-FW.png', true, false, true, 128),
  ('door', 'Laminex', 'Glazed Door Frames', '1 Pane Arch', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series4/1-Arch-1-Pane.png', true, false, true, 129),
  ('door', 'Laminex', 'Glazed Door Frames', '2 Pane Arch', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series4/2-Pane-Horizontal-Arch.jpg', true, false, true, 130),
  ('door', 'Laminex', 'Glazed Door Frames', '4 Pane Arch', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series4/4-Arch-1-Pane.png', true, false, true, 131),
  ('door', 'Laminex', 'Glazed Door Frames', '1 Pane Square', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series4/1-Pane-Square.png', true, false, true, 132),
  ('door', 'Laminex', 'Glazed Door Frames', '2 Pane Square', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series4/2-Pane-Square.png', true, false, true, 133),
  ('door', 'Laminex', 'Glazed Door Frames', '4 Pane Square', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/series4/4-Pane-Square.png', true, false, true, 134),
  ('door', 'Laminex', 'Drawers & Accessories', 'Drawer Bank', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/drawers-accessories/Drawer-Bank.jpg', true, false, true, 135),
  ('door', 'Laminex', 'Drawers & Accessories', 'Drawer Set', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/laminex-profiles/drawers-accessories/Drawer-Set.jpg', true, false, true, 136),
  ('edge', 'Polytec', 'Thermolaminate', 'EM0 Square', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/em0-square.png', true, true, true, 137),
  ('edge', 'Polytec', 'Thermolaminate', 'EM1 6mm Pencil Round', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/em1-6mm-pencil-round.png', true, true, true, 138),
  ('edge', 'Polytec', 'Thermolaminate', 'EM12 Small Chamfer', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/em12-small-chamfer.png', true, true, true, 139),
  ('edge', 'Polytec', 'Thermolaminate', 'EM2 Thumb Mould', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/em2-thumb-mould.png', true, true, true, 140),
  ('edge', 'Polytec', 'Thermolaminate', 'EM3 Large Bevel', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/em3-large-bevel.png', true, true, true, 141),
  ('edge', 'Polytec', 'Thermolaminate', 'EM4 Step Pencil Round', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/em4-step-pencil-round.png', true, true, true, 142),
  ('edge', 'Polytec', 'Thermolaminate', 'EM5 Step Bevel', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/em5-step-bevel.png', true, true, true, 143),
  ('edge', 'Polytec', 'Thermolaminate', 'EM6 Roman', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/em6-roman.png', true, true, true, 144),
  ('edge', 'Polytec', 'Thermolaminate', 'EM7 Small Bevel', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/em7-small-bevel.png', true, true, true, 145),
  ('edge', 'Polytec', 'Thermolaminate', 'EM8 Softline', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/em8-softline.png', true, true, true, 146),
  ('edge', 'Polytec', 'Thermolaminate', 'EM9 3mm Pencil Round', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/em9-3mm-pencil-round.png', true, true, true, 147),
  ('edge', 'Polytec', 'Decorative Board', '1mm Square Edge', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/1mm-square-edge.png', true, true, true, 148),
  ('edge', 'Polytec', 'Decorative Board', '1mm Bevel Edge', 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/bevel-edge.png', true, true, true, 149)
on conflict (kind, supplier_name, name) do nothing;

do $$
declare
  doors int;
  edges int;
  laminex int;
  no_image int;
begin
  select count(*) into doors   from public.pcd_profile_library where kind = 'door';
  select count(*) into edges   from public.pcd_profile_library where kind = 'edge';
  select count(*) into laminex from public.pcd_profile_library where supplier_name = 'Laminex';
  select count(*) into no_image
    from public.pcd_profile_library
   where nullif(btrim(coalesce(image_url, '')), '') is null;

  raise notice 'Profile library: % door profiles, % edge profiles, % of them Laminex.', doors, edges, laminex;
  raise notice 'Without a photo: %. These are the 21mm-only profiles and the two decorative board tape edges, which have never had one.', no_image;
end $$;
