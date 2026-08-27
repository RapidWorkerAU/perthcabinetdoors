-- THE LISTS YOU CAN ADD TO YOURSELF.
--
-- ── WHAT THIS TURNS ON ───────────────────────────────────────────────────────
--
-- Six dropdowns in the admin move out of the code and into this table, so they
-- can be added to from Settings, Lists without a deploy:
--
--   issue_kinds            what has gone wrong with a panel
--   production_timeframes  how long a job takes
--   settlement_methods     how a payment reached us
--   dismiss_reasons        why a board card was set aside
--   colour_suppliers       the brands boards are bought from
--   profile_suppliers      the brands profiles are bought from
--
-- Everything else stays in code on purpose. See lib/pcd-lists.js for which
-- lists are not here and what each of them would break.
--
-- ── NOTHING IS EVER DELETED ──────────────────────────────────────────────────
--
-- There is no delete anywhere in this feature, and this table is where that has
-- to hold. Records already refer to these values: an order raised last year
-- says its issue was 'supplier_damage'. Removing that item would leave the
-- order saying nothing at all.
--
-- An item is switched off instead, which stops it being OFFERED without
-- touching what already refers to it. A record holding a switched off value
-- still shows it, marked as retired.
--
-- ── WHY THE ITEMS ARE SEEDED RATHER THAN LEFT EMPTY ──────────────────────────
--
-- The screen has to show what is already in use before it can be reordered or
-- switched off, and the app has to keep working the moment this runs. So every
-- item that exists in code today is written in as a row marked is_builtin, in
-- the order it currently appears. Nothing changes on any screen until somebody
-- deliberately changes it here.
--
-- Safe to run twice: every insert is on conflict do nothing, keyed on the list
-- and the item, so a second run adds nothing and overwrites nothing you have
-- since edited.
--
-- ── ONE DO BLOCK ─────────────────────────────────────────────────────────────
--
-- The Supabase SQL editor pools connections, and a script that errors part way
-- through has already committed what ran before it. One block means an error
-- anywhere undoes the lot.

do $$
declare
  seeded integer;
begin

  create table if not exists public.pcd_list_items (
    id          uuid primary key default gen_random_uuid(),
    -- Which list this belongs to. Free text rather than an enum, because the
    -- set of lists lives in lib/pcd-lists.js and adding one there is a
    -- deliberate act with a reason to answer; a constraint here would mean a
    -- migration every time as well, for no extra safety.
    list_key    text not null,
    -- The value that gets STORED on a record. Fixed at birth and never changed,
    -- so correcting the spelling of a name cannot orphan the orders that
    -- already refer to it.
    item_key    text not null,
    -- What people read. Editable, precisely because the key is not.
    label       text not null,
    sort_order  integer not null default 0,
    -- Off, not gone. See above.
    is_active   boolean not null default true,
    -- Came with the app rather than being typed in. Only used to explain itself
    -- on the screen; a built-in can be renamed, reordered and switched off like
    -- any other.
    is_builtin  boolean not null default false,
    -- The settings an item carries beyond its name: how many days a timeframe
    -- means, whether a payment method asks for a reference. Which keys are
    -- allowed is decided per list in lib/pcd-lists.js.
    extras      jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default timezone('utc', now()),
    updated_at  timestamptz not null default timezone('utc', now())
  );

  -- ONE ITEM PER LIST, and the thing that makes the seed safe to run again.
  create unique index if not exists pcd_list_items_key
    on public.pcd_list_items (list_key, item_key);

  create index if not exists pcd_list_items_list_idx
    on public.pcd_list_items (list_key, sort_order);

  alter table public.pcd_list_items enable row level security;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'pcd_list_items'
       and policyname = 'pcd_list_items_admin_all'
  ) then
    create policy pcd_list_items_admin_all
      on public.pcd_list_items
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  -- ── the seed ─────────────────────────────────────────────────────────────
  --
  -- Exactly what the code holds today, in the order it holds it. sort_order
  -- goes up in tens so an item can be dropped between two without renumbering
  -- the whole list.

  insert into public.pcd_list_items (list_key, item_key, label, sort_order, is_builtin, extras) values
    ('issue_kinds', 'damaged_in_production', 'Damaged in production',   0, true, '{}'),
    ('issue_kinds', 'wrong_size',            'Wrong size',             10, true, '{}'),
    ('issue_kinds', 'wrong_colour',          'Wrong colour or finish', 20, true, '{}'),
    ('issue_kinds', 'supplier_damage',       'Damaged from supplier',  30, true, '{}'),
    ('issue_kinds', 'unavailable',           'Material unavailable',   40, true, '{}'),
    ('issue_kinds', 'customer_change',       'Customer change',        50, true, '{}'),
    ('issue_kinds', 'other',                 'Something else',         60, true, '{}'),

    ('production_timeframes', '3',  '3 days',   0, true, '{"days": 3}'),
    ('production_timeframes', '7',  '1 week',  10, true, '{"days": 7}'),
    ('production_timeframes', '14', '2 weeks', 20, true, '{"days": 14}'),
    ('production_timeframes', '21', '3 weeks', 30, true, '{"days": 21}'),
    ('production_timeframes', '28', '4 weeks', 40, true, '{"days": 28}'),
    ('production_timeframes', '42', '6 weeks', 50, true, '{"days": 42}'),
    ('production_timeframes', '56', '8 weeks', 60, true, '{"days": 56}'),
    ('production_timeframes', '84', '12 weeks', 70, true, '{"days": 84}'),

    ('settlement_methods', 'bank_transfer',  'Bank transfer',   0, true, '{"wantsReference": true}'),
    ('settlement_methods', 'cash',           'Cash',           10, true, '{"wantsReference": false}'),
    ('settlement_methods', 'card_in_person', 'Card in person', 20, true, '{"wantsReference": true}'),
    ('settlement_methods', 'cheque',         'Cheque',         30, true, '{"wantsReference": true}'),
    ('settlement_methods', 'other',          'Some other way', 40, true, '{"wantsReference": false}'),

    ('dismiss_reasons', 'no_reply_needed',   'No reply needed',      0, true, '{"words": "Nothing to answer."}'),
    ('dismiss_reasons', 'handled_elsewhere', 'Handled another way', 10, true, '{"words": "Dealt with outside the system."}'),
    ('dismiss_reasons', 'answered_by_phone', 'Answered by phone',   20, true, '{"words": "Handled on the phone."}'),
    ('dismiss_reasons', 'not_going_ahead',   'Not going ahead',     30, true, '{"words": "The customer is not proceeding."}'),
    ('dismiss_reasons', 'spam',              'Spam',                40, true, '{"words": "Spam or junk."}'),
    ('dismiss_reasons', 'other',             'Other',               50, true, '{"words": "Set aside."}'),

    ('colour_suppliers', 'Polytec',  'Polytec',   0, true, '{}'),
    ('colour_suppliers', 'Laminex',  'Laminex',  10, true, '{}'),
    ('colour_suppliers', 'Formica',  'Formica',  20, true, '{}'),
    ('colour_suppliers', 'Paperock', 'Paperock', 30, true, '{}'),

    ('profile_suppliers', 'Polytec', 'Polytec',  0, true, '{}'),
    ('profile_suppliers', 'Laminex', 'Laminex', 10, true, '{}')
  on conflict (list_key, item_key) do nothing;

  get diagnostics seeded = row_count;
  raise notice 'List items added: %', seeded;
  raise notice 'Nothing was overwritten. Rows already there keep whatever you have set on them.';
end $$;

comment on table public.pcd_list_items is
  'The dropdown vocabularies that can be added to from Settings, Lists. Never deleted from: an item is switched off, which stops it being offered without touching the records that already refer to it.';
comment on column public.pcd_list_items.item_key is
  'The value stored on records. Fixed at birth, so renaming the label cannot orphan what already refers to it.';
comment on column public.pcd_list_items.is_active is
  'Off means it is no longer offered. Records already holding it still show it, marked retired.';

notify pgrst, 'reload schema';

-- ── NOTHING BELOW THIS LINE ──────────────────────────────────────────────────
--
-- This file is one runnable block and ends here. The check query for what
-- landed is a separate read only query and is not pasted here, because a select
-- tacked onto the end of a migration gets run as part of it and its result
-- scrolls past with everything else.
