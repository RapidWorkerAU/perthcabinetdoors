alter table public.pcd_quote_line_items
  add column if not exists client_note text;
