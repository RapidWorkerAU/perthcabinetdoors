-- Repair quotes still carrying the old hardcoded terms
-- ---------------------------------------------------------------------------
--
-- WHY. Four separate places wrote this exact sentence onto a quote instead of
-- reading the configured Business Defaults:
--
--   * converting a website quote request  (the API hardcoded it outright)
--   * the "New quote" button on /admin/quotes
--   * "create quote" in the design importer
--   * any fallback to the built-in constants, which held the same wording
--
-- All four are fixed in code. This repairs the rows already written, so a quote
-- someone opens tomorrow does not still say something they deleted from
-- settings months ago.
--
-- SCOPE, deliberately narrow:
--   * only rows whose terms are EXACTLY the old sentence. A quote whose terms
--     were edited by hand, even slightly, is somebody's decision and is left
--     alone.
--   * only DRAFT quotes and variations. A sent, viewed, approved or rejected
--     quote is a document the customer already has; silently changing its terms
--     after the fact would be worse than leaving it. Those are listed by the
--     audit query at the bottom so they can be reissued deliberately.
--   * the new terms come from pcd_business_defaults. If that is blank, the
--     quote ends up with no terms, which is the correct reading of "we have not
--     written any".
--
-- Written as ONE do block: Supabase pools connections, and a single block means
-- an error anywhere undoes the lot rather than repairing half the tables.
--
-- RUN 202608171500 FIRST. That one adds pcd_business_defaults.variation_terms,
-- which the variation half of this repair reads. If it has not been run, this
-- script does NOT fail: it repairs the quotes, says plainly that it skipped the
-- variations, and can be run again afterwards to finish the job. The variation
-- repair is written with dynamic SQL for exactly that reason — a plain
-- reference to a column that does not exist yet fails at parse time, before any
-- guard around it gets a chance to run.
--
-- HOW TO USE
--   1. Run the PREVIEW at the bottom first. Read-only. It shows what changes.
--   2. Run the do block. It reports how many rows it repaired.
--   3. Run the AUDIT at the bottom to see what was deliberately left alone.

do $$
declare
  legacy_terms constant text :=
    'Prices are valid for 14 days. Final measurements and site conditions may affect the final invoice.';
  legacy_variation_terms constant text :=
    'This variation changes the accepted order scope. Work proceeds only after approval and any required payment is received.';
  configured_quote_terms     text;
  configured_variation_terms text;
  has_variation_terms        boolean;
  fixed_quotes     integer;
  fixed_variations integer := 0;
  skipped_sent     integer;
begin
  select nullif(btrim(coalesce(quote_terms, '')), '')
    into configured_quote_terms
    from public.pcd_business_defaults
   where id = '00000000-0000-0000-0000-000000000001';

  -- Draft quotes still carrying the old sentence verbatim.
  update public.pcd_quotes
  set terms = configured_quote_terms
  where status = 'draft'
    and btrim(coalesce(terms, '')) = legacy_terms;
  get diagnostics fixed_quotes = row_count;

  -- Draft variations, same idea. Their wording was hardcoded too, and is now a
  -- setting of its own — which is why this half depends on the column migration.
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'pcd_business_defaults'
       and column_name = 'variation_terms'
  ) into has_variation_terms;

  if has_variation_terms then
    execute $q$
      select nullif(btrim(coalesce(variation_terms, '')), '')
        from public.pcd_business_defaults
       where id = '00000000-0000-0000-0000-000000000001'
    $q$ into configured_variation_terms;

    update public.pcd_order_variations
    set terms = configured_variation_terms
    where status = 'draft'
      and btrim(coalesce(terms, '')) = legacy_variation_terms;
    get diagnostics fixed_variations = row_count;
  end if;

  select count(*) into skipped_sent
    from public.pcd_quotes
   where status <> 'draft'
     and btrim(coalesce(terms, '')) = legacy_terms;

  raise notice 'Repaired % draft quote(s) and % draft variation(s).', fixed_quotes, fixed_variations;
  if not has_variation_terms then
    raise notice 'SKIPPED the variations: pcd_business_defaults.variation_terms does not exist yet. Run 202608171500_pcd_business_defaults_runner_and_variation_terms.sql, then run this script again.';
  end if;
  if configured_quote_terms is null then
    raise notice 'Business Defaults has no quote terms set, so those quotes now carry none. Set them on /admin/settings if that is not what you want.';
  end if;
  if skipped_sent > 0 then
    raise notice '% quote(s) already sent to a customer still carry the old terms and were LEFT ALONE. See the audit query.', skipped_sent;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- PREVIEW - run on its own BEFORE the block above. Read-only.
-- ---------------------------------------------------------------------------
-- select
--   q.quote_number,
--   q.status,
--   q.terms                     as terms_now,
--   d.quote_terms               as becomes
-- from public.pcd_quotes q
-- cross join (select quote_terms from public.pcd_business_defaults
--              where id = '00000000-0000-0000-0000-000000000001') d
-- where q.status = 'draft'
--   and btrim(coalesce(q.terms, '')) =
--       'Prices are valid for 14 days. Final measurements and site conditions may affect the final invoice.'
-- order by q.created_at desc;

-- ---------------------------------------------------------------------------
-- AUDIT - quotes left alone because they are already out with a customer.
-- Reissue any of these deliberately if the wording matters.
-- ---------------------------------------------------------------------------
-- select quote_number, status, created_at
--   from public.pcd_quotes
--  where status <> 'draft'
--    and btrim(coalesce(terms, '')) =
--        'Prices are valid for 14 days. Final measurements and site conditions may affect the final invoice.'
--  order by created_at desc;
