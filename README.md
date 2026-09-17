# RhymeLab

German-first phonetic rhyme engine for songwriting and rap-writing tools.

RhymeLab is a **local-only** Node.js + SQLite project. The public repository contains source code, tests, benchmark plans, small curated fixtures, source/provenance manifests, and project documentation. Generated linguistic data, downloaded raw sources, benchmark queues/reviews/reference labels, reports, and the runtime SQLite database remain local and gitignored.

## Repository status

The public repository is intentionally created from a sanitized root commit. Pre-public development history, old branches, and old pull requests are not part of the public repository.

Repository state is authoritative for ongoing development. In a fresh development thread, read:

1. `AGENTS.md`
2. `docs/HANDOVER.md`
3. `STATUS.md`
4. `PROJECT_STATE.json`
5. `ROADMAP.md`
6. `DATA_SOURCES.md`
7. `docs/REPOSITORY_GOVERNANCE.md`
8. `docs/BENCHMARK.md`
9. `docs/API.md`

## Repository governance

The public `main` branch is governed by `docs/REPOSITORY_GOVERNANCE.md`. Project policy requires pull-request-based changes, successful `validate` CI, an up-to-date branch before merge, and protection against force pushes and deletion.

GitHub-side activation of the `main` ruleset requires repository-admin settings and is tracked in issue #1. Until that issue is closed, the governance policy is documented but is not fully enforced by GitHub branch protection.

## Current runtime baseline

The last formally accepted German runtime/data baseline remains RhymeLab `v0.10.0`:

- DB schema `rhymelab-local-db-v4`;
- analyzer `de-ipa-v2`;
- scorer `de-phon-v3`;
- relation policy `rhyme-relations-v2`;
- 838,209 forms / 904,836 pronunciations;
- 838,209 preferred / 66,627 alternates;
- accepted report `ok`, 5/5 QA gates;
- accepted tests 58/58 across 20 files.

The current source contains the validated v3 ranking promotion for normal all-result ranked requests. Formal baseline/version advancement remains pending the owner-local post-promotion acceptance report documented in `docs/BENCHMARK.md`.

## Local run

Requirements:

- Node.js 22.5+
- a locally built RhymeLab SQLite database at `data/local/rhymelab.sqlite`

Run:

```powershell
npm run dev
```

Open:

```text
http://127.0.0.1:3030
```

For a full local rebuild/report/launch:

```powershell
npm run local:run
```

## Tests and public-readiness checks

```powershell
npm run check
npm test
node scripts/public-readiness-audit.mjs
```

The public GitHub Actions workflow runs the same source/test/privacy checks on `main`, pull requests, and manual dispatch. Its required job/check name is `validate`.

## Data and provenance

RhymeLab deliberately separates linguistic/source evidence from product policy.

Current German source families include:

- Leipzig Corpora Collection for usage/frequency evidence;
- German Wiktionary via Kaikki/Wiktextract for attested pronunciation and lexical metadata;
- a small curated modern-entity pronunciation layer maintained by RhymeLab.

Raw third-party snapshots and generated bulk datasets are not committed. See `DATA_SOURCES.md` and `THIRD_PARTY_NOTICES.md` for the exact provenance/licensing boundaries.

## Rhyme model

Primary rhyme classes are exclusive:

- `multisyllabic_perfect`
- `perfect`
- `multisyllabic_slant`
- `family`
- `slant`

Assonance and Consonance are independent overlapping relations. Usage rank is a product-ordering signal, not phonological truth. Missing usage means unranked/unknown, not automatically rare.

Pronunciation variants are first-class and provenance-bearing. Preferred eligible pronunciations drive default search; historical-only vocabulary is hidden by default and explicitly opt-in.

## Benchmark

Current German benchmark: `de-human-rhyme-v1`.

Current reviewed universe: 367/367, 0 skipped.

Formally accepted v0.10 ranking baseline:

- NDCG: `0.9562`
- pairwise concordance: `0.8350`

The current v3 ranking source promotion and its final acceptance gate are documented in `docs/BENCHMARK.md`.

## Licensing

RhymeLab is **source-available, not OSI Open Source**.

Graph1ks Material is made available under:

- PolyForm Noncommercial License 1.0.0; plus
- the project-specific no-monetization condition in `LICENSE`.

Commercial or monetized use of Graph1ks Material requires a separate written commercial license. Project-connected donations/tips, Patreon/Ko-fi-style funding, sponsorships, ads, affiliate revenue, paid hosting/support, and similar monetization are treated as requiring commercial permission.

Third-party material is **not relicensed** by the repository root license. It keeps its original license and attribution requirements. See:

- `LICENSE`
- `COMMERCIAL_LICENSE.md`
- `THIRD_PARTY_NOTICES.md`
- `DATA_SOURCES.md`

## Contributing

Contributions are welcome under the rules in `CONTRIBUTING.md`. Code/documentation contributions require explicit acceptance of `CLA.md` before merge so Graph1ks can continue the public noncommercial/source-available model and offer separate commercial licenses for Graph1ks Material.

Never commit credentials, personal data, raw third-party corpora, generated local databases, benchmark review/reference files, or generated reports.

## Current roadmap

German single-word quality remains the priority. After the current ranking acceptance gate, the next planned work is pronunciation/lexical-quality diagnostics, then phrase/mosaic rhyme. English remains separate and will receive its own pronunciation/source pipeline, parser/canonicalizer, phonology profile, thresholds, and benchmark.
