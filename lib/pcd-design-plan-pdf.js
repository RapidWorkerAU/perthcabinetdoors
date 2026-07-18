// Customer-facing cabinetry plan PDF for the design tool.
//
// The visual pages (floor plan, wall elevations, 3D renders) are rasterised on
// the client from the exact on-screen views — so line / default-colour / real-
// finish modes all come through verbatim, including the tile textures — and
// embedded here as images. Everything else (cover, cabinet + finish schedule,
// finish palette, notes / approval) is drawn as crisp vector, reusing the same
// hand-rolled PDF engine as the cut-list/quote exports.
//
// The generator is deliberately tolerant: any missing capture just drops its
// page, so a room with no 3D renders (or no cabinets) still produces a valid,
// sensibly-paginated document.

import {
  PdfDocument,
  loadLogo,
  drawHeader,
  drawFooter,
  decodeImageDataUrl,
  MARGIN,
  HEADER_HEIGHT,
  FOOTER_HEIGHT,
  PORTRAIT_PAGE_WIDTH,
  PORTRAIT_PAGE_HEIGHT,
  PAGE_WIDTH,
  PAGE_HEIGHT,
  STROKE,
  MUTED,
  PANEL,
  LINE,
} from "./pcd-cabinet-pdf.js";

const CONTENT_TOP = HEADER_HEIGHT + 18;
const FOOTER_NOTE = "Design approval drawing. Colours and finishes shown are indicative; confirm against physical samples.";

const WALL_LABELS = { top: "Wall 1 (top)", bottom: "Wall 2 (bottom)", left: "Wall 3 (left)", right: "Wall 4 (right)", island: "Island" };
const TYPE_LABELS = {
  base_cabinet: "Base", wall_cabinet: "Wall", tall_cabinet: "Tall",
  corner_base_cabinet: "Corner base", blind_corner_cabinet: "Blind corner",
  panel: "Panel", scribe: "Scribe", obstruction: "Obstruction",
};
const FRONT_LABELS = { none: "Open", doors: "Doors", drawers: "Drawers", mixed: "Doors + drawers" };

function wallLabel(wall) { return WALL_LABELS[wall] || wall || "—"; }
function typeLabel(t) { return TYPE_LABELS[t] || String(t || "").replace(/_/g, " "); }
function frontLabel(item) { return FRONT_LABELS[item?.front_type || "none"] || item?.front_type || "—"; }

function finishText(material, finish, colour) {
  return [material, finish, colour].map((v) => (v == null ? "" : String(v))).filter(Boolean).join(" / ") || "—";
}
function sizeText(item) {
  const w = Math.round(Number(item?.width_mm) || 0);
  const h = Math.round(Number(item?.height_mm) || 0);
  const d = Math.round(Number(item?.depth_mm) || 0);
  return `${w} x ${h} x ${d}`;
}
function featuresText(item) {
  const out = [];
  if ((item?.front_type || "none") === "none" && Number(item?.shelf_qty) > 0) out.push(`${item.shelf_qty} shelves`);
  if (item?.has_benchtop) out.push("benchtop");
  if (item?.has_kickboard) out.push("kickboard");
  if (item?.has_filler_panel) out.push("filler");
  if (item?.has_rangehood) out.push("rangehood");
  if (item?.item_type === "blind_corner_cabinet") out.push(`blind ${item?.blind_side || ""}`.trim());
  return out.join(", ") || "—";
}

// A design item's carcass, then door, colour — used both for the schedule and,
// on the client, for building the palette.
function cabinetCarcassText(item) { return finishText(item?.material, item?.finish, item?.colour); }
function cabinetDoorText(item) {
  const s = item?.door_style || item?.drawer_style;
  if (!s) return "—";
  return finishText(s.material, s.finish, s.colour);
}

// Only the items a customer is actually being shown — placed cabinetry, not
// obstructions (walls/nibs) or unplaced drafts.
function scheduleItems(items) {
  return (items || []).filter((i) => i?.wall && i?.item_type && i.item_type !== "obstruction");
}

function applyLogo(page, logo) {
  page.hasLogo = Boolean(logo);
  page.logoWidth = logo?.width || 1;
  page.logoHeight = logo?.height || 1;
}

// Draw an image scaled to fit a box, preserving aspect ratio and centring it.
function drawFittedImage(page, entry, bx, by, bw, bh) {
  if (!entry?.width || !entry?.height) return null;
  const scale = Math.min(bw / entry.width, bh / entry.height);
  const w = entry.width * scale;
  const h = entry.height * scale;
  const x = bx + (bw - w) / 2;
  const y = by + (bh - h) / 2;
  page.image(entry.name, x, y, w, h);
  return { x, y, w, h };
}

function truncate(value, maxChars) {
  const text = String(value == null ? "" : value);
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}.` : text;
}

// ---- Page builders --------------------------------------------------------

function drawCover(page, { project, room, subtitle, dateLabel, colourModeLabel, hero }) {
  const pw = page.width;
  let y = HEADER_HEIGHT + 70;
  page.fillColor(STROKE);
  page.text("Cabinetry Design Plan", pw / 2, y, 24, { bold: true, align: "center" });
  y += 30;
  page.fillColor(MUTED);
  page.text(subtitle || room?.name || project?.name || "", pw / 2, y, 13, { align: "center" });
  y += 26;

  const meta = [
    project?.name ? `Project: ${project.name}` : "",
    (project?.client_name || project?.customer_name) ? `Client: ${project.client_name || project.customer_name}` : "",
    dateLabel ? `Date: ${dateLabel}` : "",
    colourModeLabel ? `Finish view: ${colourModeLabel}` : "",
  ].filter(Boolean);
  page.fillColor(STROKE);
  meta.forEach((line) => { page.text(line, pw / 2, y, 11, { align: "center" }); y += 16; });
  y += 12;

  if (hero) {
    const box = { x: MARGIN + 16, y, w: pw - 2 * (MARGIN + 16), h: page.height - FOOTER_HEIGHT - y - 26 };
    page.strokeColor(LINE);
    page.lineWidth(0.8);
    page.rect(box.x, box.y, box.w, box.h, { fill: false, stroke: true });
    drawFittedImage(page, hero, box.x + 6, box.y + 6, box.w - 12, box.h - 12);
  }
}

function drawImagePage(page, entry, caption) {
  const pw = page.width;
  const ph = page.height;
  const top = CONTENT_TOP;
  const bottom = ph - FOOTER_HEIGHT - (caption ? 26 : 8);
  page.strokeColor(LINE);
  page.lineWidth(0.8);
  page.rect(MARGIN, top, pw - 2 * MARGIN, bottom - top, { fill: false, stroke: true });
  drawFittedImage(page, entry, MARGIN + 6, top + 6, pw - 2 * MARGIN - 12, bottom - top - 12);
  if (caption) {
    page.fillColor(MUTED);
    page.text(caption, pw / 2, bottom + 16, 9, { align: "center" });
  }
}

const SCHEDULE_COLS = [
  { key: "ref", label: "Cabinet", x: 0, w: 96 },
  { key: "type", label: "Type", x: 96, w: 66 },
  { key: "size", label: "W x H x D", x: 162, w: 92 },
  { key: "carcass", label: "Carcass", x: 254, w: 104 },
  { key: "front", label: "Doors / drawers", x: 358, w: 104 },
  { key: "features", label: "Features", x: 462, w: 65 },
];

function drawSchedulePage(page, rows, { pageIndex, pageCount, roomName }) {
  const left = MARGIN;
  const contentW = page.width - 2 * MARGIN;
  let y = CONTENT_TOP + 6;
  page.fillColor(STROKE);
  const base = roomName ? `Cabinet & finish schedule — ${roomName}` : "Cabinet & finish schedule";
  page.text(pageCount > 1 ? `${base} (${pageIndex + 1}/${pageCount})` : base, left, y, 13, { bold: true });
  y += 18;

  // Header row
  page.fillColor(PANEL);
  page.rect(left, y, contentW, 18, { fill: true, stroke: false });
  page.fillColor(STROKE);
  const cx = (col) => left + (col.x / 527) * contentW;
  const cw = (col) => (col.w / 527) * contentW;
  SCHEDULE_COLS.forEach((col) => page.text(col.label, cx(col) + 3, y + 12, 8, { bold: true }));
  y += 18;
  page.strokeColor(LINE);
  page.lineWidth(0.6);
  page.line(left, y, left + contentW, y);

  const rowH = 20;
  rows.forEach((row, i) => {
    if (i % 2 === 1) { page.fillColor([0.98, 0.98, 0.97]); page.rect(left, y, contentW, rowH, { fill: true, stroke: false }); }
    page.fillColor(STROKE);
    SCHEDULE_COLS.forEach((col) => {
      const maxChars = Math.floor(cw(col) / (7.5 * 0.55));
      page.text(truncate(row[col.key], maxChars), cx(col) + 3, y + 13, 7.5);
    });
    y += rowH;
    page.strokeColor(LINE);
    page.line(left, y, left + contentW, y);
  });
}

function drawPalettePage(page, rows) {
  const left = MARGIN;
  const contentW = page.width - 2 * MARGIN;
  let y = CONTENT_TOP + 6;
  page.fillColor(STROKE);
  page.text("Finishes & colours", left, y, 13, { bold: true });
  y += 22;

  const cols = 2;
  const gap = 16;
  const cellW = (contentW - gap * (cols - 1)) / cols;
  const swatch = 54;
  const cellH = swatch + 14;

  rows.forEach((row, i) => {
    const col = i % cols;
    const cx = left + col * (cellW + gap);
    if (col === 0 && i > 0) y += cellH + 12;
    // Swatch: the tile image if the client sent one, otherwise a plain block.
    page.strokeColor(LINE);
    page.lineWidth(0.8);
    if (row.entry) {
      drawFittedImage(page, row.entry, cx, y, swatch, swatch);
      page.rect(cx, y, swatch, swatch, { fill: false, stroke: true });
    } else {
      page.fillColor(PANEL);
      page.rect(cx, y, swatch, swatch, { fill: true, stroke: true });
    }
    const tx = cx + swatch + 12;
    const tw = cellW - swatch - 12;
    const maxChars = Math.floor(tw / (9 * 0.52));
    page.fillColor(STROKE);
    page.text(truncate(row.role || "Finish", maxChars), tx, y + 14, 8, { bold: true });
    page.fillColor([0.2, 0.2, 0.2]);
    page.text(truncate(row.name || "—", maxChars), tx, y + 30, 10);
    if (row.supplier) { page.fillColor(MUTED); page.text(truncate(row.supplier, maxChars), tx, y + 44, 8); }
  });
}

function drawNotesPage(page, { inclusions, exclusions }) {
  const left = MARGIN;
  const contentW = page.width - 2 * MARGIN;
  let y = CONTENT_TOP + 6;
  page.fillColor(STROKE);
  page.text("Notes & approval", left, y, 13, { bold: true });
  y += 24;

  const block = (title, lines) => {
    page.fillColor(STROKE);
    page.text(title, left, y, 10, { bold: true });
    y += 16;
    page.fillColor([0.2, 0.2, 0.2]);
    lines.forEach((line) => {
      const maxChars = Math.floor((contentW - 14) / (9 * 0.5));
      page.text(`-  ${truncate(line, maxChars)}`, left + 6, y, 9);
      y += 14;
    });
    y += 12;
  };

  block("Included", inclusions);
  block("Not included / by others", exclusions);

  // Sign-off
  y = Math.max(y, page.height - FOOTER_HEIGHT - 150);
  page.strokeColor(LINE);
  page.lineWidth(0.8);
  page.fillColor(STROKE);
  page.text("Approval", left, y, 11, { bold: true });
  y += 26;
  const lineW = (contentW - 30) / 2;
  const sig = (label, x) => {
    page.strokeColor(STROKE);
    page.line(x, y + 22, x + lineW, y + 22);
    page.fillColor(MUTED);
    page.text(label, x, y + 34, 8);
  };
  sig("Customer name & signature", left);
  sig("Date", left + lineW + 30);
}

// ---- Entry point ----------------------------------------------------------

const COLOUR_MODE_LABELS = { line: "Line drawing", default: "Product colours", real: "Real finishes" };

export function generateDesignPlanPdf({ project = {}, rooms, room, items, captures, palette, options = {} } = {}) {
  const logo = loadLogo();
  const headerMeta = {
    quote_number: project.reference || project.name || "Design plan",
    customer_name: project.client_name || project.customer_name || "",
  };
  const colourModeLabel = COLOUR_MODE_LABELS[options.colourMode] || null;

  // Accept either the multi-room shape (rooms: [{ room, items, captures,
  // palette }]) or the original single-room shape, normalised to a one-entry
  // list so the rest of the builder is room-count agnostic.
  const roomList = Array.isArray(rooms) && rooms.length
    ? rooms
    : [{ room: room || {}, items: items || [], captures: captures || {}, palette: palette || [] }];

  // Decode captures into named image entries the document can embed. Names are
  // prefixed per room so two rooms' "Plan" images never collide in the pool.
  const images = [];
  const add = (dataUrl, name) => {
    if (!dataUrl) return null;
    const entry = decodeImageDataUrl(dataUrl, name);
    if (entry?.width && entry?.height) { images.push(entry); return entry; }
    return null;
  };

  const perRoom = roomList.map((r, ri) => ({
    room: r.room || {},
    items: r.items || [],
    planEntry: add(r.captures?.plan, `R${ri}Plan`),
    elevEntries: (r.captures?.elevations || [])
      .map((e, i) => ({ ...e, entry: add(e.image, `R${ri}Elev${i}`) }))
      .filter((e) => e.entry),
    renderEntries: (r.captures?.renders || [])
      .map((x, i) => ({ ...x, entry: add(x.image, `R${ri}Render${i}`) }))
      .filter((x) => x.entry),
  }));

  // One combined finishes page for the whole document, deduped across rooms so
  // a colour shared by two rooms isn't listed twice.
  const paletteSeen = new Set();
  const paletteRows = [];
  roomList.forEach((r, ri) => {
    (r.palette || []).forEach((p, i) => {
      const key = `${p.role}|${p.name}`;
      if (!p.name || paletteSeen.has(key)) return;
      paletteSeen.add(key);
      paletteRows.push({ ...p, entry: p.image ? add(p.image, `R${ri}Sw${i}`) : null });
    });
  });

  const inclusions = [
    "All cabinetry as drawn: carcasses, doors, drawers, fronts and fixed shelving.",
    "Benchtops, kickboards and filler panels where shown on the drawings.",
    "Finishes and colours per the finishes & colours page.",
  ];
  const exclusions = [
    "Appliances, sinks, taps and rangehood units (supplied and installed by others unless noted).",
    "Plumbing, electrical, tiling and splashbacks.",
    "Site measurements to be confirmed prior to manufacture.",
  ];

  // Assemble the page list, dropping any page whose content is absent.
  const LANDSCAPE = { width: PAGE_WIDTH, height: PAGE_HEIGHT };
  const PORTRAIT = { width: PORTRAIT_PAGE_WIDTH, height: PORTRAIT_PAGE_HEIGHT };
  const pages = [];

  const multi = perRoom.length > 1;
  const heroEntry = perRoom[0]?.renderEntries[0]?.entry || perRoom[0]?.planEntry || null;
  const coverSubtitle = multi
    ? `${perRoom.length} rooms: ${perRoom.map((p) => p.room?.name).filter(Boolean).join(", ")}`
    : (perRoom[0]?.room?.name || project?.name || "");

  pages.push({
    size: PORTRAIT, title: "Design plan",
    draw: (page) => drawCover(page, { project, subtitle: coverSubtitle, dateLabel: options.date || "", colourModeLabel, hero: heroEntry }),
  });

  // Each room contributes its own run of pages: plan, elevations, 3D renders,
  // then its schedule — so a multi-room document reads room by room.
  perRoom.forEach(({ room: r, items: rItems, planEntry, elevEntries, renderEntries }) => {
    const roomName = r?.name || "";
    const tag = multi && roomName ? ` — ${roomName}` : "";
    const captionPrefix = multi && roomName ? `${roomName} — ` : "";

    if (planEntry) {
      pages.push({
        size: LANDSCAPE, title: `Floor plan${tag}`,
        draw: (page) => drawImagePage(page, planEntry, `Floor plan - ${roomName} (${Math.round(r?.width_mm || 0)} x ${Math.round(r?.depth_mm || 0)}mm)`),
      });
    }
    elevEntries.forEach((e) => {
      const label = e.label || wallLabel(e.wall);
      const caption = `Elevation - ${captionPrefix}${label}${e.widthMm ? ` (${Math.round(e.widthMm)}mm wide)` : ""}`;
      pages.push({ size: LANDSCAPE, title: `Elevation${tag}: ${label}`, draw: (page) => drawImagePage(page, e.entry, caption) });
    });
    renderEntries.forEach((x, i) => {
      pages.push({ size: LANDSCAPE, title: `3D view${tag}`, draw: (page) => drawImagePage(page, x.entry, `${captionPrefix}${x.label || `3D view ${i + 1}`}`) });
    });

    const rows = scheduleItems(rItems).map((item, i) => ({
      ref: item.label || `${typeLabel(item.item_type)} ${i + 1}`,
      type: typeLabel(item.item_type),
      size: sizeText(item),
      carcass: cabinetCarcassText(item),
      front: `${frontLabel(item)}${item.door_style || item.drawer_style ? ` - ${cabinetDoorText(item)}` : ""}`,
      features: featuresText(item),
    }));
    if (rows.length) {
      const perPage = 26;
      const chunks = [];
      for (let i = 0; i < rows.length; i += perPage) chunks.push(rows.slice(i, i + perPage));
      chunks.forEach((chunk, idx) => {
        pages.push({
          size: PORTRAIT, title: `Schedule${tag}`,
          draw: (page) => drawSchedulePage(page, chunk, { pageIndex: idx, pageCount: chunks.length, roomName: multi ? roomName : "" }),
        });
      });
    }
  });

  if (paletteRows.length) {
    pages.push({ size: PORTRAIT, title: "Finishes", draw: (page) => drawPalettePage(page, paletteRows) });
  }
  pages.push({ size: PORTRAIT, title: "Notes & approval", draw: (page) => drawNotesPage(page, { inclusions, exclusions }) });

  const pdf = new PdfDocument({ logo, images });
  const total = pages.length;
  pages.forEach((pg, idx) => {
    pdf.addPage((page) => {
      applyLogo(page, logo);
      drawHeader(page, headerMeta, pg.title);
      pg.draw(page);
      drawFooter(page, idx + 1, total, FOOTER_NOTE);
    }, pg.size);
  });

  return pdf.toBuffer();
}
