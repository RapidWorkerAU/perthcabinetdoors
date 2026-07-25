-- Public, no-login design sessions (Phase 4 — IKEA-style website planner).
-- A public design project is created anonymously from the website and scoped by
-- an unguessable access_code. Public API route handlers use the service-role
-- client and filter EVERY query by this code (mirrors pcd_quotes.access_code) —
-- so RLS stays admin-only; no anon policy is added and no anon row access is
-- opened. is_public keeps these visually/organisationally separate from real
-- admin design projects.

alter table public.pcd_design_projects
  add column if not exists access_code text,
  add column if not exists is_public boolean not null default false;

comment on column public.pcd_design_projects.access_code is
  'Unguessable code for a public (no-login) design session; null for admin projects. Public API routes scope every query by this.';
comment on column public.pcd_design_projects.is_public is
  'True when this project was created by the public website planner (Phase 4), not by an admin.';

-- Partial unique index: only public sessions carry a code, so admin rows (null)
-- never collide.
create unique index if not exists pcd_design_projects_access_code_key
  on public.pcd_design_projects (access_code)
  where access_code is not null;

notify pgrst, 'reload schema';
