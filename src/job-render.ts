import { key } from "./core.js";

/**
 * MCP presentation of ingestion-job responses. The full job (every coverage unit with its
 * locator and receipt paths) grows with the source: tens of kilobytes for a paper and
 * megabytes for a long book. The agent needs the stage, the instruction, what is still
 * pending and the reweave decisions. Pass detail:"full" to receive the raw JSON instead.
 */
export function isJobResponse(value: any) {
  return !!value?.job?.job_id && Array.isArray(value.job.coverage);
}

export function renderJobResponse(value: any, pendingLimit = 40): string {
  const {
    job,
    instruction,
    source_paths,
    recommended_guides,
    staged_path,
    reweave,
    ...rest
  } = value;
  const lines: string[] = [
    `Job ${job.job_id} · stage ${job.stage} · status ${job.status} · workflow ${job.workflow_version ?? 1}`,
  ];
  if (instruction) lines.push(`Do now: ${instruction}`);
  if (job.error)
    lines.push(
      `Error: ${typeof job.error === "string" ? job.error : JSON.stringify(job.error)}`,
    );
  if (recommended_guides?.length)
    lines.push(
      `Guides: ${recommended_guides.map((g: string) => `kb_read {kind:"guide",name:"${g}"}`).join(", ")}`,
    );
  for (const s of source_paths ?? [])
    lines.push(`Source ${key(s.record_ref)}: ${s.path}`);

  const coverage: any[] = job.coverage;
  const tally = (field: string) => {
    const counts: Record<string, number> = {};
    for (const unit of coverage)
      counts[unit[field]] = (counts[unit[field]] ?? 0) + 1;
    return Object.entries(counts)
      .map(([state, n]) => `${n} ${state}`)
      .join(", ");
  };
  lines.push(
    `Coverage: ${coverage.length} units · read: ${tally("read")} · integrated: ${tally("integrated")} · checked: ${tally("checked")}`,
  );
  const field =
    job.stage === "reconstruct"
      ? "read"
      : job.stage === "integrate"
        ? "integrated"
        : job.stage === "check"
          ? "checked"
          : null;
  if (field) {
    const pending = coverage.filter(
      (u) => !["complete", "excluded"].includes(u[field]),
    );
    if (pending.length)
      lines.push(
        `Pending for this stage (${pending.length}${pending.length > pendingLimit ? `, first ${pendingLimit}` : ""}):`,
        ...pending
          .slice(0, pendingLimit)
          .map(
            (u) =>
              `- ${u.unit_id} · ${u.locator?.label ?? ""}${u.gaps?.length ? ` · gaps: ${u.gaps.join("; ")}` : ""}`,
          ),
      );
  }
  const remaining: string[] = job.remaining_work ?? [];
  if (remaining.length && !field)
    lines.push(
      `Remaining work: ${remaining.slice(0, 15).join("; ")}${remaining.length > 15 ? ` … (+${remaining.length - 15})` : ""}`,
    );
  if (job.paid_budget?.limit != null)
    lines.push(
      `Paid budget: ${job.paid_budget.limit} ${job.paid_budget.currency}; provider requests ${job.paid_budget.provider_request_ids.length}`,
    );
  if (reweave) {
    const targets: any[] = reweave.targets ?? [];
    const open = targets.filter((t) => t.resolution === "unassessed");
    lines.push(
      `Reweave: ${targets.length} affected account(s), ${open.length} still unassessed${reweave.inaccessible_dependents ? "; some dependents are outside your scope" : ""}.`,
    );
    if (reweave.instruction) lines.push(reweave.instruction);
    for (const t of targets.slice(0, 40))
      lines.push(
        `- ${key(t.record_ref)} · ${t.title} (${t.record_type}) · ${t.resolution}${t.staged_ref ? ` · staged ${key(t.staged_ref)}` : ""}${t.outside_write_scope ? " · outside write scope" : ""}`,
      );
    if (targets.length > 40)
      lines.push(
        `… ${targets.length - 40} more; request detail:"full" for all.`,
      );
  }
  if (staged_path) lines.push(`Staged batch: ${staged_path}`);
  const extra = Object.keys(rest);
  if (extra.length) lines.push(JSON.stringify(rest));
  lines.push(`Raw job JSON: same call with detail:"full".`);
  return lines.join("\n");
}
