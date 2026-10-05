/** Small in-process lexical index: Okapi BM25 over weighted record fields. */

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can could did do does for from had has have how i if in into is it its " +
    "may might more most no not of on or our should so such than that the their them then there these they this " +
    "those to too us was we were what when where which while who whom why will with would you your about across " +
    "after again against all also any because before being between both each few further here just only other " +
    "over own same some through under until very via"
  ).split(" "),
);

/** Conservative suffix stripping so "comparisons" meets "comparison" without inventing roots. */
export function stem(word: string) {
  if (word.length <= 4) return word;
  if (word.endsWith("ies") && word.length > 5) return word.slice(0, -3) + "y";
  if (word.endsWith("sses")) return word.slice(0, -2);
  if (word.endsWith("ss")) return word;
  if (word.endsWith("ing") && word.length > 6) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 5) return word.slice(0, -2);
  if (word.endsWith("es") && word.length > 5 && /[sxz]es$|[cs]hes$/.test(word))
    return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("us") && !word.endsWith("is"))
    return word.slice(0, -1);
  return word;
}

export function tokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (raw.length < 2 && !/\d/.test(raw)) continue;
    if (STOPWORDS.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

export type Field = { text: string; weight: number };

export class Bm25Index {
  private postings = new Map<string, Map<number, number>>();
  private lengths: number[] = [];
  private ids: string[] = [];
  private averageLength = 0;

  constructor(
    private k1 = 1.2,
    private b = 0.75,
  ) {}

  add(id: string, fields: Field[]) {
    const doc = this.ids.length;
    this.ids.push(id);
    let length = 0;
    for (const field of fields) {
      for (const term of tokens(field.text)) {
        let docs = this.postings.get(term);
        if (!docs) this.postings.set(term, (docs = new Map()));
        docs.set(doc, (docs.get(doc) ?? 0) + field.weight);
        length += field.weight;
      }
    }
    this.lengths.push(length);
  }

  finish() {
    const total = this.lengths.reduce((a, b) => a + b, 0);
    this.averageLength = this.lengths.length ? total / this.lengths.length : 0;
    return this;
  }

  get size() {
    return this.ids.length;
  }

  /** Share of distinct query terms the library has ever used; low coverage means vocabulary mismatch. */
  coverage(query: string) {
    const terms = [...new Set(tokens(query))];
    if (!terms.length) return 0;
    return terms.filter((t) => this.postings.has(t)).length / terms.length;
  }

  search(query: string, limit = 50, filter?: (id: string) => boolean) {
    const terms = [...new Set(tokens(query))];
    const scores = new Map<number, number>();
    const n = this.ids.length;
    for (const term of terms) {
      const docs = this.postings.get(term);
      if (!docs) continue;
      const idf = Math.log(1 + (n - docs.size + 0.5) / (docs.size + 0.5));
      for (const [doc, tf] of docs) {
        const norm =
          tf +
          this.k1 *
            (1 -
              this.b +
              (this.b * this.lengths[doc]) / (this.averageLength || 1));
        scores.set(
          doc,
          (scores.get(doc) ?? 0) + (idf * tf * (this.k1 + 1)) / norm,
        );
      }
    }
    return [...scores]
      .filter(([doc]) => !filter || filter(this.ids[doc]))
      .sort(
        (a, b) => b[1] - a[1] || this.ids[a[0]].localeCompare(this.ids[b[0]]),
      )
      .slice(0, limit)
      .map(([doc, score]) => ({ id: this.ids[doc], score }));
  }
}
