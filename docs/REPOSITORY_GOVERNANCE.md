# Repository governance

This document defines the public GitHub governance policy for `Graph1ks/rhymelab`.

## Public history boundary

The public repository was created on 2026-09-17 from a sanitized parentless root commit. Pre-public commits, branches, pull requests, personal commit metadata, and private-development history remain outside the public repository.

The public repository is the authoritative source repository for ongoing development. The private pre-public archive is retained only for historical/recovery purposes and must never be pushed into the public repository.

## `main` branch policy

`main` is the protected integration branch. The intended GitHub ruleset is:

- changes reach `main` through a pull request;
- the required GitHub Actions status check is `validate` from `.github/workflows/ci.yml` (`RhymeLab CI`);
- the branch must be up to date with `main` before merge;
- force pushes / non-fast-forward updates are blocked;
- deletion of `main` is blocked;
- required approving reviews are currently `0` so the owner can maintain the repository solo; external contributions still require the contribution and CLA rules below.

GitHub-side enforcement of this ruleset requires repository-administration permission. Activation and verification are tracked in issue #1. Until that issue is closed, the rules above are project policy but are not represented as fully enforced GitHub branch protection.

## Merge requirements

A pull request may merge only when all applicable requirements are satisfied:

1. `validate` succeeds. It runs the source check, test suite, and public-readiness audit.
2. The change respects `LICENSE`, `COMMERCIAL_LICENSE.md`, `THIRD_PARTY_NOTICES.md`, and `DATA_SOURCES.md`.
3. External contributors explicitly accept `CLA.md` using the statement required by `CONTRIBUTING.md`.
4. New third-party material has documented provenance, licensing, attribution, redistribution, and share-alike requirements where applicable.
5. No secrets, personal data, private paths, private URLs, local databases, generated reports, benchmark review/reference material, or downloaded raw corpora are introduced.

## CI contract

The public workflow is `.github/workflows/ci.yml` and its required job/check name is `validate`.

The workflow currently runs:

```text
npm run check
npm test
node scripts/public-readiness-audit.mjs
```

Renaming the `validate` job is a governance change because it would invalidate the configured required-status-check rule. If that job is intentionally renamed, update the GitHub ruleset and this document in the same change.

## Administrative changes

Changes to branch rulesets, repository visibility, Actions permissions, merge policy, licensing, or the public/private history boundary are repository-governance changes. They must be documented durably in the repository rather than existing only in chat or local notes.

The current branch-protection activation task is tracked by issue #1. Once activated, verify that GitHub reports `main` as protected / covered by an active ruleset and that PR merge is blocked until `validate` succeeds.
