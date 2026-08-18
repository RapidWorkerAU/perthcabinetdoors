-- Quote terms: a library of named terms instead of one block of text
-- ---------------------------------------------------------------------------
--
-- WHY. Business Defaults held ONE "Default terms text" box, and every quote got
-- it whether or not it fitted. PCD quotes doors only, whole kitchens, supply
-- only, supply and install, jobs with a door removal, jobs without. The wording
-- a job needs depends on what the job is, so one box meant either terms that
-- did not apply or terms retyped by hand on the quote.
--
-- A term is now a named piece of wording that can be:
--
--   ALWAYS      always_include = true. Every new quote starts with it.
--   ON REQUEST  always_include = false. It sits in the library until someone
--               adds it to a quote from the Add terms button.
--
-- WHAT A QUOTE STORES IS STILL ITS OWN TEXT. Adding a term COPIES its wording
-- into pcd_quotes.terms, and the quote owns that copy from then on: it can be
-- edited on the quote, and editing the library later never rewrites a quote
-- that has already been sent. A quote is a document, not a view of settings.
--
-- body_html is a SMALL subset of HTML, not free markup: paragraphs, line
-- breaks, bold, italic, underline, and bulleted or numbered lists. It is
-- sanitised down to that set on the way in (see lib/pcd-terms-html.js), because
-- it is rendered into the customer's quote page and drawn into the PDF, and
-- anything else in there would be either a hole or a mess.
--
-- terms_term_ids on the quote is a note of which library terms have been added,
-- so the Add terms modal can say which ones are already on this quote. It is a
-- convenience for that list and nothing reads it for pricing or for print — the
-- terms text itself is the truth.

create table if not exists public.pcd_quote_terms (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  body_html      text not null default '',
  always_include boolean not null default false,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.pcd_quote_terms enable row level security;

drop policy if exists pcd_quote_terms_admin_all on public.pcd_quote_terms;
create policy pcd_quote_terms_admin_all
  on public.pcd_quote_terms
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

comment on table public.pcd_quote_terms is
  'Library of named terms. Adding one to a quote copies its wording; the quote owns the copy from then on.';
comment on column public.pcd_quote_terms.always_include is
  'true = every new quote starts with this term. false = it is added on the quote when it is wanted.';
comment on column public.pcd_quote_terms.body_html is
  'Sanitised subset of HTML: p, br, strong, em, u, ul, ol, li. Nothing else survives the save.';

alter table public.pcd_quotes
  add column if not exists terms_term_ids uuid[] not null default '{}';

comment on column public.pcd_quotes.terms_term_ids is
  'Which library terms have been added to this quote, so the Add terms list can say what is already on it. Display only.';

-- Carry the single default across, so nothing a customer would see changes on
-- the day this runs: whatever the one box held becomes the first term, marked
-- Always, and every new quote keeps starting with exactly that wording.
--
-- Guarded on the table being empty rather than on the text, so re-running this
-- file cannot create a second copy of it.
insert into public.pcd_quote_terms (name, body_html, always_include, sort_order)
select
  'Standard terms',
  coalesce(nullif(btrim(d.quote_terms), ''), ''),
  true,
  10
from public.pcd_business_defaults d
where d.id = '00000000-0000-0000-0000-000000000001'
  and coalesce(nullif(btrim(d.quote_terms), ''), '') <> ''
  and not exists (select 1 from public.pcd_quote_terms);

-- pcd_business_defaults.quote_terms is left in place and nothing writes to it
-- any more. It is the source the row above was seeded from, and keeping it
-- means that seed can be checked after the fact.
comment on column public.pcd_business_defaults.quote_terms is
  'No longer used. Terms live in pcd_quote_terms; this was seeded across by 202608181900.';

notify pgrst, 'reload schema';
