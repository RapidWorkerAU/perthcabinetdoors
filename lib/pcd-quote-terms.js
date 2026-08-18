// The terms library: named pieces of wording a quote can be built from.
//
// PCD quotes doors only, whole kitchens, supply only, supply and install, jobs
// with a door removal and jobs without. One block of default wording could not
// fit all of that, so terms are named and each one is either:
//
//   ALWAYS      every new quote starts with it
//   ON REQUEST  it waits in the library until someone adds it to a quote
//
// ADDING A TERM COPIES ITS WORDING. From then on the quote owns that copy: it
// can be edited on the quote, and editing the library later never rewrites a
// quote that has already gone out. A quote is a document, not a live view of
// settings — the same reason the quote editor stopped swapping terms in behind
// the user's back.

import { joinTermsHtml, sanitizeTermsHtml, toTermsHtml } from "./pcd-terms-html";

export const QUOTE_TERMS_TABLE = "pcd_quote_terms";

function cleanName(value) {
  return String(value ?? "").trim().slice(0, 120);
}

/** One library row in the shape the app uses, whatever the row is missing. */
export function normalizeQuoteTerm(row = {}) {
  return {
    id: row.id || null,
    name: cleanName(row.name),
    body_html: toTermsHtml(row.body_html ?? row.body ?? ""),
    always_include: Boolean(row.always_include),
    sort_order: Number(row.sort_order) || 0,
  };
}

/** A row ready to write. Wording is sanitised HERE so no route can skip it. */
export function quoteTermToDbRow(input = {}) {
  return {
    name: cleanName(input.name),
    body_html: sanitizeTermsHtml(toTermsHtml(input.body_html ?? input.body ?? "")),
    always_include: Boolean(input.always_include),
  };
}

/**
 * Every term, in the order they are shown and inserted.
 *
 * A missing table is not an error here. The settings screen and every quote
 * creation path call this, and until the migration has been run the honest
 * answer is "no terms yet" rather than a screen that will not load.
 */
export async function listQuoteTerms(supabase) {
  const { data, error } = await supabase
    .from(QUOTE_TERMS_TABLE)
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    if (isMissingTermsTable(error)) return [];
    throw error;
  }
  return (data || []).map(normalizeQuoteTerm);
}

export function isMissingTermsTable(error) {
  const message = String(error?.message || "");
  return error?.code === "42P01" || (message.includes(QUOTE_TERMS_TABLE) && /does not exist|schema cache/i.test(message));
}

/** The terms a NEW quote starts with: every Always term, in order. */
export function alwaysIncludedTerms(terms = []) {
  return (Array.isArray(terms) ? terms : []).filter((term) => term.always_include);
}

/**
 * The wording and the ids a new quote starts with.
 *
 * Returns "" for the wording when there is nothing marked Always, which stays
 * true to the rule that a quote with no terms prints no terms rather than
 * inventing some.
 */
export function defaultQuoteTerms(terms = []) {
  const included = alwaysIncludedTerms(terms);
  return {
    terms: joinTermsHtml(included.map((term) => term.body_html)),
    terms_term_ids: included.map((term) => term.id).filter(Boolean),
  };
}

/** The same, read straight from the database. */
export async function defaultQuoteTermsFor(supabase) {
  return defaultQuoteTerms(await listQuoteTerms(supabase));
}
