# Public-facing status

RhymeLab's clean public repository is live at `Graph1ks/rhymelab`. It was published on 2026-09-17 from a sanitized parentless root commit; pre-public development history, old branches, historical pull requests, and private commit metadata are intentionally not part of the public repository.

The public workflow's required job/check name is `validate` and runs the source check, test suite, and public-readiness audit. `main` is protected by the active `main-protection` ruleset: changes require a pull request, `validate` must pass, the branch must be up to date before merge, force pushes/non-fast-forward updates and deletion are blocked, required approving reviews remain `0`, and there are no bypass actors.

The formally accepted German runtime baseline remains v0.10.0 with DB schema `rhymelab-local-db-v4`, analyzer `de-ipa-v2`, scorer `de-phon-v3`, relation policy `rhyme-relations-v2`, and accepted ranking `modern_entity_relative_commonness_1decade_0_05`. The accepted/base path remains available through `?ranking=legacy` on the current feature branch.

Feature branch `feat/deterministic-writer-ranking-v1` / draft PR #3 contains the current experimental deterministic writer-search stack:

- writer policy `deterministic_writer_utility_v6`;
- German right-edge/secondary-stress retrieval policy `de-right-edge-anchors-v1`;
- experimental multi-anchor writer scoring while leaving the legacy scorer endpoint unchanged;
- conservative inferred morphology-family policy `de-attested-right-head-v4`;
- explicit productive German adverbial/adjectival `-weise` construction rule `de-adverbial-weise-v2`;
- query-family suppression and result-set family diversification;
- deterministic lexical-safety tiers for unranked/very-low-usage/source-marked rare or historical candidates;
- explicit explanation/provenance payloads;
- browser Recommended ordering that preserves all `deterministic_writer_utility_*` policies;
- no LLM, ML, neural, hosted-ranking, telemetry, or runtime-network dependency.

Owner-local `Arbeitsweise` diagnostics established that legacy retrieval omitted `Hochzeitsreise`, while right-edge retrieval found it through secondary-anchor suffix channels. Direct legacy pair scoring was a usable slant (`0.7574`); the experimental secondary-stress writer domain identifies the final two syllables as a multisyllabic perfect right-edge match.

Writer v4 then solved repeated top-page lexical-head families, but a 12-query generalization audit exposed two broader defects: morphology v1 generated coincidental substring families (`Betriebe -> bet|riebe`, `Bestreben -> best|reben`, `Professoren -> profes|soren`, etc.), and the 360 audited top-page rows contained 69 unranked plus 60 usage-rank-over-100k results.

Writer v5 / morphology v2 sharply improved lexical safety: unranked top-30 rows fell from 69 to 2, explicit rare/historical rows from 2 to 0, and the earlier false splits disappeared. That safety layer remains in place.

The subsequent owner-local writer-v5 / morphology-v3 audit kept those safety gains (`2` unranked, `50` over 100k, `2` over 250k, `0` explicit rare/historical, `4` safety-demoted rows across 360 top rows) but proved that the first explicit `-weise` rule did not fire on real DB rows. `Arbeitsweise` still returned unresolved `stufenweise`, `ausnahmsweise`, `abschnittsweise`, `auszugsweise`, etc. Morphology v3 therefore failed its intended runtime validation even though source tests were green.

Root cause: the current publish/database model stores one selected lemma/POS analysis per surface form. Source entries such as `stufenweise` legitimately expose both adjective and adverb analyses, while equal-confidence analysis selection can retain either one. Morphology v4 therefore accepts the source-attested `adj`/`adv` ambiguity for the narrow `-weise` construction while preserving all existing false-split gates.

The same v3 page audit exposed a separate writer-ranking defect: generic edit similarity treated short orthographic perfect rhymes as lexical clones. Examples included `Liebe -> Diebe`, `Leben -> neben` and `Nacht -> macht`, causing perfect rhymes to be demoted behind weaker classes. Writer v6 removes edit similarity as standalone cheapness evidence for short rhyme-shaped words. Cheapness now requires same lemma, same morphology family, a long shared initial construction, or a genuinely long near-duplicate form.

Verbs and proper names remain unresolved until explicit deterministic rules exist. Missing usage remains `unranked_unknown`, not linguistic rarity.

The feature remains **draft / not accepted**. Public CI is green for writer v6 / morphology v4. Current validation priority is one owner-local rerun of `npm run diagnose:writer-pages`. If `-weise` family rotation works, the known false splits stay rejected, and short perfect rhymes remain above weaker rhyme classes, the next step is formal page-quality benchmark v2. Only after quality evidence stabilizes should validated right-edge/morphology fields be materialized/indexed for local/mobile performance.

See `PROJECT_STATE.json`, `docs/HANDOVER.md`, `docs/WRITER_RANKING.md`, `docs/REPOSITORY_GOVERNANCE.md`, and `docs/BENCHMARK.md` for the execution boundary.
