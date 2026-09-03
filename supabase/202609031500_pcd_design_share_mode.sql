-- Sharing a design we drafted, without handing over the pencil
-- ---------------------------------------------------------------------------
--
-- WHY. A design drawn in the admin has no way to reach the customer. The public
-- planner already renders any project from an access_code, in plan and in 3D,
-- and its read path returns every item, so an admin design with scribes and
-- obstructions in it displays correctly there. What was missing was a way to
-- turn one on, and a way to say whether the person opening it may change it.
--
-- ── THE DEFAULT IS 'edit', AND THAT IS NOT THE SAFE-LOOKING CHOICE ──────────
--
-- Every existing row is a session somebody created on the public planner to
-- draw their own kitchen. Defaulting this column to 'view' would make the live
-- public tool read-only for everyone mid-session. So the column default matches
-- what those rows already are, and the ADMIN share action is where 'view' is
-- chosen. The safe default belongs at the point of sharing, not in the backfill.
--
-- ── VIEW MEANS THE SERVER REFUSES, NOT THAT THE BUTTONS ARE HIDDEN ─────────
--
-- The public client hides its editing controls on a view-only share, but that
-- is a courtesy. Every public write route checks this column, because a hidden
-- button is a suggestion and the routes are reachable with curl.
--
-- ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
--
-- No per-recipient links and no accounts. One code per project, revoked by
-- setting is_public back to false, which is the same model quotes and
-- variations already use. Anything finer needs a reason first.

alter table public.pcd_design_projects
  add column if not exists share_mode text not null default 'edit',
  -- When it was last shared and who it was sent to, so the design screen can
  -- say "sent to kristy@ on 3 September" rather than only "sharing is on".
  add column if not exists shared_at timestamptz,
  add column if not exists shared_to text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pcd_design_projects_share_mode_check'
  ) then
    alter table public.pcd_design_projects
      add constraint pcd_design_projects_share_mode_check
      check (share_mode in ('view', 'edit'));
  end if;
end;
$$;

comment on column public.pcd_design_projects.share_mode is
  'view or edit. Checked by every public write route, not just hidden in the client. Defaults to edit because every pre-existing row is a public planner session the customer drew themselves.';
comment on column public.pcd_design_projects.shared_to is
  'The address the link was last emailed to. A record of who was given it, not a restriction: the link works for whoever holds it.';

notify pgrst, 'reload schema';
