-- Boards to order: what a board is, and what this quote decided about it
-- ---------------------------------------------------------------------------
--
-- WHY. A quote says what we are making and has never said what to buy. Working
-- that out meant adding up square metres by hand and dividing by 2.88, which
-- ignores that a 2100 door and a 400 bulkhead do not share a board neatly, and
-- ignores grain entirely: four tall doors that all have to run the same way
-- take two boards however the square metres divide.
--
-- Two things were missing before that could be answered.
--
--   1. WHETHER A BOARD HAS A GRAIN. The library has never recorded it. A solid
--      colour has no direction, so every panel cut from it can be turned to
--      pack tighter whatever the line says; a woodgrain cannot. Without the
--      answer the calculation has to assume one or the other, and either
--      assumption is wrong on most of the library.
--
--   2. WHAT THIS QUOTE DECIDED. Board size already lives on the colour
--      (preferred_board_width_mm / preferred_board_height_mm, set on 235 rows
--      in August 2026) and that stays the answer. But a job can legitimately
--      differ: a colour ordered in a bigger sheet for one kitchen. That, and
--      the cutting settings, are the quote's, not the colour's.
--
-- SEEDING has_grain. Every existing row needs an answer and there is nothing
-- in the table to derive it from except the finish name, so that is what this
-- uses: the seven finishes below are woodgrains, everything else is not. It
-- will be wrong on a handful of rows and right on most, and every row has an
-- answer from day one rather than the whole library reading as plain. The same
-- list is in lib/pcd-board-order.js as GRAINED_FINISHES, so the screen and this
-- migration make the same guess. Correct any row on Option Libraries, Board.
--
-- Run this BEFORE deploying the code that reads either column. Both reads are
-- written to survive the column being absent, so the order does not matter
-- much, but this way nothing ever falls back.

begin;

-- 1. Does this board have a grain?
alter table public.pcd_colour_library
  add column if not exists has_grain boolean not null default false;

comment on column public.pcd_colour_library.has_grain is
  'True when the board has a direction running down its length, so a panel cut from it cannot be turned. False on a solid colour, where every panel can be turned to pack tighter. Read by lib/pcd-board-order.js when working out how many boards a quote needs.';

update public.pcd_colour_library
   set has_grain = true
 where has_grain = false
   and lower(btrim(coalesce(finish_type, ''))) in (
     'ashgrain', 'natura', 'notaio', 'nuance', 'ravine', 'woodgrain', 'woodmatt'
   );

-- 2. What this quote decided about its boards.
--
-- One jsonb rather than a column each, because the shape is a lid on a bag of
-- per board answers keyed by supplier, colour, finish and thickness, and that
-- is not a set of columns. Shape:
--
--   {
--     "include_carcass": true,
--     "standard_grain":  "height" | "by_type",
--     "kerf_mm":         3.2,
--     "trim_mm":         10,
--     "boards": {
--       "polytec|sepia oak|ravine|18": {
--         "width_mm": 1800, "length_mm": 3600, "has_grain": true
--       }
--     }
--   }
--
-- Every key is optional. An absent key means "whatever the colour library and
-- the business defaults say", which is the normal case: the object only ever
-- holds what somebody deliberately changed on this job. Null, the default,
-- means nothing has been changed at all.
alter table public.pcd_quotes
  add column if not exists board_order_settings jsonb;

comment on column public.pcd_quotes.board_order_settings is
  'What this quote decided about its boards, on the Boards to Order tab: the cutting settings, and any board size or grain set by hand against the colour library. Only ever holds what was deliberately changed; null means nothing was. Normalised by normalizeBoardOrderSettings in lib/pcd-board-order.js.';

-- 3. Saw kerf and edge trim, as Business Defaults.
--
-- They are the same on every quote and they change when the saw or the supplier
-- changes, which is a thing to edit on a screen rather than a constant to
-- redeploy. Seeded with the numbers the prototype used so nothing starts blank;
-- correct them on Settings, Business Defaults.
--
-- A zero trim is a real answer, so neither of these inherits when zero the way
-- the hourly rate does.
alter table public.pcd_business_defaults
  add column if not exists saw_kerf_mm numeric(12,2) not null default 3.2;

alter table public.pcd_business_defaults
  add column if not exists board_edge_trim_mm numeric(12,2) not null default 10;

comment on column public.pcd_business_defaults.saw_kerf_mm is
  'How much width the blade takes between two panels cut from the same board. Used when working out how many boards a quote needs.';

comment on column public.pcd_business_defaults.board_edge_trim_mm is
  'How much is trimmed off each of the four edges of a board before anything is cut from it.';

commit;
