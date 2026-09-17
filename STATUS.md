# Public-facing status

RhymeLab's clean public repository is live at `Graph1ks/rhymelab`. It was published on 2026-09-17 from a sanitized parentless root commit; pre-public development history, old branches, historical pull requests, and private commit metadata are intentionally not part of the public repository.

The public workflow's required job/check name is `validate` and runs the source check, test suite, and public-readiness audit. `main` is protected by the active `main-protection` ruleset: changes require a pull request, `validate` must pass, the branch must be up to date before merge, force pushes/non-fast-forward updates and deletion are blocked, required approving reviews remain `0`, and there are no bypass actors.

The current formally accepted German runtime baseline remains v0.10.0 with DB schema `rhymelab-local-db-v4`, analyzer `de-ipa-v2`, scorer `de-phon-v3`, and relation policy `rhyme-relations-v2`. The accepted/base path remains available unchanged through `?ranking=legacy` on the current feature branch.

Feature branch `feat/deterministic-writer-ranking-v1` / draft PR #3 has advanced beyond the initial writer-v1 prototype during owner-local live-data validation. The current experimental writer path contains:

- deterministic writer policy `deterministic_writer_utility_v4`;
- German right-edge/secondary-stress retrieval policy `de-right-edge-anchors-v1`;
- experimental multi-anchor writer scoring while leaving the legacy scorer endpoint unchanged;
- deterministic attested right-head lexical-family evidence `de-attested-right-head-v1`;
- query-family suppression and result-set family diversification;
- explicit explanation/provenance payloads;
- browser Recommended ordering that preserves all `deterministic_writer_utility_*` policies;
- no LLM, ML, neural, hosted-ranking, telemetry, or runtime-network dependency.

Owner-local `Arbeitsweise` diagnostics established that legacy retrieval omitted `Hochzeitsreise`, while right-edge retrieval found it through secondary-anchor suffix channels. Direct legacy pair scoring was a usable slant (`0.7574`); the experimental secondary-stress writer domain identifies the final two syllables as a multisyllabic perfect right-edge match. The subsequent live page exposed true but repetitive morphological families (`-weise`, `-reise`, `-preise`, `-kreise`, `-speise`, `-gleise`), motivating the current morphology-family layer instead of further spelling-based diversity heuristics.

`Notfallbleibe`, an earlier illustrative example, is absent from the current local lexicon and is therefore a lexical-coverage case rather than a ranking/retrieval regression.

The feature remains **draft / not accepted**. Current validation priority is owner-local live review of v4 morphology-family ordering, then broader page-quality benchmarking and performance/materialization work before any promotion.

See `PROJECT_STATE.json`, `docs/HANDOVER.md`, `docs/WRITER_RANKING.md`, `docs/REPOSITORY_GOVERNANCE.md`, and `docs/BENCHMARK.md` for the execution boundary.
