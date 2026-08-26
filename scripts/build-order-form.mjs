// Writes the Excel order form to disk from the live libraries.
//
//   node --import ./test/helpers/register.mjs scripts/build-order-form.mjs [out.xlsx]
//
// The admin site serves the same file from the same code (see
// app/api/admin/order-form/route.js). This script is for looking at it, and for
// keeping a copy to attach to an email without going through the browser.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SHEET_PASSWORD, buildOrderFormWorkbook } from "../lib/pcd-order-form-workbook.js";
import { lockWorkbookStructure } from "../lib/pcd-xlsx-lock.js";
import { formatGeneratedOn, orderFormFileName } from "../lib/pcd-order-form.js";

function readEnv() {
  return readFile(".env.local", "utf8").then((raw) => {
    const vars = {};
    for (const line of raw.split(/\r?\n/)) {
      const match = line.replace(/^﻿/, "").match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (match) vars[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
    return vars;
  });
}

async function fetchAll(env, table, select) {
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=${select}&is_active=eq.true&limit=5000`;
  const response = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  return response.json();
}

const env = await readEnv();
const [colours, hardware] = await Promise.all([
  fetchAll(env, "pcd_colour_library", "name,supplier_name,material_type,thickness,finish_type,is_active"),
  fetchAll(env, "pcd_hardware", "type,brand,name,description,is_active"),
]);

let logo = null;
try {
  logo = await readFile(path.join(process.cwd(), "public", "images", "light-pcd-logo-horizontal.png"));
} catch {
  logo = null;
}

const workbook = await buildOrderFormWorkbook({
  colours,
  hardware,
  generatedOn: formatGeneratedOn(),
  logo,
});

const out = process.argv[2] || orderFormFileName();
const written = Buffer.from(await workbook.xlsx.writeBuffer());
await writeFile(out, await lockWorkbookStructure(written, SHEET_PASSWORD));
console.log(
  `Wrote ${out} from ${colours.length} colours and ${hardware.length} hardware items.`
);
