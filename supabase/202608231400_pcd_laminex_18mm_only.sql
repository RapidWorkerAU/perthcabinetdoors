-- LAMINEX PROFILES ARE 18mm ONLY, and the library still says otherwise.
--
-- ── WHAT HAPPENED ───────────────────────────────────────────────────────────
--
-- 202608231000_pcd_profile_library.sql seeds every Laminex row with
-- available_21mm = false, which is correct: the FormWrap technical data sheet
-- lists 18mm substrate only. But that file ends with
--
--   on conflict (kind, supplier_name, name) do nothing;
--
-- and the rows were already in the table from an earlier run that had them at
-- 21mm. "do nothing" did exactly that. The seed reads right and the data is
-- wrong, which is the worst of the two, because anyone checking the seed to see
-- what the library holds gets the wrong answer.
--
-- Confirmed against the live table on 2026-08-23: all 27 Laminex door profiles
-- carry available_21mm = true.
--
-- ── WHY IT MATTERS ──────────────────────────────────────────────────────────
--
-- The public quote form, the quote editor and the variation editor all narrow
-- the front profile list by thickness now. A 21mm Laminex line offers 27
-- profiles it cannot be made in, and nothing downstream disagrees: the quote
-- prints a real profile against a real colour, the order carries it, the
-- production sheet prints it, and the wrap fails at the press.
--
-- ── WHY AN UPDATE AND NOT A RESEED ──────────────────────────────────────────
--
-- Only this one column is known wrong. A reseed would also overwrite any photo
-- or category somebody has since corrected by hand in the profile library
-- screen, which is the whole point of having that screen.

update pcd_profile_library
set available_21mm = false
where supplier_name ilike 'laminex'
  and kind = 'door'
  and available_21mm is distinct from false;

-- Every Laminex profile must be available in SOMETHING, or the update above has
-- quietly emptied the range instead of narrowing it.
do $$
declare
  stranded integer;
begin
  select count(*) into stranded
  from pcd_profile_library
  where supplier_name ilike 'laminex'
    and kind = 'door'
    and coalesce(available_18mm, false) = false
    and coalesce(available_21mm, false) = false;

  if stranded > 0 then
    raise exception 'Laminex has % profiles available in no thickness at all. Refusing to leave the library in that state.', stranded;
  end if;
end $$;
