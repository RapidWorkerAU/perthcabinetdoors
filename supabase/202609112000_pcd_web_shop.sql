-- THE WEB SHOP: DECORATIVE BOARD FRONTS BOUGHT AND PAID FOR ON THE SITE.
--
-- A web order is a quote that nobody sends. Checkout writes a quote and its
-- lines, priced exactly as the quote editor would price them, and hands the
-- total to Stripe. The payment turns it into an order through the same claim
-- the deposit gate uses, so a web order is cut, labelled, delivered and
-- invoiced like every other order from the moment it exists.
--
--   pcd_quotes.source      'web_shop' on a quote made by the shop's checkout.
--                          Null on every other quote. Says who made it, so
--                          nobody wonders who quoted a job nobody quoted.
--   pcd_orders.source      the same, carried onto the order.
--   status 'web_checkout'  a web order waiting on its payment. Its own status
--                          rather than awaiting_deposit, so an unpaid cart never
--                          appears on the quotes list, the deposit chase, the
--                          dashboard or the expiry clock. Archived quietly when
--                          the Stripe page runs out after 24 hours.
--   web_delivery_metro_ex_gst
--                          the flat Perth metro delivery charge on a web order,
--                          ex GST. A Business Default like every other rate.
--
-- One block, so an error anywhere undoes the lot. Safe to run twice.

do $$
declare
  v_bad_count integer;
begin
  alter table public.pcd_quotes
    add column if not exists source text;

  alter table public.pcd_orders
    add column if not exists source text;

  alter table public.pcd_business_defaults
    add column if not exists web_delivery_metro_ex_gst numeric(12,2) not null default 45;

  comment on column public.pcd_quotes.source is
    'web_shop when the quote was written by the website shop checkout. Null otherwise.';
  comment on column public.pcd_orders.source is
    'web_shop when the order was bought and paid for on the website. Null otherwise.';
  comment on column public.pcd_business_defaults.web_delivery_metro_ex_gst is
    'Flat Perth metro delivery charge on a web shop order, ex GST.';

  select count(*) into v_bad_count
  from public.pcd_quotes
  where status is not null
    and status not in ('draft', 'sent', 'viewed', 'awaiting_deposit', 'approved', 'rejected', 'archived', 'web_checkout');

  if v_bad_count > 0 then
    raise exception
      'Not changing the constraint: % quote(s) hold a status outside the new list.',
      v_bad_count;
  end if;

  alter table public.pcd_quotes
    drop constraint if exists pcd_quotes_status_check;

  alter table public.pcd_quotes
    add constraint pcd_quotes_status_check
    check (
      status in ('draft', 'sent', 'viewed', 'awaiting_deposit', 'approved', 'rejected', 'archived', 'web_checkout')
    );
end $$;
