// Deciding whether an address is a customer, once, and remembering the answer.
//
// Supplier mail arrives almost daily and none of it is a customer conversation.
// Rather than guess from the shape of an address, the first email from an
// unknown sender asks. The answer is remembered and never asked again.
//
// PRECEDENCE: an address rule beats a domain rule. That is what lets a whole
// supplier be ignored while one real person there still opens tickets — ignore
// polytec.com.au, allow jane@polytec.com.au, and Jane still gets through.

export const RULE_TABLE = "pcd_mail_sender_rules";
export const PENDING_TABLE = "pcd_mail_pending_senders";

export function normaliseEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function domainOf(email) {
  const at = normaliseEmail(email).lastIndexOf("@");
  return at === -1 ? "" : normaliseEmail(email).slice(at + 1);
}

// The local part, for the seeded rules that match a role rather than a person.
// "mailer-daemon" as an address rule means mailer-daemon@anywhere.
function localPartOf(email) {
  const at = normaliseEmail(email).indexOf("@");
  return at === -1 ? normaliseEmail(email) : normaliseEmail(email).slice(0, at);
}

/**
 * What the rules say about one address: "customer", "ignore", or "" for a
 * sender nobody has decided about yet.
 */
export function decisionFor(email, rules = []) {
  const address = normaliseEmail(email);
  if (!address) return "ignore";
  const domain = domainOf(address);
  const local = localPartOf(address);

  // Most specific first. A rule naming this exact address, or naming a bare
  // role like "postmaster" that matches its local part, wins outright.
  const exact = rules.find(
    (rule) =>
      rule.match_type === "address" &&
      (normaliseEmail(rule.pattern) === address ||
        (!normaliseEmail(rule.pattern).includes("@") && normaliseEmail(rule.pattern) === local))
  );
  if (exact) return exact.decision;

  const byDomain = rules.find(
    (rule) => rule.match_type === "domain" && normaliseEmail(rule.pattern).replace(/^@/, "") === domain
  );
  if (byDomain) return byDomain.decision;

  return "";
}

export async function loadSenderRules(supabase) {
  const { data, error } = await supabase.from(RULE_TABLE).select("*");
  if (error) return [];
  return data || [];
}

/**
 * Remember an answer. Replaces any previous answer for the same pattern rather
 * than leaving two rules to disagree.
 */
export async function saveSenderRule(supabase, { matchType, pattern, decision, note = null, agentId = null }) {
  const cleaned = normaliseEmail(pattern).replace(/^@/, "");
  if (!cleaned) throw new Error("A rule needs an address or a domain.");
  if (!["address", "domain"].includes(matchType)) throw new Error("A rule matches an address or a domain.");
  if (!["customer", "ignore"].includes(decision)) throw new Error("A rule decides customer or ignore.");

  const { data, error } = await supabase
    .from(RULE_TABLE)
    .upsert(
      { match_type: matchType, pattern: cleaned, decision, note, created_by: agentId },
      { onConflict: "match_type,pattern", ignoreDuplicates: false }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Note that an undecided sender wrote in.
 *
 * Counts up rather than adding a row each time, so a supplier who sends four
 * statements before anybody looks is one line to decide, not four. Failure is
 * quiet: this runs inside the mail sync and must never cost a message that
 * could otherwise have been filed.
 */
export async function notePendingSender(supabase, { email, name, subject, preview, seenAt }) {
  const address = normaliseEmail(email);
  if (!address) return null;

  try {
    const { data: existing } = await supabase
      .from(PENDING_TABLE)
      .select("*")
      .ilike("email", address)
      .maybeSingle();

    if (existing?.id) {
      // Already decided and the rule has since been removed, or already
      // ignored. Either way it is not a new question.
      if (existing.status !== "pending") return existing;
      const { data } = await supabase
        .from(PENDING_TABLE)
        .update({
          message_count: (existing.message_count || 1) + 1,
          last_subject: subject || existing.last_subject,
          last_seen_at: seenAt || new Date().toISOString(),
          // A name only turns up once they sign an email properly.
          display_name: existing.display_name || name || null,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      return data || existing;
    }

    const { data } = await supabase
      .from(PENDING_TABLE)
      .insert({
        email: address,
        display_name: name || null,
        first_subject: subject || null,
        last_subject: subject || null,
        preview: String(preview || "").slice(0, 280) || null,
        first_seen_at: seenAt || new Date().toISOString(),
        last_seen_at: seenAt || new Date().toISOString(),
      })
      .select("*")
      .single();
    return data;
  } catch {
    return null;
  }
}

export async function listPendingSenders(supabase) {
  const { data, error } = await supabase
    .from(PENDING_TABLE)
    .select("*")
    .eq("status", "pending")
    .order("last_seen_at", { ascending: false });
  if (error) return [];
  return data || [];
}

export async function resolvePendingSender(supabase, { email, status, agentId = null }) {
  const address = normaliseEmail(email);
  const { error } = await supabase
    .from(PENDING_TABLE)
    .update({ status, resolved_at: new Date().toISOString(), resolved_by: agentId })
    .ilike("email", address);
  if (error) throw error;
}
