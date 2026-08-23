-- BRAND NAMES, SPELT THE ONE WAY.
--
-- pcd_colour_library held one supplier as 'formica' in lower case. It is a brand
-- name on a customer-facing tile, so it reached the finishes page, the IKEA
-- configurator and the quote form looking like a typo, and two public pages had
-- each grown their own little title-caser to hide it.
--
-- Worse than the look: the admin colour editor checks the stored value against
-- its list of brands and falls back to Polytec when it does not match. Opening
-- that Formica row to edit anything at all would have quietly re-saved it as a
-- Polytec board, with a Polytec cost behind it.
--
-- lib/pcd-colour-library.js now spells the name on the way in and on the way out
-- (normaliseSupplierName), so this cannot come back through the app. This fixes
-- what is already stored.
--
-- One do block, because the Supabase SQL editor pools connections and a script
-- that errors part way through has already committed what ran before it.

do $$
declare
  -- GET DIAGNOSTICS only ever assigns a diagnostic item, so it cannot add to
  -- the variable it is writing into. Each update lands in this one first and is
  -- added on by hand.
  touched int := 0;
  fixed_colours int := 0;
  fixed_profiles int := 0;
begin
  -- The three brands we sell. Anything else is left exactly as it is: an
  -- unrecognised name is somebody's real supplier, not a mistake to guess at.
  update pcd_colour_library
     set supplier_name = 'Polytec'
   where supplier_name is not null
     and supplier_name <> 'Polytec'
     and lower(btrim(supplier_name)) = 'polytec';
  get diagnostics touched = row_count;
  fixed_colours := fixed_colours + touched;

  update pcd_colour_library
     set supplier_name = 'Laminex'
   where supplier_name is not null
     and supplier_name <> 'Laminex'
     and lower(btrim(supplier_name)) = 'laminex';
  get diagnostics touched = row_count;
  fixed_colours := fixed_colours + touched;

  update pcd_colour_library
     set supplier_name = 'Formica'
   where supplier_name is not null
     and supplier_name <> 'Formica'
     and lower(btrim(supplier_name)) = 'formica';
  get diagnostics touched = row_count;
  fixed_colours := fixed_colours + touched;

  -- Whitespace is the other way a name stops matching.
  update pcd_colour_library
     set supplier_name = btrim(supplier_name)
   where supplier_name is not null
     and supplier_name <> btrim(supplier_name);
  get diagnostics touched = row_count;
  fixed_colours := fixed_colours + touched;

  -- The profile library keys off the same brand names, and its row cleaner has
  -- the same fall back to Polytec, so it gets the same treatment.
  update pcd_profile_library
     set supplier_name = 'Polytec'
   where supplier_name is not null
     and supplier_name <> 'Polytec'
     and lower(btrim(supplier_name)) = 'polytec';
  get diagnostics touched = row_count;
  fixed_profiles := fixed_profiles + touched;

  update pcd_profile_library
     set supplier_name = 'Laminex'
   where supplier_name is not null
     and supplier_name <> 'Laminex'
     and lower(btrim(supplier_name)) = 'laminex';
  get diagnostics touched = row_count;
  fixed_profiles := fixed_profiles + touched;

  update pcd_profile_library
     set supplier_name = btrim(supplier_name)
   where supplier_name is not null
     and supplier_name <> btrim(supplier_name);
  get diagnostics touched = row_count;
  fixed_profiles := fixed_profiles + touched;

  raise notice 'Colour library rows respelt: %', fixed_colours;
  raise notice 'Profile library rows respelt: %', fixed_profiles;
end $$;

-- What is left, so anything unrecognised is visible rather than assumed fixed.
select supplier_name, count(*) as colours
  from pcd_colour_library
 group by supplier_name
 order by colours desc;
