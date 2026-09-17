# Public-facing status

RhymeLab's clean public repository is live at `Graph1ks/rhymelab`. It was published on 2026-09-17 from a sanitized parentless root commit; pre-public development history, old branches, historical pull requests, and private commit metadata are intentionally not part of the public repository.

The first public `RhymeLab CI` run completed successfully on the clean root. The public workflow's required job/check name is `validate` and runs the source check, test suite, and public-readiness audit.

Repository governance is documented in `docs/REPOSITORY_GOVERNANCE.md`. Project policy requires pull-request-based changes to `main`, successful `validate` CI, and protection against force pushes and deletion. GitHub-side activation of the `main` ruleset requires repository-admin settings and is tracked in issue #1; until that issue is closed, the policy is documented but not fully enforced by GitHub branch protection.

The current formally accepted German runtime baseline remains v0.10.0. Runtime source contains the validated hybrid-v3 ranking promotion for normal `type=all` ranked mode; final owner-local post-promotion acceptance remains pending.

See `PROJECT_STATE.json`, `docs/HANDOVER.md`, `docs/REPOSITORY_GOVERNANCE.md`, and `docs/BENCHMARK.md` for the current execution boundary.
