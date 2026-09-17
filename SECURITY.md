# Security Policy

## Supported scope

RhymeLab is currently a local-only development project. Security fixes target the current `main` branch and the current local runtime/data pipeline.

## Reporting a vulnerability

Do **not** publish exploit details, credentials, private data, or other sensitive material in a public issue.

Prefer GitHub's private vulnerability-reporting / Security Advisory flow for this repository when available. If private vulnerability reporting is not available, contact Graph1ks through the GitHub profile first and provide sensitive technical details only through a private channel.

For non-sensitive security hardening, ordinary GitHub issues are fine.

## Security boundaries

RhymeLab is intended to bind to loopback by default and operate on local data. Changes that introduce remote services, telemetry, automatic uploads, authentication material, hosted databases, or public network exposure require explicit security review.

Generated local databases, downloaded corpora, benchmark reviews/reference labels, and reports are not intended for source control.

## Secrets and privacy

The repository must not contain personal credentials, private keys, tokens, cookies, personal email addresses, or local user/profile paths. Public-readiness validation is available through:

```bash
node scripts/public-readiness-audit.mjs
```

If a credential is ever committed, removing it from Git is not sufficient: revoke or rotate the credential as well.
