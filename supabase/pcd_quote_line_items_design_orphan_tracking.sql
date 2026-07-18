-- Lets a deleted design item's quote lines be found and cleaned up on the
-- next import, instead of becoming permanent, undetectable orphans.
--
-- 1. design_item_id must SURVIVE its item being deleted.
--
--    It was declared `references pcd_design_items(id) on delete set null`, so
--    deleting a cabinet in the design tool nulled the tag on every quote line
--    it had produced. The importer's dedupe only ever visits items that still
--    exist, so those lines became indistinguishable from hand-added ones and
--    could never be found again.
--
--    It bites hardest on run-merged panels, which are tagged with the run's
--    FIRST cabinet: delete that cabinet from a two-cabinet island run and the
--    1800mm back panel it owned is stranded on the quote, while the surviving
--    cabinet emits a fresh 900mm one. 2700mm of back panel billed for a 900mm
--    island — permanently, and re-importing only ever reconfirms it.
--
--    Dropping the FK keeps the uuid behind as a tombstone. Referential
--    integrity is deliberately traded away here: the entire point is that the
--    row must outlive its referent long enough to be swept. Nothing joins on
--    this column — it is only ever compared against ids the importer already
--    holds in memory.
--
-- 2. design_project_id, so the sweep can scope itself.
--
--    One quote can carry lines from more than one design project, so "delete
--    lines whose design_item_id no longer exists" is unsafe on its own — it
--    has to mean "...and that belonged to THIS project". Without it a sweep
--    would eat another project's lines.

alter table public.pcd_quote_line_items
  drop constraint if exists pcd_quote_line_items_design_item_id_fkey;

alter table public.pcd_quote_line_items
  add column if not exists design_project_id uuid;

-- Backfill from the items that still exist. Lines already orphaned by the old
-- SET NULL behaviour have lost their tag for good and stay null — they remain
-- manual-looking, exactly as they are today. This fixes the future, not the
-- past; pre-existing orphans still need finding by hand.
update public.pcd_quote_line_items l
set design_project_id = i.design_project_id
from public.pcd_design_items i
where l.design_item_id = i.id
  and l.design_project_id is null;

create index if not exists idx_pcd_quote_line_items_design_project
  on public.pcd_quote_line_items(quote_id, design_project_id);

comment on column public.pcd_quote_line_items.design_item_id is
  'The design item this line was imported from. Deliberately NOT a foreign '
  'key: it must survive the item being deleted so the next import can sweep '
  'the line rather than leave it orphaned. Null on hand-added lines.';

comment on column public.pcd_quote_line_items.design_project_id is
  'The design project this line was imported from. Scopes the importer''s '
  'orphan sweep so it can never touch another project''s or a hand-added line.';
