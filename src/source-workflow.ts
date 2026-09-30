import * as fs from "node:fs/promises";
import path from "node:path";
import type { Jobs } from "./jobs.js";
import {
  APP,
  ensure,
  hash,
  snapshotFile,
  json,
  immutable,
  readJson,
  exists,
  ref,
  safePath,
  withLock,
  STATE,
} from "./core.js";
import { Media } from "./media.js";
import { Visuals } from "./visuals.js";

export class SourceWorkflow {
  constructor(private jobs: Jobs) {}
  async call(id: string, input: any) {
    const store = this.jobs.store,
      j = await this.jobs.load(id),
      sources = await readJson<any[]>(
        path.join(this.jobs.jobPath(id), "sources.json"),
      );
    if (input.action === "media_plan") {
      const config = await readJson(path.join(STATE, "config.json")),
        plans = [];
      for (const s of sources)
        if (
          /\.(mp4|mkv|mov|webm|mp3|wav|m4a|flac|ogg)$/i.test(
            s.payload.original_path,
          )
        )
          plans.push({
            source_ref: ref(s),
            ...(await new Media().plan(
              store.p(s.payload.original_path),
              config.transcription,
            )),
          });
      return {
        plans,
        total_estimated_reservation: plans.reduce(
          (n, p) => n + p.estimated_reservation,
          0,
        ),
        actual_cost: null,
        credentials_checked: false,
        paid_requests: 0,
      };
    }
    const source = sources.find((s) => s.id === input.source_id);
    ensure(source, "SCOPE_DENIED", "Source must belong to this job");
    ensure(
      j.status !== "cancelled" && j.status !== "complete",
      "VALIDATION_FAILED",
      "Source workflow requires an active job",
    );
    if (input.action === "source_review") {
      ensure(
        typeof input.review_id === "string" &&
          input.review_id &&
          input.review &&
          typeof input.review === "object" &&
          typeof input.review.summary === "string" &&
          input.review.summary.trim().length > 20,
        "VALIDATION_FAILED",
        "A located, substantive source review is required",
      );
      for (const unit of input.review.evidence_unit_ids ?? [])
        ensure(
          j.coverage.some(
            (u) => u.unit_id === unit && u.source_ref.id === source.id,
          ),
          "LOCATOR_UNRESOLVED",
          "Review evidence unit is outside this source",
        );
      const relative = `jobs/${id}/source-reviews/${hash(source.id + ":" + input.review_id)}.json`;
      await immutable(
        store.p(relative),
        json({
          source_ref: ref(source),
          review: input.review,
          review_id: input.review_id,
          evidence_only: true,
        }),
      );
      return {
        saved: relative,
        canonical: false,
        note: "Carry substantive identity, findings, checks and qualifications into canonical source/account records through kb_propose.",
      };
    }
    return withLock(store.root, "conversion", async () => {
      const current = await this.jobs.load(id);
      ensure(
        current.status !== "cancelled" &&
          current.status !== "complete" &&
          current.stage !== "convert",
        "VALIDATION_FAILED",
        "Convert this active job before adding evidence",
      );
      const supplement = "supp-" + hash(json(input)).slice(0, 24),
        folder =
          path.posix.dirname(source.payload.original_path) +
          `/extractions/${id}`,
        mapping = folder + `/${supplement}.json`,
        out = store.p(folder + "/" + supplement);
      let units: any[];
      if (await exists(store.p(mapping)))
        units = (await readJson(store.p(mapping))).units;
      else {
        await fs.mkdir(out, { recursive: true });
        const visuals = new Visuals();
        const snapshot = ["frames", "pages"].includes(input.action)
          ? await snapshotFile(store.p(source.payload.original_path))
          : undefined;
        if (snapshot)
          ensure(
            snapshot.sha256 === source.payload.sha256,
            "SOURCE_UNREADABLE",
            "Original changed before visual extraction",
          );
        if (input.action === "frames") {
          ensure(
            Array.isArray(input.seconds) &&
              input.seconds.length > 0 &&
              input.seconds.length <= 24,
            "VALIDATION_FAILED",
            "Request 1 to 24 source times per call",
          );
          units = [];
          for (let i = 0; i < input.seconds.length; i++) {
            const unit = await visuals.frame(
              store.p(source.payload.original_path),
              path.join(out, String(i)),
              input.seconds[i],
              snapshot,
            );
            unit.unit_id += "-" + i;
            units.push(unit);
          }
        } else if (input.action === "pages") {
          ensure(
            source.payload.original_path.endsWith(".pdf") &&
              Array.isArray(input.pages) &&
              input.pages.length > 0 &&
              input.pages.length <= 12,
            "VALIDATION_FAILED",
            "Request 1 to 12 physical PDF pages",
          );
          units = [];
          for (let i = 0; i < input.pages.length; i++)
            units.push(
              await visuals.page(
                store.p(source.payload.original_path),
                path.join(out, String(i)),
                input.pages[i],
                input.scale ?? 3,
                snapshot,
              ),
            );
        } else if (input.action === "crop") {
          const parent = await this.unit(id, input.unit_id, source.id);
          ensure(
            parent.asset_path,
            "SOURCE_UNREADABLE",
            "Selected unit has no visual asset",
          );
          const asset = await safePath(store.root, parent.asset_path);
          const crop = await visuals.crop(asset, out, input.rectangle);
          const text = json({ ...crop.details, parent_unit_id: input.unit_id });
          units = [
            {
              unit_id: "crop",
              kind: "figure",
              text,
              sha256: hash(text),
              asset_path: crop.file,
              asset_sha256: crop.details.asset_sha256,
              locator: {
                ...parent.locator,
                label: parent.locator.label + "; unscaled crop",
              },
              details: crop.details,
            },
          ];
        } else if (input.action === "reading_copy") {
          ensure(
            Array.isArray(input.spans) &&
              input.spans.length > 0 &&
              typeof input.rationale === "string" &&
              input.rationale.trim().length > 20,
            "VALIDATION_FAILED",
            "Reading copy requires reviewed source spans and a join rationale",
          );
          const textParts = [],
            origins = [];
          let decoder: string | undefined;
          for (const span of input.spans) {
            const u = await this.unit(id, span.unit_id, source.id);
            ensure(
              u.kind === "transcript",
              "VALIDATION_FAILED",
              "Reading copies use original transcript units",
            );
            ensure(
              Number.isInteger(span.start) &&
                Number.isInteger(span.end) &&
                span.start >= 0 &&
                span.end > span.start &&
                span.end <= u.text.length,
              "LOCATOR_UNRESOLVED",
              "Span is outside original UTF-16 text",
            );
            decoder ??= u.details?.decoder;
            ensure(
              decoder === u.details?.decoder,
              "VALIDATION_FAILED",
              "Keep decoder reading copies separate",
            );
            textParts.push(u.text.slice(span.start, span.end));
            origins.push({
              unit_id: span.unit_id,
              start: span.start,
              end: span.end,
              original_text_sha256: u.sha256,
              locator: u.locator,
            });
          }
          const text = textParts.join("\n");
          units = [
            {
              unit_id: "reading-copy",
              kind: "text",
              text,
              sha256: hash(text),
              asset_path: null,
              details: {
                origins,
                rationale: input.rationale,
                offset_encoding: "utf16-code-units",
              },
              locator: {
                kind: "time_ms",
                label: "Reviewed reading copy; exact retained raw text spans",
                start: Math.min(...origins.map((o) => o.locator.start)),
                end: Math.max(...origins.map((o) => o.locator.end)),
                anchor: "reading-copy",
                precision: "approximate",
              },
            },
          ];
        } else throw new Error("Unknown source workflow action");
        for (const u of units) {
          u.unit_id = source.id + ":" + supplement + ":" + u.unit_id;
          u.locator.anchor = `extract:${id}:${supplement}:` + u.unit_id;
          if (u.asset_path)
            u.asset_path = path
              .relative(store.root, u.asset_path)
              .replaceAll("\\", "/");
        }
        await immutable(
          store.p(mapping),
          json({
            version: 2,
            source_sha256: source.payload.sha256,
            parser: "know-fu-supplement-1",
            units,
            limitations: [],
          }),
        );
      }
      return withLock(store.root, "jobs", async () => {
        const latest = await this.jobs.load(id);
        ensure(
          latest.status !== "cancelled" && latest.status !== "complete",
          "JOB_CANCELLED",
          "Job ended while preparing evidence",
        );
        let added = 0;
        for (const u of units)
          if (!latest.coverage.some((v) => v.unit_id === u.unit_id)) {
            latest.coverage.push({
              unit_id: u.unit_id,
              source_ref: ref(source),
              locator: u.locator,
              registered: "complete",
              converted: "complete",
              read: "pending",
              integrated: "pending",
              checked: "pending",
              receipts: [mapping],
              gaps: ["Additional evidence requires review"],
              exclusion_reason: null,
            });
            added++;
          }
        if (added) {
          latest.stage = "reconstruct";
          latest.status = "waiting_for_codex";
          latest.remaining_work = units.map((u) => u.unit_id);
          await this.jobs.save(latest);
        }
        return {
          added,
          units: units.map((u) => ({ unit_id: u.unit_id, locator: u.locator })),
          instruction:
            "Read added units with kb_read. New evidence reopens reconstruction, integration and checks; creation is not review.",
        };
      });
    });
  }
  async unit(id: string, unitId: string, sourceId: string) {
    const j = await this.jobs.load(id),
      u = j.coverage.find(
        (v) => v.unit_id === unitId && v.source_ref.id === sourceId,
      );
    ensure(u, "LOCATOR_UNRESOLVED", "Unknown source unit");
    const mapping = u.receipts.find((r) =>
      /\/(extraction|supp-[a-f0-9]+)\.json$/.test(r),
    );
    ensure(mapping, "SOURCE_UNREADABLE", "Extraction mapping absent");
    const m = await readJson(await safePath(this.jobs.store.root, mapping)),
      unit = m.units.find((v: any) => v.unit_id === unitId);
    ensure(
      unit && hash(unit.text) === unit.sha256,
      "SOURCE_UNREADABLE",
      "Unit changed",
    );
    if (unit.asset_sha256)
      ensure(
        hash(
          await fs.readFile(
            await safePath(this.jobs.store.root, unit.asset_path),
          ),
        ) === unit.asset_sha256,
        "SOURCE_UNREADABLE",
        "Visual asset changed",
      );
    return unit;
  }
}
