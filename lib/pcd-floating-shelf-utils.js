// Floating shelf — a decorative-board box shelf: a top panel, a bottom panel
// and a front fascia, all one finish, mitred at 45° at every visible corner so
// no board edge shows. Optionally capped at either end (0, 1 or 2 end panels).
//
// This is the single source of truth for how a shelf breaks down into boards,
// used both to price/preview it in the design tool and to generate the quote's
// decorative-panel line items. Each board carries its FINISHED face dimensions
// (width_mm × height_mm) and a mitre note for the fabricator.

// Which ends are capped, as a { left, right } and a human list.
function cappedEnds(item) {
  const left = Boolean(item?.end_panel_left);
  const right = Boolean(item?.end_panel_right);
  const names = [left && "left", right && "right"].filter(Boolean);
  const label = names.length ? `${names.join(" & ")} end${names.length > 1 ? "s" : ""}` : "";
  return { left, right, label };
}

// The board pieces for a shelf. Each: { part, label, width_mm, height_mm, note }.
// width_mm/height_mm are the finished panel face dimensions the quote prices off.
export function floatingShelfBoards(item) {
  const W = Math.round(Number(item?.width_mm) || 0);
  const D = Math.round(Number(item?.depth_mm) || 0);
  const H = Math.round(Number(item?.height_mm) || 0);
  const ends = cappedEnds(item);
  const endSuffix = ends.label ? ` + ${ends.label}` : "";

  const boards = [
    { part: "top",    label: "Shelf top",    width_mm: W, height_mm: D, note: `Mitre 45°: front edge${endSuffix}.` },
    { part: "bottom", label: "Shelf bottom", width_mm: W, height_mm: D, note: `Mitre 45°: front edge${endSuffix}.` },
    { part: "front",  label: "Shelf front fascia", width_mm: W, height_mm: H, note: `Mitre 45°: top & bottom edges${endSuffix}.` },
  ];
  if (ends.left)  boards.push({ part: "cap-left",  label: "Shelf left end",  width_mm: D, height_mm: H, note: "Mitre 45°: top, bottom & front edges." });
  if (ends.right) boards.push({ part: "cap-right", label: "Shelf right end", width_mm: D, height_mm: H, note: "Mitre 45°: top, bottom & front edges." });
  return boards;
}

// Total board area of a shelf in square metres (for a quick cost/preview).
export function floatingShelfAreaSqm(item) {
  return floatingShelfBoards(item).reduce((sum, b) => sum + (b.width_mm * b.height_mm) / 1e6, 0);
}

// The shelf's finish, taken from the item's single board selection (carcass
// fields, the same shape a panel uses).
export function floatingShelfStyle(item) {
  return {
    material: item?.material || "",
    finish: item?.finish || "",
    colour: item?.colour || "",
    thickness_mm: Number(item?.carcass_thickness_mm) || 18,
    cost_per_sqm: Number(item?.cost_per_sqm_carcass) || 0,
  };
}
