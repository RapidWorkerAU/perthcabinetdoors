-- A VARIATION THE CUSTOMER AGREED TO THAT NEVER REACHED THE ORDER.
--
-- Approving is two steps. The customer's answer is recorded and the variation
-- goes to 'approved', then it is APPLIED: its lines are written onto the order
-- and the order's totals move. The second step can fail on its own, and when it
-- did, the whole request answered with an error and the variation was left
-- saying "approved" with the order untouched.
--
-- Nothing about the order looked wrong afterwards, which is what made it
-- dangerous. The job carried on at the old price, the balance owing was short
-- by exactly the amount the customer had just agreed to, and the final payment
-- was requested for the wrong number.
--
-- apply_error holds why it stopped, so the order page can say so and somebody
-- can finish it rather than nobody knowing there is anything to finish.
--
-- One do block, because the Supabase SQL editor pools connections and a script
-- that errors part way through has already committed what ran before it.

do $$
declare
  stuck int := 0;
begin
  alter table public.pcd_order_variations
    add column if not exists apply_error text;

  -- Anything already in that state. 'approved' is by definition one of these:
  -- a variation that applied cleanly is 'applied'.
  select count(*) into stuck
    from public.pcd_order_variations
   where status = 'approved';

  if stuck > 0 then
    raise notice 'Variations approved but never written onto their order: %', stuck;
    raise notice 'Open each one and use "Apply to order" on the order page.';
  end if;
end $$;

comment on column public.pcd_order_variations.apply_error is
  'Why an approved variation could not be written onto its order. Null when there is nothing wrong. Cleared automatically the moment it applies.';

notify pgrst, 'reload schema';

-- The ones to look at, oldest first, with what they are worth. Each of these is
-- money agreed with a customer that no order total knows about.
select v.variation_number,
       o.order_number,
       o.customer_name,
       v.approved_at,
       v.total_inc_gst,
       v.apply_error
  from public.pcd_order_variations v
  join public.pcd_orders o on o.id = v.order_id
 where v.status = 'approved'
 order by v.approved_at;
