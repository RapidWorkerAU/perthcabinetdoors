-- Labour hours on a quote become an override you can see and clear, the same
-- way the ABS edging cost already works.
--
-- WHY. The box on the quote held a "manual" figure that was ADDED to the hours
-- worked out from the lines. So a quote could show four hours of labour while
-- the only box you could type in said zero, with nothing on screen to say where
-- the other four came from or how to be rid of them. Clearing the box did not
-- clear the hours. There was no way to correct a wrong figure from the screen
-- it was wrong on.
--
-- Now the box holds the whole number. Blank means follow the lines; a typed
-- number, including zero, pins it. That needs the column to be able to hold
-- nothing, which it could not.
--
-- THE BACKFILL KEEPS EVERY EXISTING QUOTE AT EXACTLY THE TOTAL IT SHOWS TODAY.
--
--   manual_labour_hours = 0  meant "no manual hours, follow the lines", which
--                            is precisely what null now means. 36 quotes.
--   manual_labour_hours > 0  meant "these hours PLUS whatever the lines add".
--                            The new meaning is "these hours, full stop", so
--                            the override is set to labour_hours: the total
--                            those quotes are already showing. 23 quotes, of
--                            which 2 actually had line hours to fold in.
--
-- Run this before deploying the code change. Without it every quote reads its
-- stored 0 as "pinned at zero", and the two quotes that derive hours from their
-- lines would show no labour until somebody re-saved them.

alter table public.pcd_quotes
  alter column manual_labour_hours drop not null;

alter table public.pcd_quotes
  alter column manual_labour_hours drop default;

update public.pcd_quotes
   set manual_labour_hours = labour_hours
 where coalesce(manual_labour_hours, 0) > 0
   and coalesce(labour_hours, 0) > coalesce(manual_labour_hours, 0);

update public.pcd_quotes
   set manual_labour_hours = null
 where manual_labour_hours = 0;

comment on column public.pcd_quotes.manual_labour_hours is
  'Labour hours typed on the quote, overriding the hours worked out from its lines. Null means follow the lines. A typed 0 means this job carries no labour and is not the same as null.';

-- What the backfill did, to check against. Every row should show the same
-- labour_hours it had before this ran.
--
-- select quote_number, labour_hours, manual_labour_hours,
--        case when manual_labour_hours is null then 'follows the lines'
--             else 'pinned' end as labour_source
--   from public.pcd_quotes
--  order by created_at desc;
