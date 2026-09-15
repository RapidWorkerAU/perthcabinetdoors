import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { cutPieceRole, normalizeCabinetConfig } from "./pcd-cabinet-utils.js";
import { calculateQuoteTotals, formatMoney, GST_RATE, hingeSpecText, toNumber } from "./pcd-quote-utils.js";
import { bandedEdgesText, panelUseFor } from "./pcd-line-details.js";
import { applyPanelNumbers } from "./pcd-order-panel-numbers.js";
import { termsHtmlToBlocks } from "./pcd-terms-html.js";
import { groupProductionRows } from "./pcd-production-groups.js";
import { lineNotesText } from "./pcd-line-notes.js";
import {
  BUSINESS_ABN_SPACED,
  BUSINESS_PHONE,
  LEGAL_ENTITY,
  SALES_EMAIL,
  TRADING_NAME,
} from "./pcd-business-identity.js";
import {
  boardGroupKey,
  boardGroupSpec,
  isHardwareLine,
  lineDisplayName,
  lineEdgeLines,
  lineSubLines,
  lineFrontProfile,
} from "./pcd-quote-line-display.js";
import { hingeCustomerLines } from "./pcd-hinges.js";
import { supplierForLine } from "./pcd-line-supplier.js";
import { issueBlocksLabel, issueKindLabel, issueOwnerLabel } from "./pcd-order-issues.js";
import {
  buildVariationContext,
  CUT_LIST_STATES,
  proposedAdditionFlag,
  proposedAdditionNote,
  variationStateForItem,
} from "./pcd-cut-list-variations.js";

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const PORTRAIT_PAGE_WIDTH = 595;
const PORTRAIT_PAGE_HEIGHT = 842;
const MARGIN = 34;
const HEADER_HEIGHT = 62;
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
  return formatMoney(value);
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

// ---- HOW WIDE A PIECE OF TEXT ACTUALLY IS ----
//
// Everything in this file used to guess: half the point size a character, a
// little more for bold. A guess is close enough to break a line on, and it is
// not close enough to align on. Right aligned money came out ragged, a centred
// cell sat off centre, and two words placed one after the other by measuring
// the first ran into each other.
//
// These are the real advance widths from Adobe's AFM files for Helvetica and
// Helvetica-Bold, in thousandths of an em, for the printable ASCII range. That
// is the whole range this writer can produce: cleanText flattens anything else
// to a dash, and these are the only two faces plus the oblique, which is
// metrically identical to the plain.
//
// Indexed from character 32, so code - 32 is the position.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/**
 * How wide `value` prints at `size` points.
 *
 * Anything outside the printable ASCII range is charged at 556, the width of a
 * digit, which is what cleanText would have turned it into anyway.
 */
function textWidth(value, size, bold = false) {
  const table = bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  const text = String(value ?? "");
  let units = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    units += code >= 32 && code <= 126 ? table[code - 32] : 556;
  }
  return (units / 1000) * size;
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

  // Graphics state, so a clip can be applied and then thrown away again.
  save() {
    this.parts.push("q");
  }

  restore() {
    this.parts.push("Q");
  }

  // Everything drawn until the next restore() is trimmed to this rectangle,
  // which is what lets a diagonal run past the edge of a narrow strip without
  // spilling into the row beside it.
  clipRect(x, y, width, height) {
    this.parts.push(`${x.toFixed(2)} ${this.y(y + height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re W n`);
  }

  // Four bezier arcs. The y flip is applied to every point, and a circle is
  // symmetric about it, so the shape is unchanged by the conversion.
  circle(cx, cy, radius, { fill = true, stroke = false } = {}) {
    const k = radius * 0.5523;
    const py = (value) => this.y(value).toFixed(2);
    const px = (value) => value.toFixed(2);
    this.parts.push(`${px(cx - radius)} ${py(cy)} m`);
    this.parts.push(`${px(cx - radius)} ${py(cy - k)} ${px(cx - k)} ${py(cy - radius)} ${px(cx)} ${py(cy - radius)} c`);
    this.parts.push(`${px(cx + k)} ${py(cy - radius)} ${px(cx + radius)} ${py(cy - k)} ${px(cx + radius)} ${py(cy)} c`);
    this.parts.push(`${px(cx + radius)} ${py(cy + k)} ${px(cx + k)} ${py(cy + radius)} ${px(cx)} ${py(cy + radius)} c`);
    this.parts.push(`${px(cx - k)} ${py(cy + radius)} ${px(cx - radius)} ${py(cy + k)} ${px(cx - radius)} ${py(cy)} c`);
    this.parts.push(fill && stroke ? "B" : fill ? "f" : "S");
  }

  dashedRect(x, y, width, height) {
    this.parts.push("[4 4] 0 d");
    this.rect(x, y, width, height);
    this.parts.push("[] 0 d");
  }

  text(value, x, y, size = 10, { bold = false, italic = false, align = "left" } = {}) {
    const text = escapePdfText(value);
    const width = textWidth(cleanText(value), size, bold);
    const textX = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    const font = bold ? "F2" : italic ? "F3" : "F1";
    this.parts.push(`BT /${font} ${size} Tf ${textX.toFixed(2)} ${this.y(y).toFixed(2)} Td (${text}) Tj ET`);
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
  // `images` are extra named XObjects available to every page, each either a
  // FlateDecode RGB image ({ name, width, height, rgb, alpha? }) or a passthrough
  // JPEG ({ name, width, height, jpeg }). The logo is wired as one of these.
  // `producer` is written into the PDF's Info dictionary, where a viewer shows
  // it under File > Properties. It is how a printed document is traced back to
  // the code that drew it: chasing a layout bug through photographs of paper
  // costs hours when the file turns out to predate the fix.
  constructor({ logo, images = [], producer = null } = {}) {
    this.pages = [];
    this.logo = logo;
    this.images = images;
    this.producer = producer;
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
    // Oblique is a third BASE FOURTEEN face, so it costs one more font object and
    // nothing embedded. Used on the labels, where the colour brand and finish sit
    // under the colour name and need to read as an aside rather than as spec.
    const fontItalicId = 5;

    // Unified image list: the logo (if present) plus any caller-supplied images,
    // each exposed under its own name to every page's /XObject resources.
    const allImages = [];
    if (this.logo) allImages.push({ name: "Logo", ...this.logo });
    for (const img of this.images || []) allImages.push(img);

    // Every id below is handed out from here, so adding a fixed object above
    // means moving this. It was 5 when there were two fonts; adding the italic
    // face without moving it gave object 5 to both that font and the first
    // image, and the image won. The page then declared /F3 as a font resource
    // pointing at an image XObject, and a viewer that cannot resolve a font
    // stops drawing the content stream THERE, silently. Everything after the
    // first italic word disappeared off the label while the stream itself
    // stayed perfectly well formed, which is exactly as hard to find as it
    // sounds. See the object-table test in test/pdf-objects.test.mjs.
    let nextId = 6;
    const imagePlan = allImages.map((img) => {
      const imageId = nextId++;
      const maskId = img.alpha ? nextId++ : null;
      return { img, imageId, maskId };
    });

    const imageIds = [];
    const pageIds = [];
    const contentIds = [];
    this.pages.forEach(() => {
      pageIds.push(nextId++);
      contentIds.push(nextId++);
    });

    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    const infoId = this.producer ? nextId++ : null;
    if (infoId) {
      objects[infoId] = `<< /Producer (${escapePdfText(this.producer)}) /Creator (${escapePdfText(this.producer)}) >>`;
    }
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    objects[fontRegularId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    objects[fontBoldId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
    objects[fontItalicId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>";
    for (const { img, imageId, maskId } of imagePlan) {
      imageIds.push(`/${img.name} ${imageId} 0 R`);
      if (img.jpeg) {
        objects[imageId] = jpegImageObject({ width: img.width, height: img.height, data: img.jpeg });
        continue;
      }
      if (maskId) {
        objects[maskId] = imageObject({
          width: img.width, height: img.height, colorSpace: "/DeviceGray",
          data: zlib.deflateSync(img.alpha),
        });
      }
      objects[imageId] = imageObject({
        width: img.width, height: img.height, colorSpace: "/DeviceRGB",
        data: zlib.deflateSync(img.rgb), maskId,
      });
    }

    this.pages.forEach((page, index) => {
      const content = page.stream();
      const xObjects = imageIds.length ? ` /XObject << ${imageIds.join(" ")} >>` : "";
      objects[pageIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R /F3 ${fontItalicId} 0 R >>${xObjects} >> /Contents ${contentIds[index]} 0 R >>`;
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
    const info = infoId ? ` /Info ${infoId} 0 R` : "";
    trailer += `trailer\n<< /Size ${objects.length} /Root 1 0 R${info} >>\nstartxref\n${xrefOffset}\n%%EOF`;
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

// A JPEG embedded verbatim (DCTDecode reads the compressed bytes directly, so
// photographic pages — the 3D renders and textured plan/elevation captures —
// stay small instead of ballooning as raw deflated RGB.
function jpegImageObject({ width, height, data }) {
  return streamObject(
    data,
    `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`
  );
}

// Pixel dimensions from a JPEG's frame header (SOF marker).
function jpegSize(buffer) {
  let offset = 2; // skip SOI (FF D8)
  while (offset < buffer.length - 8) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    // Start-of-frame markers carry the dimensions (excluding DHT/JPG/DAC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return { width: 0, height: 0 };
}

// Turns a client-captured `data:image/png|jpeg;base64,…` URL into a PdfDocument
// image entry. JPEG stays compressed (DCTDecode); PNG is decoded to RGBA.
function decodeImageDataUrl(dataUrl, name) {
  const match = /^data:image\/(png|jpeg);base64,([\s\S]*)$/.exec(dataUrl || "");
  if (!match) return null;
  const data = Buffer.from(match[2], "base64");
  if (match[1] === "jpeg") {
    const { width, height } = jpegSize(data);
    return { name, width, height, jpeg: data };
  }
  const { width, height, rgb, alpha } = parsePngRgba(data);
  return { name, width, height, rgb, alpha };
}

/**
 * The same, for bytes that arrived from somewhere other than the browser.
 *
 * The reference page's tiles are fetched from storage rather than captured on a
 * canvas, so they arrive as a buffer and a content type instead of a data URL.
 *
 * NEVER THROWS. A tile that will not decode must cost that one tile and not the
 * whole production sheet: the sheet is what the workshop needs today, and a
 * corrupt swatch in the colour library is not a reason to send them nothing.
 */
function decodeImageBuffer(buffer, name, contentType = "") {
  if (!buffer || !buffer.length) return null;
  try {
    // The magic bytes, not the content type. Storage serves plenty of PNGs
    // labelled application/octet-stream, and a wrong label would otherwise
    // silently drop a tile that was perfectly readable.
    const isPng = buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;

    if (isJpeg || /jpe?g/i.test(contentType)) {
      const { width, height } = jpegSize(buffer);
      if (!width || !height) return null;
      return { name, width, height, jpeg: buffer };
    }
    if (!isPng) return null;
    const { width, height, rgb, alpha } = parsePngRgba(buffer);
    if (!width || !height) return null;
    return { name, width, height, rgb, alpha };
  } catch {
    return null;
  }
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

// How many samples a pixel has, per PNG colour type.
const PNG_CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * A PNG, as RGB plus an alpha channel.
 *
 * IT USED TO ACCEPT ONE FORMAT. This was written for the logo, which is 8 bit
 * RGBA, and refused everything else outright. That was fine while the logo was
 * the only PNG that ever reached a document, and became a silent hole the day
 * the production sheet started printing the app's own artwork: the edge profile
 * sections in /public are 4 bit PALETTE PNGs, so every one of them was rejected
 * and printed as a box saying "No picture on file" with the file sitting right
 * there on disk.
 *
 * It now reads what the assets actually are: palette, greyscale and truecolour,
 * at any bit depth, with or without alpha. Interlaced PNGs are still refused,
 * because none of ours are and a wrong picture is worse than a missing one.
 */
function parsePngRgba(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("That file is not a PNG.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let paletteAlpha = null;
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
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "tRNS") {
      paletteAlpha = Buffer.from(data);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }

  const channels = PNG_CHANNELS[colorType];
  if (!channels) throw new Error(`Unsupported PNG colour type ${colorType}.`);
  if (![1, 2, 4, 8, 16].includes(bitDepth)) throw new Error(`Unsupported PNG bit depth ${bitDepth}.`);
  if (interlace) throw new Error("Interlaced PNGs are not supported.");
  if (colorType === 3 && !palette) throw new Error("Palette PNG has no palette.");
  if (!width || !height) throw new Error("PNG has no size.");

  // Filtering works on bytes, and on the pixel BEFORE this one. Below 8 bits a
  // pixel is part of a byte, so the offset is one byte; above it, whole bytes.
  const bitsPerPixel = channels * bitDepth;
  const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const rowLength = Math.ceil((width * bitsPerPixel) / 8);

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const rows = [];
  let sourceOffset = 0;
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

    rows.push(row);
    previousRow = row;
  }

  // One sample out of a row, whatever the bit depth. Sixteen bit samples keep
  // their high byte: the extra precision is invisible on paper.
  const maxValue = (1 << bitDepth) - 1;
  const sampleAt = (row, index) => {
    if (bitDepth === 16) return row[index * 2];
    if (bitDepth === 8) return row[index];
    const perByte = 8 / bitDepth;
    const byte = row[Math.floor(index / perByte)] || 0;
    const shift = 8 - bitDepth * ((index % perByte) + 1);
    return (byte >> shift) & maxValue;
  };
  // Greyscale below 8 bits is scaled up, so 4 bit white is 255 and not 15.
  const scale = (value) => (bitDepth >= 8 ? value : Math.round((value * 255) / maxValue));

  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height, 255);

  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const target = pixel * 3;
      const first = x * channels;

      if (colorType === 3) {
        const index = sampleAt(row, x);
        rgb[target] = palette[index * 3] ?? 0;
        rgb[target + 1] = palette[index * 3 + 1] ?? 0;
        rgb[target + 2] = palette[index * 3 + 2] ?? 0;
        if (paletteAlpha) alpha[pixel] = paletteAlpha[index] ?? 255;
        continue;
      }

      if (colorType === 0 || colorType === 4) {
        const grey = scale(sampleAt(row, first));
        rgb[target] = grey;
        rgb[target + 1] = grey;
        rgb[target + 2] = grey;
        if (colorType === 4) alpha[pixel] = scale(sampleAt(row, first + 1));
        continue;
      }

      rgb[target] = scale(sampleAt(row, first));
      rgb[target + 1] = scale(sampleAt(row, first + 1));
      rgb[target + 2] = scale(sampleAt(row, first + 2));
      if (colorType === 6) alpha[pixel] = scale(sampleAt(row, first + 3));
    }
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

// Crops an image to the pixels that actually carry ink.
//
// The logo files are exported with whitespace around the artwork. The rectangle
// lockup is 16.6% empty at the top and 7.7% at the bottom, so the mark occupies
// three quarters of the file's height and sits off centre inside it. Placing
// that file in a box makes the LOGO a quarter smaller than the box and hangs it
// low, which is why sizing the file to match the number plate still looked
// wrong beside it. Trimming first means the height asked for is the height the
// mark is drawn at.
function trimTransparent(image) {
  const { width, height, rgb, alpha } = image;
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const opaque = alpha ? alpha[y * width + x] >= 24 : true;
      // Near-white counts as background too: some exports are flattened onto
      // white rather than left transparent.
      const inked = rgb[i] <= 245 || rgb[i + 1] <= 245 || rgb[i + 2] <= 245;
      if (!opaque || !inked) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) return image;

  const w = right - left + 1;
  const h = bottom - top + 1;
  if (w === width && h === height) return image;

  const out = { width: w, height: h, rgb: Buffer.alloc(w * h * 3) };
  if (alpha) out.alpha = Buffer.alloc(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const from = ((y + top) * width + (x + left)) * 3;
      const to = (y * w + x) * 3;
      out.rgb[to] = rgb[from];
      out.rgb[to + 1] = rgb[from + 1];
      out.rgb[to + 2] = rgb[from + 2];
      if (alpha) out.alpha[y * w + x] = alpha[(y + top) * width + (x + left)];
    }
  }
  return out;
}

// The quote and drawing documents run the logo across a wide header, so the
// horizontal lockup suits them. The labels give it a block beside the number
// plate, where the horizontal one shrinks to an unreadable strip, so they ask
// for the rectangle lockup by name and for it to be trimmed to its ink.
function loadLogo(name = "horizontal-pcd-logo", { trim = false } = {}) {
  const logoPath = path.join(process.cwd(), "public", "images", `${name}.png`);
  try {
    const image = parsePngRgba(fs.readFileSync(logoPath));
    return trim && image ? trimTransparent(image) : image;
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

// Shared with the cutting plan, which is its own document but the same brand,
// fonts and page furniture, drawn by this same writer. The writer, header,
// footer and logo are already shared at the bottom of this file; the cutting
// plan also needs the real text widths and where the content starts. See
// lib/pcd-cutting-plan-pdf.js.
export { textWidth };
export const PDF_LAYOUT = { PAGE_WIDTH, PAGE_HEIGHT, MARGIN, CONTENT_TOP, FOOTER_HEIGHT, STROKE, MUTED, LINE };

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
  page.text(`${mmLabel(cabinet.height_mm)} H x ${mmLabel(cabinet.width_mm)} W x ${mmLabel(cabinet.depth_mm)} D`, MARGIN, CONTENT_TOP + 28, 10, { bold: true });
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
  // A Scribe and a Kickboard are both "Panel" by type, and are made
  // differently. The kind is the name when the title is only the bare type.
  const use = panelUseFor(item?.product_type, item?.panel_use);
  if (use) return String(title).trim().toLowerCase() === "panel" ? use : `${title} (${use})`;
  return title;
}

/**
 * What the bench needs to know about a loose piece beyond its cut: the grain,
 * and the drilling with which boring. Carcass pieces off a cabinet's cut list
 * are not drilled and have no grain answer of their own, so this is loose
 * lines only.
 */
function makeNotes(item) {
  const grain = String(item?.grain_direction || "").trim();
  return [
    grain && grain !== "Standard" ? (grain === "No grain" ? "No grain" : `Grain ${grain.toLowerCase()}`) : "",
    hingeSpecText(item),
  ].filter(Boolean).join(". ");
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

function panelPlanFor(item, panelKey, colourSuppliers = {}) {
  const plan = panelPlanning(item)[panelKey] || {};
  return {
    fulfilment_method: isThermolaminatedItem(item) ? "supplier_ready_made" : plan.fulfilment_method || item.fulfilment_method || "in_house",
    // Every note, not the first one found. These used to collapse to one, so a
    // per-panel note hid whatever was written on the line itself. Built through
    // the shared helper so this sheet and the order screen can never disagree
    // about what is written against a line. See lib/pcd-line-notes.js.
    notes: lineNotesText(item, plan),
    // The screen worked this out from the colour when nothing was stored, and
    // this printed a dash, so the same row read "Polytec" on one and nothing on
    // the other. One answer now. See lib/pcd-line-supplier.js.
    supplier_name: supplierForLine(item, plan, colourSuppliers),
    supplier_order_ref: plan.supplier_order_ref || "",
    supplier_ordered_at: plan.supplier_ordered_at || "",
    supplier_eta: plan.supplier_eta || "",
    status: plan.status || item.status || "",
  };
}

function shortDateLabel(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-AU");
}

function titleCaseLabel(value) {
  return String(value || "-").replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function panelKeyFor(...parts) {
  return parts.map((part) => String(part ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item").join(":");
}

function cutDimension(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${number}mm` : "-";
}

function cutSize(heightMm, widthMm) {
  return `${cutDimension(heightMm)} x ${cutDimension(widthMm)}`;
}

function cabinetDimensions(config) {
  const width = Number(config?.width_mm || 0);
  const height = Number(config?.height_mm || 0);
  const depth = Number(config?.depth_mm || 0);
  return width && height && depth ? `${height}H x ${width}W x ${depth}D mm` : "";
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

/**
 * The material cell, with the profile on a line of its own beneath it.
 *
 * The cell wrapper already breaks on newlines, so this needs no new column and
 * costs no width. A piece of a cabinet gets no profile line: a carcass panel is
 * not profiled, and printing "no profile" against every side panel would bury
 * the fronts that are.
 */
function cutMaterialCell(item, piece, { withThickness = false } = {}) {
  const board = cutMaterialDisplay(item, piece);
  // The supplier table has no thickness column and no room for a twelfth, so a
  // supplier made item printed no thickness anywhere. It leads the cell there,
  // because "18mm Thermolaminate" is how somebody says it out loud.
  const thickness = withThickness
    ? String(piece?.thickness_mm ? piece.thickness_mm + "mm" : item?.thickness || "").trim()
    : "";
  const material = thickness && !board.includes(thickness) ? thickness + " " + board : board;
  if (!frontProfileApplies(item, piece)) return material;
  const profile = frontProfileDisplay(item);
  // Only said when there is something to say. A front with no profile recorded
  // is covered by the edging column, which does say when nothing is recorded.
  return profile ? `${material}\n${profile} profile` : material;
}

// The same three facts as cutMaterialDisplay, kept apart.
//
// The sheet wants one string in one column. A label sets the COLOUR as its
// headline, with the board under it and the brand and finish below, so it needs
// them separately rather than having to unpick a joined string. A cabinet piece
// that came out of the cut list calculation carries a single material label with
// no structure behind it, and there is nothing to split.
function cutMaterialParts(item, piece) {
  if (piece?.material) return { materialName: piece.material, colourName: "", finishName: "" };
  return {
    materialName: item?.material || "",
    colourName: item?.colour || "",
    finishName: item?.finish || "",
  };
}

// The FRONT profile: the shape routed or pressed into the face of a door, as
// distinct from the edge profile. It is the whole specification of a
// thermolaminated door, which has no edge tape at all, and it was reaching the
// CSV and nothing else. A carcass panel has none, so this is empty far more
// often than not and every caller has to treat empty as "do not print a line".
export function frontProfileDisplay(source) {
  return [source?.profile_type, source?.profile].map((v) => String(v || "").trim()).filter(Boolean).join(" - ");
}

// Whether a front profile is a question worth asking of this piece at all.
//
// A door, a drawer front or a loose panel has a face, so a blank there means
// nobody recorded one. A carcass piece off the cut list calculation is a side,
// a back or a shelf: it has no front, and printing "nobody recorded one" would
// send somebody looking for an answer that does not exist.
export function frontProfileApplies(item, piece) {
  return !piece;
}

function cutEdgingDisplay(item, piece) {
  const label = String(piece?.label || item?.title || "").toLowerCase();
  if (label.includes("back panel")) return "No edging unless specified";
  if (label.includes("side panel")) return "Front long edge";
  if (label.includes("top panel") || label.includes("bottom panel") || label.includes("shelf")) return "Front long edge";
  // Which edges get tape, asked one at a time on the website. A loose piece
  // only: a carcass piece's edges come off the cabinet calculation above.
  const banded = piece ? "" : bandedEdgesText(item?.banded_edges);
  // A comma, not a middot: the PDF fonts are ASCII only and turn a middot into
  // a hyphen.
  if (item?.edge_mould || banded) return [item?.edge_mould, banded].filter(Boolean).join(", ");
  return "Not recorded";
}

// A line an applied variation has removed is no longer part of the order, so
// it must never reach a production sheet.
function liveOrderItems(items) {
  return (items || []).filter((item) => item?.variation_status !== "removed");
}

// What goes in the notes column: the cutting instruction that came off the
// cabinet calculation, then whatever was typed against the panel. Both are
// instructions for the person cutting, so they share a cell.
//
// A variation is not an instruction about how to cut, it is a statement about
// whether to cut at all, so it keeps its own full width row underneath.
function rowNotes(pieceNotes, planNotes) {
  return [pieceNotes, planNotes].map((note) => String(note || "").trim()).filter(Boolean).join(" ");
}

// Exported so the workshop labels are built from the very rows the sheet
// prints. The number on a label is that row's position here, so the two cannot
// drift apart and leave someone ticking off the wrong line.
// The board a piece is cut from, in the four facts a board is bought by, plus
// its material. A carcass, its back and its shelves can each be a different
// board, told apart the same way the board order tells them apart. Read by the
// cutting plan, which groups panels onto boards by this. See
// lib/pcd-cutting-plan.js.
function cutBoardSpec(item, piece, plan) {
  const supplier = plan?.supplier_name || item?.supplier_name || "";
  if (!piece) {
    return {
      supplier,
      colour: item?.colour || "",
      finish: item?.finish || "",
      thickness: item?.thickness || "",
      material: item?.material || "",
    };
  }
  const config = item?.cabinet_config || {};
  const role = cutPieceRole(piece.label);
  const thickness = piece.thickness_mm
    || (role === "shelf" ? config.shelf_thickness_mm : role === "back" ? config.back_panel_thickness_mm : config.carcass_thickness_mm)
    || "";
  if (role === "shelf") {
    return {
      supplier,
      colour: config.shelf_colour || config.carcass_colour || item?.colour || "",
      finish: config.shelf_finish || config.carcass_finish || item?.finish || "",
      thickness,
      material: config.shelf_material || config.carcass_material || "",
    };
  }
  return {
    supplier,
    colour: config.carcass_colour || item?.colour || "",
    finish: config.carcass_finish || item?.finish || "",
    thickness,
    material: (role === "back" ? config.back_panel_material : "") || config.carcass_material || "",
  };
}

export function buildCutListRows(items, context) {
  return liveOrderItems(items).flatMap((item, itemIndex) => {
    const cabinetConfig = item.cabinet_config;
    const cabinetPieces = Array.isArray(cabinetConfig?.calculated_cut_list) ? cabinetConfig.calculated_cut_list : [];
    const isBaseCabinet = item.product_type === "base_cabinet" || !!cabinetConfig;
    const variation = variationStateForItem(item, context);

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
              itemId: item.id,
              panelKey,
              cabinet: cabinetDimensions(cabinetConfig),
              piece: pieceQty > 1 ? `${piece.label} ${pieceIndex + 1}` : piece.label,
              qty: 1,
              size: cutSize(piece.height_mm, piece.width_mm),
              thickness: piece.thickness_mm ? `${piece.thickness_mm}mm` : item.thickness || "-",
              material: cutMaterialCell(item, piece),
              ...cutMaterialParts(item, piece),
              profile: frontProfileDisplay(item),
              profileApplies: frontProfileApplies(item, piece),
              edging: cutEdgingDisplay(item, piece),
              state: variation?.state || "",
              flag: variation?.flag || "",
              notes: rowNotes(piece.notes, plan.notes),
              variationNote: variation?.note || null,
              // The same piece as numbers, for the cutting plan. The strings
              // above are for printing; a board cannot be laid out from them.
              kind: "carcass",
              heightMm: Number(piece.height_mm) || 0,
              widthMm: Number(piece.width_mm) || 0,
              pieceLabel: piece.label || "",
              productType: "Carcass",
              grainDirection: "",
              bandedEdges: null,
              edgeFinish: "",
              edgeMould: item.edge_mould || "",
              materialText: cutMaterialDisplay(item, piece),
              boardSpec: cutBoardSpec(item, piece, plan),
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
      itemId: item.id,
      panelKey,
      cabinet: "",
      piece: item.description || itemDisplayTitle(item),
      qty: item.qty || 1,
      size: item.width_mm || item.height_mm ? cutSize(item.height_mm, item.width_mm) : "-",
      thickness: item.thickness || "-",
      material: cutMaterialCell(item),
      ...cutMaterialParts(item),
      profile: frontProfileDisplay(item),
      profileApplies: frontProfileApplies(item),
      edging: cutEdgingDisplay(item),
      state: variation?.state || "",
      flag: variation?.flag || "",
      notes: rowNotes(makeNotes(item), plan.notes),
      variationNote: variation?.note || null,
      // The same panel as numbers, for the cutting plan.
      kind: "line",
      heightMm: Number(item.height_mm) || 0,
      widthMm: Number(item.width_mm) || 0,
      pieceLabel: item.description || "",
      productType: item.product_type || "",
      grainDirection: item.grain_direction || "",
      bandedEdges: Array.isArray(item.banded_edges) ? item.banded_edges : null,
      edgeFinish: item.edge_finish || "",
      edgeMould: item.edge_mould || "",
      materialText: cutMaterialDisplay(item),
      boardSpec: cutBoardSpec(item, null, plan),
    }];
  });
}

// Pieces a pending variation wants to add. They are shaped exactly like the
// rows above them, using the same size, material and edging helpers, so they
// read as line items rather than as a footnote. They carry no number, because
// they are not part of the count printed at the top of the sheet.
export function buildProposedRows(context) {
  return (context?.proposedAdditions || []).map(({ line, variation }) => ({
    source: line.title || line.product_type || "Proposed item",
    cabinet: "",
    piece: line.description || line.title || line.product_type || "Proposed item",
    qty: line.qty || 1,
    size: line.width_mm || line.height_mm ? cutSize(line.height_mm, line.width_mm) : "-",
    thickness: line.thickness || "-",
    material: cutMaterialDisplay(line),
    ...cutMaterialParts(line),
    profile: frontProfileDisplay(line),
    profileApplies: frontProfileApplies(line),
    edging: cutEdgingDisplay(line),
    state: CUT_LIST_STATES.hold,
    flag: proposedAdditionFlag(variation),
    notes: "",
    variationNote: proposedAdditionNote(variation),
    // Numbered like anything else, so the label and the sheet call it the same
    // thing. It stays out of the piece count: a number identifies a panel, it
    // does not promise the panel is cuttable work. Keyed by the variation line,
    // because there is no order line to key it to yet.
    panelKey: `proposed:${line.id}`,
    itemId: null,
    proposed: true,
  }));
}

// Everything the bench does not cut: supplier ready made panels, anything
// thermolaminated, and hardware. Same sheet, second table, so one document
// covers both cutting and checking the order off as it arrives.
export function buildMadeToOrderRows(items, context, colourSuppliers = {}) {
  return liveOrderItems(items).flatMap((item) => {
    const cabinetConfig = item.cabinet_config;
    const cabinetPieces = Array.isArray(cabinetConfig?.calculated_cut_list) ? cabinetConfig.calculated_cut_list : [];
    const isBaseCabinet = item.product_type === "base_cabinet" || !!cabinetConfig;
    const variation = variationStateForItem(item, context);

    if (isBaseCabinet && cabinetPieces.length) {
      const lineQty = Math.max(1, Math.floor(Number(item.qty || 1)));
      const rows = [];
      for (let copyIndex = 0; copyIndex < lineQty; copyIndex += 1) {
        cabinetPieces.forEach((piece) => {
          const pieceQty = Math.max(1, Math.floor(Number(piece.qty || 1)));
          for (let pieceIndex = 0; pieceIndex < pieceQty; pieceIndex += 1) {
            const panelKey = panelKeyFor("cabinet", copyIndex, piece.label, pieceIndex);
            const plan = panelPlanFor(item, panelKey, colourSuppliers);
            if (plan.fulfilment_method === "in_house") continue;
            rows.push({
              item: `${cabinetCutLabel(item, 0, copyIndex, lineQty)} - ${piece.label}`,
              itemId: item.id,
              panelKey,
              qty: 1,
              size: cutSize(piece.height_mm, piece.width_mm),
              thickness: piece.thickness_mm ? `${piece.thickness_mm}mm` : item.thickness || "-",
              material: cutMaterialCell(item, piece, { withThickness: true }),
              ...cutMaterialParts(item, piece),
              profile: frontProfileDisplay(item),
              profileApplies: frontProfileApplies(item, piece),
              edging: cutEdgingDisplay(item, piece),
              supplier: plan.supplier_name || item.supplier_name || "-",
              ref: plan.supplier_order_ref || "-",
              ordered: shortDateLabel(plan.supplier_ordered_at),
              eta: shortDateLabel(plan.supplier_eta),
              status: titleCaseLabel(plan.status || item.status || "Not Ordered"),
              state: variation?.state || "",
              flag: variation?.flag || "",
              notes: rowNotes(piece.notes, plan.notes),
              variationNote: variation?.note || null,
            });
          }
        });
      }
      return rows;
    }

    const panelKey = panelKeyFor("line", item.id);
    const plan = panelPlanFor(item, panelKey, colourSuppliers);
    if (plan.fulfilment_method === "in_house") return [];
    return [{
      item: itemDisplayTitle(item),
      itemId: item.id,
      panelKey,
      qty: item.qty || 1,
      size: item.width_mm || item.height_mm ? cutSize(item.height_mm, item.width_mm) : "-",
      thickness: item.thickness || "-",
      material: cutMaterialCell(item, null, { withThickness: true }),
      ...cutMaterialParts(item),
      profile: frontProfileDisplay(item),
      profileApplies: frontProfileApplies(item),
      edging: cutEdgingDisplay(item),
      supplier: plan.supplier_name || item.supplier_name || "-",
      ref: plan.supplier_order_ref || "-",
      ordered: shortDateLabel(plan.supplier_ordered_at),
      eta: shortDateLabel(plan.supplier_eta),
      status: titleCaseLabel(item.status || "Not Ordered"),
      state: variation?.state || "",
      flag: variation?.flag || "",
      notes: rowNotes(makeNotes(item), plan.notes),
      variationNote: variation?.note || null,
    }];
  });
}

function truncateText(value, width, size = 7) {
  const text = cleanText(value || "-").replace(/\s+/g, " ").trim();
  if (textWidth(text, size) <= width) return text;
  let kept = text;
  while (kept.length > 1 && textWidth(`${kept}...`, size) > width) kept = kept.slice(0, -1);
  return `${kept}...`;
}

// `bold` matters. Bold glyphs are wider than regular ones at the same size,
// so a bold cell wrapped against regular metrics fits on paper and then
// hangs over the rule when it is drawn. The item name on a quote is bold.
function wrappedTextLines(value, width, size = 8, { bold = false } = {}) {
  const text = cleanText(value || "-").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const limit = Math.max(size, width);
  const lines = [];

  // A word longer than the column, a part code or a run of digits, is broken at
  // the last character that fits rather than left to hang over the rule.
  const breakLongWord = (word) => {
    const pieces = [];
    let piece = "";
    for (const character of word) {
      if (piece && textWidth(piece + character, size) > limit) {
        pieces.push(piece);
        piece = character;
      } else {
        piece += character;
      }
    }
    if (piece) pieces.push(piece);
    return pieces;
  };

  text.split("\n").forEach((paragraph) => {
    const words = paragraph.replace(/[ \t]+/g, " ").trim().split(" ").filter(Boolean);
    let current = "";
    words.forEach((word) => {
      if (textWidth(word, size, { bold }) > limit) {
        if (current) {
          lines.push(current);
          current = "";
        }
        const pieces = breakLongWord(word);
        // The tail of a broken word can still take company on its line.
        current = pieces.pop() || "";
        pieces.forEach((piece) => lines.push(piece));
        return;
      }
      const next = current ? `${current} ${word}` : word;
      if (current && textWidth(next, size, { bold }) > limit) {
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

// ── Formatted terms ─────────────────────────────────────────────────────────
//
// Terms are the one field on a quote that carries formatting: bold, italic,
// underline, and bulleted or numbered lists. The PDF has no HTML in it and
// draws a line at a time in one font per call, so the wording is turned into
// blocks of styled runs by lib/pcd-terms-html.js and laid out here.
//
// Two things this has to get right or the page breaks:
//
//   1. MEASURING AND DRAWING MUST AGREE. The container height is worked out
//      before anything is drawn, so both go through richTextLines(). One
//      wrapping rule, used twice.
//   2. A WRAPPED BULLET HANGS. The second line of a list item lines up with the
//      first word, not under the bullet, which means every line carries its own
//      left offset rather than the block having one.
//
// Widths come from the real Helvetica metrics, so a bold lead-in and the plain
// sentence after it are placed against each other rather than near each other.
const RICH_MARKER_GAP = 4;

function runWidth(text, size, bold) {
  return textWidth(cleanText(text), size, bold);
}

// A bullet has to survive cleanText, which flattens anything outside 7-bit
// ASCII to a dash. A drawn "-" is the honest version of what would otherwise
// arrive as one anyway.
function asciiMarker(marker) {
  if (!marker) return "";
  return /^\d+\.$/.test(marker) ? marker : "-";
}

/**
 * Blocks of styled runs into drawable lines.
 *
 * Each line: { segments: [{ text, bold, italic, underline, x }], indent }
 * where x is the offset from the left of the text column.
 */
function richTextLines(blocks, width, size) {
  const lines = [];

  for (const block of blocks) {
    const marker = asciiMarker(block.marker);
    const indent = (block.indent || 0) * 12;
    const markerWidth = marker ? runWidth(marker, size, false) + RICH_MARKER_GAP : 0;
    const textLeft = indent + markerWidth;
    const available = Math.max(size * 4, width - textLeft);

    // An empty paragraph is a blank line, which is how the gap between two
    // paragraphs survives into print.
    if (!block.runs.length) {
      lines.push({ segments: [], indent: textLeft });
      continue;
    }

    let segments = [];
    let used = 0;
    let first = true;

    const pushLine = () => {
      if (!segments.length) return;
      const withMarker = first && Boolean(marker);
      // The first line of a list item starts back at the bullet; every line
      // after it lines up with the first word instead. That is the hanging
      // indent, and it is why the offset is per line rather than per block.
      const left = withMarker ? indent : textLeft;
      // Flagged rather than recognised by its text: a line whose own wording
      // starts with "-" would otherwise be mistaken for the bullet and drawn
      // on top of it.
      if (withMarker) {
        segments.unshift({ text: marker, bold: false, italic: false, underline: false, x: 0, isMarker: true });
      }
      // x is measured from the line's own left edge, so the text runs start
      // past the marker when there is one.
      let cursor = withMarker ? markerWidth : 0;
      const placed = segments.map((segment) => {
        if (segment.isMarker) return { ...segment, x: 0 };
        const at = cursor;
        cursor += runWidth(segment.text, size, segment.bold);
        return { ...segment, x: at };
      });
      lines.push({ segments: placed, indent: left });
      segments = [];
      used = 0;
      first = false;
    };

    for (const run of block.runs) {
      const words = String(run.text).split(/(\s+)/).filter((part) => part !== "");
      for (const word of words) {
        const wordWidth = runWidth(word, size, run.bold);
        // Never start a line with the space that ended the last one.
        if (/^\s+$/.test(word) && used === 0) continue;
        if (used + wordWidth > available && used > 0) pushLine();
        const last = segments[segments.length - 1];
        if (last && last.bold === run.bold && last.italic === run.italic && last.underline === run.underline) {
          last.text += word;
        } else {
          segments.push({ text: word, bold: run.bold, italic: run.italic, underline: run.underline, x: 0 });
        }
        used += wordWidth;
      }
    }
    pushLine();
  }

  return lines;
}

function drawRichTextLines(page, lines, x, y, size, { maxLines } = {}) {
  const visible = maxLines ? lines.slice(0, maxLines) : lines;
  visible.forEach((line, index) => {
    const lineY = y + index * (size + 4);
    for (const segment of line.segments) {
      const at = x + line.indent + segment.x;
      // No bold-italic face is embedded, so bold wins where both are asked for.
      // Losing the slant is less noticeable than losing the emphasis.
      page.text(segment.text, at, lineY, size, { bold: segment.bold, italic: segment.italic && !segment.bold });
      if (segment.underline && segment.text.trim()) {
        page.line(at, lineY + 2, at + runWidth(segment.text, size, segment.bold), lineY + 2);
      }
    }
  });
  return y + visible.length * (size + 4);
}

function longDateLabel(value) {
  const date = value ? new Date(value) : new Date();
  const shown = Number.isNaN(date.getTime()) ? new Date() : date;
  return shown.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
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

// Client-facing cost breakdown. Markup is intentionally omitted — it is already
// baked into each line's unit price. "Consumables" is stored in
// installation_cost_ex_gst (see the admin QuoteEditor field mapping).
function quoteTotalsBreakdownRows(totals) {
  const breakdown = [
    ["Cabinetry (items)", totals.material_cost_ex_gst],
    ["Labour", totals.labour_cost_ex_gst],
    ["Travel", totals.travel_cost_ex_gst],
    ["Delivery", totals.delivery_cost_ex_gst],
    ["Consumables", totals.installation_cost_ex_gst],
    ["Painting", totals.painting_cost_ex_gst],
    ["Glass", totals.glass_cost_ex_gst],
    ["Door removal and disposal", totals.removal_cost_ex_gst],
    // Edge tape on everything we cut, worked out from the lines. It has to be
    // listed or the rows below no longer add up to the subtotal.
    ["Edging", totals.edging_cost_ex_gst],
  ];
  // Only itemise when there is at least one additional (non-cabinetry) cost to
  // explain the gap between the visible line items and the subtotal. Otherwise
  // the cabinetry total equals the subtotal and the breakdown is redundant.
  const hasAdditionalCosts = breakdown.slice(1).some(([, value]) => toNumber(value) > 0);
  return hasAdditionalCosts ? breakdown.filter(([, value]) => toNumber(value) > 0) : [];
}

// THE TOTALS BOX, as the sheet has it: 210pt at the right hand end, plain
// white inside a rule, the figures right aligned against their words. The grand
// total is the only thing in it set large, over a heavy rule, because it is the
// one line anybody looks for.
const QUOTE_TOTALS_WIDTH = 210;
const QUOTE_TOTALS_PAD_X = 10;
const QUOTE_TOTALS_PAD_Y = 8;
const QUOTE_TOTALS_ROW = 14;
const QUOTE_TOTALS_GRAND = 24;

/** Every row in the box, in order, so the height and the drawing agree. */
function quoteTotalsRows(quote, totals) {
  const rows = quoteTotalsBreakdownRows(totals).map(([label, value]) => ({ label, value }));
  if (rows.length) rows[rows.length - 1].ruleAfter = true;

  rows.push({ label: "Subtotal ex GST", value: totals.subtotal_ex_gst });
  rows.push({ label: `Total GST ${Math.round(GST_RATE * 100)}%`, value: totals.gst_amount });
  rows.push({ label: "Total inc GST", value: totals.total_inc_gst, grand: true });

  if (quote.deposit_required) {
    const percent = toNumber(quote.deposit_percent);
    const deposit = totals.total_inc_gst * (percent / 100);
    rows.push({ label: `Deposit on acceptance, ${percent}%`, value: deposit, ruleBefore: true });
    rows.push({ label: "Balance before delivery", value: totals.total_inc_gst - deposit });
  }
  return rows;
}

function quoteTotalsBoxHeight(quote, totals) {
  const rows = quoteTotalsRows(quote, totals);
  const body = rows.reduce((sum, row) => sum + (row.grand ? QUOTE_TOTALS_GRAND : QUOTE_TOTALS_ROW), 0);
  return QUOTE_TOTALS_PAD_Y * 2 + body;
}

function drawQuoteTotals(page, quote, totals, y) {
  const pageWidth = page.width || QUOTE_PAGE_WIDTH;
  const x = pageWidth - MARGIN - QUOTE_TOTALS_WIDTH;
  const rows = quoteTotalsRows(quote, totals);

  page.strokeColor(LINE_STRONG);
  page.lineWidth(0.7);
  page.rect(x, y, QUOTE_TOTALS_WIDTH, quoteTotalsBoxHeight(quote, totals), { fill: false, stroke: true });

  const left = x + QUOTE_TOTALS_PAD_X;
  const right = x + QUOTE_TOTALS_WIDTH - QUOTE_TOTALS_PAD_X;
  let cursor = y + QUOTE_TOTALS_PAD_Y;

  rows.forEach((row) => {
    const height = row.grand ? QUOTE_TOTALS_GRAND : QUOTE_TOTALS_ROW;
    if (row.grand) {
      page.strokeColor(STROKE);
      page.lineWidth(1.2);
      page.line(left, cursor + 2, right, cursor + 2);
    } else if (row.ruleBefore) {
      page.strokeColor(LINE);
      page.lineWidth(0.6);
      page.line(left, cursor + 2, right, cursor + 2);
    }

    const size = row.grand ? 12 : 8;
    const baseline = cursor + height - (row.grand ? 6 : 4);
    page.fillColor(row.grand ? STROKE : MUTED);
    page.text(row.label, left, baseline, size, { bold: Boolean(row.grand) });
    page.fillColor(row.grand ? GREEN_DARK : STROKE);
    page.text(moneyLabel(row.value), right, baseline, size, { bold: Boolean(row.grand), align: "right" });

    if (row.ruleAfter) {
      page.strokeColor(LINE);
      page.lineWidth(0.6);
      page.line(left, cursor + height + 1, right, cursor + height + 1);
    }
    cursor += height;
  });
}

const QUOTE_NOTE_BODY_SIZE = 7.5;
const QUOTE_NOTE_PAD_X = 8;
const QUOTE_NOTE_HEADER_H = 17; // the green strip, the same height as a table heading
const QUOTE_NOTE_LINE_H = 11.5;
const QUOTE_NOTE_PAD_BOTTOM = 10;
const QUOTE_NOTE_GAP = 10; // vertical gap between stacked containers
// Safety cap so an unusually long notes/terms field fills at most a single
// page rather than overflowing silently (a full portrait column is ~55 lines).
const QUOTE_NOTES_MAX_LINES = 52;

// Only client-facing fields appear on the quote. `quote.notes` is the admin-only
// internal notes field and must never be shown to the customer.
//
// Terms is the only one flagged as formatted. The other three are plain text
// boxes and are drawn the way they always were.
function quoteNotesSections(quote) {
  return [
    ["Notes", quote.client_notes, false],
    ["Assumptions", quote.assumptions, false],
    ["Exclusions", quote.exclusions, false],
    ["Terms", quote.terms, true],
  ].filter(([, value]) => String(value || "").trim());
}

function quoteNoteBodyWidth(width) {
  return width - QUOTE_NOTE_PAD_X * 2;
}

// The lines a section will take, worked out ONCE and used for both the height
// and the drawing, so a box can never be sized for one layout and filled with
// another.
function quoteNoteLines(value, width, rich) {
  return rich
    ? richTextLines(termsHtmlToBlocks(value), quoteNoteBodyWidth(width), QUOTE_NOTE_BODY_SIZE)
    : wrappedTextLines(value, quoteNoteBodyWidth(width), QUOTE_NOTE_BODY_SIZE);
}

function quoteNoteContainerHeight(value, width, rich = false) {
  const lineCount = Math.min(quoteNoteLines(value, width, rich).length, QUOTE_NOTES_MAX_LINES);
  return QUOTE_NOTE_HEADER_H + lineCount * QUOTE_NOTE_LINE_H + QUOTE_NOTE_PAD_BOTTOM;
}

// One full-width notes container with a header, drawn at y. Returns its height.
function drawQuoteNoteContainer(page, title, value, y, width, rich = false) {
  const height = quoteNoteContainerHeight(value, width, rich);
  page.strokeColor(LINE_STRONG);
  page.lineWidth(0.7);
  page.rect(MARGIN, y, width, height, { fill: false, stroke: true });
  page.fillColor(GREEN);
  page.rect(MARGIN, y, width, QUOTE_NOTE_HEADER_H, { fill: true, stroke: false });
  page.fillColor([1, 1, 1]);
  page.text(title.toUpperCase(), MARGIN + QUOTE_NOTE_PAD_X, y + 11.5, QUOTE_LABEL_FONT, { bold: true });
  page.fillColor(MUTED);
  const bodyX = MARGIN + QUOTE_NOTE_PAD_X;
  const bodyY = y + QUOTE_NOTE_HEADER_H + 12;
  if (rich) {
    drawRichTextLines(page, quoteNoteLines(value, width, true), bodyX, bodyY, QUOTE_NOTE_BODY_SIZE, {
      maxLines: QUOTE_NOTES_MAX_LINES,
    });
  } else {
    drawWrappedText(page, value, bodyX, bodyY, quoteNoteBodyWidth(width), QUOTE_NOTE_BODY_SIZE, {
      maxLines: QUOTE_NOTES_MAX_LINES,
    });
  }
  return height;
}

// THE SUMMARY IS TWO COLUMNS, SIDE BY SIDE, BOTH STARTING ON THE SAME LINE.
//
// The totals box on the right is what a customer looks for first and it keeps
// the width and the place it has always had. The words that go with the quote,
// the notes, the assumptions, the exclusions and the terms, stack down the left
// beside it, instead of pushing it up the page and leaving the whole left hand
// side of the sheet empty.
//
// Each block says which column it belongs to and how tall it is, so the planner
// can run a cursor down each column independently.
const QUOTE_SUMMARY_GAP = 14;

// Asked for rather than stored, because the page width it comes from is
// declared with the rest of the quote layout further down this file.
function quoteSummaryLeftWidth() {
  return QUOTE_CONTENT_WIDTH - QUOTE_TOTALS_WIDTH - QUOTE_SUMMARY_GAP;
}

function quoteSummaryBlocks(quote, totals) {
  const blocks = [
    {
      column: "right",
      height: quoteTotalsBoxHeight(quote, totals),
      gap: QUOTE_NOTE_GAP,
      draw: (page, y) => drawQuoteTotals(page, quote, totals, y),
    },
  ];
  quoteNotesSections(quote).forEach(([title, value, rich]) => {
    blocks.push({
      column: "left",
      height: quoteNoteContainerHeight(value, quoteSummaryLeftWidth(), rich),
      gap: QUOTE_NOTE_GAP,
      draw: (page, y) => drawQuoteNoteContainer(page, title, value, y, quoteSummaryLeftWidth(), rich),
    });
  });
  return blocks;
}

// Flow the summary starting at `startY` on the last table page, a cursor down
// each column. A block that would cross the page bottom moves to the top of a
// fresh page WHOLE, never split, so the totals box and every notes container
// arrive in one piece. `pageOffset` is relative to the last table page
// (0 = same page as the table).
//
// The two columns run down independently, so a long set of terms carries on
// over the page without dragging the totals box with it.
function planQuoteSummary(startY, blocks) {
  const placements = [];

  // THE TWO COLUMNS START ON THE SAME LINE OR NOT AT ALL. The top of each
  // column has to fit at startY for the summary to begin there: starting the
  // totals box at the foot of a page and the terms at the top of the next one
  // is not a row, it is two loose containers.
  const firstOf = (column) => blocks.find((block) => (block.column === "right" ? "right" : "left") === column);
  const firstRowHeight = ["left", "right"].reduce(
    (most, column) => Math.max(most, firstOf(column)?.height || 0),
    0
  );
  const top = startY + firstRowHeight > QUOTE_BOTTOM ? QUOTE_TOP : startY;
  const firstPage = top === startY ? 0 : 1;

  const cursor = { left: top, right: top };
  const pageOffset = { left: firstPage, right: firstPage };

  blocks.forEach((block) => {
    const column = block.column === "right" ? "right" : "left";
    if (cursor[column] + block.height > QUOTE_BOTTOM && cursor[column] > QUOTE_TOP) {
      pageOffset[column] += 1;
      cursor[column] = QUOTE_TOP;
    }
    placements.push({ pageOffset: pageOffset[column], y: cursor[column], block });
    cursor[column] += block.height + block.gap;
  });
  return placements;
}

// ---- THE CUSTOMER QUOTE ----
//
// The same document as the public viewer, on paper. A quote is a handful of
// boards used over and over, so the board is named once at the top of its group
// and its three columns come out of the rows underneath. What is left in a row
// is what actually differs from the line above it.
//
// LANDSCAPE, because the row carries nine things. Portrait gives a table 527pt
// and this wants 774. The tax invoice stays portrait: it is filed, this is read.
//
// THE LINE NOTE SITS UNDER THE ITEM. There is no modal on a printed page, and a
// note is about one line rather than a column of its own, so it hangs under the
// name it belongs to in smaller, quieter type.
//
// EVERY MEASUREMENT HERE IS THE ONE OFF THE SIGNED OFF SHEET, in points, so the
// file and the design are the same document. Change one and change the other.

const QUOTE_PAGE_WIDTH = PAGE_WIDTH;
const QUOTE_PAGE_HEIGHT = PAGE_HEIGHT;
const QUOTE_CONTENT_WIDTH = QUOTE_PAGE_WIDTH - MARGIN * 2;
const QUOTE_BOTTOM = QUOTE_PAGE_HEIGHT - FOOTER_HEIGHT - 16;

// The masthead band, and what sits in it.
const QUOTE_BAND_HEIGHT = 74;
const QUOTE_BAND_PAD = 16;
const QUOTE_LOGO_WIDTH = 154;

// Who it is for and who it is from, then the three figures.
const QUOTE_PARTIES_TOP = QUOTE_BAND_HEIGHT + 14;
const QUOTE_PARTIES_HEIGHT = 72;
const QUOTE_STRIP_HEIGHT = 36;
const QUOTE_STRIP_GAP = 12;
// Where the first group starts on page one, and on every page after it.
const QUOTE_FIRST_TOP = QUOTE_PARTIES_TOP + QUOTE_PARTIES_HEIGHT + QUOTE_STRIP_HEIGHT + QUOTE_STRIP_GAP;
const QUOTE_TOP = QUOTE_BAND_HEIGHT + 18;

// The table.
const QUOTE_FONT = 8;
const QUOTE_NOTE_FONT = QUOTE_FONT - 0.5;
const QUOTE_LABEL_FONT = 6.5;
const QUOTE_LINE_HEIGHT = 10.8; // 1.35 of the body size, as the sheet has it
const QUOTE_ROW_PAD = 8;
const QUOTE_HEAD_HEIGHT = 17;
const QUOTE_GROUP_HEAD_HEIGHT = 21;
const QUOTE_GROUP_GAP = 10;

// From app/globals.css, the same greens the viewer uses.
const GREEN = [0.110, 0.169, 0.118];
const GREEN_DARK = [0.176, 0.369, 0.157];
const GREEN_PANEL = [0.929, 0.957, 0.922];
const GREEN_SOFT = [0.659, 0.773, 0.627];
const GREEN_TINT = [0.961, 0.973, 0.957];
const LINE_STRONG = [0.776, 0.761, 0.706];
// White at 66% and 76% over the band, worked out once rather than guessed at
// each place that writes on the green.
const ON_BAND_QUIET = [0.697, 0.717, 0.700];
const ON_BAND_PLAIN = [0.786, 0.801, 0.788];

// THE COLUMN WIDTHS ARE RATIOS, NOT POINTS. The sheet was drawn as a table that
// fills its page, so a group with fewer columns spreads the difference over the
// ones it kept rather than leaving a gap at the right hand end. These are the
// numbers off the sheet and they are scaled to whatever the group adds up to.
const QUOTE_FIXED_SHARES = { index: 16, item: 74, size: 88, qty: 24, unit: 52, total: 56 };
// Hinges is wider than the sheet drew it, because the sheet drew a one line
// cell and the drilling is now stated in full: how many, which side, and where
// the cups go. At 84 the positions of an ordinary door fit on their own line.
const QUOTE_CONFIG_SHARES = { edge: 58, profile: 52, hinges: 84 };
const QUOTE_CONFIG_LABELS = { edge: "Edge", profile: "Profile", hinges: "Hinges" };
const QUOTE_BOARD_KEYS = ["edge", "profile", "hinges"];

// EVERY TABLE ON THE QUOTE IS LAID OUT AGAINST THE SAME REFERENCE.
//
// The widths used to be scaled to whatever columns the group happened to need,
// so a hardware group, which has no Edge, Profile or Hinges, divided the page
// between six columns instead of nine and every one of them came out half as
// wide again. Size and Qty on the hardware table were visibly wider than the
// same two columns on the board table directly above it.
//
// Scaling against the full set instead fixes those columns at one width for
// the whole document, and the width the missing columns would have taken goes
// to Item, which is the column on a hardware row that actually needs it: a
// drawer runner is called Blum TANDEMBOX antaro Drawer Runners 450NL 30kg Pair.
const QUOTE_REFERENCE_SHARE =
  Object.values(QUOTE_FIXED_SHARES).reduce((total, share) => total + share, 0) +
  Object.values(QUOTE_CONFIG_SHARES).reduce((total, share) => total + share, 0);

function quoteConfigValue(line, key) {
  if (isHardwareLine(line)) return "";
  // The edge profile, then which edges are banded, the same two lines the
  // customer's online copy shows. See lineEdgeLines.
  if (key === "edge") return lineEdgeLines(line).join("\n");
  if (key === "profile") return lineFrontProfile(line);
  // Not drilling is a fact a customer has to be told, so a board line always has
  // something to say here, and the words are the viewer's words.
  if (key === "hinges") return hingeCustomerLines(line).join("\n");
  return "";
}

// Height first, then width, and the units in the cell because a heading is read
// once and a cell is read eight times.
function quoteSizeLabel(line) {
  if (isConfiguredBaseCabinetLine(line)) {
    const cabinet = normalizeCabinetConfig(line.cabinet_config);
    return `${cabinet.height_mm || "-"} (H) x ${cabinet.width_mm || "-"} (W) x ${cabinet.depth_mm || "-"} (D) mm`;
  }
  const width = Number(line.width_mm || 0);
  const height = Number(line.height_mm || 0);
  if (!width && !height) return "-";
  return `${height || "-"} (H) x ${width || "-"} (W) mm`;
}

// What the line is called now comes from lib/pcd-quote-line-display.js, so the
// PDF and the customer's online copy cannot answer it differently.

/**
 * One group a board.
 *
 * Material, finish and colour decide the group. Only those three lift into the
 * heading, which is what was chosen: edge, profile and hinges stay as columns
 * even where every line in a group agrees on them. A column is still dropped
 * when no line in the group has anything to put in it, which is the difference
 * between "the question does not arise" and "we have not filled it in".
 *
 * The line number stays the number the line has on the quote, not its position
 * after grouping, so line seven here and line seven in the office are the same
 * line.
 */
function quoteGroups(lines) {
  const order = [];
  const map = new Map();

  lines.forEach((line, index) => {
    const numbered = { ...line, quoteLineNumber: index + 1 };
    const key = boardGroupKey(line);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key).push(numbered);
  });

  return order.map((key) => {
    const grouped = map.get(key);
    const first = grouped[0];
    const hardware = isHardwareLine(first);
    return {
      key,
      hardware,
      lines: grouped,
      title: hardware ? "Hardware" : String(first.colour || "").trim() || "Board not recorded",
      lifted: boardGroupSpec(first),
      qty: grouped.reduce((sum, line) => sum + (Number(line.qty) || 0), 0),
      total: grouped.reduce((sum, line) => sum + toNumber(line.line_total_ex_gst), 0),
      configKeys: hardware
        ? []
        : QUOTE_BOARD_KEYS.filter((configKey) =>
            grouped.some((line) => quoteConfigValue(line, configKey))
          ),
    };
  });
}

/**
 * The columns this group needs, spread across the width of the page.
 *
 * Exported so the widths can be checked without rendering a PDF and reading it
 * back, the same reason columnShareTotal is. A column that is the wrong width
 * shows up on the far side of a render and reads as a wrapping problem.
 */
export function quoteColumnsFor(group) {
  const shares = [
    { key: "index", label: "#", share: QUOTE_FIXED_SHARES.index, align: "center", wrap: false },
    { key: "item", label: "Item", share: QUOTE_FIXED_SHARES.item, bold: true },
    { key: "size", label: "Size H x W", share: QUOTE_FIXED_SHARES.size, align: "center", wrap: false, tint: true, edgeLeft: true },
    { key: "qty", label: "Qty", share: QUOTE_FIXED_SHARES.qty, align: "center", wrap: false, tint: true, edgeRight: true },
  ];
  group.configKeys.forEach((key) => {
    shares.push({ key, label: QUOTE_CONFIG_LABELS[key], share: QUOTE_CONFIG_SHARES[key] });
  });
  shares.push({ key: "unit", label: "Unit", share: QUOTE_FIXED_SHARES.unit, align: "center", wrap: false, edgeLeft: true });
  shares.push({ key: "total", label: "Total", share: QUOTE_FIXED_SHARES.total, align: "center", wrap: false });

  // Fixed against the reference, so # Size Qty Unit and Total are the same
  // width on every table in the document however many config columns a group
  // has. Item takes whatever is left, which is its own share plus the width
  // the columns this group does not need would have taken.
  const scale = QUOTE_CONTENT_WIDTH / QUOTE_REFERENCE_SHARE;
  let used = 0;
  const sized = shares.map((column) => {
    if (column.key === "item") return column;
    const width = Math.round(column.share * scale);
    used += width;
    return { ...column, width };
  });
  // Item absorbs the rounding as well, so the columns add up to exactly the
  // width of the page and the right hand rule lands on the border.
  return sized.map((column) =>
    column.key === "item" ? { ...column, width: Math.max(60, QUOTE_CONTENT_WIDTH - used) } : column
  );
}

/**
 * A cell, as the lines it is made of.
 *
 * The item cell is the only one with two voices in it: what the line is, then
 * what the customer said about it, quieter and smaller underneath.
 */
export function quoteCellLines(line, column) {
  const plain = (value) => (value ? [{ text: value, size: QUOTE_FONT }] : []);

  if (column.key === "index") return plain(String(line.quoteLineNumber || ""));
  if (column.key === "size") return plain(quoteSizeLabel(line));
  if (column.key === "qty") return plain(String(line.qty || 1));
  if (column.key === "unit") return plain(moneyLabel(line.unit_price_ex_gst));
  if (column.key === "total") return plain(moneyLabel(line.line_total_ex_gst));

  if (column.key === "item") {
    // WRAPPED, LIKE EVERY OTHER CELL. The name was the one value on the whole
    // table put in without wrapping, so anything longer than the column ran
    // out over the rule and across the next one. A drawer runner does.
    const inner = column.width - 10;
    const out = wrappedTextLines(lineDisplayName(line), inner, QUOTE_FONT, { bold: true })
      .map((text) => ({ text, size: QUOTE_FONT, bold: true }));

    // ON A HARDWARE LINE ONLY.
    //
    // A board line's material, finish and colour are said once at the top of
    // its group. That IS the grouping: the whole reason the lines are gathered
    // under a board heading is so those three are not written out again on
    // every row. lineSubLines returns them for a board line, so calling it
    // without this guard put all three back under every name and undid it.
    //
    // A hardware line has no group heading to carry anything, so what it is
    // has to be on the row, and it is read from the same describer the
    // customer's online copy reads. See lib/pcd-quote-line-display.js.
    if (isHardwareLine(line)) {
      lineSubLines(line)
        .filter((part) => part.value)
        // The item is the thing itself and reads as a name, so it goes under
        // the label on its own. Anything else is a fact ABOUT the line and
        // needs saying what it is: "Supplied by Customer supplies".
        .map((part) => (part.key === "item" ? part.value : `${part.label} ${part.value}`))
        .forEach((value) => {
          wrappedTextLines(value, inner, QUOTE_NOTE_FONT).forEach((text) => {
            out.push({ text, size: QUOTE_NOTE_FONT, muted: true });
          });
        });
    }
    const note = String(line.client_note || "").trim();
    if (note) {
      wrappedTextLines(`Note: ${note}`, inner, QUOTE_NOTE_FONT).forEach((text) => {
        out.push({ text, size: QUOTE_NOTE_FONT, muted: true });
      });
    }
    return out;
  }

  const value = quoteConfigValue(line, column.key);
  if (!value) return [{ text: "-", size: QUOTE_FONT, muted: true }];
  return wrappedTextLines(value, column.width - 10, QUOTE_FONT).map((text) => ({ text, size: QUOTE_FONT }));
}

function quoteRowHeight(line, columns) {
  const most = columns.reduce((count, column) => Math.max(count, quoteCellLines(line, column).length), 1);
  return QUOTE_ROW_PAD + most * QUOTE_LINE_HEIGHT;
}

/**
 * Everything to be laid out, in order, as blocks that know their own height.
 *
 * A group heading is welded to its table heading and its first row: a heading
 * stranded at the foot of a page tells you nothing, because the heading is what
 * says which board the rows are. A group that runs over repeats its heading on
 * the next page, marked continued, for the same reason.
 */
function quoteGroupBlocks(groups) {
  const blocks = [];
  groups.forEach((group, groupIndex) => {
    const columns = quoteColumnsFor(group);
    const rows = group.lines.map((line) => ({ line, height: quoteRowHeight(line, columns) }));
    blocks.push({
      kind: "group",
      group,
      columns,
      rows,
      gap: groupIndex === groups.length - 1 ? 0 : QUOTE_GROUP_GAP,
      headHeight: QUOTE_GROUP_HEAD_HEIGHT + QUOTE_HEAD_HEIGHT,
    });
  });
  return blocks;
}

/**
 * Where every group and row lands.
 *
 * A group starts on a page only if its heading, its column heading and its
 * first row all fit. Once started, rows fill the page and the group picks up
 * again at the top of the next one under a repeated heading.
 */
function planQuotePages(blocks) {
  const pages = [[]];
  let pageIndex = 0;
  let y = QUOTE_FIRST_TOP;

  const newPage = () => {
    pageIndex += 1;
    pages[pageIndex] = [];
    y = QUOTE_TOP;
  };

  blocks.forEach((block) => {
    let rowIndex = 0;
    let continued = false;

    while (rowIndex < block.rows.length) {
      const needed = block.headHeight + block.rows[rowIndex].height;
      if (y + needed > QUOTE_BOTTOM && pages[pageIndex].length) newPage();

      const placed = { ...block, y, continued, rows: [] };
      y += block.headHeight;
      while (rowIndex < block.rows.length && y + block.rows[rowIndex].height <= QUOTE_BOTTOM) {
        placed.rows.push({ ...block.rows[rowIndex], y });
        y += block.rows[rowIndex].height;
        rowIndex += 1;
      }
      pages[pageIndex].push(placed);
      placed.bottom = y;

      if (rowIndex < block.rows.length) {
        newPage();
        continued = true;
      }
    }
    y += block.gap;
  });

  return { pages, lastY: y };
}

function drawQuoteBand(page, quote) {
  const width = page.width || QUOTE_PAGE_WIDTH;
  page.fillColor(GREEN);
  page.rect(0, 0, width, QUOTE_BAND_HEIGHT, { fill: true, stroke: false });

  if (page.hasLogo) {
    const logoHeight = QUOTE_LOGO_WIDTH * (page.logoHeight / page.logoWidth);
    page.image("Logo", MARGIN, QUOTE_BAND_PAD, QUOTE_LOGO_WIDTH, logoHeight);
    page.fillColor(ON_BAND_QUIET);
    page.text("Cabinet doors, drawer fronts and panels", MARGIN, QUOTE_BAND_PAD + logoHeight + 9, 7);
  } else {
    page.fillColor([1, 1, 1]);
    page.text(TRADING_NAME.toUpperCase(), MARGIN, 34, 13, { bold: true });
  }

  const right = width - MARGIN;
  page.fillColor([1, 1, 1]);
  page.text("Quote", right, 32, 18, { bold: true, align: "right" });
  page.fillColor(ON_BAND_PLAIN);
  page.text(`Number ${quote.quote_number || "Draft"}`, right, 46, 8, { align: "right" });
  const issued = longDateLabel(quote.updated_at || quote.created_at);
  const valid = quote.valid_until ? `, valid until ${longDateLabel(quote.valid_until)}` : "";
  page.text(`Issued ${issued}${valid}`, right, 58, 8, { align: "right" });
}

/**
 * Who it is for, and who it is from.
 *
 * Written out here rather than taken from INVOICE_BUSINESS_LINES, which is
 * pre-wrapped for the narrow column on a portrait invoice and carries an
 * "Email:" label this block has no room for.
 */
function drawQuoteParties(page, quote, y) {
  const width = page.width || QUOTE_PAGE_WIDTH;
  page.fillColor(MUTED);
  page.text("QUOTE FOR", MARGIN, y + 7, QUOTE_LABEL_FONT, { bold: true });
  page.fillColor(STROKE);
  page.text(quote.customer_name || "Customer", MARGIN, y + 22, 9.5, { bold: true });
  page.fillColor(MUTED);
  const contact = [quote.customer_email, quote.customer_phone].filter(Boolean).join("   ");
  if (contact) page.text(contact, MARGIN, y + 35, 8);
  const address = String(quote.site_address || "").trim();
  if (address) drawWrappedText(page, address, MARGIN, y + 47, 280, 8, { maxLines: 2 });

  const right = width - MARGIN;
  [
    `${TRADING_NAME} is a trading`,
    `entity under ${LEGAL_ENTITY}.`,
    `ABN ${BUSINESS_ABN_SPACED}`,
    SALES_EMAIL,
    BUSINESS_PHONE,
  ].forEach((text, index) => {
    page.text(text, right, y + 7 + index * 12, 8, { align: "right" });
  });
}

/**
 * The three figures a customer looks for before they read anything else: what
 * it comes to, when it was written, and how long it holds.
 */
function drawQuoteStrip(page, quote, totals, y) {
  const cells = [
    ["Total inc GST", moneyLabel(totals.total_inc_gst)],
    ["Issued", longDateLabel(quote.updated_at || quote.created_at)],
    ["Valid until", quote.valid_until ? longDateLabel(quote.valid_until) : "On request"],
  ];
  const cellWidth = QUOTE_CONTENT_WIDTH / cells.length;

  page.strokeColor(GREEN_SOFT);
  page.lineWidth(0.7);
  page.rect(MARGIN, y, QUOTE_CONTENT_WIDTH, QUOTE_STRIP_HEIGHT, { fill: false, stroke: true });

  cells.forEach(([label, value], index) => {
    const x = MARGIN + index * cellWidth;
    if (index) page.line(x, y, x, y + QUOTE_STRIP_HEIGHT);
    page.fillColor(MUTED);
    page.text(label.toUpperCase(), x + 10, y + 14, QUOTE_LABEL_FONT, { bold: true });
    page.fillColor(STROKE);
    page.text(value, x + 10, y + 28, 11, { bold: true });
  });
}

function drawQuoteGroupHead(page, placed) {
  const { group } = placed;
  page.fillColor(GREEN_PANEL);
  page.strokeColor(GREEN_SOFT);
  page.lineWidth(0.7);
  page.rect(MARGIN, placed.y, QUOTE_CONTENT_WIDTH, QUOTE_GROUP_HEAD_HEIGHT, { fill: true, stroke: true });

  const baseline = placed.y + 14;
  const title = group.title + (placed.continued ? " (continued)" : "");
  page.fillColor(STROKE);
  page.text(title, MARGIN + 8, baseline, 9, { bold: true });

  let x = MARGIN + 8 + textWidth(title, 9, true) + 12;
  group.lifted.forEach(([label, value]) => {
    page.fillColor(GREEN_DARK);
    page.text(label.toUpperCase(), x, baseline, QUOTE_LABEL_FONT, { bold: true });
    x += textWidth(label.toUpperCase(), QUOTE_LABEL_FONT, true) + 5;
    page.fillColor(STROKE);
    page.text(String(value), x, baseline, 7.5);
    x += textWidth(value, 7.5) + 12;
  });

  page.fillColor(MUTED);
  page.text(
    `${group.lines.length} ${group.lines.length === 1 ? "line" : "lines"}, ${group.qty} items   ${moneyLabel(group.total)}`,
    MARGIN + QUOTE_CONTENT_WIDTH - 8,
    baseline,
    7.5,
    { align: "right" }
  );
}

function drawQuoteTableHead(page, placed) {
  const y = placed.y + QUOTE_GROUP_HEAD_HEIGHT;
  page.fillColor(GREEN);
  page.rect(MARGIN, y, QUOTE_CONTENT_WIDTH, QUOTE_HEAD_HEIGHT, { fill: true, stroke: false });
  page.fillColor([1, 1, 1]);

  let x = MARGIN;
  placed.columns.forEach((column) => {
    const centred = column.align === "center";
    page.text(column.label.toUpperCase(), centred ? x + column.width / 2 : x + 5, y + 11.5, QUOTE_LABEL_FONT, {
      bold: true,
      align: centred ? "center" : "left",
    });
    x += column.width;
  });
}

// The tint behind the pair a customer checks together, down the whole group.
function drawQuoteRowTint(page, placed, row) {
  let x = MARGIN;
  placed.columns.forEach((column) => {
    if (column.tint) {
      page.fillColor(GREEN_TINT);
      page.rect(x, row.y, column.width, row.height, { fill: true, stroke: false });
    }
    x += column.width;
  });
}

function drawQuoteRowRules(page, placed, row, isLast) {
  const { y, height } = row;

  if (!isLast) {
    page.strokeColor(LINE);
    page.lineWidth(0.5);
    page.line(MARGIN, y + height, MARGIN + QUOTE_CONTENT_WIDTH, y + height);
  }

  // Only the edges that separate what it is, how it is made, and what it costs.
  // Everything else runs without a rule between it.
  page.strokeColor(LINE_STRONG);
  page.lineWidth(0.6);
  let x = MARGIN;
  placed.columns.forEach((column) => {
    if (column.edgeLeft) page.line(x, y, x, y + height);
    if (column.edgeRight) page.line(x + column.width, y, x + column.width, y + height);
    x += column.width;
  });
}

// EVERY CELL IS CENTRED DOWN THE ROW, so a one line cell beside a three line one
// sits against it rather than floating at the top of the row.
function drawQuoteRowText(page, placed, row) {
  const { line, y, height } = row;
  let x = MARGIN;
  placed.columns.forEach((column) => {
    const lines = quoteCellLines(line, column);
    const top = y + (height - lines.length * QUOTE_LINE_HEIGHT) / 2;
    const centred = column.align === "center";
    lines.forEach((cell, index) => {
      page.fillColor(cell.muted ? MUTED : STROKE);
      page.text(
        cell.text,
        centred ? x + column.width / 2 : x + 5,
        top + index * QUOTE_LINE_HEIGHT + 8,
        cell.size,
        { bold: Boolean(cell.bold), align: centred ? "center" : "left" }
      );
    });
    x += column.width;
  });
}

/**
 * A group, drawn in passes rather than a row at a time.
 *
 * IN THIS ORDER FOR A REASON. A row's tint is a filled rectangle that reaches
 * the row above it, so drawing row by row painted each rule out again as soon
 * as the next row was drawn, and the size and quantity columns lost the row
 * lines every other column kept. Every fill goes down first, then every rule on
 * top of them, then the words.
 */
function drawQuoteGroup(page, placed) {
  drawQuoteGroupHead(page, placed);
  drawQuoteTableHead(page, placed);

  const last = placed.rows.length - 1;
  placed.rows.forEach((row) => drawQuoteRowTint(page, placed, row));
  placed.rows.forEach((row, index) => drawQuoteRowRules(page, placed, row, index === last));

  // The group is boxed on three sides. Its top edge is the table heading, which
  // is a solid green band and needs no rule drawn across it.
  const top = placed.y + QUOTE_GROUP_HEAD_HEIGHT;
  const right = MARGIN + QUOTE_CONTENT_WIDTH;
  page.strokeColor(LINE_STRONG);
  page.lineWidth(0.7);
  page.line(MARGIN, top, MARGIN, placed.bottom);
  page.line(right, top, right, placed.bottom);
  page.line(MARGIN, placed.bottom, right, placed.bottom);

  placed.rows.forEach((row) => drawQuoteRowText(page, placed, row));
}

function drawQuotePage(page, quote, totals, placedGroups, pageIndex, pageCount, summaryPlacements) {
  drawQuoteBand(page, quote);
  drawFooter(
    page,
    pageIndex + 1,
    pageCount,
    "This quote is not an invoice and nothing is charged until you accept it."
  );
  if (pageIndex === 0) {
    drawQuoteParties(page, quote, QUOTE_PARTIES_TOP);
    drawQuoteStrip(page, quote, totals, QUOTE_PARTIES_TOP + QUOTE_PARTIES_HEIGHT);
  }
  placedGroups.forEach((placed) => drawQuoteGroup(page, placed));
  summaryPlacements.forEach(({ y, block }) => block.draw(page, y));
}

function drawCheckbox(page, x, y) {
  page.strokeColor(STROKE);
  page.lineWidth(0.8);
  page.rect(x, y, 10, 10);
}

// Only for a sheet printed before the panel number table exists. Numbering by
// position is exactly what stored numbers avoid, so this is a fallback.
function positionFallback(rows) {
  const numbers = new Map();
  rows.forEach((row, index) => {
    if (row.panelKey) numbers.set(row.panelKey, index + 1);
  });
  return numbers;
}

// ---- Production sheet ----
//
// Rows are measured before they are drawn and grow to fit their text: this is a
// production document, so nothing on it is ever trimmed or hidden. Variation
// state reads three ways at once (a bar down the left edge, a flag beside the
// item, and a sentence underneath) so the sheet still makes sense printed in
// black and white.

const CUT_FONT = 7.5;
const CUT_LINE = 9.5;
const CUT_ROW_PAD = 10;
const CUT_NOTE_FONT = 7;
const CUT_NOTE_LINE = 8.8;
const CUT_TABLE_HEAD = 22;
const CUT_CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CUT_EDGE_WIDTH = 6;
// The note band is inset past the status edge, so the wrap width is not the
// full content width.
const CUT_NOTE_INSET = 22;
const CUT_NOTE_WIDTH = PAGE_WIDTH - MARGIN * 2 - CUT_NOTE_INSET - 12;
// The flag chip and the gap above it, counted when a cell is centred so the
// name and its chip sit as one block rather than the name alone being centred.
const CUT_FLAG_BLOCK = 13;

const CUT_STATE_COLORS = {
  approved: { edge: [0.176, 0.369, 0.157], tint: [0.914, 0.945, 0.902], ink: [0.153, 0.318, 0.137] },
  hold: { edge: [0.541, 0.353, 0.071], tint: [0.984, 0.949, 0.882], ink: [0.435, 0.290, 0.063] },
  removal: { edge: [0.608, 0.133, 0.149], tint: [0.984, 0.929, 0.929], ink: [0.510, 0.153, 0.165] },
};

// Every column is a share of the page, sized to the longest value it actually
// holds and capped so nothing takes more than a fifth. Material and Notes both
// sit at the cap, which is why they wrap instead of squeezing everything else.
// The status edge is outside the split: it is a marking, not a column.
const CUT_COLUMN_SHARES = [
  { key: "done", label: "Done", share: 3.5 },
  { key: "index", label: "#", share: 3 },
  { key: "piece", label: "Piece", share: 14, flag: true },
  { key: "qty", label: "Qty", share: 3 },
  { key: "size", label: "Cut size", share: 13 },
  { key: "thickness", label: "Thick.", share: 5.5 },
  { key: "material", label: "Material / colour", share: 20 },
  { key: "edging", label: "Edging", share: 18 },
  { key: "notes", label: "Notes", share: 20 },
];

function shareColumns(shares, available) {
  return shares.map((column) => ({ ...column, width: (available * column.share) / 100 }));
}

/**
 * What a set of column shares adds up to.
 *
 * A hundred, or the table is drawn wider than the page and the last column
 * hangs off the edge. Checked by test/production-pdf-columns.test.mjs rather
 * than trusted, because the symptom appears on the far side of a PDF render
 * and reads as a wrapping problem in whichever column happens to be last.
 */
export function columnShareTotal(shares) {
  return (shares || []).reduce((total, column) => total + (Number(column.share) || 0), 0);
}


function cutListColumns() {
  return [
    { key: "gutter", label: "", width: CUT_EDGE_WIDTH },
    ...shareColumns(CUT_COLUMN_SHARES, CUT_CONTENT_WIDTH - CUT_EDGE_WIDTH),
  ];
}

// THE SHARES HAVE TO ADD UP TO A HUNDRED.
//
// shareColumns divides each one by 100 and lays them out left to right, so a
// table that adds up to more than a hundred does not squeeze: it runs off the
// right hand edge of the page, and the last column is the one that goes. These
// added up to 108, which is why the notes were spilling outside the table while
// every column before them looked fine.
//
// The reference and the ETA are gone. They are the supplier's paperwork rather
// than anything the bench needs, they are in the order on screen, and between
// them they were taking a seventh of the page from the one column people
// actually write in.
const MTO_COLUMN_SHARES = [
  { key: "done", label: "Ready", share: 4 },
  { key: "index", label: "#", share: 3 },
  { key: "item", label: "Item", share: 15, flag: true },
  { key: "qty", label: "Qty", share: 3 },
  { key: "size", label: "Size", share: 11 },
  { key: "material", label: "Material / colour", share: 18 },
  { key: "edging", label: "Edging", share: 12 },
  { key: "supplier", label: "Supplier", share: 8 },
  { key: "status", label: "Status", share: 6 },
  { key: "notes", label: "Notes", share: 20 },
];

function madeToOrderColumns() {
  return [
    { key: "gutter", label: "", width: CUT_EDGE_WIDTH },
    ...shareColumns(MTO_COLUMN_SHARES, CUT_CONTENT_WIDTH - CUT_EDGE_WIDTH),
  ];
}

// Both tables, so a test can add their shares up rather than a person noticing
// a column has slid off the page.
export const PDF_COLUMN_SHARES = { cutList: CUT_COLUMN_SHARES, madeToOrder: MTO_COLUMN_SHARES };

/**
 * Wraps a note into lines of same-weight segments: the bold lead first, then
 * the regular body, flowing as one sentence.
 *
 * Words of the same weight are kept together in one segment and drawn with a
 * single text call, so spacing inside a run is Helvetica's own. Only the
 * hand-off from bold to regular is positioned by estimate, and the bold
 * estimate is deliberately the wider of the two: a hair of extra space there
 * reads as word spacing, where an underestimate would overlap the two runs.
 */
function noteLines(note, width, size) {
  const lead = cleanText(note?.lead || "").replace(/\s+/g, " ").trim();
  const body = cleanText(note?.body || "").replace(/\s+/g, " ").trim();
  if (!lead && !body) return [];

  const words = [
    ...lead.split(" ").filter(Boolean).map((word) => ({ word, bold: true })),
    ...body.split(" ").filter(Boolean).map((word) => ({ word, bold: false })),
  ];
  const spaceWidth = (bold) => textWidth(" ", size, bold);

  const lines = [];
  let line = [];
  let lineWidth = 0;

  words.forEach(({ word, bold }) => {
    const space = line.length ? spaceWidth(bold) : 0;
    const wordWidth = textWidth(word, size, bold);
    if (line.length && lineWidth + space + wordWidth > width) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    const last = line[line.length - 1];
    if (last && last.bold === bold) {
      last.text += ` ${word}`;
      lineWidth += spaceWidth(bold) + wordWidth;
      return;
    }
    const x = lineWidth + (line.length ? spaceWidth(bold) : 0);
    line.push({ text: word, bold, x });
    lineWidth = x + wordWidth;
  });

  if (line.length) lines.push(line);
  return lines;
}

function cutRowHeight(row, columns) {
  // The tallest cell sets the row height. Measured against the same wrapping
  // the drawing uses, so the two can never disagree and clip a line off.
  let tallest = CUT_LINE;
  columns.forEach((column) => {
    if (["gutter", "done", "index", "qty"].includes(column.key)) return;
    const lines = wrappedTextLines(row[column.key] || "-", column.width - 8, CUT_FONT).length;
    const height = lines * CUT_LINE + (column.flag && row.flag ? CUT_FLAG_BLOCK : 0);
    tallest = Math.max(tallest, height);
  });
  const body = tallest + CUT_ROW_PAD;
  const noteHeight = row.variationNote
    ? noteLines(row.variationNote, CUT_NOTE_WIDTH, CUT_NOTE_FONT).length * CUT_NOTE_LINE + 9
    : 0;
  return { body, note: noteHeight, total: body + noteHeight };
}

function drawStateEdge(page, x, y, height, state) {
  const colors = CUT_STATE_COLORS[state];
  if (!colors) return;

  // Approved is solid: the work is live, so the edge is unbroken.
  if (state === "approved") {
    page.fillColor(colors.edge);
    page.rect(x, y, CUT_EDGE_WIDTH, height, { fill: true, stroke: false });
    return;
  }

  // Anything on hold is hatched instead. Thin diagonals rather than horizontal
  // bars: the pattern is what separates hold from approved once the sheet is
  // printed in black and white, and it has to read as a marking rather than as
  // a smudge down the edge of the page. Hold leans one way, removal the other.
  const lean = state === "removal" ? -1 : 1;
  const step = state === "removal" ? 5 : 4;
  page.save();
  page.clipRect(x, y, CUT_EDGE_WIDTH, height);
  page.strokeColor(colors.edge);
  page.lineWidth(state === "removal" ? 0.8 : 1);
  for (let offset = -CUT_EDGE_WIDTH; offset <= height + CUT_EDGE_WIDTH; offset += step) {
    if (lean > 0) {
      page.line(x, y + offset + CUT_EDGE_WIDTH, x + CUT_EDGE_WIDTH, y + offset);
    } else {
      page.line(x, y + offset, x + CUT_EDGE_WIDTH, y + offset + CUT_EDGE_WIDTH);
    }
  }
  page.restore();
}

function drawCutFlag(page, x, y, label, state) {
  const colors = CUT_STATE_COLORS[state] || { edge: MUTED, tint: [0.97, 0.97, 0.96], ink: STROKE };
  const width = Math.min(cleanText(label).length * 3.5 + 8, 116);
  page.fillColor(colors.tint);
  page.strokeColor(colors.edge);
  page.lineWidth(0.5);
  page.rect(x, y, width, 10, { fill: true, stroke: true });
  page.fillColor(colors.ink);
  page.text(label, x + 4, y + 7.2, 5.6, { bold: true });
}

function drawCutTableHeader(page, y, columns) {
  page.fillColor([0.96, 0.94, 0.9]);
  page.strokeColor(LINE);
  page.lineWidth(0.7);
  page.rect(MARGIN, y, CUT_CONTENT_WIDTH, CUT_TABLE_HEAD, { fill: true, stroke: true });
  page.fillColor(STROKE);
  let x = MARGIN;
  columns.forEach((column) => {
    if (column.label) page.text(column.label, x + 4, y + 14, 6.5, { bold: true });
    x += column.width;
  });
  return y + CUT_TABLE_HEAD;
}

function drawCutRow(page, row, y, columns, heights) {
  page.fillColor([1, 1, 1]);
  page.strokeColor(LINE);
  page.lineWidth(0.5);
  page.rect(MARGIN, y, CUT_CONTENT_WIDTH, heights.body, { fill: true, stroke: true });

  let x = MARGIN;
  columns.forEach((column) => {
    if (column.key === "gutter") {
      drawStateEdge(page, x, y, heights.body + heights.note, row.state);
      x += column.width;
      return;
    }
    if (column.key === "done") {
      drawCheckbox(page, x + 6, y + (heights.body - 10) / 2);
      x += column.width;
      return;
    }
    // The panel's own number, stored against the order, not its position on
    // this page. A proposed piece is not a panel on the order yet, so it has
    // none.
    const value = column.key === "index"
      ? (row.panelNo ? String(row.panelNo) : "-")
      : column.key === "notes"
      ? (row.notes || "-")
      : row[column.key];
    page.fillColor(column.key === "index" ? MUTED : STROKE);

    // Every cell is centred against the row, so a one line value sits level
    // with the middle of a three line one beside it rather than riding at the
    // top of a tall row.
    const lines = wrappedTextLines(value || "-", column.width - 8, CUT_FONT);
    const hasFlag = Boolean(column.flag && row.flag);
    const blockHeight = lines.length * CUT_LINE + (hasFlag ? CUT_FLAG_BLOCK : 0);
    const top = y + Math.max(0, (heights.body - blockHeight) / 2);

    lines.forEach((line, lineIndex) => {
      page.text(line, x + 4, top + CUT_FONT + lineIndex * CUT_LINE, CUT_FONT);
    });
    if (hasFlag) {
      drawCutFlag(page, x + 4, top + lines.length * CUT_LINE + 1, row.flag, row.state);
    }
    x += column.width;
  });

  if (heights.note) {
    const colors = CUT_STATE_COLORS[row.state] || { tint: [0.976, 0.976, 0.972], ink: MUTED };
    // Inset by the width of the status edge so the note band never paints over it.
    const noteY = y + heights.body;
    page.fillColor(colors.tint);
    page.strokeColor(LINE);
    page.lineWidth(0.5);
    page.rect(MARGIN + CUT_EDGE_WIDTH, noteY, CUT_CONTENT_WIDTH - CUT_EDGE_WIDTH, heights.note, { fill: true, stroke: true });
    page.fillColor(colors.ink);
    // Which variation and where it is up to, in bold; what it means for this
    // piece, in regular. One sentence, but the fact carries at a glance.
    noteLines(row.variationNote, CUT_NOTE_WIDTH, CUT_NOTE_FONT).forEach((segments, lineIndex) => {
      segments.forEach((segment) => {
        page.text(
          segment.text,
          MARGIN + CUT_NOTE_INSET + segment.x,
          noteY + 10 + lineIndex * CUT_NOTE_LINE,
          CUT_NOTE_FONT,
          { bold: segment.bold }
        );
      });
    });
  }

  return y + heights.body + heights.note;
}

const CUT_GROUP_HEIGHT = 19;

// The bar that names an assembly. Everything that cabinet is made of sits under
// it, so the name, its size and its counts are said once instead of on every
// panel row.
function drawCutGroup(page, group, y) {
  const pieces = group.rows.reduce((total, row) => total + Number(row.qty || 0), 0);
  page.fillColor([0.918, 0.902, 0.855]);
  page.strokeColor(STROKE);
  page.lineWidth(0.9);
  page.rect(MARGIN, y, CUT_CONTENT_WIDTH, CUT_GROUP_HEIGHT, { fill: true, stroke: false });
  page.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);

  page.fillColor(STROKE);
  page.text(group.name, MARGIN + 6, y + 12.5, 9.5, { bold: true });
  if (group.meta) {
    const offset = cleanText(group.name).length * 5.2 + 16;
    page.fillColor(MUTED);
    page.text(group.meta, MARGIN + offset, y + 12.5, 7.5);
  }
  page.fillColor(MUTED);
  page.text(
    `${group.rows.length} row${group.rows.length === 1 ? "" : "s"}  ·  ${pieces} piece${pieces === 1 ? "" : "s"}`,
    PAGE_WIDTH - MARGIN - 6,
    y + 12.5,
    7.5,
    { align: "right" }
  );
  return y + CUT_GROUP_HEIGHT;
}

function drawCutLegend(page, y) {
  page.fillColor([0.976, 0.976, 0.972]);
  page.strokeColor(LINE);
  page.lineWidth(0.5);
  page.rect(MARGIN, y, CUT_CONTENT_WIDTH, 18, { fill: true, stroke: true });
  const keys = [
    { state: "", label: "Standard order line" },
    { state: "approved", label: "Approved variation, cut this" },
    { state: "hold", label: "Pending variation, do not cut" },
    { state: "removal", label: "Removal pending, do not cut" },
  ];
  let x = MARGIN + 8;
  keys.forEach((key) => {
    if (key.state) {
      drawStateEdge(page, x, y + 4, 10, key.state);
    } else {
      page.strokeColor(LINE);
      page.lineWidth(0.5);
      page.rect(x, y + 4, 6, 10);
    }
    page.fillColor(STROKE);
    page.text(key.label, x + 11, y + 12, 6.5);
    x += cleanText(key.label).length * 3.5 + 28;
  });
  return y + 18;
}

function drawSectionBand(page, y, title, note) {
  page.fillColor(STROKE);
  page.text(title, MARGIN, y + 10, 10, { bold: true });
  if (note) {
    page.fillColor(MUTED);
    page.text(note, PAGE_WIDTH - MARGIN, y + 10, 7.5, { align: "right" });
  }
  page.strokeColor(STROKE);
  page.lineWidth(1);
  page.line(MARGIN, y + 14, PAGE_WIDTH - MARGIN, y + 14);
  return y + 20;
}

// Splits rows across pages. Each page keeps its own starting offset because the
// first page of a section carries the title block and the legend.
// Entries are either a group bar or a row, laid out in one pass so a bar can
// never be orphaned at the foot of a page. A bar that would land last takes the
// next page with its first row, and a group split across a break gets its bar
// repeated, marked continued.
function paginateCutRows(entries, columns, firstTop, laterTop) {
  const bottomLimit = PAGE_HEIGHT - FOOTER_HEIGHT - 12;
  const pages = [];
  let current = [];
  let y = firstTop;
  let openGroup = null;

  const measure = (entry) => (entry.kind === "group"
    ? { body: CUT_GROUP_HEIGHT, note: 0, total: CUT_GROUP_HEIGHT }
    : cutRowHeight(entry.row, columns));

  entries.forEach((entry, index) => {
    const heights = measure(entry);
    // A bar on its own at the foot of a page helps nobody, so it is measured
    // together with the row that follows it.
    const next = entries[index + 1];
    const needed = entry.kind === "group" && next
      ? heights.total + measure(next).total
      : heights.total;

    if (current.length && y + needed > bottomLimit) {
      pages.push(current);
      current = [];
      y = laterTop + CUT_TABLE_HEAD;
      if (entry.kind !== "group" && openGroup) {
        const carried = { kind: "group", group: { ...openGroup.group, name: `${openGroup.group.name} continued` } };
        current.push({ entry: carried, heights: { body: CUT_GROUP_HEIGHT, note: 0, total: CUT_GROUP_HEIGHT } });
        y += CUT_GROUP_HEIGHT;
      }
    }

    if (entry.kind === "group") openGroup = entry;
    current.push({ entry, heights });
    y += heights.total;
  });

  if (current.length || !pages.length) pages.push(current);
  return pages;
}

// Flattens groups into the entry list the paginator walks.
function groupedEntries(groups) {
  return groups.flatMap((group) => [
    { kind: "group", group },
    ...group.rows.map((row) => ({ kind: "row", row })),
  ]);
}

function drawCutListSummary(page, order, rows, proposedCount) {
  const totalPieces = rows.reduce((total, row) => total + Number(row.qty || 0), 0);
  const held = rows.filter((row) => row.state === "hold" || row.state === "removal").length;

  page.fillColor(STROKE);
  page.text("Production sheet", MARGIN, CONTENT_TOP, 16, { bold: true });
  page.text(`${rows.length} rows to cut  |  ${totalPieces} pieces`, MARGIN, CONTENT_TOP + 22, 9, { bold: true });
  page.text(`Generated ${new Date().toLocaleDateString("en-AU")}`, PAGE_WIDTH - MARGIN, CONTENT_TOP + 22, 8, { align: "right" });

  // The counts above are cuttable work only. Held rows and proposed pieces are
  // both on the sheet, so say so here rather than letting the numbers imply
  // there is nothing else to look at.
  const parts = [];
  if (held) parts.push(`${held} row${held === 1 ? "" : "s"} on hold for a pending variation`);
  if (proposedCount) parts.push(`${proposedCount} proposed piece${proposedCount === 1 ? "" : "s"} listed at the end, not counted`);
  page.fillColor(MUTED);
  page.text(parts.length ? `${parts.join(". ")}.` : "No pending variations on this order.", MARGIN, CONTENT_TOP + 36, 7.5);
  return CONTENT_TOP + 44;
}

/**
 * Problems already reported against this order, printed where the bench sees
 * them before starting.
 *
 * An open issue is the single most production-relevant thing on the order and it
 * reached the workshop nowhere: not on either table, not on the notes page. A
 * panel recorded as damaged still printed as a panel to cut.
 *
 * Only OPEN ones. A resolved issue is history and belongs on the screen, not on
 * a sheet somebody is working from today.
 */
function drawOpenIssues(page, issues, y) {
  const open = (issues || []).filter((issue) => !issue?.resolved_at);
  if (!open.length) return y;

  y = drawSectionBand(
    page,
    y,
    `Open issues (${open.length})`,
    "Reported against this order and not yet resolved"
  );

  page.fillColor([0.96, 0.94, 0.9]);
  page.strokeColor(LINE);
  page.lineWidth(0.7);
  page.rect(MARGIN, y, CUT_CONTENT_WIDTH, CUT_TABLE_HEAD, { fill: true, stroke: true });
  page.fillColor(STROKE);
  page.text("What is wrong", MARGIN + 6, y + 14, 6.5, { bold: true });
  page.text("Stops", MARGIN + CUT_CONTENT_WIDTH - 150, y + 14, 6.5, { bold: true });
  page.text("Whose", MARGIN + CUT_CONTENT_WIDTH - 70, y + 14, 6.5, { bold: true });
  y += CUT_TABLE_HEAD;

  open.forEach((issue) => {
    const heading = [issueKindLabel(issue.kind), issue.panel_label].filter(Boolean).join(" - ");
    const detail = wrappedTextLines(issue.detail, CUT_CONTENT_WIDTH - 170, 7.5);
    const height = 18 + detail.length * 10;

    page.fillColor([1, 1, 1]);
    page.strokeColor(LINE);
    page.lineWidth(0.5);
    page.rect(MARGIN, y, CUT_CONTENT_WIDTH, height, { fill: true, stroke: true });

    // A blocker on the whole order is marked, not merely worded. Somebody
    // scanning this page has to see it without reading every row.
    if (issue.blocks === "order") {
      page.fillColor([0.62, 0.15, 0.09]);
      page.rect(MARGIN, y, 3, height, { fill: true, stroke: false });
    }

    page.fillColor(STROKE);
    page.text(heading, MARGIN + 8, y + 12, 7.5, { bold: true });
    page.fillColor(MUTED);
    detail.forEach((lineText, index) => {
      page.text(lineText, MARGIN + 8, y + 12 + (index + 1) * 10, 7.5);
    });
    page.fillColor(STROKE);
    page.text(issueBlocksLabel(issue.blocks), MARGIN + CUT_CONTENT_WIDTH - 150, y + 12, 7);
    page.text(issueOwnerLabel(issue.owner), MARGIN + CUT_CONTENT_WIDTH - 70, y + 12, 7);
    y += height;
  });

  return y + 16;
}

// ---- The reference page ----
//
// WHY IT IS HERE. Checking a delivery off means reading a row and then looking
// at the thing in your hands. "Prime Oak Ravine" and "Prime Oak Riven" are two
// lines of text on a page and two boards that look nothing alike. A person
// holding the board can tell them apart at a glance and often cannot tell from
// the name. So the sheet carries the actual tiles and the actual routed
// profiles used on THIS order, and nothing else: a catalogue of everything
// Polytec makes would be worse than no page at all.
//
// It sits immediately before the notes page, at the back where you go to look
// something up, rather than in front of the rows you are working through.

const REF_TILE_WIDTH = 176;
const REF_TILE_IMAGE_HEIGHT = 104;
const REF_TILE_TEXT_HEIGHT = 40;
const REF_TILE_HEIGHT = REF_TILE_IMAGE_HEIGHT + REF_TILE_TEXT_HEIGHT;
const REF_TILE_GAP = 14;
const REF_SECTION_HEAD = 26;

/** How many tiles fit across the page, and where each column starts. */
function referenceColumns(pageWidth = PAGE_WIDTH) {
  const usable = pageWidth - MARGIN * 2;
  const count = Math.max(1, Math.floor((usable + REF_TILE_GAP) / (REF_TILE_WIDTH + REF_TILE_GAP)));
  // Spread the leftover evenly rather than leaving a gutter down the right.
  const gap = count > 1 ? (usable - count * REF_TILE_WIDTH) / (count - 1) : 0;
  return { count, gap };
}

/**
 * Break the sections into pages.
 *
 * A section heading is never left stranded at the foot of a page with its
 * tiles overleaf, which is the one thing that would make this page harder to
 * use than no page at all.
 */
export function paginateReference(sections = [], pageWidth = PAGE_WIDTH, pageHeight = PAGE_HEIGHT) {
  const { count } = referenceColumns(pageWidth);
  const bottom = pageHeight - FOOTER_HEIGHT - 14;
  const pages = [];
  let current = [];
  let y = CONTENT_TOP + 40;

  const rowsFor = (entries) => Math.ceil(entries.length / count);
  const startPage = () => {
    if (current.length) pages.push(current);
    current = [];
    y = CONTENT_TOP + 14;
  };

  for (const section of sections) {
    let entries = [...section.entries];
    let first = true;
    while (entries.length) {
      const headHeight = REF_SECTION_HEAD;
      const roomBelow = bottom - (y + headHeight);
      let rowsThatFit = Math.floor((roomBelow + REF_TILE_GAP) / (REF_TILE_HEIGHT + REF_TILE_GAP));

      // A heading with no room for even one row of tiles under it belongs on
      // the next page, with them.
      if (rowsThatFit < 1) {
        startPage();
        rowsThatFit = Math.floor((bottom - (y + headHeight) + REF_TILE_GAP) / (REF_TILE_HEIGHT + REF_TILE_GAP));
        if (rowsThatFit < 1) break; // A page too short to hold anything at all.
      }

      const take = entries.slice(0, rowsThatFit * count);
      current.push({ section, entries: take, continued: !first });
      y += headHeight + rowsFor(take) * (REF_TILE_HEIGHT + REF_TILE_GAP) + 6;
      entries = entries.slice(take.length);
      first = false;
      if (entries.length) startPage();
    }
  }

  if (current.length) pages.push(current);
  return pages;
}

function drawReferenceTile(page, entry, x, y, images) {
  const image = images?.[entry.key];

  page.fillColor([1, 1, 1]);
  page.strokeColor(LINE);
  page.lineWidth(0.8);
  page.rect(x, y, REF_TILE_WIDTH, REF_TILE_HEIGHT, { fill: true, stroke: true });

  if (image) {
    // NEVER DISTORTED, and cropped only where cropping is safe.
    //
    // A board tile is a texture: any part of it is the colour, so it fills the
    // well and the overflow is trimmed. A profile is a SHAPE, photographed on a
    // real door, and a profile with its edges cropped off is exactly the thing
    // somebody would then misjudge, so it is fitted whole inside the well with
    // the spare room left as white.
    const crop = entry.kind === "colour";

    // A cropped colour fills its well edge to edge, because a board sample with
    // a white border around it reads as a smaller board rather than as a
    // sample. A fitted picture gets room to breathe: a door photo drawn hard
    // against the rule looked like it had been trimmed by it.
    const pad = crop ? 0 : 7;
    const wellWidth = REF_TILE_WIDTH - pad * 2;
    const wellHeight = REF_TILE_IMAGE_HEIGHT - pad * 2;

    const wellRatio = wellWidth / wellHeight;
    const imageRatio = (image.width || 1) / (image.height || 1);
    const wider = crop ? imageRatio > wellRatio : imageRatio < wellRatio;

    let drawWidth = wellWidth;
    let drawHeight = wellHeight;
    if (wider) drawWidth = wellHeight * imageRatio;
    else drawHeight = wellWidth / imageRatio;

    // A cropped tile is drawn LARGER than its well by definition, and a PDF
    // clips nothing on its own: without this the overflow paints straight over
    // the tile beside it and the heading above it.
    page.save();
    page.clipRect(x, y, REF_TILE_WIDTH, REF_TILE_IMAGE_HEIGHT);
    page.image(
      image.name,
      x + (REF_TILE_WIDTH - drawWidth) / 2,
      y + (REF_TILE_IMAGE_HEIGHT - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
    page.restore();
  } else {
    // Named, and honest about having no picture. A colour the library has never
    // heard of is exactly the one somebody will be unsure about on the dock.
    page.fillColor(PANEL);
    page.rect(x + 0.8, y + 0.8, REF_TILE_WIDTH - 1.6, REF_TILE_IMAGE_HEIGHT - 1.6, { fill: true, stroke: false });
    page.fillColor(MUTED);
    page.text("No picture on file", x + REF_TILE_WIDTH / 2, y + REF_TILE_IMAGE_HEIGHT / 2 + 3, 8, { align: "center" });
  }

  page.strokeColor(LINE);
  page.line(x, y + REF_TILE_IMAGE_HEIGHT, x + REF_TILE_WIDTH, y + REF_TILE_IMAGE_HEIGHT);

  let textY = y + REF_TILE_IMAGE_HEIGHT + 15;
  page.fillColor(STROKE);
  page.text(truncateText(entry.name, REF_TILE_WIDTH - 14, 9), x + 7, textY, 9, { bold: true });
  page.fillColor(MUTED);
  for (const detail of (entry.details || []).slice(0, 2)) {
    if (!detail) continue;
    textY += 11;
    page.text(truncateText(detail, REF_TILE_WIDTH - 14, 7.5), x + 7, textY, 7.5);
  }
}

function drawReferencePage(page, order, blocks, pageNumber, pageCount, images, isFirst) {
  drawHeader(page, order, "Colour and profile reference");

  const { count, gap } = referenceColumns(page.width || PAGE_WIDTH);
  let y = CONTENT_TOP + 14;

  if (isFirst) {
    page.fillColor(STROKE);
    page.text("What these are meant to look like", MARGIN, CONTENT_TOP, 16, { bold: true });
    page.fillColor(MUTED);
    page.text(
      "Only the colours and profiles used on this order. Check a delivered piece against the picture, not the name.",
      MARGIN,
      CONTENT_TOP + 20,
      8
    );
    y = CONTENT_TOP + 40;
  }

  for (const block of blocks) {
    page.fillColor(STROKE);
    page.text(
      block.continued ? `${block.section.title} continued` : block.section.title,
      MARGIN,
      y + 11,
      11,
      { bold: true }
    );
    if (!block.continued && block.section.note) {
      page.fillColor(MUTED);
      page.text(block.section.note, MARGIN + 4, y + 22, 7.5);
    }
    y += REF_SECTION_HEAD;

    block.entries.forEach((entry, index) => {
      const column = index % count;
      const row = Math.floor(index / count);
      drawReferenceTile(
        page,
        entry,
        MARGIN + column * (REF_TILE_WIDTH + gap),
        y + row * (REF_TILE_HEIGHT + REF_TILE_GAP),
        images
      );
    });

    y += Math.ceil(block.entries.length / count) * (REF_TILE_HEIGHT + REF_TILE_GAP) + 6;
  }

  drawFooter(page, pageNumber, pageCount, "Reference only. Nothing on this page is an instruction to cut.");
}

function drawNotesPage(page, order, pageNumber, pageCount, issues) {
  drawHeader(page, order, "Production sheet");
  drawFooter(page, pageNumber, pageCount, "Workshop notes. Anything written here stays with this order.");

  page.fillColor(STROKE);
  page.text("Notes", MARGIN, CONTENT_TOP, 16, { bold: true });
  page.text(
    [order.order_number, order.customer_name].filter(Boolean).join("  |  "),
    MARGIN,
    CONTENT_TOP + 22,
    9,
    { bold: true }
  );
  page.text(`Generated ${new Date().toLocaleDateString("en-AU")}`, PAGE_WIDTH - MARGIN, CONTENT_TOP + 22, 8, { align: "right" });

  let y = CONTENT_TOP + 40;

  if (order.internal_notes) {
    const lines = wrappedTextLines(order.internal_notes, CUT_CONTENT_WIDTH - 24, 8);
    const height = lines.length * 11 + 28;
    page.fillColor([0.976, 0.976, 0.972]);
    page.strokeColor(LINE);
    page.lineWidth(0.7);
    page.rect(MARGIN, y, CUT_CONTENT_WIDTH, height, { fill: true, stroke: true });
    page.fillColor(MUTED);
    page.text("Recorded on the order", MARGIN + 12, y + 14, 7, { bold: true });
    page.fillColor(STROKE);
    lines.forEach((line, index) => {
      page.text(line, MARGIN + 12, y + 27 + index * 11, 8);
    });
    y += height + 16;
  }

  y = drawOpenIssues(page, issues, y);

  // Banded and headed like every table on the other pages, so the notes page
  // reads as part of the same document rather than a sheet of lined paper that
  // wandered in. Same section rule, same cream header bar, same border.
  y = drawSectionBand(page, y, "Workshop notes", "Anything written here stays with this order");

  page.fillColor([0.96, 0.94, 0.9]);
  page.strokeColor(LINE);
  page.lineWidth(0.7);
  page.rect(MARGIN, y, CUT_CONTENT_WIDTH, CUT_TABLE_HEAD, { fill: true, stroke: true });
  page.fillColor(STROKE);
  page.text("Write up anything the bench needs to remember about this order", MARGIN + 6, y + 14, 6.5, { bold: true });
  page.text("Date / initials", PAGE_WIDTH - MARGIN - 6, y + 14, 6.5, { bold: true, align: "right" });
  y += CUT_TABLE_HEAD;

  // Ruled writing area filling the rest of the page, drawn as table rows: a
  // rule under each line and a column rule where the initials go.
  const bottom = PAGE_HEIGHT - FOOTER_HEIGHT - 16;
  const initialsX = PAGE_WIDTH - MARGIN - 86;
  page.fillColor([1, 1, 1]);
  page.rect(MARGIN, y, CUT_CONTENT_WIDTH, bottom - y, { fill: true, stroke: false });

  page.strokeColor(LINE);
  page.lineWidth(0.5);
  for (let lineY = y + 22; lineY <= bottom; lineY += 22) {
    page.line(MARGIN, lineY, PAGE_WIDTH - MARGIN, lineY);
  }
  page.line(initialsX, y, initialsX, bottom);

  page.strokeColor(LINE);
  page.lineWidth(0.7);
  page.rect(MARGIN, y, CUT_CONTENT_WIDTH, bottom - y);
}

function drawCutSectionPage(page, order, section, pageIndex, pageNumber, pageCount) {
  drawHeader(page, order, "Production sheet");
  drawFooter(page, pageNumber, pageCount, section.footerNote);

  let y;
  if (pageIndex === 0) {
    y = section.drawIntro(page);
    y = drawSectionBand(page, y, section.title, section.subtitle);
  } else {
    page.fillColor(STROKE);
    page.text(`${section.title} continued`, MARGIN, CONTENT_TOP + 4, 10, { bold: true });
    page.strokeColor(STROKE);
    page.lineWidth(1);
    page.line(MARGIN, CONTENT_TOP + 8, PAGE_WIDTH - MARGIN, CONTENT_TOP + 8);
    y = CONTENT_TOP + 14;
  }

  y = drawCutTableHeader(page, y, section.columns);
  section.pages[pageIndex].forEach(({ entry, heights }) => {
    y = entry.kind === "group"
      ? drawCutGroup(page, entry.group, y)
      : drawCutRow(page, entry.row, y, section.columns, heights);
  });

  // An empty page only means "nothing here" when the section has no rows at
  // all. A trailing empty page is one the proposed block was pushed onto.
  if (!section.pages[pageIndex].length && !section.hasRows) {
    page.fillColor(MUTED);
    page.text(section.emptyLabel, MARGIN + 8, y + 16, 8);
  }
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

// includeCabinetDrawings: the schematic page-per-cabinet tail. On by default,
// which is what the download button in the editor gives you. The copy attached
// to a quote when it is emailed leaves them off, so the customer gets the quote
// itself rather than a workshop drawing set.
export function generateQuotePdf({ quote, lines, businessDefaults, includeCabinetDrawings = true }) {
  const normalizedLines = (lines || []).filter(Boolean);
  const totals = calculateQuoteTotals(normalizedLines, quote.gst_rate ?? GST_RATE, {
    ...quote,
    business_defaults: businessDefaults,
  });
  const calculatedLines = totals.lines.map((line, index) => ({
    ...normalizedLines[index],
    ...line,
  }));
  // Left empty when the drawings are not wanted, so the page count in every
  // footer stays honest rather than counting pages that were never added.
  const cabinetLines = includeCabinetDrawings ? calculatedLines.filter(isConfiguredBaseCabinetLine) : [];

  // The light logo, because the masthead is now a deep green band. loadLogo
  // still defaults to the dark one, which is right for the white headers the
  // drawings and the production sheet use.
  const logo = loadLogo("light-pcd-logo-horizontal");
  const pdf = new PdfDocument({ logo });
  const quotePlan = planQuotePages(quoteGroupBlocks(quoteGroups(calculatedLines)));
  const quotePages = quotePlan.pages;

  // Flow the summary (totals box + notes containers) starting immediately after
  // the last table row, adding extra pages only when a block overflows.
  const lastTablePageIndex = quotePages.length - 1;
  const summaryPlacements = planQuoteSummary(quotePlan.lastY + 14, quoteSummaryBlocks(quote, totals));
  const extraSummaryPages = summaryPlacements.reduce((max, placement) => Math.max(max, placement.pageOffset), 0);

  const quotePageCount = quotePages.length + extraSummaryPages;
  const pageCount = quotePageCount + cabinetLines.length;

  for (let pageIndex = 0; pageIndex < quotePageCount; pageIndex += 1) {
    const placedGroups = quotePages[pageIndex] || [];
    const pagePlacements = summaryPlacements.filter(
      (placement) => lastTablePageIndex + placement.pageOffset === pageIndex
    );
    pdf.addPage((page) => {
      page.hasLogo = Boolean(logo);
      page.logoWidth = logo?.width || 1;
      page.logoHeight = logo?.height || 1;
      drawQuotePage(page, quote, totals, placedGroups, pageIndex, pageCount, pagePlacements);
    }, { width: QUOTE_PAGE_WIDTH, height: QUOTE_PAGE_HEIGHT });
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

/**
 * The production sheet: the whole order, in three sections, each starting on
 * its own page. What we cut in house, what is made to order, and a notes page.
 *
 * Approved variations are already part of the order lines so they are cut;
 * pending ones are flagged and held; removed lines never print at all.
 *
 * Panel numbers run continuously across both tables and are stored against the
 * order, so a section reads its own subset (1, 2, 3, 5) rather than restarting
 * at 1. Pass panelNumbers from ensurePanelNumbers; without it the rows fall
 * back to their position, which is only correct until something is removed.
 */
export function generateOrderCutListPdf({
  order,
  items,
  quoteLines = [],
  variations = [],
  variationLines = [],
  panelNumbers = null,
  issues = [],
  // The colours and profiles this order uses, and the pictures for them. Worked
  // out and fetched by the route, because the pictures live in storage and this
  // function must stay synchronous and testable. Absent means no reference
  // page, which is what a database without the libraries gets.
  reference = null,
} = {}) {
  const context = buildVariationContext({ variations, variationLines });
  const rawCutRows = buildCutListRows(items, context);
  // The brand behind each board, so the supplier column answers the same way
  // the order screen does rather than printing a dash beside it.
  const rawMtoRows = buildMadeToOrderRows(items, context, reference?.colourSuppliers || {});
  if (!rawCutRows.length && !rawMtoRows.length) {
    throw new Error("No cut list or made to order rows found for this order.");
  }

  // One numbering across both tables. Without stored numbers this falls back to
  // position in the same order ensurePanelNumbers hands them out, so a sheet
  // printed before the migration is installed still reads correctly; it just
  // cannot survive a panel being removed.
  const numbers = panelNumbers || positionFallback([...rawCutRows, ...rawMtoRows]);
  const cutRows = applyPanelNumbers(rawCutRows, numbers);
  const mtoRows = applyPanelNumbers(rawMtoRows, numbers);

  // Proposed pieces print as rows at the end of the cut table, marked the same
  // way as any other pending line. They are kept out of the counts, which is
  // why the summary is measured against cutRows rather than what is drawn.
  const proposed = buildProposedRows(context);
  const drawnCutRows = [...cutRows, ...proposed];
  const cutColumns = cutListColumns();
  const mtoColumns = madeToOrderColumns();

  // Cabinets first, each holding its own panels, doors and fronts, then
  // anything supplied on its own grouped by what it is. Proposed pieces sit in
  // their own group at the end: they are not part of any assembly yet.
  const cutGroups = groupProductionRows(cutRows, { items, quoteLines });
  if (proposed.length) {
    cutGroups.push({ key: "proposed", name: "Proposed", meta: "On a pending variation, not counted", rows: proposed });
  }
  const cutEntries = groupedEntries(cutGroups);
  const mtoEntries = mtoRows.map((row) => ({ kind: "row", row }));

  const cutIntroHeight = 44 + 18 + 8;
  const cutPages = paginateCutRows(cutEntries, cutColumns, CONTENT_TOP + cutIntroHeight + 20 + CUT_TABLE_HEAD, CONTENT_TOP + 14);
  const mtoPages = paginateCutRows(mtoEntries, mtoColumns, CONTENT_TOP + 46 + 20 + CUT_TABLE_HEAD, CONTENT_TOP + 14);

  const cutSection = {
    title: "Cut in house",
    subtitle: "Everything below is cut and edged by us",
    columns: cutColumns,
    pages: cutPages,
    hasRows: drawnCutRows.length > 0,
    emptyLabel: "Nothing on this order is cut in house.",
    footerNote: "Cut, edge and tick off each row. Anything marked hold must not be cut until the variation is settled.",
    drawIntro: (page) => {
      const y = drawCutListSummary(page, order, cutRows, proposed.length);
      return drawCutLegend(page, y) + 8;
    },
  };

  const mtoSection = {
    title: "Made to order",
    subtitle: "Not cut here. Tick each one off once it has arrived and been checked",
    columns: mtoColumns,
    pages: mtoPages,
    hasRows: mtoRows.length > 0,
    emptyLabel: "Nothing on this order is made to order.",
    footerNote: "Supplier made items. Check each one against the order before it goes out.",
    drawIntro: (page) => {
      const totalPieces = mtoRows.reduce((total, row) => total + Number(row.qty || 0), 0);
      page.fillColor(STROKE);
      page.text("Made to order items", MARGIN, CONTENT_TOP, 16, { bold: true });
      page.text(`${mtoRows.length} line${mtoRows.length === 1 ? "" : "s"}  |  ${totalPieces} piece${totalPieces === 1 ? "" : "s"}`, MARGIN, CONTENT_TOP + 22, 9, { bold: true });
      page.text(`Generated ${new Date().toLocaleDateString("en-AU")}`, PAGE_WIDTH - MARGIN, CONTENT_TOP + 22, 8, { align: "right" });
      page.fillColor(MUTED);
      page.text("Supplier ready made panels, anything thermolaminated, and hardware.", MARGIN, CONTENT_TOP + 36, 7.5);
      return CONTENT_TOP + 46;
    },
  };

  // The reference page, if there is anything to put on it. An order of plain
  // white doors with no profile has nothing to check against a picture, and an
  // empty page of tiles would be one more sheet to turn past.
  const referenceSections = (reference?.sections || []).filter((section) => section.entries?.length);
  const referenceImages = reference?.images || {};
  const referencePages = referenceSections.length ? paginateReference(referenceSections) : [];

  const logo = loadLogo();
  const pdf = new PdfDocument({
    logo,
    // Every tile is registered once and drawn wherever it is needed, so the
    // same oak used by a door and a panel is one copy in the file.
    images: Object.values(referenceImages),
  });
  const pageCount = cutPages.length + mtoPages.length + referencePages.length + 1;
  let pageNumber = 0;

  const addSectionPages = (section) => {
    section.pages.forEach((_, pageIndex) => {
      pageNumber += 1;
      const currentPageNumber = pageNumber;
      pdf.addPage((page) => {
        page.hasLogo = Boolean(logo);
        page.logoWidth = logo?.width || 1;
        page.logoHeight = logo?.height || 1;
        drawCutSectionPage(page, order, section, pageIndex, currentPageNumber, pageCount);
      });
    });
  };

  addSectionPages(cutSection);
  addSectionPages(mtoSection);

  // Immediately before the notes page: at the back, where you go to look
  // something up, rather than in front of the rows being worked through.
  referencePages.forEach((blocks, pageIndex) => {
    pageNumber += 1;
    const currentPageNumber = pageNumber;
    pdf.addPage((page) => {
      page.hasLogo = Boolean(logo);
      page.logoWidth = logo?.width || 1;
      page.logoHeight = logo?.height || 1;
      drawReferencePage(page, order, blocks, currentPageNumber, pageCount, referenceImages, pageIndex === 0);
    });
  });

  pdf.addPage((page) => {
    page.hasLogo = Boolean(logo);
    page.logoWidth = logo?.width || 1;
    page.logoHeight = logo?.height || 1;
    drawNotesPage(page, order, pageCount, pageCount, issues);
  });

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
    const dimTxt = `${cab.height_mm || "?"}x${cab.width_mm || "?"}`;

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

// Shared primitives for other PDF generators (e.g. the design-tool plan export).
export {
  PdfPage,
  PdfDocument,
  loadLogo,
  drawHeader,
  drawFooter,
  decodeImageDataUrl,
  decodeImageBuffer,
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
};
