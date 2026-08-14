import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Saves a visitor's quote list so they can pick it up on another device.
//
// Unauthenticated by design - the whole point is that nobody has to make an
// account to keep a list. It goes through the service-role client rather than
// the anon key so the table stays unreadable from the browser: the returned
// code is the only way back in, and it cannot be brute-forced client-side.

const MAX_ENTRIES = 200;
const MAX_BODY_BYTES = 96 * 1024;

// No look-alike characters, so someone reading a code off a phone screen and
// typing it on a laptop does not fall down an I/1 or O/0 hole.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(length = 8) {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i += 1) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

// Only the fields the drawer and the quote form actually read. Anything else a
// caller sends is dropped rather than stored, so this endpoint cannot be used
// as free JSON storage.
function sanitiseEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const text = (value, max = 160) => String(value ?? "").slice(0, max);
  const num = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const kind = raw.kind === "custom" ? "custom" : "configured";
  const entry = {
    id: text(raw.id, 40),
    kind,
    qty: Math.min(999, Math.max(1, Math.round(num(raw.qty) || 1))),
    title: text(raw.title),
    detail: text(raw.detail, 300),
    source: text(raw.source, 40),
    material: text(raw.material, 60),
    thickness: text(raw.thickness, 20),
    finish: text(raw.finish, 60),
    colour: text(raw.colour, 80),
    profileType: text(raw.profileType, 40),
    profile: text(raw.profile, 60),
  };

  if (kind === "custom") {
    entry.itemType = text(raw.itemType, 60);
    entry.width = text(raw.width, 12);
    entry.height = text(raw.height, 12);
    entry.note = text(raw.note, 300);
    return entry;
  }

  const cabinetWidth = num(raw.cabinet?.width);
  const cabinetHeight = num(raw.cabinet?.height);
  entry.cabinet = { width: cabinetWidth || 0, height: cabinetHeight || 0 };
  entry.arrangement = ["columns", "rows", "single"].includes(raw.arrangement) ? raw.arrangement : "single";
  entry.pieces = Array.isArray(raw.pieces)
    ? raw.pieces.slice(0, 12).map((piece) => ({
        width: Math.max(0, Math.round(num(piece?.width) || 0)),
        height: Math.max(0, Math.round(num(piece?.height) || 0)),
        type: text(piece?.type, 40),
      }))
    : [];
  return entry;
}

export async function POST(request) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return Response.json({ ok: false, error: "That list is too large to save." }, { status: 413 });
    }

    const payload = JSON.parse(raw || "{}");
    const entries = Array.isArray(payload.entries)
      ? payload.entries.slice(0, MAX_ENTRIES).map(sanitiseEntry).filter(Boolean)
      : [];

    if (!entries.length) {
      return Response.json({ ok: false, error: "There is nothing on your list to save yet." }, { status: 400 });
    }

    const email = String(payload.email || "").trim().slice(0, 200) || null;
    const supabase = createSupabaseAdminClient();

    // Retry on the vanishingly unlikely code collision rather than handing back
    // an error the visitor can do nothing about.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = makeCode();
      const { data, error } = await supabase
        .from("pcd_saved_quote_lists")
        .insert({
          code,
          entries,
          item_count: entries.reduce((sum, entry) => sum + (Number(entry.qty) || 1), 0),
          email,
        })
        .select("code")
        .single();

      if (!error && data) return Response.json({ ok: true, code: data.code });
      if (error?.code !== "23505") throw error;
    }

    throw new Error("Could not allocate a code for your list.");
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not save your list." },
      { status: 500 }
    );
  }
}
