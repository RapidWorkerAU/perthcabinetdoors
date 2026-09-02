-- Quote request lines: carry the CABINET, not just a sentence about it
-- ---------------------------------------------------------------------------
--
-- WHY. A cabinet is priced from its cut list, and the cut list is worked out
-- from the box: height, width, depth, carcass thickness, whether there is a
-- back, how many shelves and where they sit. When we draw a design ourselves
-- and import it, all of that is written into the quote's cabinet configuration
-- and the cabinet arrives measured and costed.
--
-- A customer's own design took a different route. The request builder wrote the
-- size into a SENTENCE in the line's notes and dropped everything else, because
-- a request was treated as a lead rather than something that had to survive
-- into a quote. There was nowhere on a request line to put a depth, a shelf
-- count or a back panel in the first place.
--
-- So a converted cabinet landed with no height, no width and no depth. Opening
-- the configurator on one showed its built-in starting values (720 high x 900
-- wide x 560 deep, no shelves) with nothing on screen to say the real
-- measurements had been lost. On the first real customer design that came
-- through this way, three cabinets were re-entered by hand off the description.
--
-- cabinet_spec is that missing place. It holds the same cabinet configuration
-- the admin importer builds, so both routes now produce the same cabinet from
-- the same drawing.
--
-- Stored as a snapshot rather than read back off the design at conversion time,
-- on purpose: a request is what the customer asked for on the day. It has to
-- still convert correctly after they have carried on editing their design, or
-- after the design is deleted.
--
-- design_item_id ties the line back to the item it was built from, for anyone
-- tracing a piece back to the drawing. Deliberately NOT a foreign key, for the
-- same reason cabinet_spec is a snapshot: a deleted design must never stop a
-- lead from converting.

alter table public.pcd_quote_request_line_items
  add column if not exists design_item_id uuid,
  add column if not exists cabinet_spec jsonb;

comment on column public.pcd_quote_request_line_items.cabinet_spec is
  'The cabinet box as data (size, carcass thickness, back panel, shelves), in the same shape as pcd_cabinet_configs. Set on base_cabinet lines built from a design. The conversion turns it into the quote cabinet''s configuration and cut list.';

comment on column public.pcd_quote_request_line_items.design_item_id is
  'pcd_design_items row this line was built from. Not an FK on purpose: a deleted design must not stop a lead converting.';

create index if not exists idx_pcd_quote_request_line_items_design_item
  on public.pcd_quote_request_line_items(design_item_id);
