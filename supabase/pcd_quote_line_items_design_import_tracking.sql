-- Tags quote lines created by the design-tool importer with the design item
-- they came from, so re-running an import can replace those lines instead of
-- appending duplicates on top of them (see app/api/admin/design/projects/
-- [projectId]/import/route.js). Manually created/edited lines simply leave
-- this null.

alter table public.pcd_quote_line_items
  add column if not exists design_item_id uuid references public.pcd_design_items(id) on delete set null;

create index if not exists idx_pcd_quote_line_items_design_item
  on public.pcd_quote_line_items(quote_id, design_item_id);
