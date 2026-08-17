// Grouping for the production sheet.
//
// A cabinet group holds everything that cabinet is made of: its carcass panels,
// its shelves, its kickboard, and its doors and drawer fronts. Anything
// supplied on its own groups by what it is instead.
//
// ── WHAT LINKS A DOOR TO ITS CABINET ─────────────────────────────────────────
// design_item_id on the quote line. Every line the design tool generates for one
// cabinet carries the same one, so the carcass, the doors, the fronts and the
// kickboard all share it. Order lines reach it through quote_line_item_id.
//
// A hand-added line has no design_item_id and nothing to belong to, so it falls
// through to a type group. So does a design item that never had a cabinet, which
// is the whole replacement front trade: a door someone ordered on its own is not
// an assembly of one.

const TYPE_GROUPS = [
  { key: "doors", name: "Doors", meta: "Supplied on their own", matches: /door/i },
  { key: "fronts", name: "Drawer fronts", meta: "Supplied on their own", matches: /drawer/i },
  { key: "panels", name: "Loose panels", meta: "Not linked to a cabinet", matches: /.*/ },
];

function text(value) {
  return String(value ?? "").trim();
}

function isCabinetItem(item) {
  return item?.product_type === "base_cabinet" || Boolean(item?.cabinet_config);
}

function cabinetSize(config) {
  const width = Number(config?.width_mm || 0);
  const height = Number(config?.height_mm || 0);
  const depth = Number(config?.depth_mm || 0);
  return width && height && depth ? `${width}W x ${height}H x ${depth}D mm` : "";
}

// "tall_cabinet" is a stored enum, not something to print at a workshop.
function humanise(value) {
  return text(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function cabinetName(item) {
  return text(item?.cabinet_config?.label) || humanise(item?.product_type) || text(item?.title) || "Cabinet";
}

function typeGroupFor(item) {
  const subject = `${text(item?.product_type)} ${text(item?.title)}`;
  return TYPE_GROUPS.find((group) => group.matches.test(subject)) || TYPE_GROUPS[TYPE_GROUPS.length - 1];
}

/**
 * Groups production rows for printing.
 *
 * Returns [{ key, name, meta, rows }] in the order they should print: cabinets
 * first, in the order their panels appear, then the supplied on their own
 * groups. Every row goes in exactly one group.
 */
export function groupProductionRows(rows = [], { items = [], quoteLines = [] } = {}) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const quoteLinesById = new Map(quoteLines.map((line) => [line.id, line]));

  // Which design items are actually cabinets. A design item with no cabinet in
  // it is not an assembly, however many lines it generated.
  const cabinetAssemblies = new Map();
  items.forEach((item) => {
    const designItemId = quoteLinesById.get(item.quote_line_item_id)?.design_item_id;
    if (!designItemId || !isCabinetItem(item)) return;
    if (cabinetAssemblies.has(designItemId)) return;
    cabinetAssemblies.set(designItemId, {
      key: `assembly:${designItemId}`,
      name: cabinetName(item),
      meta: [cabinetSize(item.cabinet_config), humanise(item.product_type)].filter(Boolean).join(" · "),
      rows: [],
    });
  });

  const groups = [];
  const byKey = new Map();

  const groupFor = (row) => {
    const item = itemsById.get(row.itemId);
    const designItemId = quoteLinesById.get(item?.quote_line_item_id)?.design_item_id;
    const assembly = designItemId ? cabinetAssemblies.get(designItemId) : null;
    if (assembly) return assembly;

    const type = typeGroupFor(item);
    return { key: `type:${type.key}`, name: type.name, meta: type.meta, rows: [] };
  };

  rows.forEach((row) => {
    const template = groupFor(row);
    let group = byKey.get(template.key);
    if (!group) {
      group = { key: template.key, name: template.name, meta: template.meta, rows: [] };
      byKey.set(template.key, group);
      groups.push(group);
    }
    group.rows.push(row);
  });

  // Cabinets first, in the order their panels appear, then the type groups in a
  // fixed order so two sheets for different orders read the same way.
  const typeOrder = TYPE_GROUPS.map((group) => `type:${group.key}`);
  return groups.sort((a, b) => {
    const aType = typeOrder.indexOf(a.key);
    const bType = typeOrder.indexOf(b.key);
    if (aType === -1 && bType === -1) return groups.indexOf(a) - groups.indexOf(b);
    if (aType === -1) return -1;
    if (bType === -1) return 1;
    return aType - bType;
  });
}
