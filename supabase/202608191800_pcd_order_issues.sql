-- Panel issues: a problem with one panel, as its own record
-- ---------------------------------------------------------------------------
--
-- WHY. "Issue Follow-Up" was an option in the panel's own status dropdowns, so
-- recording a problem OVERWROTE how far that panel had got. The first question
-- anybody asks about a problem is "where was it up to", and reporting it
-- destroyed the answer. It also captured nothing else: no what, no who, no
-- whether it was fixed, no cost.
--
-- An issue is now its own row. The panel keeps its stage, and the stage it was
-- at is COPIED here as a historical fact.
--
-- Raising and resolving also write to pcd_order_activity, which the order page
-- already renders, so the Activity Log tells the story for free. This table
-- answers "what is open right now", which an activity feed cannot do cheaply.

create table if not exists public.pcd_order_issues (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.pcd_orders(id) on delete cascade,
  -- Nullable on purpose. A panel can be deleted from an order and the issue has
  -- to survive it: a remake that cost money must not vanish from the record
  -- because somebody tidied up the line it was against.
  line_item_id      uuid references public.pcd_order_line_items(id) on delete set null,
  panel_key         text,

  kind              text not null default 'other' check (
    kind in ('damaged_in_production', 'wrong_size', 'wrong_colour',
             'supplier_damage', 'unavailable', 'customer_change', 'other')
  ),
  detail            text not null,

  -- Where the panel had got to when the problem was found. Copied, never moved.
  -- progress_kind says WHICH list the value came from, because a panel we cut
  -- has a production stage and one a supplier makes has an order status, and a
  -- panel can be swapped between the two afterwards.
  stage_at_report   text,
  progress_kind     text check (progress_kind is null or progress_kind in ('Stage', 'Status')),

  -- Who has to move next. Decides which side of the board the card lands on.
  owner             text not null default 'us' check (owner in ('us', 'customer', 'supplier')),
  blocks            text not null default 'panel' check (blocks in ('panel', 'order', 'nothing')),
  extra_cost_ex_gst numeric(12,2) not null default 0 check (extra_cost_ex_gst >= 0),

  raised_by         uuid references public.pcd_agents(id) on delete set null,
  raised_at         timestamptz not null default timezone('utc', now()),
  -- Null means open. This is the column the board reads.
  resolved_at       timestamptz,
  resolution        text,

  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now())
);

-- Nothing closes silently: a resolved issue must say what was done about it.
alter table public.pcd_order_issues
  drop constraint if exists pcd_order_issues_resolution_required;
alter table public.pcd_order_issues
  add constraint pcd_order_issues_resolution_required
  check (resolved_at is null or coalesce(btrim(resolution), '') <> '');

comment on table public.pcd_order_issues is
  'One row per problem with a panel. The panel keeps its own stage; stage_at_report is a copy of where it had got to.';
comment on column public.pcd_order_issues.resolved_at is
  'Null means open. The board reads this and nothing else to decide what to show.';
comment on column public.pcd_order_issues.progress_kind is
  'Stage for panels we cut, Status for panels a supplier makes. Recorded so the value is never ambiguous later.';

-- The board asks one question: what is open right now.
create index if not exists pcd_order_issues_open_idx
  on public.pcd_order_issues (order_id, raised_at desc)
  where resolved_at is null;
create index if not exists pcd_order_issues_line_idx
  on public.pcd_order_issues (line_item_id)
  where line_item_id is not null;

drop trigger if exists trg_pcd_order_issues_updated_at on public.pcd_order_issues;
create trigger trg_pcd_order_issues_updated_at
  before update on public.pcd_order_issues
  for each row execute function public.set_updated_at_timestamp();

alter table public.pcd_order_issues enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pcd_order_issues'
      and policyname = 'Authenticated users can manage order issues'
  ) then
    create policy "Authenticated users can manage order issues"
      on public.pcd_order_issues for all to authenticated
      using (true) with check (true);
  end if;
end$$;

-- ── migrating the old status ────────────────────────────────────────────────
--
-- Any panel sitting on 'Issue Follow-Up' becomes an open issue. Its progress is
-- left BLANK rather than guessed, because the old status overwrote where the
-- panel actually was and that is not recoverable. Somebody has to look at each
-- one, which is the honest outcome.

insert into public.pcd_order_issues (order_id, line_item_id, kind, detail, stage_at_report, owner, blocks, raised_at)
select
  li.order_id,
  li.id,
  'other',
  'Migrated from the old Issue Follow-Up status. What went wrong was never recorded, and the stage it had reached was overwritten by the status itself.',
  null,
  'us',
  'panel',
  coalesce(li.status_updated_at, li.updated_at, li.created_at)
from public.pcd_order_line_items li
where li.status = 'Issue Follow-Up'
  and not exists (
    select 1 from public.pcd_order_issues existing
    where existing.line_item_id = li.id and existing.kind = 'other' and existing.resolved_at is null
  );

-- The status column has to hold something legal once the option is gone. These
-- rows are the ones a person now has to look at, so they go back to the start
-- of the list rather than pretending to a progress nobody recorded.
update public.pcd_order_line_items
set status = 'Not Ordered'
where status = 'Issue Follow-Up';

-- Same again inside panel_planning, where a per-panel status or stage can also
-- be sitting on the old value.
update public.pcd_order_line_items li
set panel_planning = (
  select jsonb_object_agg(
    key,
    case
      when value->>'status' = 'Issue Follow-Up' or value->>'production_stage' = 'Issue Follow-Up'
        then value
          - 'status'
          - 'production_stage'
          || jsonb_build_object('issue_migrated', true)
      else value
    end
  )
  from jsonb_each(li.panel_planning)
)
where li.panel_planning is not null
  and jsonb_typeof(li.panel_planning) = 'object'
  and li.panel_planning::text like '%Issue Follow-Up%';
