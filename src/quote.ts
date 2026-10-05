/**
 * Locate a quoted span in extracted source text without trusting the model's retyping.
 * Matching folds typography (curly quotes, dashes, soft hyphens, ligatures, line-break
 * hyphenation) and whitespace, so a faithful quote matches even when the text layer
 * differs cosmetically. A paraphrase does not match.
 */
export function normalizeForQuote(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[­​-‍﻿]/g, "")
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function quoteFound(quote: string, text: string) {
  const q = normalizeForQuote(quote);
  return q.length >= 8 && normalizeForQuote(text).includes(q);
}

/** Closest window of the source to a failed quote, so the author can correct it instead of guessing. */
export function closestSpan(quote: string, text: string) {
  const q = normalizeForQuote(quote);
  const t = normalizeForQuote(text);
  if (!q || !t) return null;
  const words = new Set(q.split(" "));
  const tokens = t.split(" ");
  const width = q.split(" ").length;
  let best = { score: -1, start: 0 };
  for (let i = 0; i + 1 <= Math.max(1, tokens.length - width + 1); i++) {
    let score = 0;
    for (let j = i; j < Math.min(tokens.length, i + width); j++)
      if (words.has(tokens[j])) score++;
    if (score > best.score) best = { score, start: i };
  }
  return {
    overlap: best.score / Math.max(1, words.size),
    text: tokens.slice(best.start, best.start + width).join(" "),
  };
}
