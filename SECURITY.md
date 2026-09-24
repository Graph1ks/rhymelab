# Security Policy

## Supported scope

RhymeLab is a local-first application. Security fixes target the current `main` branch and the current local runtime/data pipeline.

The application security design and future BYOK AI trust boundary are defined in `docs/SECURITY_ARCHITECTURE.md`.

## Reporting a vulnerability

Do **not** publish exploit details, credentials, private data, or other sensitive material in a public issue.

Prefer GitHub's private vulnerability-reporting / Security Advisory flow for this repository when available. If private vulnerability reporting is not available, contact Graph1ks through the GitHub profile first and provide sensitive technical details only through a private channel.

For non-sensitive security hardening, ordinary GitHub issues are fine.

## Runtime security boundary

RhymeLab binds to loopback by default. Non-loopback/LAN binding requires the explicit owner opt-in `RHYMELAB_ALLOW_REMOTE=1`; wildcard binds (`0.0.0.0` / `::`) additionally require an explicit `RHYMELAB_ALLOWED_HOSTS` allowlist.

Browser/API security is fail-closed by default:

- no wildcard CORS on the localhost API;
- restrictive CSP on served HTML;
- anti-framing, no-sniff, referrer and cross-origin isolation headers;
- bounded request targets and JSON request bodies;
- localhost-only write-origin checks for current mutating development endpoints;
- unexpected internal exceptions are not reflected verbatim to clients;
- remote services, telemetry, automatic uploads, authentication material, hosted databases, or normal public network exposure require explicit security review.

Generated local databases, downloaded corpora, benchmark reviews/reference labels, and reports are not intended for source control.

## Secrets and future AI provider keys

The repository must not contain personal credentials, private keys, tokens, cookies, personal email addresses, or local user/profile paths.

Future user-supplied AI provider keys must follow `docs/SECURITY_ARCHITECTURE.md`: no URL/log/prompt/diagnostic exposure, no plaintext localStorage/IndexedDB persistence, memory-only by default, renderer-minimized access, and a narrow local provider adapter rather than arbitrary browser egress.

If a credential is ever committed or exposed, removing it from Git or UI state is not sufficient: revoke or rotate it as well.

## Validation

Run before security-sensitive or public-facing changes:

```bash
npm run check
npm test
npm run security:audit
node scripts/public-readiness-audit.mjs
```

GitHub CI also runs dependency auditing and CodeQL scanning.
