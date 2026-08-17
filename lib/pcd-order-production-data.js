// Everything the production documents need about an order, loaded once.
//
// The cut list sheet and the workshop labels have to agree exactly: the number
// on a label is a row's position on the sheet, so if the two ever loaded
// different items, or loaded them in a different order, the bench would be
// ticking off the wrong line. One loader, one ordering, both documents.

// What the colour library knows about a colour, keyed by its name.
//
// An order line records the colour by NAME. The brand that makes it ("Polytec")
// and its finish ("Woodmatt") live on the library row, not on the line, so the
// label has to look them both up. The line's own finish column is often empty,
// which is why a label built from the line alone printed neither.
//
// Matched on a normalised name rather than an exact one. A catalogue name that
// differs by case or by a stray space is the same colour, and an exact match
// silently produced a label with the brand missing and no way to tell why.
//
// Deliberately soft: a colour that is not in the library, or a library that
// cannot be read, leaves one line off one label. That is not worth failing a
// print run for, so this never throws.
export function colourKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function colourSuppliers(supabase, items) {
  const wanted = new Set((items || []).map((item) => colourKey(item.colour)).filter(Boolean));
  if (!wanted.size) return {};
  const { data, error } = await supabase
    .from("pcd_colour_library")
    .select("name, supplier_name, finish_type");
  if (error || !data) return {};

  const found = {};
  for (const row of data) {
    const key = colourKey(row.name);
    if (!wanted.has(key) || found[key]) continue;
    found[key] = { supplier: row.supplier_name || "", finish: row.finish_type || "" };
  }
  return found;
}

export async function loadOrderProductionData(supabase, orderId) {
  const { data: order, error: orderError } = await supabase
    .from("pcd_orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (orderError) throw orderError;

  const { data: items, error: itemsError } = await supabase
    .from("pcd_order_line_items")
    .select("*")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (itemsError) throw itemsError;

  const quoteLineIds = (items || []).map((item) => item.quote_line_item_id).filter(Boolean);

  // Cabinet configs carry the calculated piece list, which is what turns one
  // base cabinet line into a row per panel.
  let cabinetConfigs = [];
  // Hinge drilling is recorded on the quote line, not the order line, so the
  // labels have to read back through the link to know whether to drill.
  let quoteLines = [];
  if (quoteLineIds.length) {
    const [configs, quotes] = await Promise.all([
      supabase.from("pcd_cabinet_configs").select("*").in("line_item_id", quoteLineIds),
      // design_item_id is what ties a door line to the cabinet it belongs to:
      // every line the design tool generates for one cabinet carries the same
      // one. It is the only structured link between them.
      supabase.from("pcd_quote_line_items").select("id, hinge_holes, hinge_qty, design_item_id").in("id", quoteLineIds),
    ]);
    if (configs.error) throw configs.error;
    if (quotes.error) throw quotes.error;
    cabinetConfigs = configs.data || [];
    quoteLines = quotes.data || [];
  }

  // Variations are read straight off the order rather than inferred from the
  // line items: an applied one has already rewritten the lines, but a pending
  // one has written nothing, and the bench still needs to see it coming.
  const { data: variations, error: variationsError } = await supabase
    .from("pcd_order_variations")
    .select("*, pcd_order_variation_lines(*)")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (variationsError) throw variationsError;

  const configsByLineId = new Map(cabinetConfigs.map((config) => [config.line_item_id, config]));

  return {
    order,
    colourSuppliers: await colourSuppliers(supabase, items),
    items: (items || []).map((item) => ({
      ...item,
      // The snapshot taken when the order was raised is the truth. The live
      // join is only a fallback for orders created before snapshots existed:
      // reading it is what let a quote edit change an order's panel list.
      cabinet_config: item.cabinet_config_snapshot || configsByLineId.get(item.quote_line_item_id) || null,
    })),
    quoteLines,
    variations: variations || [],
    variationLines: (variations || []).flatMap((variation) => variation.pcd_order_variation_lines || []),
  };
}
