-- Match remaining colour library rows without images to files in colour-tiles/general.
--
-- Expected storage path shape:
--   general/colour-name.ext
--
-- This updates only rows where image_url/image_path are currently blank
-- and the normalised colour name matches a file in the general folder.
-- Rows without a matching image are left unchanged.

begin;

with settings as (
  select
    'https://lvhoyhlypzgynmgglgvl.supabase.co'::text as supabase_url,
    'colour-tiles'::text as bucket_name
),
general_files as (
  select
    objects.name as object_name,
    regexp_replace(split_part(objects.name, '/', 2), '\.[^.]+$', '') as colour_file_name
  from storage.objects
  cross join settings
  where objects.bucket_id = settings.bucket_name
    and split_part(objects.name, '/', 1) = 'general'
    and array_length(string_to_array(objects.name, '/'), 1) = 2
    and objects.name !~ '/$'
    and split_part(objects.name, '/', 2) !~ '^\.(emptyFolderPlaceholder|keep)$'
),
normalised_general_files as (
  select
    object_name,
    regexp_replace(lower(colour_file_name), '[^a-z0-9]+', '', 'g') as colour_key,
    row_number() over (
      partition by regexp_replace(lower(colour_file_name), '[^a-z0-9]+', '', 'g')
      order by object_name
    ) as match_rank
  from general_files
),
matched_images as (
  select
    colour_library.id,
    general_files.object_name
  from public.pcd_colour_library colour_library
  join normalised_general_files general_files
    on general_files.match_rank = 1
   and general_files.colour_key = regexp_replace(lower(colour_library.name), '[^a-z0-9]+', '', 'g')
  where coalesce(colour_library.image_url, '') = ''
    and coalesce(colour_library.image_path, '') = ''
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

-- Check remaining rows still missing images:
-- select material_type, thickness, finish_type, name
-- from public.pcd_colour_library
-- where coalesce(image_url, '') = ''
--   and coalesce(image_path, '') = ''
-- order by material_type, thickness, finish_type, name;
