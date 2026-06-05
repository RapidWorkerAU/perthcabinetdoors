-- Match colour library rows to images in the public colour-tiles storage bucket.
--
-- Expected storage path shape:
--   material-folder/finish-folder/colour-name.ext
--
-- Examples:
--   decorative-board/woodmatt/Botany Oak.png
--   compact-laminate/matt/black.jpg
--   thermolaminate/smooth/Calacutta Doro.webp
--
-- This updates only rows where material + finish + colour name match.
-- Rows without a matching image are left unchanged.

begin;

with settings as (
  select
    'https://lvhoyhlypzgynmgglgvl.supabase.co'::text as supabase_url,
    'colour-tiles'::text as bucket_name
),
storage_files as (
  select
    objects.name as object_name,
    split_part(objects.name, '/', 1) as material_folder,
    split_part(objects.name, '/', 2) as finish_folder,
    regexp_replace(split_part(objects.name, '/', 3), '\.[^.]+$', '') as colour_file_name
  from storage.objects
  cross join settings
  where objects.bucket_id = settings.bucket_name
    and array_length(string_to_array(objects.name, '/'), 1) >= 3
    and objects.name !~ '/$'
    and split_part(objects.name, '/', 3) !~ '^\.(emptyFolderPlaceholder|keep)$'
),
normalised_storage_files as (
  select
    object_name,
    regexp_replace(lower(material_folder), '[^a-z0-9]+', '', 'g') as material_key,
    regexp_replace(lower(finish_folder), '[^a-z0-9]+', '', 'g') as finish_key,
    regexp_replace(lower(colour_file_name), '[^a-z0-9]+', '', 'g') as colour_key,
    row_number() over (
      partition by
        regexp_replace(lower(material_folder), '[^a-z0-9]+', '', 'g'),
        regexp_replace(lower(finish_folder), '[^a-z0-9]+', '', 'g'),
        regexp_replace(lower(colour_file_name), '[^a-z0-9]+', '', 'g')
      order by object_name
    ) as match_rank
  from storage_files
),
matched_images as (
  select
    colour_library.id,
    storage_files.object_name
  from public.pcd_colour_library colour_library
  join normalised_storage_files storage_files
    on storage_files.match_rank = 1
   and storage_files.material_key = regexp_replace(lower(colour_library.material_type), '[^a-z0-9]+', '', 'g')
   and storage_files.finish_key = regexp_replace(lower(colour_library.finish_type), '[^a-z0-9]+', '', 'g')
   and storage_files.colour_key = regexp_replace(lower(colour_library.name), '[^a-z0-9]+', '', 'g')
)
update public.pcd_colour_library colour_library
set
  image_path = matched_images.object_name,
  image_url = settings.supabase_url
    || '/storage/v1/object/public/'
    || settings.bucket_name
    || '/'
    || replace(matched_images.object_name, ' ', '%20'),
  updated_at = timezone('utc', now())
from matched_images
cross join settings
where colour_library.id = matched_images.id;

commit;

-- Check how many colour rows now have matched images:
-- select count(*) as matched_image_rows
-- from public.pcd_colour_library
-- where image_path is not null and image_path <> '';

-- Check rows still missing images:
-- select material_type, thickness, finish_type, name
-- from public.pcd_colour_library
-- where image_path is null or image_path = ''
-- order by material_type, thickness, finish_type, name;
