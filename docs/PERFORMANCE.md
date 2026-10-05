# Performance and its limits

These are small local measurements, not capacity guarantees for arbitrary libraries. Unless a section says otherwise, they were taken on Windows 11 with a Ryzen 9 7950X, 32 GB RAM and only an integrated GPU, with regular FalkorDB in Ubuntu WSL2 and QMD 2.8.3 forced to the CPU.

## 2026-10-05: recall, brief and connect (1.2.0)

`kb_recall`, `kb_brief` and `kb_connect` share one in-process index per process. It is built on first use from the published release and cached by the store's session signature, the release and the scope, so a new publication or a scope change rebuilds it. The index holds BM25 over titles, summaries and bodies, the link map with its labels and weights, and the visibility and reliance rules. It needs neither FalkorDB nor QMD. Recall calls QMD's semantic search only when keyword coverage of the query is below 0.7 or keyword search finds fewer than five accounts.

Measured on a copy of the three-source acceptance library (182 records, release `release-6eabd081`):

| Call | Time | Output |
|---|---:|---:|
| `kb_recall`, ten frozen cases, semantic search skipped as unnecessary on all ten | 7-180 ms per call | 6,100-11,900 estimated tokens |
| Packet route on the same ten cases, for comparison | 2.9-3.7 s per call (semantic search on every call) | 18,400-80,100 estimated tokens |
| First `kb_connect` in a fresh process, including the index build | 146 ms | 3,129 characters |
| Repeated `kb_connect` with a target, three different pairs | 1-4 ms | 2,779-3,352 characters |
| Repeated `kb_connect` without a target (outward), including `max_hops: 6` | 3-9 ms | about 5,950 characters |

Estimated tokens are characters divided by four. The slowest recall call includes the index build. The `kb_connect` path search stops after 60,000 expansions, so its cost on a dense library is bounded, but no large library has been measured. Memory use of the index wasn't measured. The quality side of the recall comparison is in [VALIDATION.md](VALIDATION.md).

A job response through MCP fell from 117,069 to 3,633 characters for a 121-unit job, because MCP now renders a compact summary and returns the raw JSON only on `detail:"full"`.

## 1.0.2: streaming source hashes

The 1.0.2 repair streams whole-source hashing and immutable registration copies instead of loading complete media files into memory. A requested batch of frames or pages shares one verified source hash and checks file identity around each extraction. That removes repeated whole-file reads within a batch. No new multi-gigabyte throughput or peak-memory benchmark is claimed. The measurements below are the dated 1.0.1 results from 29 September 2026.

## Canonical retrieval (1.0.1)

The synthetic libraries and queries from the earlier adapter audit were run again. Complete returned packets matched the saved baseline once request ids and timing fields were excluded. This comparison ran before the engine version bump, and new receipts correctly name the newer engine.

| Records | Earlier repeated retrieval | First request in a fresh Store | Repeated requests |
|---:|---:|---:|---:|
| 25 | 192-212 ms | 122 ms | 11-14 ms |
| 250 | 1,688-1,757 ms | 80 ms | 28-35 ms |
| 1,000 | 6,612-6,876 ms | 213 ms | 97-103 ms |

This measures canonical retrieval with the graph and QMD unavailable or disabled, including policy and dependency handling. A fresh Store is not a cold computer: OS caches and schema compilation in the process can already be warm. Tiny samples and filesystem variation explain why the first 250-record request beat the first 25-record request. Don't interpolate a capacity curve from these numbers.

The change removed repeated file parsing, validation and duplicate work within a request, and limits independent filesystem reads to 16 at a time. It still scans record metadata and relevant text, so it is not sublinear retrieval at arbitrary scale.

## Cache boundary

The default cache allowance is an estimated 64 MiB per Store, with at most 20,000 entries. Each entry is charged four times its raw byte size plus 1 KiB. That is an accounting estimate, not a hard limit on Node's heap, the current request, QMD or FalkorDB. The 1,000-record fixture used about 11.8 MB of the estimated allowance.

Access bindings, source restrictions, deletion policy, generation and CURRENT never come from this cache. Changed controls invalidate it, and a control change during retrieval rejects the result. Canonical contents are reused only after path checks and a bigint file fingerprint check (device, identity, size, modification and change times). Changed files are reread, hashed and validated. On the tested local filesystem, a same-length edit with its modification time restored is still caught by the change time. This is no defense against a privileged actor who falsifies all filesystem metadata. Parsed records are returned as clones, so a caller's uncommitted edit can't poison shared cache entries.

Regression tests cover warm-cache corrections, withdrawal, historical retrieval, removed files, metadata and prose changes, narrowed scope, revoked bindings, missing or mismatched deletion ledgers, policy changes during a query, eviction and directory-junction replacement.

## Graph projection (1.0.1)

Live FalkorDB rebuilds used separate random graph names and compared complete sorted lists of dependency and relationship edges with the previous writer. Only those temporary graphs were removed afterward.

| Nodes | Edges | Previous writer | Batched writer |
|---:|---:|---:|---:|
| 25 | 76 | 74 ms | 37 ms |
| 250 | 760 | 371 ms | 61 ms |
| 1,000 | 3,040 | 1,396 ms | 313 ms |

The writer sends up to 256 rows per query, checks node and edge counts, then writes the projection marker. An interrupted or incomplete build can't mark itself ready. These numbers cover graph writing only, not document conversion, embedding, full publication or service startup.

## QMD search (1.0.1)

The worker uses the pinned official QMD SDK instead of launching the CLI for every lookup. For one unchanged query against an existing small local library, hit order matched and scores matched to the CLI's two-decimal display precision. Three sequential runs, without the concurrent PDF conversion that spoiled earlier exploratory timings, gave:

| Route | CLI per query | Worker first request | Worker repeats |
|---|---:|---:|---:|
| Lexical | 149-154 ms | 117 ms | 5.5-7.0 ms |
| Semantic, no reranking | 3,213-3,270 ms | 2,830 ms | 2,329-2,469 ms |

The semantic model still runs on the CPU. The worker keeps imported code but closes the database and model handles after every request, so Windows can rebuild or purge and an old open database is never served. It exits after 60 seconds idle. Failures and timeouts end it, and the next request can start it again. No extra service, cloud database or paid embedding API is involved. Explicit reranking stays optional and wasn't benchmarked.

The same audit found a correctness bug. QMD can return a URL with an `?index=...` suffix, and the old mapper dropped those hits while keyword fallback still returned plausible answers. The mapper now strips QMD URL suffixes before resolving canonical records. A regression test uses a semantic-only hit with no literal overlap with the query, which proves the index really contributes. Earlier successful answers alone never showed that.

In the source acceptance run, rebuilding 71 revised wiki documents took roughly another 7.5 minutes of CPU embedding. QMD kept orphaned embeddings from earlier document versions until cleanup. The faster lookup doesn't remove rebuild cost or compact the cache automatically, so repeated full-library revisions need storage and embedding monitoring. Canonical originals and historical records follow their own deliberate retention policy.

Private benchmark scripts, raw packets and acceptance inputs stay out of Git. What transfers is the method, the results and the limits here, plus the automated tests. Results on real sources are in [VALIDATION.md](VALIDATION.md).

## 2026-10-04: reading cost is the whole trajectory (1.1.0)

Version 1.1.0 added summary-led discovery, selected complete-account reads, batches and sections. The API and CLI keep the structured reading contract. MCP presents shared scopes and assessment definitions once, while keeping complete prose, source locators, warnings and exact references. That avoids repeated metadata without cutting an explanation to hit a token target.

The real-source comparison holds the 109-record foundational release constant across three conditions: fixed packet, progressive with graph, and progressive with prose only. Every answer uses the same model alias, medium reasoning, a 1,000-word limit and a 300,000-token cumulative input ceiling. Progressive tool calls, delivered characters and wall time are capped. The token ceiling is checked after completion, and overruns stay in the results. Cached input counts as measured input. Grader usage is recorded separately.

Intermediate runs showed why response size alone misleads: a smaller response could still cost more total model input through extra reads and repeated context. The final comparison and the adoption decision are in [VALIDATION.md](VALIDATION.md). Earlier measurements of expanded JSON size estimated that representation, not the exact MCP presentation; final reading receipts hash and measure the actual compact presentation. The local lookup timings above answer a different question from total model reading cost.
