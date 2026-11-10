-- What a site measure booking is for: which rooms, how many of each, and what
-- kind of job. Asked on the public booking form and shown in the sales email,
-- the calendar event and the customer's confirmation.
--
-- measure_rooms is [{"room": "Bathroom", "count": 2}], rooms by label from
-- Settings > Lists (Rooms). job_type is doors, cabinetry or unsure.
-- Bookings made before this have neither, and read as not given.

alter table public.pcd_site_measure_bookings
  add column if not exists measure_rooms jsonb not null default '[]'::jsonb,
  add column if not exists job_type text;
