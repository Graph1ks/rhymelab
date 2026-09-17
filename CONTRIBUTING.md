# Contributing to RhymeLab

Contributions are welcome when they improve RhymeLab without changing its licensing model, provenance rules, or local-first architecture unless that change is explicitly discussed and accepted first.

## Before contributing

Please open an issue or discussion before starting substantial architectural work. Small bug fixes, tests, and documentation corrections may be submitted directly.

RhymeLab is source-available, not OSI Open Source. Graph1ks Material is governed by the repository's public noncommercial terms; third-party material keeps its original license.

## Contributor License Agreement

All code and documentation contributions require acceptance of [CLA.md](CLA.md). Before a pull request can be merged, the contributor must post this exact statement in the pull request discussion:

`I have read and agree to CLA.md for this contribution.`

This preserves Graph1ks' ability to maintain the public licensing model and offer separate commercial licenses for Graph1ks Material.

## Third-party material and data

Do not add copied code, corpora, dictionaries, generated datasets, model outputs, fonts, media, or other third-party material without documenting:

- source and canonical URL;
- applicable license/terms;
- required attribution;
- snapshot/version where applicable;
- whether redistribution and modification are permitted;
- any share-alike or notice requirements.

Never assume the repository's root license applies to third-party content. Update `THIRD_PARTY_NOTICES.md`, `DATA_SOURCES.md`, and any relevant directory/source manifest when adding licensed external material.

## Privacy and secrets

Never commit:

- API keys, access tokens, passwords, cookies, credentials, private keys, or `.env` files;
- personal email addresses or local user/profile paths;
- local databases, generated reports, benchmark review data, or downloaded raw corpora;
- private URLs or internal infrastructure details.

Run:

```bash
node scripts/public-readiness-audit.mjs
```

before requesting review.

## Engineering rules

- Preserve German-first scope until German single-word quality is stable.
- Keep runtime local-only unless a hosted architecture is explicitly approved.
- Keep ranking changes isolated from phonology/scorer/relation changes unless the task explicitly requires both.
- Preserve pronunciation/source provenance.
- Missing usage evidence must not be silently interpreted as linguistic rarity or obsolescence.
- Do not introduce telemetry, advertising, tracking, remote uploads, or hidden network behavior.
- Do not add dependencies without a clear technical need.
- Do not commit generated bulk data under `data/de/`, local SQLite, reports, or benchmark review/reference files.

## Validation

Before requesting review, run at minimum:

```bash
npm run check
npm test
node scripts/public-readiness-audit.mjs
```

Changes touching data/source policy should also run the relevant source/provenance tests and update the durable documentation.

The public GitHub Actions workflow must pass its `validate` job before merge. The durable branch/merge policy is documented in `docs/REPOSITORY_GOVERNANCE.md`.

## Pull-request policy

- Changes to public `main` are made through pull requests under the repository-governance policy.
- Keep one coherent concern per PR.
- Avoid unrelated refactors in feature/bug-fix PRs.
- Do not change licensing, third-party attribution, provenance, privacy behavior, CI permissions, network behavior, or public-data boundaries silently.
- Prefer deterministic tests and reproducible build steps.
- Use GitHub's privacy-protecting `noreply` commit address for public contributions if you do not want your personal email exposed in Git metadata.
- Do not rename the required `validate` CI job without updating the GitHub ruleset and `docs/REPOSITORY_GOVERNANCE.md` in the same change.
