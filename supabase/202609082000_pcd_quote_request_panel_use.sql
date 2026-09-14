-- WHAT KIND OF PANEL, ALL THE WAY FROM THE WEBSITE TO THE WORKSHOP.
--
-- A quote line has carried panel_use for a while: it is how the items table
-- shows a Filler as a Filler and a Scribe as a Scribe rather than six kinds of
-- thing all reading "Panel". The request that a line is converted FROM never
-- had the column, and quoteRequestToQuoteLines never set one, so nothing a
-- customer sent could ever say which kind of panel it was.
--
-- The effect on the bench: every panel off the website arrived as a plain
-- Panel, and somebody had to work out from the notes whether it was a scribe,
-- a filler or a kickboard before it could be cut. This is the missing link.
--
-- Deliberately no check constraint. The panel uses are editable in Settings,
-- Lists, so a constraint here would mean a migration every time somebody adds
-- one, and a request rejected at the database the day they did.

begin;

alter table public.pcd_quote_request_line_items
  add column if not exists panel_use text;

comment on column public.pcd_quote_request_line_items.panel_use is
  'Which kind of panel: End panel, Filler, Scribe, Kickboard, Shelf, Back panel. Null on anything that is not a Panel. Copied onto the quote line at conversion.';

-- Every panel already on record is one nobody could say the kind of, so they
-- stay null. Guessing from the notes here would be inventing an answer the
-- customer never gave.

create index if not exists pcd_quote_request_line_items_panel_use_idx
  on public.pcd_quote_request_line_items (panel_use)
  where panel_use is not null;

commit;
