import { Store } from "./store.js";
import {
  blockedIds,
  condition,
  ensure,
  key,
  readJson,
  ref,
  relianceBlocked,
} from "./core.js";
import type { RecordData, Ref, Scope } from "./core.js";
import { Bm25Index } from "./text-index.js";
import { summary } from "./navigation.js";
import { mapLimit } from "./verified-cache.js";
import { ResearchView } from "./research-view.js";

/** Records a reader can open as explanations, as opposed to evidence, links and sources. */
export const ACCOUNT_TYPES = new Set([
  "knowledge",
  "concept",
  "learning",
  "judgment",
  "question",
]);

/** How strongly association flows along each kind of link during spreading activation. */
const PREDICATE_WEIGHT: Record<string, number> = {
  qualifies: 1,
  challenges: 1,
  depends_on: 1,
  explains: 0.8,
  exemplifies: 0.8,
  supports: 0.7,
  applies_to: 0.6,
  derived_from: 0.4,
};

/** Reading a typed relationship from its subject, and back from its object. */
const PREDICATE_WORDS: Record<string, [string, string]> = {
  supports: ["supports", "is supported by"],
  challenges: ["challenges", "is challenged by"],
  qualifies: ["qualifies", "is qualified by"],
  depends_on: ["builds on", "is a prerequisite for"],
  explains: ["explains", "is explained by"],
  exemplifies: ["is an example of", "has an example in"],
  applies_to: ["applies to", "is applied by"],
  derived_from: ["is derived from", "is the source of"],
};

export type EdgeInfo = {
  weight: number;
  label: string;
  rationale: string | null;
  via: Ref | null;
};

export type Link = {
  relationship: RecordData;
  predicate: string;
  subject: string;
  object: string;
  rationale: string;
  materiality: string;
};

/** The abstract purpose and mechanism wording from an account's facets, if it has any. */
export function functionText(record: RecordData) {
  const facets = (record.extensions as any)?.functional_facets;
  return ["purpose", "mechanism"]
    .flatMap((slot) => (facets?.[slot] ?? []).map((e: any) => e.abstract))
    .filter(Boolean)
    .join("; ");
}

const cache = new WeakMap<Store, Map<string, Promise<LibraryIndex>>>();

/**
 * One scoped, release-pinned snapshot of the library, built once and reused while
 * the library's controls (binding, deletion ledger, CURRENT) stay unchanged.
 * Visibility and reliance rules match ResearchView; only usable records are indexed.
 */
export class LibraryIndex {
  readonly visible = new Map<string, RecordData>();
  readonly usableIds = new Set<string>();
  readonly bodies = new Map<string, string>();
  readonly pending = new Set<string>();
  readonly incoming = new Map<string, Link[]>();
  readonly outgoing = new Map<string, Link[]>();
  readonly judgmentsByIssue = new Map<string, RecordData[]>();
  readonly citedBy = new Map<string, string[]>();
  readonly adjacency = new Map<string, Map<string, number>>();
  /** How each directed link reads, for explaining a chain: label, weight and the relationship behind it. */
  readonly edges = new Map<string, Map<string, EdgeInfo>>();
  readonly lexical = new Bm25Index();
  /** Ideas live in their own lane: never usable as accounts, linked or indexed with them. */
  readonly ideas = new Map<string, RecordData>();
  readonly ideaLexical = new Bm25Index();
  /** Accounts indexed by the domain-free wording of what they do and how, for matching across fields. */
  readonly functional = new Bm25Index();
  dimensions: Record<string, unknown> = {};
  private blockedLive?: Set<string>;
  private guardView?: Promise<ResearchView>;
  private firstSeen?: Map<string, number>;

  private constructor(
    readonly store: Store,
    readonly scope: Scope,
    readonly release: string,
    readonly current: string,
    readonly records: Map<string, RecordData>,
    readonly live: Map<string, RecordData>,
  ) {}

  static async open(
    store: Store,
    request: { scope?: Scope; release_id?: string },
  ): Promise<LibraryIndex> {
    const scope = await store.scope(request.scope);
    const release = await store.release(request.release_id);
    ensure(
      release,
      "NO_KNOWLEDGE",
      "The library has no published research yet",
    );
    const signature = [
      store.sessionSignature() ?? "unsigned",
      release.release_id,
      JSON.stringify(scope),
    ].join("|");
    let byStore = cache.get(store);
    if (!byStore) cache.set(store, (byStore = new Map()));
    const hit = byStore.get(signature);
    if (hit) return hit;
    if (byStore.size > 8) byStore.clear();
    const pending = (async () => {
      const index = new LibraryIndex(
        store,
        scope,
        release.release_id,
        (await store.current())!,
        await store.records(release.release_id),
        await store.records(),
      );
      await index.build();
      return index;
    })();
    byStore.set(signature, pending);
    pending.catch(() => byStore!.delete(signature));
    return pending;
  }

  /** Withdrawal or missing support anywhere in the exact input chain blocks reliance. */
  blocked(record: RecordData): boolean {
    this.blockedLive ??= blockedIds(this.live);
    return relianceBlocked(record, this.live, this.blockedLive);
  }

  /** The canonical guard resolver shared with progressive reading, for the same release and scope. */
  guards() {
    this.guardView ??= ResearchView.open(this.store, {
      scope: this.scope,
      release_id: this.release,
    });
    return this.guardView;
  }

  usable(record: RecordData) {
    const latest = this.live.get(record.id);
    return (
      record.record_type !== "idea" &&
      record.lifecycle === "active" &&
      !record.archived &&
      latest?.lifecycle === "active" &&
      !latest.archived &&
      !this.blocked(record)
    );
  }

  isAccount(record: RecordData) {
    return ACCOUNT_TYPES.has(record.record_type);
  }

  text(record: RecordData) {
    const p = record.payload as any;
    return (
      this.bodies.get(record.id) ||
      p.text ||
      p.definition ||
      p.rationale ||
      (record.record_type === "question"
        ? `Known: ${p.known}\nUnknown: ${p.unknown}\nWhy it matters: ${p.impact}\nNext action: ${p.next_action}`
        : "") ||
      p.summary ||
      ""
    );
  }

  applicability(
    record: RecordData,
    context: Record<string, { value: unknown; unit?: string | null }> = {},
  ) {
    return condition(
      record.scope.condition_expression,
      context,
      this.dimensions,
    );
  }

  /** Records an undirected link for spreading activation, and how to read it in each direction. */
  private link(
    a: string,
    b: string,
    weight: number,
    forward: string,
    backward: string,
    via?: RecordData,
  ) {
    if (a === b || !this.usableIds.has(a) || !this.usableIds.has(b)) return;
    for (const [x, y, label] of [
      [a, b, forward],
      [b, a, backward],
    ]) {
      let row = this.adjacency.get(x);
      if (!row) this.adjacency.set(x, (row = new Map()));
      if ((row.get(y) ?? 0) >= weight && this.edges.get(x)?.has(y)) continue;
      row.set(y, weight);
      let labels = this.edges.get(x);
      if (!labels) this.edges.set(x, (labels = new Map()));
      labels.set(y, {
        weight,
        label,
        rationale: (via?.payload as any)?.rationale ?? null,
        via: via ? ref(via) : null,
      });
    }
  }

  private async build() {
    const allowedCache = new Map<string, boolean>();
    for (const record of this.records.values())
      if (await this.store.allowed(record, this.scope, allowedCache))
        this.visible.set(record.id, record);
    for (const record of this.visible.values()) {
      if (record.record_type === "idea") {
        const latest = this.live.get(record.id);
        if (
          record.lifecycle === "active" &&
          !record.archived &&
          latest?.lifecycle === "active" &&
          !latest.archived
        )
          this.ideas.set(record.id, record);
      } else if (this.usable(record)) this.usableIds.add(record.id);
    }
    this.dimensions = await readJson(this.store.p("dimensions.json")).catch(
      () => ({}),
    );
    const impacts = await readJson<any[]>(
      this.store.p(`releases/${this.current}.impacts.json`),
    ).catch(() => []);
    for (const impact of impacts)
      if (impact.status === "pending_reassessment")
        this.pending.add(impact.record_ref.id);

    const usable = [...this.usableIds].map((id) => this.visible.get(id)!);
    await mapLimit(usable, async (record) => {
      const body = await this.store.body(record);
      if (body) this.bodies.set(record.id, body);
      return null;
    });

    for (const record of usable) {
      const p = record.payload as any;
      if (record.record_type === "relationship") {
        const link: Link = {
          relationship: record,
          predicate: p.predicate,
          subject: p.subject.id,
          object: p.object.id,
          rationale: p.rationale,
          materiality: p.materiality,
        };
        if (
          !this.usableIds.has(link.subject) ||
          !this.usableIds.has(link.object)
        )
          continue;
        (
          this.incoming.get(link.object) ??
          this.incoming.set(link.object, []).get(link.object)!
        ).push(link);
        (
          this.outgoing.get(link.subject) ??
          this.outgoing.set(link.subject, []).get(link.subject)!
        ).push(link);
        const [forward, backward] = PREDICATE_WORDS[link.predicate] ?? [
          link.predicate,
          `is the object of ${link.predicate}`,
        ];
        this.link(
          link.subject,
          link.object,
          PREDICATE_WEIGHT[link.predicate] ?? 0.5,
          forward,
          backward,
          record,
        );
        continue;
      }
      if (record.record_type === "source") continue;
      if (record.record_type === "judgment") {
        for (const issue of p.issue_refs as Ref[]) {
          const list = this.judgmentsByIssue.get(issue.id) ?? [];
          list.push(record);
          this.judgmentsByIssue.set(issue.id, list);
          this.link(record.id, issue.id, 0.9, "weighs", "is weighed by");
        }
        for (const alternative of [
          ...(p.alternatives ?? []),
          ...(p.preferred_refs ?? []),
        ])
          this.link(
            record.id,
            alternative.id,
            0.6,
            "considers",
            "is considered by",
          );
      }
      for (const concept of p.concept_refs ?? [])
        this.link(record.id, concept.id, 0.6, "uses the concept", "is used by");
      for (const knowledge of p.knowledge_refs ?? [])
        this.link(record.id, knowledge.id, 0.7, "teaches", "is taught by");
      for (const related of p.related_refs ?? [])
        this.link(
          record.id,
          related.id,
          0.6,
          "asks about",
          "is asked about by",
        );
      for (const input of record.provenance.input_refs) {
        const target = this.visible.get(input.id);
        if (!target) continue;
        if (target.record_type === "passage") {
          const list = this.citedBy.get(target.id) ?? [];
          list.push(record.id);
          this.citedBy.set(target.id, list);
          this.link(record.id, target.id, 0.3, "cites", "is cited by");
        } else if (target.record_type !== "source")
          this.link(record.id, target.id, 0.5, "draws on", "feeds");
      }
    }

    for (const record of usable) {
      if (
        record.record_type === "relationship" ||
        record.record_type === "source"
      )
        continue;
      const p = record.payload as any;
      this.lexical.add(record.id, [
        { text: record.title, weight: 3 },
        { text: summary(record) ?? "", weight: 2 },
        { text: (p.aliases ?? []).join(" "), weight: 2 },
        { text: this.text(record), weight: 1 },
      ]);
    }
    this.lexical.finish();

    for (const record of usable) {
      const abstract = functionText(record);
      if (abstract)
        this.functional.add(record.id, [{ text: abstract, weight: 1 }]);
    }
    this.functional.finish();

    for (const idea of this.ideas.values()) {
      const p = idea.payload as any;
      this.ideaLexical.add(idea.id, [
        { text: idea.title, weight: 3 },
        { text: p.statement, weight: 2 },
        { text: [p.kill_test, p.origin ?? ""].join(" "), weight: 1 },
        {
          text: idea.provenance.input_refs
            .map((x) => this.visible.get(x.id)?.title ?? "")
            .join(" "),
          weight: 1,
        },
      ]);
    }
    this.ideaLexical.finish();
  }

  /** What has happened under an idea since it was written: changed or lost premises. */
  ideaFlags(idea: RecordData) {
    const flags: string[] = [];
    if (this.pending.has(idea.id))
      flags.push("a premise changed since it was written");
    if (this.blocked(idea))
      flags.push("a premise was withdrawn or lost its support");
    return flags;
  }

  /**
   * Personalized PageRank: activation starts at the seeds and spreads along typed
   * links, so connected explanations surface even when they share no query words.
   */
  spread(seeds: Map<string, number>, restart = 0.35, iterations = 30) {
    const total = [...seeds.values()].reduce((a, b) => a + b, 0);
    if (!total) return new Map<string, number>();
    const personal = new Map([...seeds].map(([id, w]) => [id, w / total]));
    let rank = new Map(personal);
    const outWeight = new Map<string, number>();
    for (const [id, row] of this.adjacency)
      outWeight.set(
        id,
        [...row.values()].reduce((a, b) => a + b, 0),
      );
    for (let i = 0; i < iterations; i++) {
      const next = new Map<string, number>();
      for (const [id, value] of personal) next.set(id, restart * value);
      let dangling = 0;
      for (const [id, value] of rank) {
        const row = this.adjacency.get(id);
        const out = outWeight.get(id) ?? 0;
        if (!row || !out) {
          dangling += value;
          continue;
        }
        for (const [neighbor, weight] of row)
          next.set(
            neighbor,
            (next.get(neighbor) ?? 0) + (1 - restart) * value * (weight / out),
          );
      }
      if (dangling)
        for (const [id, value] of personal)
          next.set(id, (next.get(id) ?? 0) + (1 - restart) * dangling * value);
      rank = next;
    }
    return rank;
  }

  /** Position (0 = oldest) of the committed release where this exact revision first appeared. */
  async releaseOrder(reference: Ref) {
    if (!this.firstSeen) {
      const seen = new Map<string, number>();
      const ancestry = (await this.store.committedReleases()).slice().reverse();
      ancestry.forEach((release, position) => {
        for (const entry of release.records) {
          const k = key(entry.record_ref);
          if (!seen.has(k)) seen.set(k, position);
        }
      });
      this.firstSeen = seen;
    }
    return this.firstSeen.get(key(reference)) ?? -1;
  }

  /** Global importance within the scope, used for orientation maps. */
  centrality() {
    const seeds = new Map<string, number>();
    for (const id of this.usableIds) {
      const record = this.visible.get(id)!;
      if (this.isAccount(record)) seeds.set(id, 1);
    }
    return this.spread(seeds, 0.15, 40);
  }

  /** Conceptual prerequisites first, then the account itself: a first-principles reading order. */
  foundations(id: string, depth = 4) {
    const order: string[] = [];
    const seen = new Set<string>();
    const visit = (current: string, level: number) => {
      if (seen.has(current) || level > depth) return;
      seen.add(current);
      const record = this.visible.get(current);
      for (const link of this.outgoing.get(current) ?? [])
        if (link.predicate === "depends_on") visit(link.object, level + 1);
      for (const concept of (record?.payload as any)?.concept_refs ?? [])
        if (this.usableIds.has(concept.id)) visit(concept.id, level + 1);
      order.push(current);
    };
    visit(id, 0);
    return order;
  }
}
