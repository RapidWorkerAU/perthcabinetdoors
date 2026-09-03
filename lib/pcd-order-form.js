// Pulling the live libraries and handing back a finished order form.
//
// One place, so the download button on the admin site and the script that
// writes the file to disk cannot end up offering different colours.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { SHEET_PASSWORD, buildOrderFormWorkbook } from "./pcd-order-form-workbook";
import { lockWorkbookStructure } from "./pcd-xlsx-lock";
import { loadAllListItems } from "./pcd-list-load";
import { activeOnly } from "./pcd-lists";

/** The date printed on the sheet, in the words a Perth customer reads. */
export function formatGeneratedOn(date = new Date()) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Perth",
  }).format(date);
}

/**
 * The file name they end up with in their downloads folder. Dated, because a
 * form filled in from a six month old copy is a form full of colours we may
 * have stopped stocking, and the date is what lets us see that at a glance.
 */
export function orderFormFileName(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Australia/Perth",
  }).format(date);
  return `PCD-Order-Form-${parts}.xlsx`;
}

async function readLogo() {
  try {
    return await readFile(path.join(process.cwd(), "public", "images", "light-pcd-logo-horizontal.png"));
  } catch {
    // The sheet is still perfectly usable without it, and failing the whole
    // download over a missing image would be the wrong trade.
    return null;
  }
}

/**
 * Reads the three libraries the form is built from.
 *
 * Only active rows. A colour switched off in the library is one we have stopped
 * offering, and putting it on a form is inviting an order we then have to go
 * back on.
 */
export async function loadOrderFormLibraries(supabase) {
  const [colours, hardware, vocab] = await Promise.all([
    supabase
      .from("pcd_colour_library")
      .select("name, supplier_name, material_type, thickness, finish_type, is_active")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("pcd_hardware")
      .select("type, brand, name, description, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    // The two vocabularies somebody can add to from Settings, Lists. A missing
    // table falls back to the built-in words rather than shipping a form with
    // two empty dropdowns on it.
    loadAllListItems(supabase),
  ]);

  const failed = [colours, hardware].find((result) => result.error);
  if (failed) throw new Error(failed.error.message);

  const wordsFor = (listKey) =>
    activeOnly((vocab.items || []).filter((item) => item.list_key === listKey)).map((item) => item.label);

  // The profile library is deliberately NOT read here. Door and edge profiles
  // come from lib/quote-form-data.js, which is the module the website request
  // form itself reads, so the form and the site cannot offer different things.
  // The library carries groupings the request form has no way to represent
  // (the supplier series, the glazed frames), and offering one would produce a
  // request line nothing downstream understands.
  return {
    colours: colours.data || [],
    hardware: hardware.data || [],
    rooms: wordsFor("room_areas"),
    panelUses: wordsFor("panel_uses"),
  };
}

/** The finished workbook as a buffer, ready to write or to stream. */
export async function generateOrderForm(supabase, { now = new Date() } = {}) {
  const libraries = await loadOrderFormLibraries(supabase);
  const workbook = await buildOrderFormWorkbook({
    ...libraries,
    generatedOn: formatGeneratedOn(now),
    logo: await readLogo(),
  });
  // Locked AFTER it is written, because ExcelJS can password protect a sheet
  // but has nothing for the workbook, and the two stop different things. See
  // lib/pcd-xlsx-lock.js.
  const written = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer: await lockWorkbookStructure(written, SHEET_PASSWORD),
    fileName: orderFormFileName(now),
    counts: {
      colours: libraries.colours.length,
      hardware: libraries.hardware.length,
    },
  };
}
