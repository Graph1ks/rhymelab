# Public-facing status

RhymeLab's clean public repository is live at `Graph1ks/rhymelab`. It was published on 2026-09-17 from a sanitized parentless root commit; pre-public development history, old branches, historical pull requests, and private commit metadata are intentionally not part of the public repository.

The first public `RhymeLab CI` run completed successfully on the clean root. The public workflow's required job/check name is `validate` and runs the source check, test suite, and public-readiness audit.

Repository governance is documented in `docs/REPOSITORY_GOVERNANCE.md`. GitHub now actively enforces the `main-protection` ruleset on the default branch: changes to `main` require a pull request, `validate` must pass, the branch must be up to date before merge, force pushes/non-fast-forward updates are blocked, and deletion is blocked. Required approving reviews remain `0` for solo-maintainer operation, and the ruleset has no bypass actors.

The current formally accepted German runtime baseline remains v0.10.0. Runtime source contains the validated hybrid-v3 ranking promotion for normal `type=all` ranked mode; final owner-local post-promotion acceptance remains pending.

Feature branch `feat/deterministic-writer-ranking-v1` / draft PR #3 adds a deterministic writer-oriented utility/diversity layer without changing `de-ipa-v2`, `de-phon-v3`, `rhyme-relations-v2`, or DB schema v4. The branch makes writer ranking visible in the local UI, retains `?ranking=legacy` for comparison, adds `Arbeitsweise` regressions, and records the hard no-LLM/no-ML core-search constraint. Public CI is green on the initial implementation. This feature is not yet an accepted runtime baseline.

See `PROJECT_STATE.json`, `docs/HANDOVER.md`, `docs/WRITER_RANKING.md`, `docs/REPOSITORY_GOVERNANCE.md`, and `docs/BENCHMARK.md` for the current execution boundary.
