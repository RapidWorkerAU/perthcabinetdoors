// MAY THE PERSON HOLDING THIS LINK CHANGE THE DESIGN?
//
// ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────────
//
// It belongs with the rest of the public design rules in
// lib/pcd-public-design.js, and it cannot live there. That file imports node's
// crypto to generate access codes, and the design screen is a client component:
// importing it to read one flag would drag crypto into the browser bundle.
//
// So the vocabulary lives here, with no imports at all, and pcd-public-design
// re-exports it. Same split, and same reason, as ASKABLE_KINDS in
// lib/pcd-calendar.js.
//
// ── WHAT THE TWO MODES MEAN ──────────────────────────────────────────────────
//
//   edit   the visitor drew this themselves on the public planner, or we
//          deliberately shared a draft for them to change
//   view   we drafted it and sent it to be looked at
//
// A design we drew and sent for approval must not be editable by the person
// approving it. If it were, the thing they agreed to and the thing we drew
// would stop being the same drawing, with nothing anywhere saying which moved.
//
// ── ABSENT READS AS EDITABLE, DELIBERATELY ───────────────────────────────────
//
// Every project that existed before this was a public planner session somebody
// drew themselves and has always been able to change. A missing value must
// therefore mean editable, or turning this on would have locked all of them
// mid-session. The safe default belongs at the moment of sharing instead, which
// is why the admin share route defaults to view while the column defaults to
// edit. See supabase/202609031500_pcd_design_share_mode.sql.

export const VIEW_ONLY = "view";
export const EDITABLE = "edit";
export const SHARE_MODES = [VIEW_ONLY, EDITABLE];

export function canEditPublicProject(project) {
  return String(project?.share_mode || EDITABLE) !== VIEW_ONLY;
}

/**
 * What a refused write says.
 *
 * One wording, so the five public write routes cannot drift into five different
 * explanations of the same rule. It tells them what to do next rather than only
 * that they cannot, because somebody who wants a change still needs the change.
 */
export const VIEW_ONLY_REFUSAL =
  "This design was shared with you to look at, so it cannot be changed here. " +
  "Reply to the email we sent you and we will make the change for you.";
