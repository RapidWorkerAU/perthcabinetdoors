alter table public.pcd_quote_line_items
  add column if not exists supplier_name text;

update public.pcd_quote_line_items
set supplier_name = case
  when lower(coalesce(unit_cost_source_label, '')) like '%laminex%' then 'Laminex'
  when lower(coalesce(unit_cost_source_label, '')) like '%formica%' then 'Formica'
  when lower(coalesce(unit_cost_source_label, '')) like '%polytec%' then 'Polytec'
  else supplier_name
end
where coalesce(supplier_name, '') = ''
  and coalesce(unit_cost_source_label, '') <> '';
