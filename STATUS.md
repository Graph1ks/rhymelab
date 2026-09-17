# Public-facing status

RhymeLab's clean public repository is live at `Graph1ks/rhymelab`. It was published on 2026-09-17 from a sanitized parentless root commit; pre-public development history, old branches, historical pull requests, and private commit metadata are intentionally not part of the public repository.

The public workflow's required job/check name is `validate` and runs the source check, test suite, and public-readiness audit. `main` is protected by the active `main-protection` ruleset: changes require a pull request, `validate` must pass, the branch must be up to date before merge, force pushes/non-fast-forward updates and deletion are blocked, required approving reviews remain `0`, and there are no bypass actors.

The formally accepted German runtime baseline remains v0.10.0 with DB schema `rhymelab-local-db-v4`, analyzer `de-ipa-v2`, scorer `de-phon-v3`, relation policy `rhyme-relations-v2`, and accepted ranking `modern_entity_relative_commonness_1decade_0_05`. The accepted/base path remains available through `?ranking=legacy` on the current feature branch.

Feature branch `feat/deterministic-writer-ranking-v1` / draft PR #3 contains the current experimental deterministic writer-search stack:

- writer policy `deterministic_writer_utility_v5`;
- German right-edge/secondary-stress retrieval policy `de-right-edge-anchors-v1`;
- experimental multi-anchor writer scoring while leaving the legacy scorer endpoint unchanged;
- conservative inferred morphology-family policy `de-attested-right-head-v3`;
- explicit productive German adverbial `-weise` construction rule `de-adverbial-weise-v1`;
- query-family suppression and result-set family diversification;
- deterministic lexical-safety tiers for unranked/very-low-usage/source-marked rare or historical candidates;
- explicit explanation/provenance payloads;
- browser Recommended ordering that preserves all `deterministic_writer_utility_*` policies;
- no LLM, ML, neural, hosted-ranking, telemetry, or runtime-network dependency.

Owner-local `Arbeitsweise` diagnostics established that legacy retrieval omitted `Hochzeitsreise`, while right-edge retrieval found it through secondary-anchor suffix channels. Direct legacy pair scoring was a usable slant (`0.7574`); the experimental secondary-stress writer domain identifies the final two syllables as a multisyllabic perfect right-edge match.

Writer v4 then solved repeated top-page lexical-head families, but a 12-query generalization audit exposed two broader defects: morphology v1 generated coincidental substring families (`Betriebe -> bet|riebe`, `Bestreben -> best|reben`, `Professoren -> profes|soren`, etc.), and the 360 audited top-page rows contained 69 unranked plus 60 usage-rank-over-100k results.

The owner-local v5 / morphology-v2 rerun showed that lexical safety improved sharply: unranked top-30 rows fell from 69 to 2, usage-rank-over-100k rows from 60 to 51, explicit rare/historical rows from 2 to 0, and mean elapsed time from 1583.4 ms to 1428.3 ms. The earlier false splits such as `Betriebe -> bet|riebe` and `Bestreben -> best|reben` disappeared.

That rerun also exposed a conservative-morphology blind spot: productive adverbial `-weise` forms such as `schätzungsweise`, `stellenweise`, `paarweise` and `beispielsweise` became unresolved, so `Arbeitsweise` was again dominated by same-construction rows while the formal repeated-family counter stayed at zero. Morphology v3 therefore adds one narrow deterministic construction rule: an adverb ending in independently attested noun `Weise`, with measured left-side lexical evidence, receives family `right:weise`. Generic suffix similarity is still not accepted as morphology.

Verbs and proper names remain unresolved until explicit deterministic rules exist. Missing usage remains `unranked_unknown`, not linguistic rarity.

The feature remains **draft / not accepted**. Public CI is green for the v3 implementation. Current validation priority is one owner-local rerun of `npm run diagnose:writer-pages` on writer v5 / morphology v3. If the `-weise` family is restored without reintroducing false splits, the next step is formal page-quality benchmark v2. Only after quality evidence stabilizes should validated right-edge/morphology fields be materialized/indexed for local/mobile performance.

See `PROJECT_STATE.json`, `docs/HANDOVER.md`, `docs/WRITER_RANKING.md`, `docs/REPOSITORY_GOVERNANCE.md`, and `docs/BENCHMARK.md` for the execution boundary.
