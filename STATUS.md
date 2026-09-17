# Public-facing status

RhymeLab's clean public repository is live at `Graph1ks/rhymelab`. It was published on 2026-09-17 from a sanitized parentless root commit; pre-public development history, old branches, historical pull requests, and private commit metadata are intentionally not part of the public repository.

The public workflow's required job/check name is `validate` and runs the source check, test suite, and public-readiness audit. `main` is protected by the active `main-protection` ruleset: changes require a pull request, `validate` must pass, the branch must be up to date before merge, force pushes/non-fast-forward updates and deletion are blocked, required approving reviews remain `0`, and there are no bypass actors.

The formally accepted German runtime baseline remains v0.10.0 with DB schema `rhymelab-local-db-v4`, analyzer `de-ipa-v2`, scorer `de-phon-v3`, relation policy `rhyme-relations-v2`, and accepted ranking `modern_entity_relative_commonness_1decade_0_05`. The accepted/base path remains available through `?ranking=legacy` on the current feature branch.

Feature branch `feat/deterministic-writer-ranking-v1` / draft PR #3 contains the current experimental deterministic writer-search stack:

- writer policy `deterministic_writer_utility_v5`;
- German right-edge/secondary-stress retrieval policy `de-right-edge-anchors-v1`;
- experimental multi-anchor writer scoring while leaving the legacy scorer endpoint unchanged;
- conservative inferred right-head morphology-family policy `de-attested-right-head-v2`;
- query-family suppression and result-set family diversification;
- deterministic lexical-safety tiers for unranked/very-low-usage/source-marked rare or historical candidates;
- explicit explanation/provenance payloads;
- browser Recommended ordering that preserves all `deterministic_writer_utility_*` policies;
- no LLM, ML, neural, hosted-ranking, telemetry, or runtime-network dependency.

Owner-local `Arbeitsweise` diagnostics established that legacy retrieval omitted `Hochzeitsreise`, while right-edge retrieval found it through secondary-anchor suffix channels. Direct legacy pair scoring was a usable slant (`0.7574`); the experimental secondary-stress writer domain identifies the final two syllables as a multisyllabic perfect right-edge match.

Writer v4 then solved repeated top-page lexical-head families, but a 12-query generalization audit exposed two broader defects: morphology v1 generated coincidental substring families (`Betriebe -> bet|riebe`, `Bestreben -> best|reben`, `Professoren -> profes|soren`, etc.), and the 360 audited top-page rows contained 69 unranked plus 60 usage-rank-over-100k results. Writer v5 / morphology v2 were introduced from this evidence rather than further tuning `Arbeitsweise`.

Morphology v2 is deliberately conservative: noun/adjective head POS must agree, the whole lemma must end in the right-head lemma, left evidence must have measured usage, and verbs/proper names stay unresolved until explicit deterministic rules exist. Writer v5 separately treats missing usage as `unranked_unknown` rather than linguistic rarity while conservatively lowering its default-page priority.

The feature remains **draft / not accepted**. Current validation priority is the owner-local rerun of `npm run diagnose:writer-pages` on v5/v2, followed by formal page-quality benchmark v2. Only after quality evidence stabilizes should validated right-edge/morphology fields be materialized/indexed for local/mobile performance.

See `PROJECT_STATE.json`, `docs/HANDOVER.md`, `docs/WRITER_RANKING.md`, `docs/REPOSITORY_GOVERNANCE.md`, and `docs/BENCHMARK.md` for the execution boundary.
