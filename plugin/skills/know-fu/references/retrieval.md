# Using the knowledge

Domain tags influence ranking; they are not a strict filter. Use module/source scope for enforced access restrictions. Retrieval includes lifecycle, archive state and validity dates before body excerpts, and flags dates outside today's UTC date. A historical cited premise can remain in a packet without being a current recommendation. Automatic judgment expansion excludes retired or archived judgments. When following `depends_on`, its object is the prerequisite and its subject is the dependent account.

Establish what the task must resolve. For routine answers, call `kb_retrieve` with `mode:"packet"` (also the API default), `query` and a purpose: explain, teach, apply, compare, invent or investigate. Read its explanatory accounts and material qualifications; use `kb_read` for a complete exact record when needed. For a synthesis through this compatibility route, use the explain purpose and state the required branches in the query.

When the task calls for navigating a topic, choosing successive readings or explicitly using progressive access, call `kb_retrieve` with `mode:"progressive"`, `query` and one of those purposes or `synthesize`. Start precise lookups with three candidates and expand when a relevant branch is missing. Each follow-up can resend earlier context; smaller individual responses do not establish lower cumulative cost. Start with the relevant domain. Broaden within permitted modules only when the task warrants it; an expressly source-limited request stays source-limited. Set `scope.source_refs` for that restriction. Subject tags are not permissions.

Progressive discovery combines available keyword/vector search with optional graph exploration and mandatory material-context checks. It returns orientation candidates, necessary reading and traceable support. Summaries help select reading; they do not count as inspected evidence. `graph:false` disables optional exploration while retaining known qualifications, challenges, conceptual prerequisites and current judgments. `graph_required:true` errors when the graph projection is unavailable. `semantic:false` requests keyword lookup. CPU reranking is optional and can be expensive. Check the returned route rather than assume a backend ran.

Choose an entry point suited to the question:

- Broad orientation: `kb_read {kind:"catalogue",purpose}` lists permitted topics and primers; `kind:"topic",topic:"domain_id"` lists summarized accounts. Follow `pagination.next_offset` when the relevant coverage extends beyond the page.
- Targeted reading: `kb_read {kind:"account",record_ref:{id,revision},purpose}` opens a complete account. `kind:"accounts",record_refs:[...]` reads up to 12 selected accounts together.
- Long accounts: `kind:"sections",record_ref` supplies stable section IDs. Read one using `kind:"account",record_ref,section_id`. A section is explicitly partial; its locator is tied to the exact revision, body hash and release. Re-list after a stale-section error.
- Material context: `kind:"context",record_refs:[...]` resolves known context without opening every body. Follow `material_context.next_offset` using `context_offset` until resolved. Discovery and account reads also carry this context.
- Supporting evidence: open exact passage references as accounts; existing `kb_read {record_ref:{id,revision}}` remains available. For ambiguous tables, equations or quotations, inspect the original evidence, including job visual units where available.

Give a short reason for additional reading when it helps the user follow a consequential choice. Discovery's necessary reading is conditional on relying on the associated candidate. Choose relevant explanations, batch them with their identified qualifications and prerequisites, then resolve their returned material context; never drop a low-ranked exception just to save tokens. Resolve applicability facts or preserve them as unknown. Keep a task-local list of inspected exact refs, body hashes and any sections so repeated paths do not cause repeated full reads. Full input-dependency chains remain traceable in `traceable_support`; their bodies need not all be opened. Top-level `depends_on` records exact inputs and invalidation, whereas a relationship predicate `depends_on` identifies a conceptual prerequisite.

MCP presents complete reading content with shared scope and assessment definitions printed once. Exact references appear as `id@revision`; pass them to tools as objects `{id,revision}`. The API/CLI and durable receipts retain the structured JSON contract. Section reads remain partial, and every source-specific warning and unresolved material-context page still matters.

Stop when the task's material requirements are satisfied, or state what remains unresolved. A completed retrieval call or graph traversal does not establish completeness. Respect pending reassessment, historical status, inaccessible evidence, pagination and budget limits. If required reading cannot fit, narrow the claim or report the limitation. Do not silently treat a summary, excerpt or old revision as a current complete account. `mode:"packet"` retains the original expanded-packet route for explicit compatibility and comparison.

Retrieval rank is relevance, not truth. Repeated derivative sources and summary/body matches are not independent corroboration. Consider source fidelity, evidence strength and applicability separately.

Teach through coherent prose and examples suited to the learner. For application or invention, make premises, mechanisms, constraints and testing needs explicit. Distinguish a warranted deduction, a speculative hypothesis, and an empirical result. Skills can supply writing/product methods without pretending those methods came from research records.

Match the reading to the purpose:

| Purpose | Resolve before answering |
|---|---|
| Explain | Meaning, mechanism, reasoning and the boundary that changes the account |
| Teach | Prerequisites, a coherent sequence, a worked case and a likely misunderstanding or near miss |
| Apply | Necessary inputs, decision steps, failed preconditions and what the result permits |
| Compare | Each account's definition, scope, evidence and unresolved differences |
| Invent | Supported mechanisms, compatible assumptions, relevant prior attempts, the new inferential step and a test that could reject it |
| Synthesize | Relevant branches, minority positions and exceptions; search beyond one connected component |
| Investigate | The consequential gap, the decision it could change and the most useful next check |

Use functional facets when they help connect a task to a mechanism. Do not force novelty or cross-domain transfer. Rank a small set of useful questions by decision value, uncertainty, dependencies and resolution cost; a sparse graph is not itself a valuable research gap. Preserve the wider backlog rather than treating an answer as permission to launch new work.

When accounts conflict, compare definitions, populations, timing, units, assumptions and method. Preserve genuine unresolved alternatives and explain what would decide between them. Missing applicability context remains unknown. Avoid automatic supersession by age, popularity, confident language or personal preference.

Reusable improvements can enter a normal authorized research change. The fact that an answer was generated successfully does not automatically validate it or authorize a new research campaign.
