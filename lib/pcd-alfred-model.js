// WHICH CLAUDE MODEL ALFRED USES, AND WHAT A QUESTION COSTS.
//
// The chat itself (lib/pcd-alfred-ask.js) talks to Claude. This file holds the
// model name and the price sum so the monthly limit counts what the account is
// actually charged.

export const ALFRED_MODEL = "claude-opus-5-5";

// US dollars per million tokens, Claude Opus 5.5. Cache reads and writes are
// priced separately by the API.
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };

export function costOf(usage = {}) {
  const per = (tokens, rate) => ((Number(tokens) || 0) * rate) / 1_000_000;
  return Number(
    (
      per(usage.input_tokens, PRICE.input) +
      per(usage.output_tokens, PRICE.output) +
      per(usage.cache_read_input_tokens, PRICE.cacheRead) +
      per(usage.cache_creation_input_tokens, PRICE.cacheWrite)
    ).toFixed(4)
  );
}
