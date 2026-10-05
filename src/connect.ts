import { Store } from "./store.js";
import { LibraryIndex } from "./library-index.js";
import type { EdgeInfo } from "./library-index.js";
import { ensure, key, ref } from "./core.js";
import type { RecordData, Ref, Scope } from "./core.js";
import { summary } from "./navigation.js";
import { clip, form } from "./recall.js";
import { parseRef } from "./filing.js";

export type ConnectRequest = {
  from: string | Ref;
  to?: string | Ref;
  max_hops?: number;
  paths?: number;
  limit?: number;
  scope?: Scope;
  release_id?: string;
};

type Step = { id: string; edge: EdgeInfo | null };
type Chain = { steps: Step[]; cost: number; strength: number };
type Endpoint = { record: RecordData; query: string | null };

/** A small binary heap ordered by cost, for best-first path search. */
class Heap<T extends { cost: number }> {
  private items: T[] = [];
  get size() {
    return this.items.length;
  }
  push(item: T) {
    const a = this.items;
    a.push(item);
    for (let i = a.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (a[parent].cost <= a[i].cost) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < a.length && a[l].cost < a[m].cost) m = l;
        if (r < a.length && a[r].cost < a[m].cost) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Explicit dot-connecting: the strongest chains of recorded links between two ideas,
 * each hop read in its own direction with the reason given when the link was written.
 * A chain shows how this library connects ideas; it is not evidence of causation.
 */
export class Connect {
  constructor(readonly store: Store) {}

  async connect(input: ConnectRequest) {
    ensure(
      input.from,
      "VALIDATION_FAILED",
      "from is required: a record id, id@revision or a few words to search for",
    );
    const maxHops = input.max_hops ?? 4;
    ensure(
      Number.isInteger(maxHops) && maxHops >= 1 && maxHops <= 6,
      "VALIDATION_FAILED",
      "max_hops must be 1 to 6",
    );
    const wanted = input.paths ?? 3;
    ensure(
      Number.isInteger(wanted) && wanted >= 1 && wanted <= 8,
      "VALIDATION_FAILED",
      "paths must be 1 to 8",
    );
    return this.store.withReadSession(() => this.run(input, maxHops, wanted));
  }

  private resolve(
    index: LibraryIndex,
    value: string | Ref,
    which: string,
  ): Endpoint {
    const raw = typeof value === "string" ? value.trim() : null;
    if (!raw || /^[a-z][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*(@\d+)?$/.test(raw)) {
      const reference =
        raw && !raw.includes("@")
          ? { id: raw, revision: index.visible.get(raw)?.revision ?? 0 }
          : parseRef(value);
      const record = index.visible.get(reference.id);
      ensure(
        record &&
          key(record) === key(reference) &&
          index.usableIds.has(record.id),
        "VALIDATION_FAILED",
        `${which}: ${typeof value === "string" ? value : key(value)} is not a current, usable record in your scope`,
      );
      return { record, query: null };
    }
    const hit = index.lexical
      .search(
        raw,
        10,
        (id) =>
          index.usableIds.has(id) && index.isAccount(index.visible.get(id)!),
      )
      .at(0);
    ensure(
      hit,
      "NO_MATCH",
      `${which}: nothing in the library matches "${raw}"`,
    );
    return { record: index.visible.get(hit.id)!, query: raw };
  }

  /** Best-first search over simple paths; hubs cost more so chains go through specific ideas. */
  paths(
    index: LibraryIndex,
    from: string,
    to: string,
    maxHops: number,
    wanted: number,
  ) {
    const degree = (id: string) => index.adjacency.get(id)?.size ?? 0;
    const heap = new Heap<{ cost: number; steps: Step[]; strength: number }>();
    heap.push({ cost: 0, strength: 1, steps: [{ id: from, edge: null }] });
    const found: Chain[] = [];
    const shapes = new Set<string>();
    let expansions = 0;
    while (heap.size && found.length < wanted && expansions < 60000) {
      const current = heap.pop()!;
      expansions++;
      const last = current.steps.at(-1)!.id;
      if (last === to) {
        const shape = current.steps
          .slice(1, -1)
          .map((s) => s.id)
          .sort()
          .join("|");
        if (!shapes.has(shape)) {
          shapes.add(shape);
          found.push(current);
        }
        continue;
      }
      if (current.steps.length - 1 >= maxHops) continue;
      for (const [next, edge] of index.edges.get(last) ??
        new Map<string, EdgeInfo>()) {
        if (current.steps.some((s) => s.id === next)) continue;
        const record = index.visible.get(next);
        if (!record || record.record_type === "source") continue;
        const hub = next === to ? 0 : 0.15 * Math.log2(1 + degree(next));
        heap.push({
          cost: current.cost + 1 / edge.weight + hub,
          strength: current.strength * edge.weight,
          steps: [...current.steps, { id: next, edge }],
        });
      }
    }
    return found;
  }

  private chainText(index: LibraryIndex, chain: Chain) {
    const name = (id: string) => {
      const r = index.visible.get(id)!;
      return `**${r.title}** (${key(r)} · ${form(r)})`;
    };
    const lines = [`- ${name(chain.steps[0].id)}`];
    for (const step of chain.steps.slice(1)) {
      const r = index.visible.get(step.id)!;
      const gloss =
        r.record_type === "passage"
          ? ""
          : summary(r)
            ? `: ${clip(summary(r)!, 110)}`
            : "";
      lines.push(
        `  ↳ ${step.edge!.label} ${name(step.id)}${gloss}${step.edge!.rationale ? `\n    why: ${clip(step.edge!.rationale, 220)}` : ""}`,
      );
    }
    return lines.join("\n");
  }

  private async run(input: ConnectRequest, maxHops: number, wanted: number) {
    const index = await LibraryIndex.open(this.store, input);
    const from = this.resolve(index, input.from, "from");
    const header: string[] = [];
    const describe = (label: string, end: Endpoint) =>
      `${label}: ${end.record.title} (${key(end.record)})${end.query ? ` · matched from "${end.query}"` : ""}`;

    if (input.to) {
      const to = this.resolve(index, input.to, "to");
      ensure(
        from.record.id !== to.record.id,
        "VALIDATION_FAILED",
        "from and to resolve to the same record",
      );
      const chains = this.paths(
        index,
        from.record.id,
        to.record.id,
        maxHops,
        wanted,
      );
      header.push(
        `# Connect: ${from.record.title} → ${to.record.title}`,
        `Release ${index.release} · up to ${maxHops} hops · ${chains.length} chain(s) found`,
        describe("From", from),
        describe("To", to),
        "Each step names a link recorded in the library and, for typed links, the reason written with it. A chain shows how ideas connect here; it is not evidence that one causes the other.",
      );
      const blocks = chains.map(
        (c, i) =>
          `## Chain ${i + 1} · ${c.steps.length - 1} hop${c.steps.length > 2 ? "s" : ""} · strength ${c.strength.toFixed(2)}\n${this.chainText(index, c)}`,
      );
      if (!chains.length)
        blocks.push(
          `No chain within ${maxHops} hops. In this library the two ideas are unconnected, which is worth knowing: if they should connect, the missing link is a gap for a note, a judgment or a question.`,
        );
      return {
        interface_version: "connect-1",
        release_id: index.release,
        from: ref(from.record),
        to: ref(to.record),
        chains: chains.map((c) => ({
          hops: c.steps.length - 1,
          strength: Number(c.strength.toFixed(4)),
          steps: c.steps.map((s) => ({
            record_ref: ref(index.visible.get(s.id)!),
            title: index.visible.get(s.id)!.title,
            link: s.edge?.label ?? null,
            rationale: s.edge?.rationale ?? null,
            via: s.edge?.via ?? null,
          })),
        })),
        briefing: [header.join("\n"), ...blocks].join("\n\n"),
      };
    }

    // Outward mode: what this idea reaches within a few hops, split into its own topic and others.
    const limit = Math.min(Math.max(input.limit ?? 8, 1), 20);
    const activation = index.spread(new Map([[from.record.id, 1]]));
    const domains = new Set(from.record.scope.domains);
    const reached = [...activation]
      .filter(
        ([id]) =>
          id !== from.record.id && index.isAccount(index.visible.get(id)!),
      )
      .sort((a, b) => b[1] - a[1]);
    const near: { record: RecordData; chain: Chain; other: boolean }[] = [];
    for (const [id] of reached) {
      if (near.length >= limit * 2) break;
      const chain = this.paths(index, from.record.id, id, maxHops, 1)[0];
      if (!chain || chain.steps.length < 3) continue;
      const record = index.visible.get(id)!;
      near.push({
        record,
        chain,
        other: !record.scope.domains.some((d) => domains.has(d)),
      });
    }
    const others = near.filter((n) => n.other).slice(0, limit);
    const same = near.filter((n) => !n.other).slice(0, limit);
    header.push(
      `# Connect outward: ${from.record.title}`,
      `Release ${index.release} · ideas two to ${maxHops} hops away, strongest first · direct neighbours are left to kb_recall`,
      describe("From", from),
    );
    const section = (title: string, items: typeof near) =>
      items.length
        ? `## ${title}\n` +
          items
            .map(
              (n) => `### ${n.record.title}\n${this.chainText(index, n.chain)}`,
            )
            .join("\n\n")
        : "";
    const blocks = [
      section("In other topics: possible bridges", others),
      section("In the same topic, not directly linked", same),
    ].filter(Boolean);
    if (!blocks.length)
      blocks.push(
        "Nothing further out is linked yet. New sources and notes with typed links will grow this.",
      );
    return {
      interface_version: "connect-1",
      release_id: index.release,
      from: ref(from.record),
      reached: [...others, ...same].map((n) => ({
        record_ref: ref(n.record),
        title: n.record.title,
        hops: n.chain.steps.length - 1,
        other_topic: n.other,
      })),
      briefing: [header.join("\n"), ...blocks].join("\n\n"),
    };
  }
}
