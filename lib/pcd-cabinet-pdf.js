import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { normalizeCabinetConfig } from "./pcd-cabinet-utils.js";
import { calculateQuoteTotals, GST_RATE, toNumber } from "./pcd-quote-utils.js";

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const PORTRAIT_PAGE_WIDTH = 595;
const PORTRAIT_PAGE_HEIGHT = 842;
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
  constructor({ width = PAGE_WIDTH, height = PAGE_HEIGHT } = {}) {
    this.parts = [];
    this.width = width;
    this.height = height;
  }

  y(value) {
    return this.height - value;
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

  addPage(draw, options = {}) {
    const page = new PdfPage(options);
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
      objects[pageIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >>${xObjects} >> /Contents ${contentIds[index]} 0 R >>`;
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
  const pageWidth = page.width || PAGE_WIDTH;
  page.fillColor([1, 1, 1]);
  page.strokeColor(LINE);
  page.lineWidth(0.8);
  page.rect(0, 0, pageWidth, HEADER_HEIGHT, { fill: true, stroke: false });
  if (page.hasLogo) {
    const logoWidth = 154;
    const logoHeight = logoWidth * (page.logoHeight / page.logoWidth);
    page.image("Logo", MARGIN, 22, logoWidth, logoHeight);
  } else {
    page.fillColor([0.09, 0.2, 0.12]);
    page.text("PERTH CABINET DOORS", MARGIN, 30, 13, { bold: true });
  }
  page.fillColor(STROKE);
  page.text(title, pageWidth - MARGIN, 30, 11, { bold: true, align: "right" });
  page.text([quote.quote_number || quote.order_number, quote.customer_name].filter(Boolean).join("  |  "), pageWidth - MARGIN, 48, 9, { align: "right" });
  page.strokeColor(LINE);
  page.lineWidth(0.8);
  page.line(MARGIN, HEADER_HEIGHT, pageWidth - MARGIN, HEADER_HEIGHT);
}

function drawFooter(page, pageNumber, pageCount, note = "Drawings are schematic and scaled against cabinet dimensions for quote review.") {
  const pageWidth = page.width || PAGE_WIDTH;
  const footerTop = (page.height || PAGE_HEIGHT) - FOOTER_HEIGHT;
  page.fillColor([1, 1, 1]);
  page.strokeColor(LINE);
  page.lineWidth(0.8);
  page.rect(0, footerTop, pageWidth, FOOTER_HEIGHT, { fill: true, stroke: false });
  page.line(MARGIN, footerTop, pageWidth - MARGIN, footerTop);
  page.fillColor(MUTED);
  page.text(note, MARGIN, footerTop + 21, 8);
  page.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - MARGIN, footerTop + 21, 8, { align: "right" });
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

function drawCabinetPage(page, quote, cabinetLine, index, pageCount, options = {}) {
  const cabinet = normalizeCabinetConfig(cabinetLine.cabinet_config || {});
  const label = cabinetLine.cabinet_config?.label || cabinetLine.product_name || `Base cabinet ${index + 1}`;
  drawHeader(page, quote, options.title || "Cabinet drawings");
  drawFooter(page, options.pageNumber || index + 1, pageCount);

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

function wrappedTextLines(value, width, size = 8) {
  const text = cleanText(value || "-").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const maxChars = Math.max(4, Math.floor(width / (size * 0.5)));
  const lines = [];

  text.split("\n").forEach((paragraph) => {
    const words = paragraph.replace(/[ \t]+/g, " ").trim().split(" ").filter(Boolean);
    let current = "";
    words.forEach((word) => {
      if (word.length > maxChars) {
        if (current) {
          lines.push(current);
          current = "";
        }
        for (let index = 0; index < word.length; index += maxChars) {
          lines.push(word.slice(index, index + maxChars));
        }
        return;
      }
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
        return;
      }
      current = next;
    });
    if (current) lines.push(current);
  });

  return lines.length ? lines : ["-"];
}

function dateLabel(value) {
  if (!value) return new Date().toLocaleDateString("en-AU");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toLocaleDateString("en-AU") : date.toLocaleDateString("en-AU");
}

function quoteLineTitle(line) {
  return [line.product_name, line.description].filter(Boolean).join(" - ") || line.product_type || "Quote item";
}

function quoteLineSize(line) {
  if (isConfiguredBaseCabinetLine(line)) {
    const cabinet = normalizeCabinetConfig(line.cabinet_config);
    return `${mmLabel(cabinet.width_mm)} W x ${mmLabel(cabinet.height_mm)} H x ${mmLabel(cabinet.depth_mm)} D`;
  }
  const width = Number(line.width_mm || 0);
  const height = Number(line.height_mm || 0);
  if (!width && !height) return "-";
  return `${width || "-"} x ${height || "-"}mm`;
}

function colourWithoutFinish(line) {
  const colour = String(line.colour || "").trim();
  const finish = String(line.finish || "").trim();
  if (!colour || !finish) return colour;
  const escapedFinish = finish.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return colour
    .replace(new RegExp(`\\s*-?\\s*${escapedFinish}\\s*$`, "i"), "")
    .trim() || colour;
}

function quoteLineDetails(line) {
  const details = [];
  if (line.material) details.push(`Material: ${line.material}`);
  if (line.thickness) details.push(`Thickness: ${line.thickness}`);
  if (line.finish) details.push(`Finish: ${line.finish}`);
  if (line.colour) details.push(`Colour: ${colourWithoutFinish(line)}`);
  if (line.edge_mould) details.push(`Edge profile: ${line.edge_mould}`);
  if (line.profile || line.profile_type) details.push(`Front profile: ${[line.profile_type, line.profile].filter(Boolean).join(" - ")}`);
  if (line.hinge_holes) details.push(`Hinge Holes Drilled: ${line.hinge_qty || line.hinge_drilling_qty || "-"} quantity`);
  if (line.hinge_supply) details.push(`Hinges Supplied: ${line.hinge_qty || line.hinge_supply_qty || "-"} supplied`);
  return details.join("\n") || "-";
}

function isConfiguredBaseCabinetLine(line) {
  if (line?.product_type !== "base_cabinet" || !line?.cabinet_config) return false;
  const cabinet = normalizeCabinetConfig(line.cabinet_config);
  return Number(cabinet.width_mm || 0) > 0 && Number(cabinet.height_mm || 0) > 0 && Number(cabinet.depth_mm || 0) > 0;
}

function drawWrappedText(page, value, x, y, width, size = 8, options = {}) {
  const lines = wrappedTextLines(value, width, size);
  const visibleLines = options.maxLines ? lines.slice(0, options.maxLines) : lines;

  visibleLines.forEach((line, index) => {
    page.text(line, x, y + index * (size + 4), size, options);
  });
  return y + visibleLines.length * (size + 4);
}

function drawQuoteInfo(page, quote) {
  const pageWidth = page.width || PORTRAIT_PAGE_WIDTH;
  const boxY = CONTENT_TOP;
  page.fillColor([0.97, 0.98, 0.96]);
  page.strokeColor(LINE);
  page.lineWidth(0.7);
  page.rect(MARGIN, boxY, pageWidth - MARGIN * 2, 88, { fill: true, stroke: true });

  page.fillColor(STROKE);
  page.text("Prepared for", MARGIN + 14, boxY + 20, 8, { bold: true });
  page.text(quote.customer_name || "Customer", MARGIN + 14, boxY + 38, 13, { bold: true });
  page.text([quote.customer_email, quote.customer_phone].filter(Boolean).join("  |  "), MARGIN + 14, boxY + 56, 8);
  drawWrappedText(page, quote.site_address || "", MARGIN + 14, boxY + 72, 250, 8, { maxLines: 1 });

  const rightX = pageWidth - MARGIN - 180;
  page.text("Quote number", rightX, boxY + 20, 8, { bold: true });
  page.text(quote.quote_number || "Draft quote", pageWidth - MARGIN - 12, boxY + 20, 8, { align: "right" });
  page.text("Date", rightX, boxY + 38, 8, { bold: true });
  page.text(dateLabel(quote.updated_at || quote.created_at), pageWidth - MARGIN - 12, boxY + 38, 8, { align: "right" });
}

function drawQuoteLineHeader(page, y, columns) {
  const pageWidth = page.width || PORTRAIT_PAGE_WIDTH;
  page.fillColor([0.96, 0.94, 0.9]);
  page.strokeColor(LINE);
  page.lineWidth(0.7);
  page.rect(MARGIN, y, pageWidth - MARGIN * 2, 24, { fill: true, stroke: true });
  page.fillColor(STROKE);
  let x = MARGIN;
  columns.forEach((column) => {
    const textX = column.align === "right" ? x + column.width - 4 : x + 4;
    page.text(column.label, textX, y + 15, 6.5, { bold: true, align: column.align || "left" });
    x += column.width;
  });
}

function quoteLineCellValues(line, index) {
  return {
    index: index + 1,
    item: quoteLineTitle(line),
    details: quoteLineDetails(line),
    size: quoteLineSize(line),
    qty: line.qty || 1,
    unit: moneyLabel(line.unit_price_ex_gst),
    total: moneyLabel(line.line_total_ex_gst),
  };
}

function quoteLineRowHeight(line, index, columns) {
  const values = quoteLineCellValues(line, index);
  const maxLines = columns.reduce((largest, column) => {
    const lineCount = column.wrap === false
      ? 1
      : wrappedTextLines(values[column.key], column.width - 8, column.size || 7).length;
    return Math.max(largest, lineCount);
  }, 1);
  return Math.max(34, 14 + maxLines * 10);
}

function drawQuoteLineRow(page, line, index, y, columns, rowHeight) {
  const pageWidth = page.width || PORTRAIT_PAGE_WIDTH;
  page.fillColor([1, 1, 1]);
  page.strokeColor(LINE);
  page.lineWidth(0.5);
  page.rect(MARGIN, y, pageWidth - MARGIN * 2, rowHeight, { fill: true, stroke: true });

  const values = quoteLineCellValues(line, index);
  let x = MARGIN;
  columns.forEach((column) => {
    page.fillColor(STROKE);
    const size = column.size || 7;
    const lines = column.wrap === false
      ? [truncateText(values[column.key], column.width - 8, size)]
      : wrappedTextLines(values[column.key], column.width - 8, size);
    const textX = column.align === "right" ? x + column.width - 4 : x + 4;
    lines.forEach((lineText, lineIndex) => {
      page.text(lineText, textX, y + 17 + lineIndex * 10, size, { align: column.align || "left", bold: Boolean(column.bold) });
    });
    x += column.width;
  });
}

function drawQuoteTotals(page, quote, totals, y) {
  const pageWidth = page.width || PORTRAIT_PAGE_WIDTH;
  const width = 220;
  const x = pageWidth - MARGIN - width;
  const rows = [
    ["Subtotal ex GST", totals.subtotal_ex_gst],
    ["GST", totals.gst_amount],
    ["Total inc GST", totals.total_inc_gst],
  ];
  page.fillColor([0.93, 0.97, 0.91]);
  page.strokeColor(LINE);
  page.lineWidth(0.7);
  page.rect(x, y, width, 82, { fill: true, stroke: true });
  rows.forEach(([label, value], index) => {
    const rowY = y + 22 + index * 23;
    if (index) page.line(x + 12, rowY - 12, x + width - 12, rowY - 12);
    page.fillColor(STROKE);
    page.text(label, x + 14, rowY, index === 2 ? 9 : 8, { bold: index === 2 });
    page.text(moneyLabel(value), x + width - 14, rowY, index === 2 ? 9 : 8, { bold: index === 2, align: "right" });
  });
  if (quote.deposit_required) {
    const depositPercent = toNumber(quote.deposit_percent);
    const depositAmount = totals.total_inc_gst * (depositPercent / 100);
    page.text(`Deposit requested: ${depositPercent}% (${moneyLabel(depositAmount)})`, x, y + 102, 8);
  }
}

function drawQuoteNotes(page, quote, y) {
  const sections = [
    ["Notes", quote.client_notes || quote.notes],
    ["Assumptions", quote.assumptions],
    ["Exclusions", quote.exclusions],
    ["Terms", quote.terms],
  ].filter(([, value]) => String(value || "").trim());
  let currentY = y;
  sections.slice(0, 3).forEach(([title, value]) => {
    page.fillColor(STROKE);
    page.text(title, MARGIN, currentY, 9, { bold: true });
    currentY = drawWrappedText(page, value, MARGIN, currentY + 16, 280, 7.5, { maxLines: 4 }) + 8;
  });
}

function quotePdfColumns() {
  return [
    { key: "index", label: "#", width: 18, size: 6.4, wrap: false },
    { key: "item", label: "Item", width: 112, size: 6.4 },
    { key: "details", label: "Material / detail", width: 154, size: 6.4 },
    { key: "size", label: "Size", width: 66, size: 6.4 },
    { key: "qty", label: "Qty", width: 28, size: 6.4, align: "right", wrap: false },
    { key: "unit", label: "Unit ex GST", width: 68, size: 6.4, align: "right", wrap: false },
    { key: "total", label: "Total ex GST", width: 81, size: 6.4, align: "right", bold: true, wrap: false },
  ];
}

function paginateQuoteLines(lines, columns) {
  const pages = [];
  const bottomLimit = PORTRAIT_PAGE_HEIGHT - FOOTER_HEIGHT - 28;
  let currentPage = [];
  let currentY = CONTENT_TOP + 112 + 24;

  lines.forEach((line, index) => {
    const rowHeight = quoteLineRowHeight(line, index, columns);
    if (currentPage.length && currentY + rowHeight > bottomLimit) {
      pages.push(currentPage);
      currentPage = [];
      currentY = CONTENT_TOP + 24;
    }
    currentPage.push({ line, index, rowHeight });
    currentY += rowHeight;
  });

  pages.push(currentPage);
  return pages;
}

function needsSeparateQuoteSummaryPage(pageRows, pageIndex) {
  const bottomLimit = PORTRAIT_PAGE_HEIGHT - FOOTER_HEIGHT - 28;
  const tableTop = pageIndex === 0 ? CONTENT_TOP + 112 : CONTENT_TOP;
  const rowBottom = pageRows.reduce((y, row) => y + row.rowHeight, tableTop + 24);
  return rowBottom + 18 + 132 > bottomLimit;
}

function drawQuotePage(page, quote, totals, pageRows, pageIndex, quotePageCount, overallPageCount, columns) {
  const pageNumber = pageIndex + 1;
  drawHeader(page, quote, "Quote");
  drawFooter(page, pageNumber, overallPageCount, "Quote prepared by Perth Cabinet Doors. Pricing is subject to final review and acceptance.");

  page.fillColor(STROKE);
  page.text("Quote", MARGIN, CONTENT_TOP - 22, 18, { bold: true });
  if (pageIndex === 0) drawQuoteInfo(page, quote);

  const tableTop = pageIndex === 0 ? CONTENT_TOP + 112 : CONTENT_TOP;
  drawQuoteLineHeader(page, tableTop, columns);
  let rowY = tableTop + 24;
  pageRows.forEach(({ line, index, rowHeight }) => {
    drawQuoteLineRow(page, line, index, rowY, columns, rowHeight);
    rowY += rowHeight;
  });

  if (pageIndex === quotePageCount - 1) {
    const summaryY = rowY + 18;
    drawQuoteNotes(page, quote, summaryY);
    drawQuoteTotals(page, quote, totals, summaryY);
  }
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
  const cabinetLines = (lines || []).filter(isConfiguredBaseCabinetLine);
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

export function generateQuotePdf({ quote, lines, businessDefaults }) {
  const normalizedLines = (lines || []).filter(Boolean);
  const totals = calculateQuoteTotals(normalizedLines, quote.gst_rate ?? GST_RATE, {
    ...quote,
    business_defaults: businessDefaults,
  });
  const calculatedLines = totals.lines.map((line, index) => ({
    ...normalizedLines[index],
    ...line,
  }));
  const cabinetLines = calculatedLines.filter(isConfiguredBaseCabinetLine);

  const logo = loadLogo();
  const pdf = new PdfDocument({ logo });
  const columns = quotePdfColumns();
  const quotePages = paginateQuoteLines(calculatedLines, columns);
  if (quotePages.length && needsSeparateQuoteSummaryPage(quotePages[quotePages.length - 1], quotePages.length - 1)) {
    quotePages.push([]);
  }
  const quotePageCount = quotePages.length;
  const pageCount = quotePageCount + cabinetLines.length;

  for (let pageIndex = 0; pageIndex < quotePageCount; pageIndex += 1) {
    const pageRows = quotePages[pageIndex] || [];
    pdf.addPage((page) => {
      page.hasLogo = Boolean(logo);
      page.logoWidth = logo?.width || 1;
      page.logoHeight = logo?.height || 1;
      drawQuotePage(page, quote, totals, pageRows, pageIndex, quotePageCount, pageCount, columns);
    }, { width: PORTRAIT_PAGE_WIDTH, height: PORTRAIT_PAGE_HEIGHT });
  }

  cabinetLines.forEach((line, index) => {
    pdf.addPage((page) => {
      page.hasLogo = Boolean(logo);
      page.logoWidth = logo?.width || 1;
      page.logoHeight = logo?.height || 1;
      drawCabinetPage(page, quote, line, index, pageCount, {
        pageNumber: quotePageCount + index + 1,
        title: "Quote cabinet drawings",
      });
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

// ---- Wall elevation PDF ----

// Cabinet fill colours blended 78% over white (matches SVG fillOpacity={0.78})
const ELEVATION_FILL = {
  base:        [0.400, 0.618, 0.973],
  wall:        [0.324, 0.823, 0.508],
  tall:        [0.981, 0.572, 0.287],
  corner_base: [0.734, 0.480, 0.975],
  corner_wall: [0.645, 0.501, 0.973],
  island:      [0.548, 0.569, 0.611],
};

const ELEVATION_STROKE_COLOR = {
  base:        [0.231, 0.510, 0.965],
  wall:        [0.133, 0.773, 0.369],
  tall:        [0.976, 0.451, 0.086],
  corner_base: [0.659, 0.333, 0.969],
  corner_wall: [0.545, 0.361, 0.965],
  island:      [0.420, 0.447, 0.502],
};

const ELEVATION_TYPE_LABELS = {
  base:        "Base",
  wall:        "Wall",
  tall:        "Tall",
  corner_base: "Corner Base",
  corner_wall: "Corner Wall",
  island:      "Island",
};

function drawElevationPage(page, quote, room, wall, wallCabinets, pageNumber, pageCount) {
  const wallW   = (wall === "top" || wall === "bottom") ? (room.width_mm || 3000) : (room.depth_mm || 3000);
  const wallH   = room.height_mm || 2400;
  const wallLbl = wall.charAt(0).toUpperCase() + wall.slice(1);

  drawHeader(page, quote, "Wall elevations");
  drawFooter(page, pageNumber, pageCount, "Wall elevations are schematic. Cabinet positions are indicative only.");

  // Section heading
  page.fillColor(STROKE);
  page.text(cleanText(room.name || "Room"), MARGIN, CONTENT_TOP, 14, { bold: true });
  page.text(
    `${wallLbl} wall - ${wallW}mm wide x ${wallH}mm high`,
    MARGIN, CONTENT_TOP + 22, 9
  );

  // Space reserved for annotation around the wall outline
  const DIM_LEFT  = 42; // height dim line + rotated label
  const DIM_ABOVE = 32; // total-width dim line + label above
  const DIM_BELOW = 52; // per-cabinet dim lines + labels below

  const headingBottom = CONTENT_TOP + 50;
  const footerTop = (page.height || PAGE_HEIGHT) - FOOTER_HEIGHT;
  const wallAreaH = footerTop - headingBottom;
  const pageWidth = page.width || PAGE_WIDTH;
  const availW    = pageWidth - MARGIN * 2 - DIM_LEFT - 16;
  const availH    = wallAreaH - DIM_ABOVE - DIM_BELOW;

  // Uniform scale to fit wall outline in available space
  const sc  = Math.min(availW / wallW, availH / wallH);
  const dwW = wallW * sc;
  const dwH = wallH * sc;

  // Centre wall horizontally; ceiling at headingBottom + DIM_ABOVE
  const ox = MARGIN + DIM_LEFT + (availW - dwW) / 2;
  const oy = headingBottom + DIM_ABOVE;
  const fy = oy + dwH;

  const sorted = [...wallCabinets].sort((a, b) => (a.x_mm || 0) - (b.x_mm || 0));

  // Wall fill
  page.fillColor([0.976, 0.976, 0.972]);
  page.rect(ox, oy, dwW, dwH, { fill: true, stroke: false });

  // Cabinets
  sorted.forEach((cab) => {
    const rawCx = ox + (cab.x_mm || 0) * sc;
    const rawCw = (cab.width_mm || 600) * sc;
    const ch    = Math.min((cab.height_mm || 720) * sc, dwH);
    const cx    = Math.max(rawCx, ox);
    const cw    = Math.min(rawCw, ox + dwW - cx);
    if (cw < 0.5) return;
    const cy = fy - ch;

    const fill   = ELEVATION_FILL[cab.cabinet_type]         || [0.74, 0.74, 0.74];
    const stroke = ELEVATION_STROKE_COLOR[cab.cabinet_type] || [0.50, 0.50, 0.50];
    const lbl    = cab.label || ELEVATION_TYPE_LABELS[cab.cabinet_type] || "Cabinet";
    const dimTxt = `${cab.width_mm || "?"}x${cab.height_mm || "?"}`;

    page.fillColor(fill);
    page.strokeColor(stroke);
    page.lineWidth(0.5);
    page.rect(cx, cy, cw, ch, { fill: true, stroke: true });

    page.fillColor([1, 1, 1]);
    const fsize   = Math.max(Math.min(8.5, (cw / Math.max(lbl.length, 1)) * 1.3), 5);
    const showTwo = cw >= 22 && ch >= 28;
    const showOne = cw >= 16 && ch >= 14;

    if (showTwo) {
      page.text(lbl,    cx + cw / 2, cy + ch * 0.40, fsize,               { align: "center", bold: true });
      page.text(dimTxt, cx + cw / 2, cy + ch * 0.62, Math.max(fsize - 1, 5), { align: "center" });
    } else if (showOne) {
      page.text(lbl,    cx + cw / 2, cy + ch / 2,    fsize,               { align: "center", bold: true });
    }
  });

  // Wall outline redrawn on top
  page.strokeColor(STROKE);
  page.lineWidth(1.5);
  page.rect(ox, oy, dwW, dwH, { fill: false, stroke: true });

  // Floor line + ground serifs
  page.strokeColor(STROKE);
  page.lineWidth(2.5);
  page.line(ox - 10, fy, ox + dwW + 10, fy);
  page.lineWidth(1);
  const serifStep = dwW / 14;
  [-6, 0, 6].forEach((offset) => {
    const sx = ox + dwW / 2 + offset * serifStep;
    page.line(sx, fy + 2, sx - 6, fy + 8);
  });

  // Total wall width dimension above ceiling
  const widthDimY = oy - 18;
  page.strokeColor(MUTED);
  page.lineWidth(0.5);
  page.line(ox,       oy, ox,       widthDimY - 4);
  page.line(ox + dwW, oy, ox + dwW, widthDimY - 4);
  page.dimensionLine({ x1: ox, y1: widthDimY, x2: ox + dwW, y2: widthDimY, label: `${wallW}mm` });

  // Wall height dimension left of wall
  const heightDimX = ox - 26;
  page.strokeColor(MUTED);
  page.lineWidth(0.5);
  page.line(ox, oy, heightDimX - 3, oy);
  page.line(ox, fy, heightDimX - 3, fy);
  page.dimensionLine({ x1: heightDimX, y1: oy, x2: heightDimX, y2: fy, label: `${wallH}mm`, orientation: "vertical" });

  // Per-cabinet width dimensions below floor
  const cabDimY = fy + 26;
  sorted.forEach((cab) => {
    const rawCx = ox + (cab.x_mm || 0) * sc;
    const rawCw = (cab.width_mm || 600) * sc;
    const cx    = Math.max(rawCx, ox);
    const cw    = Math.min(rawCw, ox + dwW - cx);
    if (cw < 6) return;
    page.strokeColor(MUTED);
    page.lineWidth(0.5);
    page.line(cx,      fy, cx,      cabDimY + 3);
    page.line(cx + cw, fy, cx + cw, cabDimY + 3);
    page.dimensionLine({ x1: cx, y1: cabDimY, x2: cx + cw, y2: cabDimY, label: `${cab.width_mm || "?"}mm` });
  });
}

export function generateElevationPdf({ quote, rooms, cabinetsByRoom }) {
  const wallOrder = ["top", "bottom", "left", "right", "island"];
  const pages = [];

  (rooms || []).forEach((room) => {
    const allCabinets = (cabinetsByRoom || {})[room.id] || [];
    wallOrder.forEach((wall) => {
      const wallCabinets = allCabinets.filter((c) => c.wall === wall);
      if (wallCabinets.length > 0) {
        pages.push({ room, wall, wallCabinets });
      }
    });
  });

  if (!pages.length) {
    throw new Error("No cabinet placements found. Add cabinets to rooms before generating elevations.");
  }

  const logo = loadLogo();
  const pdf  = new PdfDocument({ logo });

  pages.forEach(({ room, wall, wallCabinets }, index) => {
    pdf.addPage((page) => {
      page.hasLogo    = Boolean(logo);
      page.logoWidth  = logo?.width  || 1;
      page.logoHeight = logo?.height || 1;
      drawElevationPage(page, quote, room, wall, wallCabinets, index + 1, pages.length);
    });
  });

  return pdf.toBuffer();
}
