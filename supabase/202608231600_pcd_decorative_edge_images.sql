-- THE 1mm BEVEL EDGE HAD NO PHOTO, AND THE SQUARE EDGE ONLY HAD ONE BY LUCK.
--
-- ── WHAT WAS HAPPENING ──────────────────────────────────────────────────────
--
-- Both decorative board edge rows were seeded with image_url = null. With
-- nothing recorded, every screen fell back to guessing a filename from the
-- profile's name:
--
--   "1mm Square Edge"  ->  1mm-square-edge.png   which is what the file is
--   "1mm Bevel Edge"   ->  1mm-bevel-edge.png    but the file is bevel-edge.png
--
-- So the square edge appeared and the bevel did not, and the difference was
-- nothing to do with either of them: one name happened to match its file and
-- the other did not. Both photos have been sitting in the bucket all along.
--
-- ── WHY FILL THE COLUMN RATHER THAN FIX THE GUESS ───────────────────────────
--
-- The guess is fixed too, in lib/pcd-profile-images.js, because a null still has
-- to fall back to something sensible. But a rule that turns a name into a
-- filename is a rule with exceptions, and every exception has to be repeated
-- everywhere the rule is written down. There were five copies of it.
--
-- Recording the URL ends the guessing for these two: the library says where the
-- photo is, and nothing has to work it out.
--
-- The eleven Thermolaminate edge rows are left alone. They carry working local
-- paths and changing them today buys nothing.

update pcd_profile_library
set image_url = 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/1mm-square-edge.png'
where kind = 'edge'
  and supplier_name ilike 'polytec'
  and name = '1mm Square Edge'
  and image_url is null;

update pcd_profile_library
set image_url = 'https://lvhoyhlypzgynmgglgvl.supabase.co/storage/v1/object/public/polytec-edge-profies/bevel-edge.png'
where kind = 'edge'
  and supplier_name ilike 'polytec'
  and name = '1mm Bevel Edge'
  and image_url is null;

-- Both were verified as HTTP 200 on 2026-08-23. The bucket name really is
-- "polytec-edge-profies": the typo is in the bucket itself, so correcting it
-- here would point at a bucket that does not exist.
do $$
declare
  missing integer;
begin
  select count(*) into missing
  from pcd_profile_library
  where kind = 'edge'
    and category = 'Decorative Board'
    and coalesce(image_url, '') = '';

  if missing > 0 then
    raise exception 'A decorative board edge still has no photo recorded. Expected both to be filled.';
  end if;
end $$;
