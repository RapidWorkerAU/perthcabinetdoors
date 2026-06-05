-- Assign product images from the public products storage bucket.
--
-- Expected storage path shapes:
--   decorative-board/doors/image-name.jpg
--   decorative-board/drawers/image-name.jpg
--   decorative-board/panels/image-name.jpg
--   thermolaminate/doors/image-name.jpg
--   thermolaminate/drawers/image-name.jpg
--   thermolaminate/panels/image-name.jpg
--   compact-laminate/image-name.jpg
--
-- This intentionally:
--   - does not delete or update currently assigned product images
--   - skips IKEA-compatible products
--   - inserts up to 2 new images per eligible product
--   - avoids assigning the same image URL to the same product twice
--   - keeps each image URL used no more than 2 times total, including existing product_images usage
--
-- Re-runnable: existing product/image URL pairs are skipped.

begin;

with settings as (
  select
    'https://lvhoyhlypzgynmgglgvl.supabase.co'::text as supabase_url,
    'products'::text as bucket_name,
    2::integer as max_new_images_per_product,
    2::integer as max_total_uses_per_image
),
storage_images as (
  select
    objects.name as object_name,
    split_part(objects.name, '/', 1) as material_folder,
    case
      when array_length(string_to_array(objects.name, '/'), 1) >= 3 then split_part(objects.name, '/', 2)
      else ''
    end as type_folder,
    settings.supabase_url
      || '/storage/v1/object/public/'
      || settings.bucket_name
      || '/'
      || replace(objects.name, ' ', '%20') as image_url
  from storage.objects objects
  cross join settings
  where objects.bucket_id = settings.bucket_name
    and objects.name !~ '/$'
    and objects.name !~* '(^|/)(uploads|upload)/'
    and split_part(objects.name, '/', 1) in ('decorative-board', 'thermolaminate', 'compact-laminate')
    and split_part(objects.name, '/', array_length(string_to_array(objects.name, '/'), 1)) !~ '^\.(emptyFolderPlaceholder|keep)$'
),
normalised_storage_images as (
  select
    object_name,
    image_url,
    case regexp_replace(lower(material_folder), '[^a-z0-9]+', '', 'g')
      when 'decorativeboard' then 'decorative-board'
      when 'thermolaminate' then 'thermolaminate'
      when 'compactlaminate' then 'compact-laminate'
      else regexp_replace(lower(material_folder), '[^a-z0-9-]+', '', 'g')
    end as material_key,
    case
      when regexp_replace(lower(type_folder), '[^a-z0-9]+', '', 'g') in ('door', 'doors', 'cabinetdoor', 'cabinetdoors') then 'door'
      when regexp_replace(lower(type_folder), '[^a-z0-9]+', '', 'g') in ('drawer', 'drawers', 'drawerfront', 'drawerfronts') then 'drawer'
      when regexp_replace(lower(type_folder), '[^a-z0-9]+', '', 'g') in ('panel', 'panels') then 'panel'
      else ''
    end as type_key,
    row_number() over (
      partition by
        case regexp_replace(lower(material_folder), '[^a-z0-9]+', '', 'g')
          when 'decorativeboard' then 'decorative-board'
          when 'thermolaminate' then 'thermolaminate'
          when 'compactlaminate' then 'compact-laminate'
          else regexp_replace(lower(material_folder), '[^a-z0-9-]+', '', 'g')
        end,
        case
          when regexp_replace(lower(type_folder), '[^a-z0-9]+', '', 'g') in ('door', 'doors', 'cabinetdoor', 'cabinetdoors') then 'door'
          when regexp_replace(lower(type_folder), '[^a-z0-9]+', '', 'g') in ('drawer', 'drawers', 'drawerfront', 'drawerfronts') then 'drawer'
          when regexp_replace(lower(type_folder), '[^a-z0-9]+', '', 'g') in ('panel', 'panels') then 'panel'
          else ''
        end
      order by object_name
    ) as image_rank
  from storage_images
),
eligible_products as (
  select
    products.id,
    products.name,
    products.slug,
    coalesce(products.type, '') as product_type,
    coalesce(products.type_label, '') as type_label,
    coalesce(products.material, '') as material,
    coalesce(products.material_label, '') as material_label,
    case
      when lower(coalesce(products.material, '') || ' ' || coalesce(products.material_label, '') || ' ' || coalesce(products.name, '')) like '%thermolaminate%' then 'thermolaminate'
      when lower(coalesce(products.material, '') || ' ' || coalesce(products.material_label, '') || ' ' || coalesce(products.name, '')) like '%compact%' then 'compact-laminate'
      when lower(coalesce(products.material, '') || ' ' || coalesce(products.material_label, '') || ' ' || coalesce(products.name, '')) like '%decorative%'
        or lower(coalesce(products.material, '') || ' ' || coalesce(products.material_label, '') || ' ' || coalesce(products.name, '')) like '%16mm%'
        or lower(coalesce(products.material, '') || ' ' || coalesce(products.material_label, '') || ' ' || coalesce(products.name, '')) like '%18mm%' then 'decorative-board'
      else ''
    end as material_key,
    case
      when lower(coalesce(products.type, '') || ' ' || coalesce(products.type_label, '') || ' ' || coalesce(products.name, '')) like '%drawer%' then 'drawer'
      when lower(coalesce(products.type, '') || ' ' || coalesce(products.type_label, '') || ' ' || coalesce(products.name, '')) like '%panel%' then 'panel'
      when lower(coalesce(products.type, '') || ' ' || coalesce(products.type_label, '') || ' ' || coalesce(products.name, '')) like '%door%' then 'door'
      else ''
    end as type_key,
    coalesce(
      (
        select max(product_images.sort_order)
        from public.product_images product_images
        where product_images.product_id = products.id
      ),
      -1
    ) as existing_max_sort_order,
    exists (
      select 1
      from public.product_images product_images
      where product_images.product_id = products.id
        and product_images.is_primary = true
    ) as has_primary_image
  from public.products products
  where coalesce(products.is_active, true) = true
    and lower(
      coalesce(products.compatibility, '') || ' ' ||
      coalesce(products.compatibility_label, '') || ' ' ||
      coalesce(products.ikea_system, '') || ' ' ||
      coalesce(products.slug, '') || ' ' ||
      coalesce(products.name, '')
    ) not like '%ikea%'
),
candidate_matches as (
  select
    eligible_products.id as product_id,
    eligible_products.name as product_name,
    eligible_products.existing_max_sort_order,
    eligible_products.has_primary_image,
    normalised_storage_images.image_url,
    normalised_storage_images.object_name,
    normalised_storage_images.image_rank,
    row_number() over (
      partition by eligible_products.id
      order by normalised_storage_images.image_rank, normalised_storage_images.object_name
    ) as product_image_rank,
    count(*) over (
      partition by normalised_storage_images.image_url
      order by eligible_products.slug, eligible_products.id
      rows between unbounded preceding and current row
    ) as new_image_use_rank
  from eligible_products
  join normalised_storage_images
    on normalised_storage_images.material_key = eligible_products.material_key
   and (
      eligible_products.material_key = 'compact-laminate'
      or normalised_storage_images.type_key = eligible_products.type_key
   )
  where eligible_products.material_key in ('decorative-board', 'thermolaminate', 'compact-laminate')
    and (
      eligible_products.material_key = 'compact-laminate'
      or eligible_products.type_key in ('door', 'drawer', 'panel')
    )
    and not exists (
      select 1
      from public.product_images existing_product_image
      where existing_product_image.product_id = eligible_products.id
        and existing_product_image.image_url = normalised_storage_images.image_url
    )
),
existing_image_usage as (
  select
    product_images.image_url,
    count(*)::integer as existing_use_count
  from public.product_images product_images
  group by product_images.image_url
),
selected_matches as (
  select
    candidate_matches.*
  from candidate_matches
  cross join settings
  left join existing_image_usage
    on existing_image_usage.image_url = candidate_matches.image_url
  where candidate_matches.product_image_rank <= settings.max_new_images_per_product
    and coalesce(existing_image_usage.existing_use_count, 0) + candidate_matches.new_image_use_rank <= settings.max_total_uses_per_image
)
insert into public.product_images (
  product_id,
  image_url,
  alt_text,
  caption,
  sort_order,
  is_primary
)
select
  selected_matches.product_id,
  selected_matches.image_url,
  selected_matches.product_name,
  null,
  selected_matches.existing_max_sort_order + selected_matches.product_image_rank,
  selected_matches.has_primary_image = false and selected_matches.product_image_rank = 1
from selected_matches
where not exists (
  select 1
  from public.product_images existing_product_image
  where existing_product_image.product_id = selected_matches.product_id
    and existing_product_image.image_url = selected_matches.image_url
);

commit;

-- Preview eligible products still without any assigned images:
-- select products.slug, products.name, products.material, products.material_label, products.type, products.type_label
-- from public.products products
-- where not exists (
--   select 1
--   from public.product_images product_images
--   where product_images.product_id = products.id
-- )
-- and lower(
--   coalesce(products.compatibility, '') || ' ' ||
--   coalesce(products.compatibility_label, '') || ' ' ||
--   coalesce(products.ikea_system, '') || ' ' ||
--   coalesce(products.slug, '') || ' ' ||
--   coalesce(products.name, '')
-- ) not like '%ikea%'
-- order by products.slug;

-- Check if any image URL is now used more than twice:
-- select image_url, count(*) as uses
-- from public.product_images
-- group by image_url
-- having count(*) > 2
-- order by uses desc, image_url;
