-- WHICH VARIATION LINE PUT THIS LINE ON THE ORDER.
--
-- Applying a variation inserts one order line per "add" line on it, and stamps
-- them all with the VARIATION's id. That is enough to say "this line came from
-- that variation" and not enough to say "this line came from that line of it".
--
-- Which matters the moment applying fails half way. The status is only marked
-- at the very end, so a variation that inserted three of its five lines and
-- then stopped sits at "approved" with three lines already on the order.
-- Applying it again would insert all five, and the order would carry three
-- duplicates that nobody typed and no total expects.
--
-- With this column, applying can skip the lines it has already written and
-- finish the ones it has not, so pressing the button twice is safe and a half
-- finished apply completes rather than doubling.
--
-- One do block, because the Supabase SQL editor pools connections and a script
-- that errors part way through has already committed what ran before it.

do $$
begin
  alter table public.pcd_order_line_items
    add column if not exists variation_line_id uuid;

  -- No foreign key on purpose. A variation line can be deleted long after its
  -- order line is cut and delivered, and the order line must not go with it.
  -- The column is a note about where the line came from, not a dependency.

  create index if not exists pcd_order_line_items_variation_line_idx
    on public.pcd_order_line_items (variation_line_id)
    where variation_line_id is not null;
end $$;

comment on column public.pcd_order_line_items.variation_line_id is
  'The variation line this order line was created from. Lets applying a variation skip what it has already written, so a retry cannot duplicate lines.';

notify pgrst, 'reload schema';

-- What is already on an order from a variation, and whether it can be told
-- apart line by line yet. Anything applied before this migration has the
-- variation but not the line, which is fine: it is already applied.
select v.variation_number,
       count(li.id)                              as lines_from_this_variation,
       count(li.variation_line_id)               as of_those_traceable_to_a_line
  from public.pcd_order_variations v
  left join public.pcd_order_line_items li on li.variation_id = v.id
 group by v.variation_number
having count(li.id) > 0
 order by v.variation_number;
