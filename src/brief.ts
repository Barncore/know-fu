import * as fs from "node:fs/promises";
import { Store } from "./store.js";
import { LibraryIndex } from "./library-index.js";
import { ensure, key, readJson } from "./core.js";
import type { RecordData, Scope } from "./core.js";
import { summary } from "./navigation.js";
import { clip, estimateTokens, form, isFiledAnswer } from "./recall.js";

export type BriefRequest = {
  domains?: string[];
  budget_tokens?: number;
  scope?: Scope;
  release_id?: string;
};

const IMPACT_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
const EFFORT_RANK: Record<string, number> = {
  low: 3,
  medium: 2,
  high: 1,
  unknown: 1,
};

/**
 * Session-start orientation: what the library knows, built from authored records.
 * It is the compact model a fresh session carries before choosing what to recall,
 * not a summary generated on read.
 */
export class Brief {
  constructor(readonly store: Store) {}

  async brief(input: BriefRequest = {}) {
    ensure(
      input.budget_tokens === undefined ||
        (Number.isInteger(input.budget_tokens) &&
          input.budget_tokens >= 800 &&
          input.budget_tokens <= 30000),
      "VALIDATION_FAILED",
      "budget_tokens must be an integer from 800 to 30000",
    );
    return this.store.withReadSession(() => this.run(input));
  }

  private async run(input: BriefRequest) {
    const index = await LibraryIndex.open(this.store, input);
    const config = await this.store.config();
    const budget = input.budget_tokens ?? 3500;
    const usable = [...index.usableIds].map((id) => index.visible.get(id)!);
    const accounts = usable.filter((r) => index.isAccount(r));
    const domains = [...new Set(accounts.flatMap((r) => r.scope.domains))]
      .filter((d) => !input.domains?.length || input.domains.includes(d))
      .sort();
    const centrality = index.centrality();
    const sources = usable.filter((r) => r.record_type === "source");
    const links = usable.filter((r) => r.record_type === "relationship").length;
    const openQuestions = accounts.filter(
      (r) =>
        r.record_type === "question" &&
        (r.payload as any).resolution_status !== "answered",
    );
    const releases = await this.store.committedReleases();
    const lastRelease = releases[0];

    const lines: string[] = [
      `# Library brief: ${config.title}`,
      `${sources.length} sources · ${accounts.length} explanations, concepts and lessons · ${links} typed connections · ${openQuestions.length} open questions · release ${index.release}${lastRelease ? ` (${lastRelease.created_at.slice(0, 10)})` : ""}`,
      "Read this to orient. Use kb_recall for anything you will rely on: a brief entry orients, the full account carries the conditions.",
    ];
    let used = estimateTokens(lines.join("\n"));
    const add = (text: string, required = false) => {
      const cost = estimateTokens(text) + 1;
      if (!required && used + cost > budget) return false;
      lines.push(text);
      used += cost;
      return true;
    };
    const omitted: string[] = [];

    const learned = await this.recentlyLearned(index);
    const perDomain = Math.max(
      600,
      Math.floor((budget - used - 300) / Math.max(1, domains.length)),
    );
    for (const domain of domains) {
      const domainStart = used;
      const title =
        config.domains.find((d) => d.domain_id === domain)?.title ?? domain;
      const members = accounts.filter((r) => r.scope.domains.includes(domain));
      add(`\n## ${title} (${domain})`, true);
      const primers = members
        .filter((r) => form(r) === "primer")
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const primer = primers[0];
      if (primer) {
        const primerOrder = await index.releaseOrder(primer);
        const newer: RecordData[] = [];
        for (const r of members)
          if (
            r.id !== primer.id &&
            !isFiledAnswer(r) &&
            (await index.releaseOrder(r)) > primerOrder
          )
            newer.push(r);
        const freshness = newer.length
          ? ` · stale: ${newer.length} account(s) published or revised in later releases; revise this primer when you next ingest here`
          : " · current";
        const body = index.text(primer).trim();
        add(
          `### Primer: ${primer.title.replace(/^primer:\s*/i, "")}\n${key(primer)}${freshness}`,
          true,
        );
        if (!add(body)) add(clip(summary(primer) ?? body, 600), true);
      } else
        add(
          "No primer yet. The next ingest in this domain should write one.",
          true,
        );

      const core = members
        .filter(
          (r) =>
            r.id !== primer?.id &&
            ["knowledge", "concept", "learning"].includes(r.record_type),
        )
        .sort(
          (a, b) => (centrality.get(b.id) ?? 0) - (centrality.get(a.id) ?? 0),
        );
      const coreLines: string[] = [];
      for (const r of core) {
        if (used - domainStart > perDomain * 0.75) {
          omitted.push(
            `${core.length - coreLines.length} more core ideas in ${domain}`,
          );
          break;
        }
        const line = `- ${r.title} (${form(r)}; ${r.id}): ${clip(summary(r) ?? index.text(r), 140)}`;
        if (
          !add(
            coreLines.length
              ? line
              : "### Core ideas, most connected first\n" + line,
          )
        )
          break;
        coreLines.push(line);
      }

      const disputes = members.filter(
        (r) =>
          r.record_type === "judgment" &&
          ["unresolved", "provisional_preference", "different_scope"].includes(
            (r.payload as any).outcome,
          ),
      );
      if (disputes.length)
        add(
          "### Live disagreements\n" +
            disputes
              .slice(0, 4)
              .map(
                (j) => `- ${j.title} (${(j.payload as any).outcome}; ${j.id})`,
              )
              .join("\n"),
        );

      const questions = openQuestions
        .filter((q) => q.scope.domains.includes(domain))
        .sort((a, b) => {
          const pa = (a.payload as any).priority,
            pb = (b.payload as any).priority;
          return (
            IMPACT_RANK[pb?.impact] * EFFORT_RANK[pb?.effort] -
              IMPACT_RANK[pa?.impact] * EFFORT_RANK[pa?.effort] ||
            a.title.localeCompare(b.title)
          );
        });
      if (questions.length)
        add(
          "### Questions worth answering next\n" +
            questions
              .slice(0, 4)
              .map(
                (q) =>
                  `- ${q.title} (impact ${(q.payload as any).priority?.impact}, effort ${(q.payload as any).priority?.effort}; ${q.id})`,
              )
              .join("\n"),
        );
    }

    if (learned.length)
      add(
        "\n## Recently learned\n" +
          learned
            .slice(0, 4)
            .map(
              (l) =>
                `- ${l.date} ${l.sources}: ${clip(l.added.join(" "), 260)}${l.revised ? ` (revised ${l.revised} earlier account(s))` : ""}`,
            )
            .join("\n"),
      );
    if (omitted.length)
      add(`\nNot shown to fit the budget: ${omitted.join("; ")}.`, true);

    const briefing = lines.join("\n");
    return {
      interface_version: "brief-1",
      release_id: index.release,
      domains,
      budget: {
        requested: budget,
        used: estimateTokens(briefing),
        estimated: true,
      },
      briefing,
    };
  }

  /** Ingestion reports in this scope, newest first: what each ingest says it added. */
  private async recentlyLearned(index: LibraryIndex) {
    const out: {
      date: string;
      sources: string;
      added: string[];
      revised: number;
    }[] = [];
    const dirs = await fs
      .readdir(this.store.p("jobs"))
      .catch(() => [] as string[]);
    const releases = new Map(
      (await this.store.committedReleases()).map((r) => [r.release_id, r]),
    );
    for (const dir of dirs) {
      const report = await readJson<any>(
        this.store.p(`jobs/${dir}/ingestion-report.json`),
      ).catch(() => null);
      const release = report && releases.get(report.release_id);
      if (!release || !report.understanding_change?.added?.length) continue;
      const job = await readJson<any>(
        this.store.p(`jobs/${dir}/job.json`),
      ).catch(() => null);
      const sources: RecordData[] = (job?.source_refs ?? [])
        .map((r: any) => index.visible.get(r.id))
        .filter(Boolean);
      if (!job || sources.length !== (job.source_refs ?? []).length) continue;
      out.push({
        date: release.created_at.slice(0, 10),
        sources: sources
          .map((s) => s.title.replace(/\.[a-z0-9]+$/i, ""))
          .join(", "),
        added: report.understanding_change.added,
        revised: report.understanding_change.revised_refs?.length ?? 0,
      });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }
}
