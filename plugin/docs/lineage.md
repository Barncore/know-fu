# Design lineage

[Overview](../../README.md) · [How it works](architecture.md)

Know Fu borrowed ideas from many places and depends on almost none of them. This page keeps three things apart: what the code runs on, where the ideas came from, and what the 0.6 design claims on the strength of research. An influence is not a dependency, and none of these systems is bundled or installed.

## What the code runs on

Node (22.18 or newer) with its built-in `node:sqlite`, and three optional command-line tools: Poppler for PDFs, pandoc for EPUB, DOCX and HTML, and FFmpeg for audio and video. Nothing else. No code was copied from the projects below.

## Where the ideas came from

| Influence | What Know Fu took | Where it stops |
|---|---|---|
| [Andrej Karpathy's LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | A body of synthesized knowledge that an LLM maintains, that improves as sources arrive, with immutable raw sources underneath | The origin of the whole approach. Know Fu adds the principles layer, the delta rule and a checker |
| [Ars Contexta, Reweave](https://github.com/agenticnotetaking/arscontexta) | A new source revisits the older explanations it affects | In 0.6 this is the account revised in place, and the five outcomes in the ingest guide |
| [nvk/llm-wiki](https://github.com/nvk/llm-wiki) | Raw is immutable; articles are synthesized, not copied; honest gaps; an activity log; indexes are a derived cache; frontmatter is structured data | Principles the owner picked out early. 0.6 follows all of them |
| [LLM Wiki v2 by rohitg00](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2) | Supersession with a reason, consolidation, an audit trail | Supersession is `status: retired` with a reason; the audit trail is git |
| Chi, Feltovich and Glaser (1981), "Categorization and representation of physics problems by experts and novices" | Experts sort problems by governing principle, novices by surface features | The reason the topic page is organized by principle |
| [Discourse Graphs](https://joelchan.me/assets/pdf/Discourse_Graphs_for_Augmented_Knowledge_Synthesis_What_and_Why.pdf) | Links among claims, evidence and questions that a reader can inspect | In 0.6 the links are written in the accounts, with a verb and a reason, and there are no separate relationship records |
| [Memory Graph](https://github.com/memory-graph/memory-graph) and [ste-bah](https://github.com/ste-bah)'s fork | The idea that sparked the project: knowledge as connected nodes with typed relationships | Know Fu has never run Memory Graph. Since 0.6 it has no relationship records either; `kf_connect` walks the links in the files |
| [Archon](https://github.com/ste-bah/archon-cli) by ste-bah | Check quotes against the source text; return conflicts with the answer | The checker's quote rule, and recall's rule that a disputing account always travels with what it disputes |
| [Hindsight](https://github.com/vectorize-io/hindsight) | Pack results in rank order to a token budget and say what didn't fit | `kf_recall`'s budget |
| [Scideator](https://arxiv.org/abs/2409.14634) | State a mechanism by what it does, so another field can recognize it | Principles are written that way; the invention moves in the use guide |
| Agent Skills (Anthropic) | A short body loaded first, references read on demand | The shape of a topic: the page, then accounts, then sources |
| The owner's earlier book and video ingestion work | Exact locators, looking at the page when a figure matters, keeping what a speaker shows apart from what they assert | The ingest guide's rules for figures, tables and recordings |

## Research the 0.6 design leans on

Each row says how the finding was read. "Owner's research wiki" means the paper was read in full and graded in the owner's own wiki of AI research. "Subagent web read, 10 November 2026" means a research subagent read the page through a fetch tool and reported it; the quotes were not re-checked against the papers, so treat those rows as leads to verify before building on them further.

| Finding | Source | How it was read | What it supports |
|---|---|---|---|
| Skills that models wrote for themselves scored below having none; curated skills helped, most in fields that pretraining covers poorly; focused beat comprehensive | SkillsBench, [arXiv 2602.12670](https://arxiv.org/abs/2602.12670) | Owner's research wiki, grade B | The delta rule; small focused accounts |
| LLM-written context files were neutral to slightly harmful and cost over 20% more; they helped only when the repository's own docs were removed | [arXiv 2602.11988](https://arxiv.org/abs/2602.11988) | Owner's research wiki, grade B | The delta rule |
| A strong model held steady under unrelated extra text and dropped with related text | A practitioner test on Claude Opus 5, in the owner's research wiki, grade C | Owner's research wiki | One account per idea, not many near-matching notes |
| A wiki an LLM compiled beat single-round retrieval at connecting findings across papers, at many times the query tokens; splitting the question closed most of the gap | [arXiv 2605.18490](https://arxiv.org/abs/2605.18490) | Subagent web read | Compiling across sources; sub-questions in recall |
| An agent using grep and file reads beat a strong embedding retriever on a research benchmark, degrading only past about 100,000 documents | [arXiv 2605.05242](https://arxiv.org/abs/2605.05242) | Subagent web read | Lexical search, no embeddings at this size |
| Over a 709-page wiki, a capable agent never loaded the large index; a keyword-ranked tool returning page gists matched quality at 30% to 58% lower cost | [arXiv 2607.04576](https://arxiv.org/abs/2607.04576) | Subagent web read; an earlier version was read for the 1.1.0 plan on 2 October 2026 | Gists in recall; pinning loads principles, never the catalogue |
| Atomic propositions were the worst retrieval unit tested; coherent chunks won (weak reader model) | [arXiv 2606.00881](https://arxiv.org/abs/2606.00881) | Subagent web read | The account as the unit |
| Wikis compiled without checking scored far below raw context; a refinement pass against probes recovered most of the loss (weak model) | [arXiv 2605.07068](https://arxiv.org/abs/2605.07068) | Subagent web read | The probe check stage |
| Two people who ran LLM-maintained wikis for six months: stale reference sections, duplicate pages, orphans and dead links, no locking between writers; both kept an immutable raw layer | Practitioner posts (August and May 2026) | Subagent web read | The checker's duplicate, link and drift rules; the write lock |

What the research doesn't show: no 2026 study tests a principles page against the same accounts without one, and none compares a typed graph with prose links on a strong model at matched cost. Those parts of the design rest on the reasoning in [the rebuild record](../../docs/REBUILD.md) and on Know Fu's own comparison there.

## Left out on purpose

- **A graph database, typed relationship records, embeddings and a reranker.** See [how it works](architecture.md#why-there-are-no-embeddings).
- **`analogous_to` links.** An analogy worth keeping is an idea, with both accounts as its premises (owner's decision, 6 October 2026).
- **Confidence scores.** A number invites false precision. An account carries its `basis`, a principle says which sources hold it and whether they state it, and prose says what kind of evidence a source rests on.
- **Automatic memory of sessions.** Know Fu holds what the owner chose to feed it. Operational and project memory belong in a separate tool.
