-- What the public site measure booking page says while bookings are switched
-- off. Edited in Settings beside the open/closed switch.

alter table public.pcd_booking_settings
  add column if not exists closed_heading text not null default 'Booking is closed at the moment',
  add column if not exists closed_message text not null default 'We are not taking site measure bookings online right now. Email sales@perthcabinetdoors.com.au and we will find you a day.';
