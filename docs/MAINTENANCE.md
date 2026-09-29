# Keeping behavior and documentation together

Use this repository as the development source. The installed user-profile plugin/cache are deployment copies. The machine-local engine state and corpus remain outside versioned source.

| Change | Update |
|---|---|
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

For new README, changelog and documentation prose, use the owner's `my-writing-style` skill when available. Accuracy comes first. The aim is clear, natural writing, without impersonation or invented personal experience. Keep the skill and its writing samples private. `AGENTS.md` gives a fallback for contributors who do not have it. Leave historical log entries intact, and keep requested replacement drafts separate until the owner approves them.
