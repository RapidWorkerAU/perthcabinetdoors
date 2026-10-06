// WHICH ROWS GET ALFRED'S COPPER DOT.
//
// One read for every list (orders, quotes, quote requests, enquiries), so a
// dot means the same thing everywhere: a draft or a question of Alfred's is
// waiting on a person. Never throws: a database without Alfred's tables lists
// as before, with no dots.

/**
 * @param column  the draft column that names the row: "order_id", "quote_id",
 *                "quote_request_id" or "enquiry_id"
 * @param questionPrefix  questions are keyed by source_key; "enquiry:" finds
 *                the ones about enquiries
 * @returns { [rowId]: true }
 */
export async function alfredWaitingBy(supabase, column, { questionPrefix = "" } = {}) {
  const waiting = {};
  try {
    const { data: drafts } = await supabase.from("pcd_alfred_drafts").select(column).eq("status", "waiting").not(column, "is", null);
    (drafts || []).forEach((row) => {
      if (row[column]) waiting[row[column]] = true;
    });
    if (questionPrefix) {
      const { data: questions } = await supabase.from("pcd_alfred_questions").select("source_key").eq("status", "open").like("source_key", `${questionPrefix}%`);
      (questions || []).forEach((row) => {
        const id = String(row.source_key || "").slice(questionPrefix.length);
        if (id) waiting[id] = true;
      });
    }
  } catch {
    /* no dots */
  }
  return waiting;
}
