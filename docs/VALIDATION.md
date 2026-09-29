# Validation status

The local development installation is Windows with Ubuntu WSL2, regular FalkorDB and CPU QMD. This repository is a reusable source baseline; not every deployment option has been provisioned on a fresh machine.

| Evidence | Result and boundary |
|---|---|
| Automated suite after portability changes | 39 tests passed: canonical integrity, scope, lifecycle/recovery, source workflow, uncertain paid-request handling, native/selected-WSL argument routing, configurable state and no-overwrite setup |
| TypeScript build | Passed with the version-guarded FalkorDB client patch and generated schema types |
| Bundled schemas/configuration | Engine contract hashes, corpus example and relative links checked by packaging script |
| Isolated staged checkout | All 39 tests and package checks passed from the files selected for Git, with the existing locked dependency installation shared; private sibling research fixtures/configuration were absent |
| External-server profile | Authenticated PONG from the existing local FalkorDB using a separate state/configuration and `falkordb-external`; no graph modification or new service provisioning |
| Original local book/video tools | Earlier synthetic native video-frame/crop and PDF page-rendering checks passed; paid requests were mocked |
| Original local graph/search/wiki | Previously exercised publication, graph reconstruction, QMD lexical/semantic retrieval and wiki projection |
| Real long books/videos | No general throughput or mastery claim; representative full-source acceptance is still required |
| Paid speech requests | No paid transcription performed during packaging |
| Docker/native service provisioning | Not performed. External-server connection support does not establish image setup, restart or persistence correctness |
| Other harnesses / shared writers | Not validated or enabled by this packaging work |

Run `npm test`, `npm run build` and `npm run check:package` on a new checkout. Pure text fixture tests do not require the primary personal corpus. Live conversion, database, model/search and MCP checks need configured dependencies and must report their own outcomes.

Small earlier application checks distinguished source-only and full-library answer paths but did not demonstrate broad expert mastery or consistent superiority. Structural correctness, faithful source reconstruction and independent application are separate validation targets.
