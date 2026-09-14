-- Put the shoe rack and the trouser rack under their own kinds.
--
-- Both were added as Cabinet Inserts, which was the only accessory kind that
-- fitted at the time. Each now has a kind of its own, and the design tool draws
-- from the kind: as Cabinet Inserts they are drawn as a plain box of the space
-- they take up, and as themselves they are drawn as the rack, with its levels,
-- its shoes and its trousers.
--
-- Matched on the name rather than the id so this runs the same way anywhere.
-- Only a row still sitting on cabinet_inserts is touched, so running it twice
-- changes nothing the second time.
--
-- Cabinets already carrying one pick the new kind up on their own: the design
-- panel brings an accessory back in line with its library row when the cabinet
-- is next opened. Nothing has to be removed and re-added, and no height moves.

do $$
declare
  shoe_rows int;
  trouser_rows int;
begin
  update pcd_hardware
     set type = 'pull_out_shoe_rail'
   where type = 'cabinet_inserts'
     and name ilike '%shoe%';
  get diagnostics shoe_rows = row_count;

  update pcd_hardware
     set type = 'pull_out_trouser_rack'
   where type = 'cabinet_inserts'
     and name ilike '%trouser%';
  get diagnostics trouser_rows = row_count;

  raise notice 'Shoe racks retyped: %, trouser racks retyped: %', shoe_rows, trouser_rows;
end $$;
