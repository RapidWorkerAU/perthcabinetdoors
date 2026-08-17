-- Job costs on an order, and job cost lines on a variation
-- ---------------------------------------------------------------------------
--
-- WHY. A variation could add, change and remove items but could not touch
-- labour, travel, delivery, consumables, painting, glass or removal. A job that
-- grew by two hours on site had nowhere to put them.
--
-- The variation shows what each cost IS NOW and what it BECOMES, which is only
-- honest if the order actually holds a current figure. It did not. An order
-- stored the subtotal, the GST and the total and nothing else; the breakdown was
-- left behind on the quote and never copied across. So this migration does two
-- things:
--
--   1. gives the order the same cost columns the quote has, and backfills them
--      from the quote each order was raised off
--   2. lets a variation line be a job cost, with a cost_type saying which one
--
-- From here, createOrderFromQuote copies the costs at acceptance and
-- applyAcceptedVariation writes the revised figure back, so the "currently"
-- figure a staff member sees is always the live one.
--
-- HOW LABOUR IS HELD. As hours and a rate, not a dollar figure, matching the
-- quote and matching what the customer reads. The money is derived wherever it
-- is shown, so it can never disagree with the hours.
--
-- HOW TO USE
--   1. Run the PREVIEW at the bottom. Read-only. It shows what the backfill
--      will copy and flags any order whose quote is gone.
--   2. Run the do block.
--   3. Run the VERIFICATION at the bottom.

-- ── 1. The order's cost breakdown ──────────────────────────────────────────

alter table public.pcd_orders
  add column if not exists labour_hours numeric(12,2) not null default 0,
  add column if not exists worker_hourly_rate numeric(12,2) not null default 0,
  add column if not exists travel_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists delivery_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists installation_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists painting_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists glass_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists removal_cost_ex_gst numeric(12,2) not null default 0;

comment on column public.pcd_orders.labour_hours is
  'Job labour hours currently on the order. Copied from the quote at acceptance and revised by an applied variation. Money is derived as hours x worker_hourly_rate.';
comment on column public.pcd_orders.installation_cost_ex_gst is
  'Consumables. Named installation_* to match pcd_quotes, where the same column is labelled Consumables in the UI.';

-- ── 2. Job cost lines on a variation ───────────────────────────────────────

alter table public.pcd_order_variation_lines
  add column if not exists cost_type text;

comment on column public.pcd_order_variation_lines.cost_type is
  'Which job cost this line revises (labour, travel, delivery, consumables, painting, glass, removal). Null on ordinary item lines.';

alter table public.pcd_order_variation_lines
  drop constraint if exists pcd_order_variation_lines_action_check;

alter table public.pcd_order_variation_lines
  add constraint pcd_order_variation_lines_action_check
  check (action in ('add', 'change', 'remove', 'price_adjustment', 'job_cost'));

-- A job cost line must say which cost it is; an item line must not pretend to be
-- one. Without this a job cost with no cost_type would be applied to nothing and
-- silently lose its money on the next variation.
alter table public.pcd_order_variation_lines
  drop constraint if exists pcd_order_variation_lines_cost_type_check;

alter table public.pcd_order_variation_lines
  add constraint pcd_order_variation_lines_cost_type_check
  check (
    (action = 'job_cost' and cost_type in ('labour','travel','delivery','consumables','painting','glass','removal'))
    or (action <> 'job_cost' and cost_type is null)
  );

create index if not exists idx_pcd_order_variation_lines_cost_type
  on public.pcd_order_variation_lines(variation_id, cost_type);

-- ── 3. Backfill the orders from their quotes ───────────────────────────────
--
-- Scoped to orders that still have nothing set, so re-running is harmless and an
-- order whose costs have already been revised by a variation is never reset.
-- An order whose quote has been deleted keeps zeros and is listed by the
-- verification query: zero is honest there, since the figure is genuinely
-- unknown, and a variation on one of those simply starts from nothing.

do $$
declare
  filled   integer;
  no_quote integer;
begin
  update public.pcd_orders o
  set
    labour_hours             = coalesce(q.labour_hours, 0),
    worker_hourly_rate       = coalesce(q.worker_hourly_rate, 0),
    travel_cost_ex_gst       = coalesce(q.travel_cost_ex_gst, 0),
    delivery_cost_ex_gst     = coalesce(q.delivery_cost_ex_gst, 0),
    installation_cost_ex_gst = coalesce(q.installation_cost_ex_gst, 0),
    painting_cost_ex_gst     = coalesce(q.painting_cost_ex_gst, 0),
    glass_cost_ex_gst        = coalesce(q.glass_cost_ex_gst, 0),
    removal_cost_ex_gst      = coalesce(q.removal_cost_ex_gst, 0)
  from public.pcd_quotes q
  where q.id = o.quote_id
    and coalesce(o.labour_hours, 0) = 0
    and coalesce(o.worker_hourly_rate, 0) = 0
    and coalesce(o.travel_cost_ex_gst, 0) = 0
    and coalesce(o.delivery_cost_ex_gst, 0) = 0
    and coalesce(o.installation_cost_ex_gst, 0) = 0
    and coalesce(o.painting_cost_ex_gst, 0) = 0
    and coalesce(o.glass_cost_ex_gst, 0) = 0
    and coalesce(o.removal_cost_ex_gst, 0) = 0;
  get diagnostics filled = row_count;

  select count(*) into no_quote
    from public.pcd_orders o
   where o.quote_id is null
      or not exists (select 1 from public.pcd_quotes q where q.id = o.quote_id);

  raise notice 'Filled the cost breakdown on % order(s) from their quotes.', filled;
  if no_quote > 0 then
    raise notice '% order(s) have no quote to copy from and keep zeros. A variation on one of those starts its costs from nothing, which is honest but worth knowing.', no_quote;
  end if;
end $$;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- PREVIEW - run on its own BEFORE the do block. Read-only.
-- ---------------------------------------------------------------------------
-- select
--   o.order_number,
--   q.quote_number,
--   q.labour_hours,
--   q.worker_hourly_rate,
--   q.travel_cost_ex_gst,
--   q.delivery_cost_ex_gst,
--   q.installation_cost_ex_gst  as consumables,
--   q.painting_cost_ex_gst,
--   q.glass_cost_ex_gst,
--   q.removal_cost_ex_gst
-- from public.pcd_orders o
-- left join public.pcd_quotes q on q.id = o.quote_id
-- order by o.created_at desc;

-- ---------------------------------------------------------------------------
-- VERIFICATION - after the do block.
--   `unpriced_labour` is orders carrying labour hours at a $0 rate, which would
--   value that labour at nothing on the next variation. Expect 0.
-- ---------------------------------------------------------------------------
-- select
--   count(*)                                                              as orders,
--   count(*) filter (where quote_id is null)                              as no_quote_linked,
--   count(*) filter (where coalesce(labour_hours,0) > 0
--                      and coalesce(worker_hourly_rate,0) = 0)            as unpriced_labour,
--   count(*) filter (where coalesce(labour_hours,0) = 0
--                      and coalesce(travel_cost_ex_gst,0) = 0
--                      and coalesce(delivery_cost_ex_gst,0) = 0
--                      and coalesce(installation_cost_ex_gst,0) = 0
--                      and coalesce(painting_cost_ex_gst,0) = 0
--                      and coalesce(glass_cost_ex_gst,0) = 0
--                      and coalesce(removal_cost_ex_gst,0) = 0)           as still_all_zero
-- from public.pcd_orders;
