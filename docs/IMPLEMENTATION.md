# The 1.1.0 build and handover

The owner approved the full [north-star plan](NORTH_STAR.md) on 4 October 2026, including implementation, verification, installed-plugin rollout and a GitHub push. This file records how that 1.1.0 build was delivered. It doesn't replace the intent or the validation record.

Version 1.2.0 came the next day and replaced 1.1.0's routine reading route with `kb_recall`. Its changes are in the [change log](../CHANGELOG.md), its evidence in [VALIDATION.md](VALIDATION.md), and the work that follows it in [ROADMAP.md](ROADMAP.md).

## Starting point

Engine 1.0.2 passed all 80 existing tests. The first sandboxed run couldn't create throwaway test folders; a permitted rerun passed with nothing skipped. The original fixed-packet paper pilot and its release stay preserved in the private acceptance folder. They are comparison evidence, not public fixtures and not proof that progressive reading works.

## Delivery

| Work | Status | How it was accepted |
|---|---|---|
| Behavioral contract and frozen comparison material | Complete | Source-grounded criteria cover every core use; exposed engineering cases and repeats are disclosed |
| Summary-led navigation and progressive reading | Built and compared; did not meet the bar to become the default | Complete explanations and scoped navigation work, but the measured cost and completeness didn't justify making it the default |
| Cumulative ingestion and the workflow for using knowledge | Built; publication of all three sources complete | Earlier teaching and questions were revised, historical accounts kept, and no affected account was left unassessed |
| Interactive evaluation and controlled comparisons | Complete, with limits reported | Access and cumulative comparisons kept, with source-only and no-library controls, repeats, full usage and review against the sources |
| Package, installed tools, docs and push | Installed and verified; release checks complete | Ten tools, six guides, semantic and graph reading, original images and recovered retries verified; production binding kept |

## Architecture decisions

- Canonical records and complete Markdown accounts keep ownership. Navigation is a view built from authored fields, and a missing summary shows as missing.
- The packet retrieval interface and its evaluator stay, so results can be reproduced and compared. Progressive reading was added as a separate, versioned interface.
- Optional graph exploration is separate from the required scope, lifecycle, qualification and prerequisite checks. Turning exploration off never turns caveats off.
- Provenance references come back without loading their bodies automatically. Exact supporting revisions stay readable, and current restrictions still apply.
- Scope filtering happens before any title, summary, topic membership or count is shown.
- Section locators bind the release, the exact record revision and the body hash. A section is marked as partial, and full-account reads stay available.

Setup, operation, component roles and troubleshooting are in the [README](../README.md) and the [maintenance guide](MAINTENANCE.md). Behavior evidence and limits belong in [VALIDATION.md](VALIDATION.md). At handover, the installed skill described both reading routes and the revised ingestion protocol, with packet retrieval as the routine default. Version 1.2.0 changed that default to `kb_recall`.

## Build evidence at handover

The final full run after the reading, ingestion and evaluator changes passed 107 tests with none skipped. Focused tests cover low-ranked exceptions, inherited primer caveats, source scope, exact historical reads, release-bound sections, current withdrawal, invalidation by a new material link, integrity of staged reassessment, batch reading, budgets, compact MCP presentation and resumption. Further tests keep a judgment's assessed issues distinct from prerequisites, stop passage bodies from getting the ranking bonus meant for authored summaries, and keep unfinished source stages during a rebase. These are engineering fixtures, not evidence of domain expertise.

A refreshed native Codex session read seven fictional accounts through the constrained MCP reader. Four synthetic reads of hidden files were denied, and so was a tool request that tried to override the fixed scope. A separate fixed-packet probe also denied four native file reads. The receipts bind the runtime policy and the state configuration, and a mismatched state binding was rejected before any evaluation model call. Reported input usage includes repeated context. These probes are isolation evidence, not efficiency benchmarks or full security assessments.

Sending extra source text to a grader is opt-in per run. The run freezes the source references or exact extract hashes, the destination and the authorization. This boundary was added after an automatic approval review rejected adding source text unconditionally. The acceptance work uses public papers and fictional fixtures, and existing private research is never an implied grading payload.
