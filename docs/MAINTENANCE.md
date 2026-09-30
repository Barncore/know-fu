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

Preserve the established documentation style. On 2026-10-01 the owner chose the original README/docs over the personal-writing-style draft; that draft was not adopted. Keep factual updates current, leave historical log entries intact, and keep replacement drafts separate until explicitly chosen. Repository prose does not require the owner's private writing skill.
