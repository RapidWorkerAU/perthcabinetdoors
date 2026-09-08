-- What a panel can be: three words out, one word in
-- ---------------------------------------------------------------------------
--
-- WHY THIS IS A MIGRATION AND NOT JUST A CODE CHANGE. The panel uses live in
-- TWO places and both are read. lib/pcd-line-details.js holds the built-in list
-- the quote items table offers, and pcd_list_items holds the rows Settings,
-- Lists edits, which is what lib/pcd-order-form.js writes into the Excel order
-- form's dropdowns. Changing the code alone leaves the spreadsheet still
-- offering words no screen does.
--
-- OUT: Bulkhead, Upstand, Other.
--
--   Bulkhead and Upstand are not things we make.
--
--   "Other" answers nothing. A panel nobody has named already reads as Panel,
--   which says exactly the same thing without looking like somebody chose it.
--
-- IN: Scribe. It was being written into the notes because there was nowhere
-- else for it, and a scribe with a size on it is a panel we cut like any other.
--
-- WHAT HAPPENS TO A LINE THAT ALREADY SAYS ONE OF THE THREE. panel_use is
-- validated against the list on the way in, so such a line keeps the word until
-- somebody saves it, and then loses it and reads as Panel. Nothing else about
-- the line changes: it was always a Panel and it is priced, cut and ordered as
-- one. Count them before running this if you want to know:
--
--   select panel_use, count(*) from public.pcd_quote_line_items
--    where panel_use in ('Bulkhead', 'Upstand', 'Other') group by panel_use;
--
-- If that returns rows you care about, say so before running this rather than
-- after: putting a word back is a one line change, finding out which lines used
-- to carry it is not.

begin;

-- 1. The three that go.
--
-- Deleted rather than deactivated. A hidden row is for a word that is still
-- true and simply not offered any more, so that an old record still reads
-- correctly. These are not that: nothing we make is a bulkhead, and "Other"
-- never meant anything in the first place.
delete from public.pcd_list_items
 where list_key = 'panel_uses'
   and item_key in ('Bulkhead', 'Upstand', 'Other');

-- 2. The one that arrives.
--
-- Sorted between Filler and Kickboard, matching the order of PANEL_USES, so the
-- spreadsheet's dropdown and the quote items table read the same way down.
-- `on conflict do nothing` so re-running this cannot duplicate it or overwrite
-- a label somebody has since edited.
insert into public.pcd_list_items (list_key, item_key, label, sort_order, is_active, is_builtin)
values ('panel_uses', 'Scribe', 'Scribe', 15, true, true)
on conflict (list_key, item_key) do nothing;

-- 3. Re-space what is left, so a use added later lands at the end rather than
-- in the middle of a run of tens.
update public.pcd_list_items as target
   set sort_order = ordered.position
  from (
    select id, (row_number() over (order by sort_order, item_key) - 1) * 10 as position
      from public.pcd_list_items
     where list_key = 'panel_uses'
  ) as ordered
 where target.id = ordered.id
   and target.sort_order is distinct from ordered.position;

commit;
