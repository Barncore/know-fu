# Keeping behavior and documentation together

Use this repository as the development source. The installed user-profile plugin/cache are deployment copies. The machine-local engine state and corpus remain outside versioned source.

| Change | Update |
|---|---|
| Product intent, accepted architecture decision or implementation-plan status | NORTH_STAR; preserve the distinction between intent, proposal, implementation and validation |
| User-visible behavior or limitation | README, relevant workflow reference, CHANGELOG |
| Schemas, record semantics or ownership | Engine contracts, generated types, plugin architecture/contracts docs, CHANGELOG |
| Setup defaults, paths, backend/runtime support | Setup guide, setup-choices, setup-ai, configuration examples, CHANGELOG |
| Copied code or new dependency | Lockfiles, lineage/dependency notes, applicable notices, CHANGELOG |
| Validation/capability status | VALIDATION and any README/setup claims it changes |
| Retrieval/indexing performance | PERFORMANCE, relevant architecture notes and correctness regressions for affected routes |
| Durable implementation lesson | LESSONS, with reason and practical implication |

Run package generation after engine contract or transcription-example changes. `npm run check:package` checks bundled contract parity, the corpus example and local links. `npm run check:release -- --staged` checks the actual staged tree for excluded material, private-machine paths, common credential signatures, broken documentation links and change-log/doc accompaniment. These checks reduce mistakes; they cannot prove semantic correctness or catch every possible secret.

Keep a dated CHANGELOG entry for completed changes. If a code-only repair has no user-facing documentation impact, state that rationale in the entry. The release checker accepts documentation or a `Documentation impact: none` explanation in the staged changelog; reviewers must assess that explanation rather than treating it as an escape hatch.

The first private commit summarizes earlier local development instead of fabricating old commits. The owner made the repository public on 2026-09-30. Private evidence files stay local. No open-source license has been selected for Know Fu itself yet.

Preserve the established documentation style. On 2026-10-01 the owner chose the original README/docs over the personal-writing-style draft; that draft was not adopted. Keep factual updates current, leave historical log entries intact, and keep replacement drafts separate until explicitly chosen. Repository prose does not require the owner's private writing skill.

## Changing navigation or reading

`navigation.ts` owns authored summaries, section boundaries and purpose requirements. `research-view.ts` owns the pinned, scoped canonical view and material-context rules. `reading.ts` selects and opens content; `reading-render.ts` presents that same content compactly to MCP clients. `projections.ts` builds the owner-level wiki and search documents. Change the canonical reading schemas first when altering the API, regenerate types with the build and regenerate plugin contracts with `node scripts/package-plugin.mjs`.

Input provenance, assessment targets and conceptual prerequisites have different roles. Do not infer a prerequisite from a judgment's list of assessed issues. Keep qualification discovery independent of optional graph exploration, and keep complete explanations available even when discovery returns only summaries. The progressive-reading tests cover these distinctions alongside source scope, history and withdrawal.

## Repeating capability checks

Use an isolated library, freeze its release and case criteria before running, and preserve unsuccessful attempts. Version 3 evaluations record the full reading trajectory and measured cumulative input. Their immutable manifest binds implementation, budgets, scope, cases and grader-source authorization. A changed implementation needs a new run; a release mismatch requires a new comparison. Do not overwrite a receipt to resume through either mismatch.

Check the native isolation receipt against the exact runtime and state binding before model calls. A probe failure should stop the evaluation, not trigger a less restrictive sandbox. Public-source authorization in an example does not authorize sending private research to a grader. The default retrieval policy changes only when the [acceptance criteria](ACCEPTANCE.md) are met; packaging a new reading mode is not proof that it should replace the existing route.

When a concurrently published source makes a job's base stale, use the job's `rebase` action and inspect its next stage. Unfinished conversion, reconstruction and integration remain required. A job already past reweaving returns there so its consequences can be reviewed against the new base; rebasing is not permission to mark old coverage complete.

Before refreshing an installed plugin, verify the old file hashes and preserve a local backup. Copy the approved package through the normal install script, refresh it using the harness's supported plugin command, then check real tool discovery, guides and the existing corpus binding in a fresh process. Keep that machine-local configuration out of Git.

An adapter backup does not roll back the engine it points to. A rollback must deliberately align the engine Git revision, rebuilt output and plugin version. Keep corpus and independent-ledger backups together, and check the target engine can read any jobs or records created since the backup. Version 1.1.0 reads legacy jobs; that does not promise an older engine can read new workflow-version-2 jobs.
