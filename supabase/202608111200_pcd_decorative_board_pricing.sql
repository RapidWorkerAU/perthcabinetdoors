-- Bulk price update: decorative board colours
--
-- APPLIED 11 Aug 2026. 235 colours updated and verified. Do not run again -
-- the guard will correctly report 'matched 0' because there is nothing left
-- to do. Kept for the record of what was changed and why.
--
-- Scope (agreed):
--   * material_type = 'decorative board' only
--   * ONLY rows that have no board size AND no price on either column
--   * rows with a board size, or a price, or one of the two, are left alone
--   * every row updated gets board size 1200 x 2400 (the only size we supply)
--
-- Board area is fixed at 1.2m x 2.4m = 2.88 sqm, so:
--     cost_per_board_ex_gst = cost_per_sqm_ex_gst * 2.88
--     cost_per_sqm_ex_gst   = cost_per_board_ex_gst / 2.88
--
-- Prices are ex-GST supplier cost, confirmed 11 Aug 2026, from the supplied
-- price sheet. Markup is applied on top of these when quoting.
--
-- Written as ONE self-contained statement on purpose. Supabase pools
-- connections, so a temp table or a session variable does not survive from one
-- statement to the next - it has to all be in the same block. A do block is a
-- single statement, so if it raises an error every change inside it is undone.
--
-- HOW TO USE
--   1. Run the PREVIEW query at the bottom on its own first. It is read-only.
--      It should list 17 lines adding up to 235 colours, matching the price
--      sheet line for line.
--   2. Then run the do block. It reports how many colours it updated.
--   3. Run the VERIFICATION query at the bottom to see the result.

-- ---------------------------------------------------------------------------
-- THE UPDATE
--
-- Two guards, either of which aborts the block and undoes everything:
--   * it must match exactly 235 colours - the number counted when the price
--     sheet was drawn up. A different number means a finish name does not line
--     up, or the library has changed since.
--   * every decorative board colour at 1200 x 2400 must end up with its two
--     price columns agreeing (per board = per sqm x 2.88). Catches a typo in
--     either number below.
-- ---------------------------------------------------------------------------
do $$
declare
  rows_updated integer;
  bad_prices   integer;
begin
  update public.pcd_colour_library as c
  set
    preferred_board_width_mm  = 1200,
    preferred_board_height_mm = 2400,
    cost_per_sqm_ex_gst       = p.cost_per_sqm_ex_gst,
    cost_per_board_ex_gst     = p.cost_per_board_ex_gst
  from (
    values
      --  finish            thickness      $/sqm            $/board          -- colours
      ('Ashgrain'::text,  '16mm'::text,  60.74::numeric,  174.93::numeric),  --   1
      ('Gloss',           '18mm',       111.76,           321.87),           --  20
      ('Legato',          '18mm',        76.88,           221.41),           --  14
      ('Matt',            '16mm',        60.74,           174.93),           --  66
      ('Matt',            '18mm',        66.81,           192.41),           --   4
      ('Ravine',          '18mm',        82.69,           238.15),           --  21
      ('Satin',           '16mm',        30.41,            87.58),           --   1
      ('Satin',           '18mm',        34.88,           100.45),           --   1
      ('Sheen',           '16mm',        75.25,           216.72),           --  11
      ('Sheen',           '18mm',        94.05,           270.86),           --   2
      ('Smooth',          '16mm',        63.78,           183.69),           --  17
      ('Texture',         '16mm',        54.92,           158.17),           --   3
      ('Texture',         '18mm',        25.91,            74.62),           --   1
      ('Ultramatt',       '18mm',       106.42,           306.49),           --  11
      ('Venette',         '18mm',       147.01,           423.39),           --  17
      ('Woodmatt',        '16mm',        72.90,           209.95),           --  31
      ('Woodmatt',        '18mm',        80.20,           230.98)            --  14
      --                                                                     -- 235 total
  ) as p (finish_type, thickness, cost_per_sqm_ex_gst, cost_per_board_ex_gst)
  where c.material_type = 'decorative board'
    and btrim(c.finish_type) = p.finish_type
    and btrim(c.thickness)   = p.thickness
    -- untouched if it already has a board size...
    and coalesce(c.preferred_board_width_mm, 0)  = 0
    and coalesce(c.preferred_board_height_mm, 0) = 0
    -- ...or any price at all, on either column
    and coalesce(c.cost_per_sqm_ex_gst, 0)   = 0
    and coalesce(c.cost_per_board_ex_gst, 0) = 0;

  get diagnostics rows_updated = row_count;

  if rows_updated <> 235 then
    raise exception
      'Stopped: expected to update 235 colours but matched %. Nothing has been changed.',
      rows_updated;
  end if;

  select count(*) into bad_prices
    from public.pcd_colour_library
   where material_type = 'decorative board'
     and preferred_board_width_mm  = 1200
     and preferred_board_height_mm = 2400
     and abs(cost_per_board_ex_gst - (cost_per_sqm_ex_gst * 2.88)) > 0.01;

  if bad_prices > 0 then
    raise exception
      'Stopped: % colour(s) ended up with a per-board price that does not match per-sqm x 2.88. Nothing has been changed.',
      bad_prices;
  end if;

  raise notice 'Updated % decorative board colours.', rows_updated;
end $$;

-- ---------------------------------------------------------------------------
-- PREVIEW - run this on its own BEFORE the block above. Read-only.
--
-- Lists every decorative board colour that will be updated, grouped the same
-- way as the price sheet. Expect 17 lines totalling 235 colours. A finish on
-- the sheet that is missing here, or a line here with no entry on the sheet,
-- means we sort that out before running anything.
-- ---------------------------------------------------------------------------
-- select
--   finish_type,
--   thickness,
--   count(*) as colours_to_update
-- from public.pcd_colour_library
-- where material_type = 'decorative board'
--   and coalesce(preferred_board_width_mm, 0)  = 0
--   and coalesce(preferred_board_height_mm, 0) = 0
--   and coalesce(cost_per_sqm_ex_gst, 0)       = 0
--   and coalesce(cost_per_board_ex_gst, 0)     = 0
-- group by 1, 2
-- order by 1, 2;

-- ---------------------------------------------------------------------------
-- VERIFICATION - run this after the block above.
--   Every line should read 1200 x 2400 apart from the rows we deliberately
--   left alone (Matt 18mm and Woodmatt 18mm also exist at 1800 x 3600).
--   'still_unpriced' should be 0 everywhere except Raw 16mm, which has a board
--   size but no price and so is out of scope by agreement.
-- ---------------------------------------------------------------------------
-- select
--   finish_type,
--   thickness,
--   preferred_board_width_mm  as width_mm,
--   preferred_board_height_mm as height_mm,
--   count(*)                  as colours,
--   min(cost_per_sqm_ex_gst)  as sqm_low,
--   max(cost_per_sqm_ex_gst)  as sqm_high,
--   min(cost_per_board_ex_gst) as board_low,
--   max(cost_per_board_ex_gst) as board_high,
--   count(*) filter (
--     where coalesce(cost_per_sqm_ex_gst, 0) = 0
--       and coalesce(cost_per_board_ex_gst, 0) = 0
--   ) as still_unpriced
-- from public.pcd_colour_library
-- where material_type = 'decorative board'
-- group by 1, 2, 3, 4
-- order by 1, 2, 3, 4;
