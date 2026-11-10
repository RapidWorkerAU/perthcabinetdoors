// WHAT A SITE MEASURE IS FOR: WHICH ROOMS, HOW MANY, AND WHAT KIND OF JOB.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// A booking used to say only a day and an address. One of them turned out to
// be a whole house, and the measure took most of a day that had been planned as
// an hour. So the customer now says which rooms and how many of each, and what
// kind of job it is, and those travel with the booking to the sales email, the
// calendar event and their own confirmation.
//
// ── ONE DEFINITION, FOUR READERS ─────────────────────────────────────────────
//
// The booking page, the booking route, the emails and the calendar event all
// read these helpers, so "Bathroom x2" is spelled the same everywhere and the
// route refuses exactly what the page would not let through.
//
// ── ROOMS ARE STORED AS WORDS ────────────────────────────────────────────────
//
// The rooms come from Settings > Lists (Rooms), the same list the quote lines
// use. They are stored by label, not by key, so a booking still reads properly
// after somebody renames or retires a room in Settings.
//
// No verdicts. A booking with nine rooms is shown as nine rooms; nothing here
// decides that is too many. See the room count in the calendar title.

export const JOB_TYPES = [
  { key: "doors", label: "Replacement doors and panels" },
  { key: "cabinetry", label: "New cabinetry" },
  { key: "unsure", label: "Not sure yet" },
];

/** Most of any one room a single booking can claim. Typos, not policy. */
export const MAX_PER_ROOM = 20;

export function jobTypeLabel(key) {
  return JOB_TYPES.find((type) => type.key === key)?.label || "";
}

export function isJobType(key) {
  return JOB_TYPES.some((type) => type.key === key);
}

/**
 * The rooms, whatever shape they arrived in.
 *
 * [{ room: "Bathroom", count: 2 }]. A room not on the allowed list is dropped,
 * a count is held between 1 and MAX_PER_ROOM, and the same room twice is added
 * together. Without an allowed list every room is kept, which is how a stored
 * booking is read back after its room has been retired.
 */
export function normalizeMeasureRooms(raw, allowed = null) {
  const list = Array.isArray(raw) ? raw : [];
  const allowedSet = Array.isArray(allowed) ? new Set(allowed) : null;
  const totals = new Map();

  for (const entry of list) {
    const room = String(entry?.room || "").trim().slice(0, 60);
    if (!room) continue;
    if (allowedSet && !allowedSet.has(room)) continue;
    const count = Math.round(Number(entry?.count));
    if (!Number.isFinite(count) || count < 1) continue;
    totals.set(room, Math.min(MAX_PER_ROOM, (totals.get(room) || 0) + count));
  }

  const order = allowedSet ? [...allowedSet] : [];
  return [...totals.entries()]
    .map(([room, count]) => ({ room, count }))
    .sort((a, b) => {
      const ai = order.indexOf(a.room);
      const bi = order.indexOf(b.room);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
}

export function totalRooms(rooms = []) {
  return (rooms || []).reduce((sum, entry) => sum + (Number(entry?.count) || 0), 0);
}

/** "Kitchen, Bathroom x2, Laundry". */
export function roomsWords(rooms = []) {
  return (rooms || [])
    .filter((entry) => entry?.room && Number(entry?.count) > 0)
    .map((entry) => (Number(entry.count) > 1 ? `${entry.room} x${entry.count}` : entry.room))
    .join(", ");
}

/** "4 rooms", "1 room", or "" when none were given (an office booking). */
export function roomCountWords(rooms = []) {
  const total = totalRooms(rooms);
  if (!total) return "";
  return `${total} room${total === 1 ? "" : "s"}`;
}

/**
 * The calendar title. The count is in it so a big job is obvious from the week
 * view and from Outlook without opening anything.
 */
export function siteMeasureTitle(name, rooms = []) {
  const count = roomCountWords(rooms);
  return `Site measure, ${name || "customer"}${count ? `, ${count}` : ""}`;
}

/** "Bathroom x2, Laundry (3 rooms). New cabinetry." for notes and emails. */
export function scopeWords({ rooms = [], jobType = "" } = {}) {
  const list = roomsWords(rooms);
  const count = roomCountWords(rooms);
  const job = jobTypeLabel(jobType);
  return [list ? `${list} (${count})` : "", job].filter(Boolean).join(". ");
}
