-- PUTTING THE WEBSITE FIGURES BACK TO WHAT ACTUALLY HAPPENED.
--
-- ── THE THREE THINGS THAT WERE WRONG ─────────────────────────────────────────
--
-- 1. PAGES THAT DO NOT EXIST WERE COUNTED AS READ. The visit counter is mounted
--    in the site layout, and a layout wraps the not-found boundary exactly as it
--    wraps a real page, so any URL that 404s was reported as a page view. A
--    scraper found that: it swept eight old product URLs with ".json" on the end
--    every couple of hours for days, from a rotating pool of addresses in
--    European data centres, running a real browser so nothing in the user agent
--    gave it away. About a hundred and ninety views, more than the homepage got,
--    plus a one page visit each time straight into the bounce rate.
--
--    The code no longer counts a 404 at all. See app/(site)/not-found.js.
--
-- 2. EVERY VISIT FROM CHATGPT WAS FILED AS FACEBOOK. The referrer test matched
--    on a piece of the text rather than on the host, and one of the hosts in the
--    social list was "t.co", Twitter's link shortener. "chatgpt.com" contains
--    it. So does "microsoft.com", which took Copilot with it. Fourteen real
--    people who found us through an AI answer were sitting in the Facebook
--    column, and the real Facebook number was one visit.
--
--    Channels are matched on the host now, and AI answers have a column of
--    their own. See lib/pcd-site-tracking.js.
--
-- 3. A CITY WITH A SPACE IN ITS NAME WAS STORED ENCODED. Vercel percent encodes
--    that header, so it read "Frankfurt%20am%20Main".
--
-- ── WHY THE 404 ROWS ARE MARKED RATHER THAN DELETED ──────────────────────────
--
-- Because "we left out N machine views" is a more honest dashboard than one
-- that quietly pretends nothing was there. is_bot is already what takes a row
-- out of every figure the panel shows, and the panel already says how many it
-- dropped, so marking them puts them where they belong and leaves the record of
-- the sweep in place for its ninety days.
--
-- ── THE ROLL UPS HAVE TO BE REBUILT, NOT PATCHED ─────────────────────────────
--
-- Each finished day is folded into pcd_site_daily and pcd_site_page_daily, and
-- those hold totals rather than rows, so there is nothing in them to correct one
-- view at a time. Only the days this script actually changed are deleted, and
-- only where the raw rows are still there to rebuild from: raw is kept ninety
-- days, and clearing an older day would lose real history rather than fix it.
--
-- The roll up folds every day from scratch, so it rebuilds them. Today is always
-- read live off the raw table, so today needs nothing.
--
-- Run the roll up after this: /api/cron/site-rollup, or wait for the nightly
-- pass at 18:00 UTC.
--
-- ── ONE DO BLOCK ─────────────────────────────────────────────────────────────
--
-- The Supabase SQL editor pools connections, and a script that errors part way
-- through has already committed what ran before it. One block means an error
-- anywhere undoes the lot. Safe to run twice: every statement is idempotent and
-- a second pass finds nothing left to change.

do $$
declare
  touched  date[] := '{}';
  found    date[];
  probes   integer := 0;
  refiled  integer := 0;
  decoded  integer := 0;
  cleared  integer := 0;
begin

  -- ── 1. views of pages that do not exist ───────────────────────────────────
  --
  -- Everything under /products. The whole section is switched off
  -- (PRODUCTS_ENABLED in lib/pcd-site-flags.js), so every one of these returned
  -- a 404 whoever asked for it. That is the objective test and it is the same
  -- one the code now applies. Nothing else in the table is touched.

  with marked as (
    update public.pcd_site_events
       set is_bot = true
     where is_bot = false
       and (path = '/products' or path like '/products/%')
    returning (created_at at time zone 'Australia/Perth')::date as day
  )
  select count(*), coalesce(array_agg(distinct day), '{}')
    into probes, found
    from marked;
  touched := touched || found;
  raise notice '404 views marked as machine: %', probes;

  -- ── 2. the AI referrers hiding in other columns ───────────────────────────
  --
  -- Matched on the host, the same way the code now does, so this correction and
  -- every future row agree. The list is the one in lib/pcd-site-tracking.js.

  with refixed as (
    update public.pcd_site_events
       set channel = 'ai'
     where channel <> 'ai'
       and referrer is not null
       and (
         substring(referrer from '^[a-z]+://([^/:?#]+)') = any (array[
           'chatgpt.com', 'openai.com', 'perplexity.ai', 'claude.ai',
           'copilot.microsoft.com', 'gemini.google.com', 'bard.google.com',
           'aistudio.google.com', 'meta.ai', 'grok.com', 'x.ai',
           'deepseek.com', 'mistral.ai', 'you.com', 'poe.com', 'phind.com'
         ])
         or substring(referrer from '^[a-z]+://([^/:?#]+)') like any (array[
           '%.chatgpt.com', '%.openai.com', '%.perplexity.ai', '%.claude.ai',
           '%.meta.ai', '%.grok.com', '%.x.ai', '%.deepseek.com',
           '%.mistral.ai', '%.you.com', '%.poe.com', '%.phind.com'
         ])
       )
    returning (created_at at time zone 'Australia/Perth')::date as day
  )
  select count(*), coalesce(array_agg(distinct day), '{}')
    into refiled, found
    from refixed;
  touched := touched || found;
  raise notice 'visits refiled as AI answers: %', refiled;

  -- ── 3. the encoded city names ─────────────────────────────────────────────
  --
  -- Only the two encodings that actually turn up in a city name. Anything more
  -- would need an extension, and new rows are decoded on the way in now, so
  -- there is nothing else for this to catch up on.
  --
  -- It changes no figure on the dashboard, which shows no region today, so the
  -- day does not need folding again for it.

  update public.pcd_site_events
     set region = replace(replace(region, '%20', ' '), '%27', '''')
   where region is not null
     and strpos(region, '%') > 0;
  get diagnostics decoded = row_count;
  raise notice 'city names decoded: %', decoded;

  -- ── 4. the days that have to be folded again ──────────────────────────────

  if array_length(touched, 1) is null then
    raise notice 'nothing changed, so no day needs folding again';
  else
    with rebuildable as (
      select day
        from unnest(touched) as day
       where exists (
         select 1
           from public.pcd_site_events e
          where (e.created_at at time zone 'Australia/Perth')::date = day
       )
    ),
    cleared_pages as (
      delete from public.pcd_site_page_daily p
       using rebuildable r
       where p.day = r.day
      returning p.day
    ),
    cleared_days as (
      delete from public.pcd_site_daily d
       using rebuildable r
       where d.day = r.day
      returning d.day
    )
    select count(*) into cleared from cleared_days;

    raise notice 'days cleared for the roll up to rebuild: % of %', cleared, array_length(touched, 1);
    raise notice 'Now run the roll up: /api/cron/site-rollup';
  end if;

end $$;
