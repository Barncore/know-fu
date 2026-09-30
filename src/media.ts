import * as fs from "node:fs/promises";
import path from "node:path";
import {
  ensure,
  hash,
  fileHash,
  json,
  atomic,
  immutable,
  readJson,
  exists,
  now,
  KBError,
} from "./core.js";
import { run } from "./process.js";
import { MediaRuntime } from "./media-runtime.js";
import { Visuals } from "./visuals.js";
export type Budget = { limit: number; currency: string; authorization: string };
export type Decode = {
  id: string;
  endpoint: string;
  model: string;
  key_env: string;
  estimated_cost_per_minute: number;
  currency: string;
  response_format?: "json" | "verbose_json";
  timestamp_granularities?: ("word" | "segment")[];
  prompt?: string;
};
export function chunks(duration: number, core = 300, overlap = 8) {
  ensure(
    Number.isFinite(duration) &&
      duration > 0 &&
      Number.isFinite(core) &&
      core >= 10 &&
      core <= 600 &&
      Number.isFinite(overlap) &&
      overlap >= 0 &&
      overlap < core / 2,
    "VALIDATION_FAILED",
    "Invalid media chunk geometry",
  );
  const out = [];
  for (let start = 0; start < duration; start += core)
    out.push({
      index: out.length,
      core_start: start,
      core_end: Math.min(duration, start + core),
      start: Math.max(0, start - overlap),
      end: Math.min(duration, start + core + overlap),
    });
  return out;
}
export function decoders(config: any): Decode[] {
  const models: Decode[] =
    config?.models ?? (config?.model ? [{ ...config, id: "primary" }] : []);
  ensure(
    models.length > 0 &&
      new Set(models.map((m) => m.id)).size === models.length,
    "PAID_BUDGET_REQUIRED",
    "Configure distinct transcription decoder IDs",
  );
  for (const m of models) {
    ensure(
      /^[a-z][a-z0-9_-]*$/.test(m.id) &&
        m.model &&
        m.key_env &&
        m.currency &&
        Number.isFinite(m.estimated_cost_per_minute) &&
        m.estimated_cost_per_minute > 0,
      "PAID_BUDGET_REQUIRED",
      "Invalid decoder configuration",
    );
    const u = new URL(m.endpoint);
    ensure(
      u.protocol === "https:" && !u.username && !u.password && !u.search,
      "VALIDATION_FAILED",
      "Use an HTTPS endpoint without embedded credentials or query secrets",
    );
    ensure(
      !m.timestamp_granularities?.length ||
        m.response_format === "verbose_json",
      "VALIDATION_FAILED",
      "Timestamp output requires verbose_json",
    );
  }
  return models;
}
export class Media {
  runtime: MediaRuntime;
  constructor(
    runner = run,
    private request = fetch,
  ) {
    this.runtime = new MediaRuntime(runner);
  }
  async plan(original: string, config: any) {
    const models = decoders(config),
      probe = await this.runtime.probe(original),
      duration = Number(probe.format.duration),
      parts = chunks(
        duration,
        config?.chunk_seconds ?? 300,
        config?.overlap_seconds ?? 8,
      );
    const margin = config?.reservation_multiplier ?? 1.25,
      fee = config?.reservation_per_request ?? 0.001;
    ensure(
      Number.isFinite(margin) &&
        margin >= 1 &&
        Number.isFinite(fee) &&
        fee >= 0,
      "VALIDATION_FAILED",
      "Invalid reservation margin",
    );
    const requests = parts.flatMap((c) =>
      models.map((m) => ({
        decoder: m.id,
        chunk: c.index,
        estimated_cost:
          (Math.ceil(c.end - c.start) / 60) *
            m.estimated_cost_per_minute *
            margin +
          fee,
      })),
    );
    ensure(
      new Set(models.map((m) => m.currency)).size === 1,
      "PAID_BUDGET_REQUIRED",
      "All decoders must use one currency",
    );
    return {
      duration,
      has_video: probe.streams.some((s: any) => s.codec_type === "video"),
      source_start: Number(probe.format.start_time ?? 0),
      models,
      parts,
      requests,
      currency: models[0].currency,
      estimated_reservation: requests.reduce((a, r) => a + r.estimated_cost, 0),
      actual_cost: null,
    };
  }
  async convert(
    original: string,
    output: string,
    budget: Budget,
    config: any,
    checkpoint: () => Promise<void> = async () => {},
    reserve: (id: string, cost: number) => Promise<void> = async () => {},
  ) {
    ensure(
      Number.isFinite(budget?.limit) &&
        budget.limit > 0 &&
        budget.currency &&
        budget.authorization,
      "PAID_BUDGET_REQUIRED",
      "API transcription requires an explicit job spending allowance",
    );
    const plan = await this.plan(original, config);
    ensure(
      plan.currency === budget.currency &&
        plan.estimated_reservation <= budget.limit,
      "PAID_BUDGET_REQUIRED",
      "All decoders and overlap must fit the authorized allowance",
      { estimate: plan.estimated_reservation, currency: plan.currency },
    );
    for (const model of plan.models)
      ensure(
        process.env[model.key_env],
        "MODEL_UNAVAILABLE",
        "Configured transcription credential is unavailable",
        { decoder: model.id, key_env: model.key_env },
      );
    await fs.mkdir(output, { recursive: true });
    const sourceHash = await fileHash(original),
      planFile = path.join(output, "media-plan.json"),
      journalFile = path.join(output, "transcription-requests.json");
    const planHash = hash(json({ sourceHash, plan }));
    if (await exists(planFile))
      ensure(
        (await readJson(planFile)).plan_hash === planHash,
        "REVISION_CONFLICT",
        "Source or media configuration changed; reconcile existing paid work first",
      );
    else {
      ensure(
        !(await exists(journalFile)),
        "REVISION_CONFLICT",
        "Previous converter paid history requires reconciliation before upgrading this job",
      );
      await immutable(
        planFile,
        json({ plan_hash: planHash, source_sha256: sourceHash, ...plan }),
      );
    }
    const journal: any[] = (await exists(journalFile))
      ? await readJson(journalFile)
      : [];
    const units: any[] = [],
      transcripts = new Map<string, any>(),
      input = await this.runtime.file(original);
    for (const chunk of plan.parts) {
      await checkpoint();
      const audio = path.join(output, `audio-${chunk.index}.mp3`),
        audioMeta = audio + ".json";
      if (!(await exists(audioMeta))) {
        await this.runtime.exec("ffmpeg", [
          "-nostdin",
          "-y",
          "-ss",
          String(chunk.start),
          "-t",
          String(chunk.end - chunk.start),
          "-i",
          input,
          "-vn",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-b:a",
          "64k",
          await this.runtime.file(audio),
        ]);
        const b = await fs.readFile(audio),
          p = await this.runtime.probe(audio);
        await immutable(
          audioMeta,
          json({
            source_sha256: sourceHash,
            ...chunk,
            sha256: hash(b),
            bytes: b.length,
            encoded_duration: Number(p.format.duration),
            timing:
              "requested offsets; compressed audio may add subsecond padding",
          }),
        );
      }
      const audioBytes = await fs.readFile(audio),
        meta = await readJson(audioMeta);
      ensure(
        hash(audioBytes) === meta.sha256 && audioBytes.length < 24_000_000,
        "SOURCE_UNREADABLE",
        "Prepared audio changed or exceeds upload cap",
      );
      for (const model of plan.models) {
        await checkpoint();
        const requestId = hash(
          json({
            planHash,
            chunk: chunk.index,
            decoder: model.id,
            audio_sha256: meta.sha256,
          }),
        );
        let req = journal.find((r) => r.id === requestId);
        const rawFile = path.join(output, `response-${requestId}.json`);
        if (req && ["uncertain", "submitted", "rejected"].includes(req.status))
          throw new KBError(
            "PROVIDER_OUTCOME_UNCERTAIN",
            "Reconcile the preserved paid request; automatic retry blocked",
            { request_id: req.id, status: req.status },
          );
        if (!req) {
          req = {
            id: requestId,
            decoder: model.id,
            model: model.model,
            ...chunk,
            status: "reserved",
            estimated_cost: plan.requests.find(
              (r) => r.chunk === chunk.index && r.decoder === model.id,
            )!.estimated_cost,
            actual_cost: null,
            created_at: now(),
          };
          journal.push(req);
          await atomic(journalFile, json(journal));
        }
        if (req.status !== "complete") {
          await reserve(req.id, req.estimated_cost);
          await checkpoint();
          req.status = "submitted";
          await atomic(journalFile, json(journal));
          try {
            const form = new FormData();
            form.append("model", model.model);
            form.append("response_format", model.response_format ?? "json");
            for (const g of model.timestamp_granularities ?? [])
              form.append("timestamp_granularities[]", g);
            if (model.prompt) form.append("prompt", model.prompt);
            form.append("file", new Blob([audioBytes]), path.basename(audio));
            const response = await this.request(model.endpoint, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env[model.key_env]}`,
              },
              body: form,
              redirect: "error",
              signal: AbortSignal.timeout(300000),
            });
            req.provider_request_id = response.headers.get("x-request-id");
            const raw = await response.text();
            await immutable(rawFile, raw);
            req.response_sha256 = hash(raw);
            if (!response.ok) {
              req.status = response.status >= 500 ? "uncertain" : "rejected";
              await atomic(journalFile, json(journal));
              throw new KBError(
                "TRANSCRIPTION_FAILED",
                "Provider rejected the request",
                {
                  status: response.status,
                  request_id: req.provider_request_id,
                },
              );
            }
            const decoded = JSON.parse(raw);
            ensure(
              typeof decoded.text === "string" && decoded.text.trim(),
              "SOURCE_UNREADABLE",
              "Transcription response has no usable text",
            );
            req.status = "complete";
            req.completed_at = now();
            await atomic(journalFile, json(journal));
          } catch (e) {
            if (req.status === "submitted") {
              req.status = "uncertain";
              await atomic(journalFile, json(journal));
            }
            throw e;
          }
        }
        const raw = await fs.readFile(rawFile, "utf8");
        ensure(
          hash(raw) === req.response_sha256,
          "SOURCE_UNREADABLE",
          "Raw response hash mismatch",
        );
        const result = JSON.parse(raw),
          unitId = `transcript-${model.id}-${chunk.index}`;
        const details = {
          decoder: model.id,
          model: model.model,
          request_id: req.id,
          ...chunk,
          raw_response: path.basename(rawFile),
          raw_sha256: req.response_sha256,
          offset_encoding: "utf16-code-units",
        };
        units.push({
          unit_id: unitId,
          kind: "transcript",
          text: result.text,
          sha256: hash(result.text),
          asset_path: null,
          locator: {
            kind: "time_ms",
            label: `${model.id} chunk ${chunk.index}; original response text`,
            start: Math.floor(chunk.start * 1000),
            end: Math.ceil(chunk.end * 1000),
            anchor: unitId,
            precision: "approximate",
          },
          details,
        });
        transcripts.set(`${model.id}:${chunk.index}`, {
          id: unitId,
          text: result.text,
        });
        if (result.words || result.segments) {
          const timing: any = {
            ...details,
            precision:
              "ASR estimates; never transfer to another decoder without verified alignment",
            words: result.words ?? [],
            segments: result.segments ?? [],
          };
          for (const category of ["words", "segments"])
            timing[category] = timing[category].map((v: any) => ({
              ...v,
              source_start:
                typeof v.start === "number" ? chunk.start + v.start : null,
              source_end:
                typeof v.end === "number" ? chunk.start + v.end : null,
            }));
          const text = json(timing);
          units.push({
            unit_id: `timing-${model.id}-${chunk.index}`,
            kind: "timing",
            text,
            sha256: hash(text),
            asset_path: null,
            locator: {
              kind: "time_ms",
              label: `Raw timing map ${model.id} chunk ${chunk.index}`,
              start: Math.floor(chunk.start * 1000),
              end: Math.ceil(chunk.end * 1000),
              anchor: `timing-${model.id}-${chunk.index}`,
              precision: "approximate",
            },
          });
        }
      }
    }
    for (const chunk of plan.parts) {
      if (plan.models.length > 1) {
        const text = json({
          task: "Compare consequential wording, omissions, repetition and numbers. Agreement is not independent evidence.",
          chunks: plan.models.map((m) =>
            transcripts.get(`${m.id}:${chunk.index}`),
          ),
        });
        units.push(
          this.reviewUnit(
            `compare-${chunk.index}`,
            text,
            chunk.start,
            chunk.end,
          ),
        );
      }
      if (chunk.index > 0)
        for (const model of plan.models) {
          const previous = plan.parts[chunk.index - 1],
            a = transcripts.get(`${model.id}:${chunk.index - 1}`),
            b = transcripts.get(`${model.id}:${chunk.index}`);
          const text = json({
            task: "Review overlap; preserve qualifiers or report unresolved joins. Do not deduplicate solely by similarity.",
            previous: {
              unit_id: a.id,
              end_excerpt: a.text.slice(-2500),
              excerpt_start: Math.max(0, a.text.length - 2500),
            },
            next: {
              unit_id: b.id,
              start_excerpt: b.text.slice(0, 2500),
              excerpt_start: 0,
            },
            offset_encoding: "utf16-code-units",
          });
          units.push(
            this.reviewUnit(
              `join-${model.id}-${chunk.index}`,
              text,
              chunk.start,
              previous.end,
            ),
          );
        }
    }
    if (plan.has_video)
      units.push(
        ...(await new Visuals(this.runtime).navigation(
          original,
          output,
          config?.navigation,
        )),
      );
    return {
      version: 2,
      source_sha256: sourceHash,
      parser: "know-fu-media-2",
      units,
      review_profile: "video",
      limitations: [
        "ASR wording and timing require review; timestamps do not transfer between decoders.",
        "Navigation is sampled, not continuous playback. Request native frames for consequential details.",
        ...(plan.models.length < 2
          ? ["Only one decoder configured; reduced transcription comparison."]
          : []),
      ],
      cost: {
        estimated_reservation: plan.estimated_reservation,
        actual: null,
        currency: plan.currency,
      },
      provider: {
        models: plan.models.map((m) => ({ id: m.id, model: m.model })),
        requests: journal.map((r) => ({
          id: r.id,
          status: r.status,
          provider_request_id: r.provider_request_id ?? null,
        })),
      },
    };
  }
  private reviewUnit(id: string, text: string, start: number, end: number) {
    return {
      unit_id: id,
      kind: "review",
      text,
      sha256: hash(text),
      asset_path: null,
      locator: {
        kind: "time_ms",
        label: id,
        start: Math.floor(start * 1000),
        end: Math.ceil(end * 1000),
        anchor: id,
        precision: "approximate",
      },
    };
  }
}
