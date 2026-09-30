# Performance and its limits

The 1.0.2 repair streams whole-source hashing and immutable registration copies instead of loading complete media files into memory. A requested frame/page batch shares one verified source hash and checks file identity around each extraction. These changes remove repeated whole-file reads within a batch; no new multi-gigabyte throughput or peak-memory benchmark is claimed. The measurements below remain the dated 1.0.1 results.

Measured on 2026-09-29 on Windows 11, Ryzen 9 7950X, 32 GB RAM, integrated GPU only, regular FalkorDB in Ubuntu WSL2 and QMD 2.8.3 forced to CPU. These are small local measurements, not capacity guarantees for arbitrary libraries.

## Canonical retrieval

The same synthetic libraries and queries used for the earlier adapter audit were repeated. Complete returned packets matched the saved baseline after excluding request identifiers and timing fields. This comparison preceded the engine-version bump; new receipts correctly identify the newer engine.

| Records | Previous repeated retrieval | New first request in a fresh Store | New repeated requests |
|---:|---:|---:|---:|
| 25 | 192–212 ms | 122 ms | 11–14 ms |
| 250 | 1,688–1,757 ms | 80 ms | 28–35 ms |
| 1,000 | 6,612–6,876 ms | 213 ms | 97–103 ms |

This measures canonical retrieval with graph and QMD unavailable/disabled, including policy and dependency handling. A fresh Store is not a cold computer: OS caches and process-level schema compilation can already be warm. Tiny samples and filesystem variation explain why the first 250-record request was faster than the first 25-record request. Do not interpolate a capacity curve from these numbers.

The change removes repeated file parsing, validation and duplicate work during a request, and bounds independent filesystem reads to 16 at a time. It still scans record metadata and relevant text; it is not sublinear retrieval at arbitrarily large scale.

## Cache boundary

The default cache allowance is an estimated 64 MiB per Store, with at most 20,000 entries. Each entry is charged four times its raw byte size plus 1 KiB. This is an accounting estimate, not a hard bound on Node's heap, current request, QMD or FalkorDB. The 1,000-record fixture used about 11.8 MB of estimated cache allowance.

Access bindings, source restrictions, deletion policy, generation and CURRENT are not served from this cache. Changed controls invalidate it; a control change during retrieval rejects the result. Canonical contents are reused only after path checks and a bigint file fingerprint check (device, identity, size, modification and change times). Changed files are reread, hashed and validated. A same-length edit with its modification time restored is detected by the tested local filesystem's change time. This is not a defense against a privileged actor falsifying all filesystem metadata. Returned parsed records are cloned to prevent a caller's uncommitted edit from poisoning shared cache entries.

Regression tests cover warm-cache corrections, withdrawal, historical retrieval, removed files, metadata/prose changes, narrowed scope, revoked bindings, missing or mismatched deletion ledgers, policy changes during a query, eviction and directory-junction replacement.

## Graph projection

Live FalkorDB rebuilds used separate random graph names and compared complete sorted dependency/relationship edge lists with the previous writer. Only those temporary graphs were removed afterward.

| Nodes | Edges | Previous writer | Batched writer |
|---:|---:|---:|---:|
| 25 | 76 | 74 ms | 37 ms |
| 250 | 760 | 371 ms | 61 ms |
| 1,000 | 3,040 | 1,396 ms | 313 ms |

The writer sends up to 256 rows per query, checks node and edge counts, then writes the projection marker. Interrupted or incomplete builds cannot mark themselves ready. These measurements cover graph writing, not document conversion, embedding, full publication or service startup.

## QMD search

The worker uses the pinned official QMD SDK rather than launching its CLI for every lookup. For one unchanged query against an existing small local corpus, hit ordering matched and scores matched to the CLI's two-decimal display precision. Three sequential runs, without the concurrent PDF conversion used in discarded exploratory timings, gave:

| Route | CLI per query | New worker first request | New worker repeats |
|---|---:|---:|---:|
| Lexical | 149–154 ms | 117 ms | 5.5–7.0 ms |
| Semantic, no reranking | 3,213–3,270 ms | 2,830 ms | 2,329–2,469 ms |

The semantic model still runs on the CPU. The worker retains imported code, but closes the database and model handles after every request to allow Windows rebuilds/purges and avoid serving an old open database. It exits after 60 seconds idle; failures and timeouts terminate it, and later requests can restart it. No extra service, cloud database or paid embedding API is introduced. Explicit reranking remains optional and was not benchmarked here.

The audit also found a correctness defect: QMD can return a URL with an `?index=...` suffix. The previous mapper discarded those hits while keyword fallback still returned plausible answers. The mapper now removes QMD URL suffixes before resolving canonical records. A regression uses a semantic-only hit with no literal query overlap, proving indexed evidence actually contributes. Earlier successful-answer checks alone therefore did not establish that the index had contributed.

In the source acceptance run, rebuilding 71 revised wiki documents took roughly another 7.5 minutes of CPU embedding. QMD retained orphaned embeddings from previous document versions until cleanup. The lookup optimization does not eliminate rebuild cost or provide automatic cache compaction; repeated full-library revisions need storage/embedding monitoring. Canonical originals and historical records have a separate intentional retention policy.

Private benchmark scripts, raw packets and acceptance inputs remain excluded from Git. The transferable evidence is the methodology, results and limitations here, plus the automated regression suite. Real-source application results are recorded in [validation](VALIDATION.md).
