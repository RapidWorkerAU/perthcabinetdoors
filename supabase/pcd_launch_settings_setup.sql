create table if not exists public.pcd_launch_settings (
  id text primary key default 'main',
  is_active boolean not null default false,
  live_at text not null default '2026-06-08T12:00',
  status_pill text not null default 'Private preview',
  eyebrow text not null default 'New website loading',
  headline text not null default 'Launching 8 June',
  headline_accent text not null default 'at 12pm.',
  copy text not null default 'We are putting the final pieces in place. Team access is available below.',
  password_label text not null default 'Password',
  show_password_text text not null default 'Show',
  hide_password_text text not null default 'Hide',
  submit_button_text text not null default 'Enter website',
  busy_button_text text not null default 'Checking...',
  empty_password_message text not null default 'Enter the launch access password.',
  config_missing_message text not null default 'Launch access is not configured. Supabase environment variables are missing.',
  accepted_but_unsaved_message text not null default 'Password accepted, but access could not be saved. Please try again.',
  enquiry_prompt_text text not null default 'Need to contact us before launch?',
  enquiry_button_text text not null default 'Send an enquiry',
  enquiry_eyebrow text not null default 'Website enquiry',
  enquiry_title text not null default 'Send us a message',
  close_button_text text not null default 'Close',
  cancel_button_text text not null default 'Cancel',
  send_button_text text not null default 'Send enquiry',
  sending_button_text text not null default 'Sending...',
  enquiry_success_message text not null default 'Thanks. Your enquiry has been received and we will respond within 1-3 business days.',
  updated_at timestamptz not null default now()
);

insert into public.pcd_launch_settings (id)
values ('main')
on conflict (id) do nothing;

alter table public.pcd_launch_settings enable row level security;

drop policy if exists "pcd_launch_settings_public_read" on public.pcd_launch_settings;
create policy "pcd_launch_settings_public_read"
on public.pcd_launch_settings
for select
using (true);
