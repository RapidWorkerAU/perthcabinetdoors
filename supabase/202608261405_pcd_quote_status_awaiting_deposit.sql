-- LETTING A QUOTE SAY 'awaiting_deposit'.
--
-- RUN THIS AFTER 202608261400_pcd_deposit_gate.sql AND BEFORE
-- 202608261410_pcd_clear_stranded_deposit.sql. The data fix cannot land without
-- it.
--
-- ── WHY THIS IS A SEPARATE FILE ──────────────────────────────────────────────
--
-- 202608261400 said pcd_quotes.status was free text and needed no constraint
-- change. That was wrong, and it was wrong for an avoidable reason: the check
-- was an UPDATE against an id that does not exist. It matched no rows, so the
-- constraint was never evaluated, and "no error" was read as "no constraint".
--
-- A constraint only fires on a row it actually touches. Probing one means
-- writing a real row and rolling back, or reading pg_constraint. Never an
-- update that quietly matches nothing.
--
-- ── WHAT CHANGES ─────────────────────────────────────────────────────────────
--
-- One value added. draft, sent, viewed, approved, rejected and archived all
-- stay exactly as they are.
--
--   awaiting_deposit   the customer clicked Approve on a quote that needs a
--                      deposit and the money has not arrived. It is NOT an
--                      approval: no order exists, nothing is booked, and it is
--                      invisible to production and to the financials. See
--                      lib/pcd-deposit-gate.js.

begin;

do $$
declare
  v_bad_count integer;
  v_existing text;
begin
  -- WHAT IS THERE NOW, recorded in the output. If the old constraint allowed
  -- something this file does not list, that is worth seeing before it is
  -- replaced rather than discovering it from a failure months later.
  select pg_get_constraintdef(oid) into v_existing
  from pg_constraint
  where conrelid = 'public.pcd_quotes'::regclass
    and conname = 'pcd_quotes_status_check';

  if v_existing is null then
    raise notice 'No pcd_quotes_status_check to replace. Adding one.';
  else
    raise notice 'Replacing pcd_quotes_status_check, which was: %', v_existing;
  end if;

  -- REFUSE RATHER THAN BREAK. Adding a constraint validates every existing row,
  -- and a status in the table that is not in the list below would fail the whole
  -- migration with a message about one row. This says which values are the
  -- problem instead.
  select count(*) into v_bad_count
  from public.pcd_quotes
  where status is not null
    and status not in ('draft', 'sent', 'viewed', 'awaiting_deposit', 'approved', 'rejected', 'archived');

  if v_bad_count > 0 then
    raise exception
      'Not changing the constraint: % quote(s) hold a status outside the new list. Run this to see them: %',
      v_bad_count,
      'select distinct status from public.pcd_quotes where status not in (''draft'',''sent'',''viewed'',''awaiting_deposit'',''approved'',''rejected'',''archived'');';
  end if;
end $$;

alter table public.pcd_quotes
  drop constraint if exists pcd_quotes_status_check;

alter table public.pcd_quotes
  add constraint pcd_quotes_status_check
  check (
    status in ('draft', 'sent', 'viewed', 'awaiting_deposit', 'approved', 'rejected', 'archived')
  );

commit;

-- Check it landed:
--
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.pcd_quotes'::regclass
--     and conname = 'pcd_quotes_status_check';
--
-- Expect awaiting_deposit to appear in the list.
