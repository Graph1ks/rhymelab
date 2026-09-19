# Repository governance

This document defines the public GitHub governance policy for `Graph1ks/rhymelab`.

## Operating model

RhymeLab is a public **owner-controlled / solo-dev** repository. Public visibility provides source access under the repository's actual license terms; it does not create community governance or an open contribution queue.

- Pull-request creation is collaborators-only.
- Unsolicited external code contributions are not accepted.
- Explicitly authorized external contributions remain subject to CONTRIBUTING.md and CLA.md.
- Issues are feedback/input channels and do not become automatic owner or AI-agent work.
- AI/agent work on Issues or Discussions requires an explicit owner request.
- Repository mode, cost policy, licensing posture, and durable architecture boundaries are defined in PROJECT.md.

## Public history boundary

The public repository was created on 2026-09-17 from a sanitized parentless root commit. Pre-public commits, branches, pull requests, personal commit metadata, and private-development history remain outside the public repository.

The public repository is the authoritative source repository for ongoing development. The private pre-public archive is retained only for historical/recovery purposes and must never be pushed into the public repository.

## `main` branch policy

`main` is the protected integration branch. GitHub enforces the active repository ruleset `main-protection` against the default branch.

The enforced rules are:

- changes reach `main` through a pull request;
- the required GitHub Actions status check is `validate` from `.github/workflows/ci.yml` (`RhymeLab CI`);
- the branch must be up to date with `main` before merge;
- force pushes / non-fast-forward updates are blocked;
- deletion of `main` is blocked;
- required approving reviews are currently `0` so the owner can maintain the repository solo; external contributions still require the contribution and CLA rules below;
- there are no bypass actors configured for this ruleset.

The ruleset was activated and verified on 2026-09-17. GitHub reports the ruleset as active and targeting `~DEFAULT_BRANCH`, with required status check `validate`, strict up-to-date enforcement, pull-request enforcement, deletion protection, and non-fast-forward protection.

## Merge requirements

A pull request may merge only when all applicable requirements are satisfied:

1. `validate` succeeds. It runs the source check, test suite, and public-readiness audit.
2. The pull-request branch is up to date with `main`.
3. The change respects `LICENSE`, `COMMERCIAL_LICENSE.md`, `THIRD_PARTY_NOTICES.md`, and `DATA_SOURCES.md`.
4. External contributors explicitly accept `CLA.md` using the statement required by `CONTRIBUTING.md`.
5. New third-party material has documented provenance, licensing, attribution, redistribution, and share-alike requirements where applicable.
6. No secrets, personal data, private paths, private URLs, local databases, generated reports, benchmark review/reference material, or downloaded raw corpora are introduced.

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

The initial `main` protection rollout was tracked in issue #1 and is complete. Future governance changes should use the same pattern: document the intended state, apply the GitHub administration change, verify the live configuration, and update the repository record in the same workstream.
