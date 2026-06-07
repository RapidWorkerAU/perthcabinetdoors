import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { normalizeCabinetConfig } from "./pcd-cabinet-utils.js";

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 34;
const HEADER_HEIGHT = 104;
const FOOTER_HEIGHT = 34;
const CONTENT_TOP = HEADER_HEIGHT + 20;
const FOOTER_TOP = PAGE_HEIGHT - FOOTER_HEIGHT;
const STROKE = [0.2, 0.2, 0.2];
const MUTED = [0.45, 0.45, 0.45];
const PANEL = [0.97, 0.98, 0.96];
const LINE = [0.85, 0.82, 0.76];

function cleanText(value) {
  return String(value ?? "").replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "-");
}

function escapePdfText(value) {
  return cleanText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function moneyLabel(value) {
  const number = Number(value) || 0;
  return `$${number.toFixed(2)}`;
}

function mmLabel(value) {
  return `${Math.round(Number(value) || 0)}mm`;
}

function materialLabel(config) {
  return [config.carcass_material, config.carcass_finish, config.carcass_colour].filter(Boolean).join(" - ") || "Cabinet board";
}

function shelfPositions(cabinet, rectHeight) {
  const count = Math.max(0, Number(cabinet.shelf_qty) || 0);
  const heights = Array.isArray(cabinet.shelf_heights_mm) ? cabinet.shelf_heights_mm : [];
  return Array.from({ length: count }, (_, index) => {
    const fallback = ((index + 1) * cabinet.height_mm) / (count + 1);
    const heightFromBottom = Math.min(cabinet.height_mm, Math.max(0, Number(heights[index]) || fallback));
    return {
      index,
      heightFromBottom,
      y: rectHeight - ((heightFromBottom / Math.max(1, cabinet.height_mm)) * rectHeight),
    };
  }).sort((a, b) => a.heightFromBottom - b.heightFromBottom);
}

class PdfPage {
  constructor() {
    this.parts = [];
  }

  y(value) {
    return PAGE_HEIGHT - value;
  }

  color(values, op) {
    this.parts.push(`${values.map((value) => Number(value).toFixed(3)).join(" ")} ${op}`);
  }

  strokeColor(values) {
    this.color(values, "RG");
  }

  fillColor(values) {
    this.color(values, "rg");
  }

  lineWidth(value) {
    this.parts.push(`${value} w`);
  }

  line(x1, y1, x2, y2) {
    this.parts.push(`${x1.toFixed(2)} ${this.y(y1).toFixed(2)} m ${x2.toFixed(2)} ${this.y(y2).toFixed(2)} l S`);
  }

  rect(x, y, width, height, { fill = false, stroke = true } = {}) {
    const op = fill && stroke ? "B" : fill ? "f" : "S";
    this.parts.push(`${x.toFixed(2)} ${this.y(y + height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${op}`);
  }

  dashedRect(x, y, width, height) {
    this.parts.push("[4 4] 0 d");
    this.rect(x, y, width, height);
    this.parts.push("[] 0 d");
  }

  text(value, x, y, size = 10, { bold = false, align = "left" } = {}) {
    const text = escapePdfText(value);
    const approxWidth = cleanText(value).length * size * 0.52;
    const textX = align === "center" ? x - approxWidth / 2 : align === "right" ? x - approxWidth : x;
    this.parts.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${textX.toFixed(2)} ${this.y(y).toFixed(2)} Td (${text}) Tj ET`);
  }

  image(name, x, y, width, height) {
    this.parts.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${this.y(y + height).toFixed(2)} cm /${name} Do Q`);
  }

  tick(x, y, direction = "horizontal") {
    const size = 5;
    if (direction === "horizontal") {
      this.line(x - size, y + size, x + size, y - size);
      return;
    }
    this.line(x - size, y - size, x + size, y + size);
  }

  dimensionLine({ x1, y1, x2, y2, label, orientation = "horizontal" }) {
    this.strokeColor(STROKE);
    this.lineWidth(0.8);
    this.line(x1, y1, x2, y2);
    this.tick(x1, y1, orientation);
    this.tick(x2, y2, orientation);
    if (orientation === "horizontal") {
      this.text(label, (x1 + x2) / 2, y1 - 8, 8, { align: "center" });
    } else {
      this.text(label, x1 - 24, (y1 + y2) / 2, 8, { align: "center" });
    }
  }

  stream() {
    return this.parts.join("\n");
  }
}

class PdfDocument {
  constructor({ logo } = {}) {
    this.pages = [];
    this.logo = logo;
  }

  addPage(draw) {
    const page = new PdfPage();
    draw(page);
    this.pages.push(page);
  }

  toBuffer() {
    const objects = [];
    const fontRegularId = 3;
    const fontBoldId = 4;
    const imageIds = [];
    const logoImageId = this.logo ? 5 : null;
    const logoMaskId = this.logo ? 6 : null;
    const pageIds = [];
    const contentIds = [];
    let nextId = this.logo ? 7 : 5;

    this.pages.forEach(() => {
      pageIds.push(nextId++);
      contentIds.push(nextId++);
    });

    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    objects[fontRegularId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    objects[fontBoldId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
    if (this.logo) {
      imageIds.push(`/Logo ${logoImageId} 0 R`);
      objects[logoMaskId] = imageObject({
        width: this.logo.width,
        height: this.logo.height,
        colorSpace: "/DeviceGray",
        data: zlib.deflateSync(this.logo.alpha),
      });
      objects[logoImageId] = imageObject({
        width: this.logo.width,
        height: this.logo.height,
        colorSpace: "/DeviceRGB",
        data: zlib.deflateSync(this.logo.rgb),
        maskId: logoMaskId,
      });
    }

    this.pages.forEach((page, index) => {
      const content = page.stream();
      const xObjects = imageIds.length ? ` /XObject << ${imageIds.join(" ")} >>` : "";
      objects[pageIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >>${xObjects} >> /Contents ${contentIds[index]} 0 R >>`;
      objects[contentIds[index]] = streamObject(Buffer.from(content, "latin1"));
    });

    const offsets = [];
    const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
    let length = chunks[0].length;
    for (let id = 1; id < objects.length; id += 1) {
      offsets[id] = length;
      const objectBuffer = Buffer.isBuffer(objects[id]) ? objects[id] : Buffer.from(String(objects[id]), "latin1");
      const chunk = Buffer.concat([
        Buffer.from(`${id} 0 obj\n`, "latin1"),
        objectBuffer,
        Buffer.from("\nendobj\n", "latin1"),
      ]);
      chunks.push(chunk);
      length += chunk.length;
    }
    const xrefOffset = length;
    let trailer = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id += 1) {
      trailer += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    }
    trailer += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    chunks.push(Buffer.from(trailer, "latin1"));
    return Buffer.concat(chunks);
  }
}

function streamObject(data, dictionary = "") {
  return Buffer.concat([
    Buffer.from(`<< /Length ${data.length}${dictionary ? ` ${dictionary}` : ""} >>\nstream\n`, "latin1"),
    data,
    Buffer.from("\nendstream", "latin1"),
  ]);
}

function imageObject({ width, height, colorSpace, data, maskId }) {
  const mask = maskId ? ` /SMask ${maskId} 0 R` : "";
  return streamObject(
    data,
    `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /FlateDecode${mask}`
  );
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function parsePngRgba(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("Logo file is not a PNG.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = readUInt32(buffer, offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error("Logo PNG must be 8-bit RGBA.");
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  const rgba = Buffer.alloc(width * height * bytesPerPixel);
  let sourceOffset = 0;
  let targetOffset = 0;
  let previousRow = Buffer.alloc(rowLength);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = Buffer.from(inflated.subarray(sourceOffset, sourceOffset + rowLength));
    sourceOffset += rowLength;

    for (let x = 0; x < rowLength; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previousRow[x] || 0;
      const upLeft = x >= bytesPerPixel ? previousRow[x - bytesPerPixel] || 0 : 0;
      if (filter === 1) row[x] = (row[x] + left) & 0xff;
      if (filter === 2) row[x] = (row[x] + up) & 0xff;
      if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 0xff;
      if (filter === 4) row[x] = (row[x] + paethPredictor(left, up, upLeft)) & 0xff;
    }

    row.copy(rgba, targetOffset);
    targetOffset += rowLength;
    previousRow = row;
  }

  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height);
  for (let i = 0, p = 0, a = 0; i < rgba.length; i += 4, p += 3, a += 1) {
    rgb[p] = rgba[i];
    rgb[p + 1] = rgba[i + 1];
    rgb[p + 2] = rgba[i + 2];
    alpha[a] = rgba[i + 3];
  }

  return { width, height, rgb, alpha };
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function loadLogo() {
  const logoPath = path.join(process.cwd(), "public", "images", "horizontal-pcd-logo.png");
  try {
    return parsePngRgba(fs.readFileSync(logoPath));
  } catch {
    return null;
  }
}

function drawHeader(page, quote, title = "Cabinet drawings") {
  page.fillColor([1, 1, 1]);
  page.strokeColor(LINE);
  page.lineWidth(0.8);
  page.rect(0, 0, PAGE_WIDTH, HEADER_HEIGHT, { fill: true, stroke: false });
  if (page.hasLogo) {
    const logoWidth = 154;
    const logoHeight = logoWidth * (page.logoHeight / page.logoWidth);
    page.image("Logo", MARGIN, 22, logoWidth, logoHeight);
  } else {
    page.fillColor([0.09, 0.2, 0.12]);
    page.text("PERTH CABINET DOORS", MARGIN, 30, 13, { bold: true });
  }
  page.fillColor(STROKE);
  page.text(title, PAGE_WIDTH - MARGIN, 30, 11, { bold: true, align: "right" });
  page.text([quote.quote_number || quote.order_number, quote.customer_name, quote.project_name].filter(Boolean).join("  |  "), PAGE_WIDTH - MARGIN, 48, 9, { align: "right" });
  page.strokeColor(LINE);
  page.lineWidth(0.8);
  page.line(MARGIN, HEADER_HEIGHT, PAGE_WIDTH - MARGIN, HEADER_HEIGHT);
}

function drawFooter(page, pageNumber, pageCount, note = "Drawings are schematic and scaled against cabinet dimensions for quote review.") {
  page.fillColor([1, 1, 1]);
  page.strokeColor(LINE);
  page.lineWidth(0.8);
  page.rect(0, FOOTER_TOP, PAGE_WIDTH, FOOTER_HEIGHT, { fill: true, stroke: false });
  page.line(MARGIN, FOOTER_TOP, PAGE_WIDTH - MARGIN, FOOTER_TOP);
  page.fillColor(MUTED);
  page.text(note, MARGIN, FOOTER_TOP + 21, 8);
  page.text(`Page ${pageNumber} of ${pageCount}`, PAGE_WIDTH - MARGIN, FOOTER_TOP + 21, 8, { align: "right" });
}

function drawDrawingFrame(page, title, x, y, width, height) {
  page.fillColor([1, 1, 1]);
  page.strokeColor(LINE);
  page.lineWidth(0.8);
  page.rect(x, y, width, height, { fill: true, stroke: true });
  page.fillColor(STROKE);
  page.text(title, x + 12, y + 20, 11, { bold: true });
}

function drawFrontElevation(page, cabinet, x, y, width, height, scale) {
  drawDrawingFrame(page, "Front elevation", x, y, width, height);
  const rectWidth = cabinet.width_mm * scale;
  const rectHeight = cabinet.height_mm * scale;
  const rx = x + (width - rectWidth) / 2;
  const ry = y + 52 + ((height - 96 - rectHeight) / 2);
  const thickness = Math.max(2, cabinet.carcass_thickness_mm * scale);
  const shelfThickness = Math.max(2.2, cabinet.shelf_thickness_mm * scale);

  page.strokeColor(STROKE);
  page.lineWidth(1.1);
  page.rect(rx, ry, rectWidth, rectHeight);
  page.strokeColor(MUTED);
  page.lineWidth(0.7);
  page.rect(rx, ry, thickness, rectHeight);
  page.rect(rx + rectWidth - thickness, ry, thickness, rectHeight);

  const sideGap = Math.max(7, thickness);
  page.fillColor(PANEL);
  shelfPositions(cabinet, rectHeight).forEach((shelf) => {
    const sy = ry + shelf.y;
    page.strokeColor(STROKE);
    page.rect(rx + sideGap, sy - shelfThickness / 2, Math.max(1, rectWidth - sideGap * 2), shelfThickness, { fill: true, stroke: true });
    page.fillColor(STROKE);
    page.text(`S${shelf.index + 1} ${mmLabel(shelf.heightFromBottom)}`, rx + rectWidth + 6, sy - 3, 7);
  });

  const dimY = ry + rectHeight + 28;
  const dimX = rx - 26;
  page.strokeColor(MUTED);
  page.line(rx, ry + rectHeight, rx, dimY);
  page.line(rx + rectWidth, ry + rectHeight, rx + rectWidth, dimY);
  page.dimensionLine({ x1: rx, y1: dimY, x2: rx + rectWidth, y2: dimY, label: mmLabel(cabinet.width_mm) });
  page.line(rx, ry, dimX, ry);
  page.line(rx, ry + rectHeight, dimX, ry + rectHeight);
  page.dimensionLine({ x1: dimX, y1: ry, x2: dimX, y2: ry + rectHeight, label: mmLabel(cabinet.height_mm), orientation: "vertical" });
}

function drawSideElevation(page, cabinet, x, y, width, height, scale) {
  drawDrawingFrame(page, "Side elevation", x, y, width, height);
  const rectWidth = cabinet.depth_mm * scale;
  const rectHeight = cabinet.height_mm * scale;
  const rx = x + (width - rectWidth) / 2;
  const ry = y + 52 + ((height - 96 - rectHeight) / 2);
  const shelfThickness = Math.max(2.2, cabinet.shelf_thickness_mm * scale);
  const backThickness = cabinet.back_panel_included ? Math.max(2, cabinet.back_panel_thickness_mm * scale) : 0;

  page.strokeColor(STROKE);
  page.lineWidth(1.1);
  page.rect(rx, ry, rectWidth, rectHeight);
  if (cabinet.back_panel_included) {
    page.fillColor(PANEL);
    page.strokeColor(MUTED);
    page.dashedRect(rx + rectWidth - backThickness, ry, backThickness, rectHeight);
  }

  const frontGap = 4;
  const rearGap = Math.max(8, backThickness + 4);
  page.fillColor(PANEL);
  shelfPositions(cabinet, rectHeight).forEach((shelf) => {
    const sy = ry + shelf.y;
    page.strokeColor(STROKE);
    page.rect(rx + frontGap, sy - shelfThickness / 2, Math.max(1, rectWidth - frontGap - rearGap), shelfThickness, { fill: true, stroke: true });
  });

  const dimY = ry + rectHeight + 28;
  const dimX = rx - 26;
  page.strokeColor(MUTED);
  page.line(rx, ry + rectHeight, rx, dimY);
  page.line(rx + rectWidth, ry + rectHeight, rx + rectWidth, dimY);
  page.dimensionLine({ x1: rx, y1: dimY, x2: rx + rectWidth, y2: dimY, label: mmLabel(cabinet.depth_mm) });
  page.line(rx, ry, dimX, ry);
  page.line(rx, ry + rectHeight, dimX, ry + rectHeight);
  page.dimensionLine({ x1: dimX, y1: ry, x2: dimX, y2: ry + rectHeight, label: mmLabel(cabinet.height_mm), orientation: "vertical" });
}

function drawTopPlan(page, cabinet, x, y, width, height, scale) {
  drawDrawingFrame(page, "Top plan", x, y, width, height);
  const rectWidth = cabinet.width_mm * scale;
  const rectHeight = cabinet.depth_mm * scale;
  const rx = x + (width - rectWidth) / 2;
  const ry = y + 54 + ((height - 100 - rectHeight) / 2);
  const thickness = Math.max(2, cabinet.carcass_thickness_mm * scale);
  const backThickness = cabinet.back_panel_included ? Math.max(2, cabinet.back_panel_thickness_mm * scale) : 0;

  page.strokeColor(STROKE);
  page.lineWidth(1.1);
  page.rect(rx, ry, rectWidth, rectHeight);
  page.strokeColor(MUTED);
  page.line(rx + thickness, ry, rx + thickness, ry + rectHeight);
  page.line(rx + rectWidth - thickness, ry, rx + rectWidth - thickness, ry + rectHeight);
  if (cabinet.back_panel_included) {
    page.fillColor(PANEL);
    page.dashedRect(rx, ry + rectHeight - backThickness, rectWidth, backThickness);
  }

  const dimY = ry + rectHeight + 28;
  const dimX = rx - 26;
  page.strokeColor(MUTED);
  page.line(rx, ry + rectHeight, rx, dimY);
  page.line(rx + rectWidth, ry + rectHeight, rx + rectWidth, dimY);
  page.dimensionLine({ x1: rx, y1: dimY, x2: rx + rectWidth, y2: dimY, label: mmLabel(cabinet.width_mm) });
  page.line(rx, ry, dimX, ry);
  page.line(rx, ry + rectHeight, dimX, ry + rectHeight);
  page.dimensionLine({ x1: dimX, y1: ry, x2: dimX, y2: ry + rectHeight, label: mmLabel(cabinet.depth_mm), orientation: "vertical" });
}

function drawCabinetPage(page, quote, cabinetLine, index, pageCount) {
  const cabinet = normalizeCabinetConfig(cabinetLine.cabinet_config || {});
  const label = cabinetLine.cabinet_config?.label || cabinetLine.product_name || `Base cabinet ${index + 1}`;
  drawHeader(page, quote);
  drawFooter(page, index + 1, pageCount);

  page.fillColor(STROKE);
  page.text(`${index + 1}. ${label}`, MARGIN, CONTENT_TOP, 16, { bold: true });
  page.text(`${mmLabel(cabinet.width_mm)} W x ${mmLabel(cabinet.height_mm)} H x ${mmLabel(cabinet.depth_mm)} D`, MARGIN, CONTENT_TOP + 28, 10, { bold: true });
  page.text(`Material: ${materialLabel(cabinet)}`, MARGIN, CONTENT_TOP + 44, 9);
  page.text(`Back panel: ${cabinet.back_panel_included ? `${mmLabel(cabinet.back_panel_thickness_mm)} included` : "Not included"}  |  Shelves: ${cabinet.shelf_qty || 0}`, MARGIN, CONTENT_TOP + 59, 9);
  page.text(`Cabinet total ex GST: ${moneyLabel(cabinetLine.line_total_ex_gst || cabinetLine.product_unit_cost_ex_gst)}`, PAGE_WIDTH - MARGIN, CONTENT_TOP + 28, 9, { align: "right" });

  const drawingTop = CONTENT_TOP + 86;
  const drawingWidth = 246;
  const drawingHeight = 300;
  const gap = 18;
  const maxDimension = Math.max(cabinet.width_mm, cabinet.height_mm, cabinet.depth_mm, 1);
  const scale = 178 / maxDimension;

  drawFrontElevation(page, cabinet, MARGIN, drawingTop, drawingWidth, drawingHeight, scale);
  drawSideElevation(page, cabinet, MARGIN + drawingWidth + gap, drawingTop, drawingWidth, drawingHeight, scale);
  drawTopPlan(page, cabinet, MARGIN + (drawingWidth + gap) * 2, drawingTop, drawingWidth, drawingHeight, scale);

}

function itemDisplayTitle(item) {
  const title = item?.title || item?.product_type || "Cabinetry item";
  if (String(title).toLowerCase() === "base_cabinet" || item?.product_type === "base_cabinet") return "Base Cabinet";
  return title;
}

function panelPlanning(item) {
  if (!item?.panel_planning || typeof item.panel_planning !== "object" || Array.isArray(item.panel_planning)) return {};
  return item.panel_planning;
}

function isThermolaminatedItem(item) {
  return [
    item?.material,
    item?.title,
    item?.product_type,
    item?.description,
    item?.profile_type,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes("thermolaminate"));
}

function panelPlanFor(item, panelKey) {
  const plan = panelPlanning(item)[panelKey] || {};
  return {
    fulfilment_method: isThermolaminatedItem(item) ? "supplier_ready_made" : plan.fulfilment_method || item.fulfilment_method || "in_house",
    notes: plan.notes ?? item.production_notes ?? item.notes ?? "",
  };
}

function panelKeyFor(...parts) {
  return parts.map((part) => String(part ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item").join(":");
}

function cutDimension(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${number}mm` : "-";
}

function cutSize(widthMm, heightMm) {
  return `${cutDimension(widthMm)} x ${cutDimension(heightMm)}`;
}

function cabinetDimensions(config) {
  const width = Number(config?.width_mm || 0);
  const height = Number(config?.height_mm || 0);
  const depth = Number(config?.depth_mm || 0);
  return width && height && depth ? `${width}W x ${height}H x ${depth}D mm` : "";
}

function cabinetCutLabel(item, itemIndex, copyIndex, totalCopies) {
  const config = item?.cabinet_config || {};
  const baseLabel = config.label || item.description || itemDisplayTitle(item);
  const orderNumber = Number.isFinite(Number(item?.sort_order)) ? Number(item.sort_order) + 1 : itemIndex + 1;
  const copyLabel = totalCopies > 1 ? ` - cabinet ${copyIndex + 1} of ${totalCopies}` : "";
  return `${orderNumber}. ${baseLabel}${copyLabel}`;
}

function cutMaterialDisplay(item, piece) {
  return piece?.material || [item?.material, item?.finish, item?.colour].filter(Boolean).join(" - ") || "-";
}

function cutEdgingDisplay(item, piece) {
  const label = String(piece?.label || item?.title || "").toLowerCase();
  if (label.includes("back panel")) return "No edging unless specified";
  if (label.includes("side panel")) return "Front long edge";
  if (label.includes("top panel") || label.includes("bottom panel") || label.includes("shelf")) return "Front long edge";
  if (item?.edge_mould) return item.edge_mould;
  return "As specified";
}

function buildCutListRows(items) {
  return (items || []).flatMap((item, itemIndex) => {
    const cabinetConfig = item.cabinet_config;
    const cabinetPieces = Array.isArray(cabinetConfig?.calculated_cut_list) ? cabinetConfig.calculated_cut_list : [];
    const isBaseCabinet = item.product_type === "base_cabinet" || !!cabinetConfig;

    if (isBaseCabinet && cabinetPieces.length) {
      const lineQty = Math.max(1, Math.floor(Number(item.qty || 1)));
      const rows = [];
      for (let copyIndex = 0; copyIndex < lineQty; copyIndex += 1) {
        cabinetPieces.forEach((piece) => {
          const pieceQty = Math.max(1, Math.floor(Number(piece.qty || 1)));
          for (let pieceIndex = 0; pieceIndex < pieceQty; pieceIndex += 1) {
            const panelKey = panelKeyFor("cabinet", copyIndex, piece.label, pieceIndex);
            const plan = panelPlanFor(item, panelKey);
            if (plan.fulfilment_method !== "in_house") continue;
            rows.push({
              source: cabinetCutLabel(item, itemIndex, copyIndex, lineQty),
              cabinet: cabinetDimensions(cabinetConfig),
              piece: pieceQty > 1 ? `${piece.label} ${pieceIndex + 1}` : piece.label,
              qty: 1,
              size: cutSize(piece.width_mm, piece.height_mm),
              thickness: piece.thickness_mm ? `${piece.thickness_mm}mm` : item.thickness || "-",
              material: cutMaterialDisplay(item, piece),
              edging: cutEdgingDisplay(item, piece),
              notes: plan.notes || "",
            });
          }
        });
      }
      return rows;
    }

    const panelKey = panelKeyFor("line", item.id);
    const plan = panelPlanFor(item, panelKey);
    if (plan.fulfilment_method !== "in_house") return [];
    return [{
      source: itemDisplayTitle(item),
      cabinet: "",
      piece: item.description || itemDisplayTitle(item),
      qty: item.qty || 1,
      size: item.width_mm || item.height_mm ? cutSize(item.width_mm, item.height_mm) : "-",
      thickness: item.thickness || "-",
      material: cutMaterialDisplay(item),
      edging: cutEdgingDisplay(item),
      notes: plan.notes || "",
    }];
  });
}

function truncateText(value, width, size = 7) {
  const text = cleanText(value || "-").replace(/\s+/g, " ").trim();
  const maxChars = Math.max(3, Math.floor(width / (size * 0.5)));
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}...` : text;
}

function drawCheckbox(page, x, y) {
  page.strokeColor(STROKE);
  page.lineWidth(0.8);
  page.rect(x, y, 10, 10);
}

function drawCutListTableHeader(page, y, columns) {
  page.fillColor([0.96, 0.94, 0.9]);
  page.strokeColor(LINE);
  page.lineWidth(0.7);
  page.rect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, 24, { fill: true, stroke: true });
  page.fillColor(STROKE);
  let x = MARGIN;
  columns.forEach((column) => {
    page.text(column.label, x + 4, y + 15, 6.5, { bold: true });
    x += column.width;
  });
}

function drawCutListRow(page, row, index, y, columns) {
  page.fillColor([1, 1, 1]);
  page.strokeColor(LINE);
  page.lineWidth(0.5);
  page.rect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, 30, { fill: true, stroke: true });
  let x = MARGIN;
  columns.forEach((column) => {
    if (column.key === "done") {
      drawCheckbox(page, x + 8, y + 10);
    } else {
      const value = column.key === "index" ? index + 1 : row[column.key];
      page.fillColor(STROKE);
      page.text(truncateText(value, column.width - 8, column.size || 7), x + 4, y + 18, column.size || 7);
    }
    x += column.width;
  });
}

function drawCutListPage(page, order, rows, pageRows, pageIndex, pageCount) {
  drawHeader(page, order, "Cut list");
  drawFooter(page, pageIndex + 1, pageCount, "Print, cut, edge and tick off each row as completed.");

  const totalPieces = rows.reduce((total, row) => total + Number(row.qty || 0), 0);
  page.fillColor(STROKE);
  page.text("Production cut list", MARGIN, CONTENT_TOP, 16, { bold: true });
  page.text(`${rows.length} cut list rows  |  ${totalPieces} total pieces`, MARGIN, CONTENT_TOP + 24, 9, { bold: true });
  page.text(`Generated ${new Date().toLocaleDateString("en-AU")}`, PAGE_WIDTH - MARGIN, CONTENT_TOP + 24, 8, { align: "right" });

  const columns = [
    { key: "done", label: "Done", width: 30 },
    { key: "index", label: "#", width: 24 },
    { key: "source", label: "Source item", width: 108 },
    { key: "cabinet", label: "Cabinet size", width: 90 },
    { key: "piece", label: "Cut piece", width: 82 },
    { key: "qty", label: "Qty", width: 30 },
    { key: "size", label: "Cut size", width: 70 },
    { key: "thickness", label: "Thick.", width: 46 },
    { key: "material", label: "Material / colour", width: 146 },
    { key: "edging", label: "Edging", width: 98 },
    { key: "notes", label: "Notes", width: 50 },
  ];
  const tableTop = CONTENT_TOP + 50;
  drawCutListTableHeader(page, tableTop, columns);
  pageRows.forEach((row, rowIndex) => {
    drawCutListRow(page, row, pageIndex * 12 + rowIndex, tableTop + 24 + rowIndex * 30, columns);
  });
}

export function generateCabinetDrawingsPdf({ quote, lines }) {
  const cabinetLines = (lines || []).filter((line) => line.product_type === "base_cabinet" && line.cabinet_config);
  if (!cabinetLines.length) {
    throw new Error("No configured base cabinets found for this quote.");
  }

  const logo = loadLogo();
  const pdf = new PdfDocument({ logo });
  cabinetLines.forEach((line, index) => {
    pdf.addPage((page) => {
      page.hasLogo = Boolean(logo);
      page.logoWidth = logo?.width || 1;
      page.logoHeight = logo?.height || 1;
      drawCabinetPage(page, quote, line, index, cabinetLines.length);
    });
  });
  return pdf.toBuffer();
}

export function generateOrderCutListPdf({ order, items }) {
  const rows = buildCutListRows(items);
  if (!rows.length) {
    throw new Error("No made-in-house cut list rows found for this order.");
  }

  const logo = loadLogo();
  const pdf = new PdfDocument({ logo });
  const rowsPerPage = 12;
  const pageCount = Math.ceil(rows.length / rowsPerPage);
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageRows = rows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    pdf.addPage((page) => {
      page.hasLogo = Boolean(logo);
      page.logoWidth = logo?.width || 1;
      page.logoHeight = logo?.height || 1;
      drawCutListPage(page, order, rows, pageRows, pageIndex, pageCount);
    });
  }
  return pdf.toBuffer();
}
