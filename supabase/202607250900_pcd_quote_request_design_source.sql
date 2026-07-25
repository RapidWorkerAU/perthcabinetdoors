-- "Send my design to PCD" from the public planner (Phase 4) submits as a QUOTE
-- REQUEST, tagged source='design_tool' and linked to the saved public design so
-- staff can open it in the admin design tool and build the quote with Stage
-- Quote. Adds the new source value + a nullable design link.

alter table public.pcd_quote_requests
  drop constraint if exists pcd_quote_requests_source_check;
alter table public.pcd_quote_requests
  add constraint pcd_quote_requests_source_check
  check (source in ('request_quote', 'product_detail', 'design_tool'));

alter table public.pcd_quote_requests
  add column if not exists design_project_id uuid
    references public.pcd_design_projects(id) on delete set null;

comment on column public.pcd_quote_requests.design_project_id is
  'The public design (pcd_design_projects) this quote request was submitted from, if any — staff open it to build the quote.';

notify pgrst, 'reload schema';
