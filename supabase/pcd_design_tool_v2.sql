-- Design Tool v3 additions
-- Run in Supabase SQL editor after pcd_design_tool_v2.sql

alter table public.pcd_design_items
  add column if not exists mount_height_mm integer;
