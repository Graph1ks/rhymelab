# Security Architecture

RhymeLab is a local-first application. This document defines the security boundary for the browser UI, the local Node.js runtime, local databases, imported user data, and future opt-in AI features.

## Security baseline

The target baseline is OWASP ASVS 5.0-style defense in depth for the application-relevant controls, plus explicit local-application and AI-agent threat boundaries.

Core rules:

- bind to loopback by default; non-loopback/LAN binding requires the explicit owner opt-in `RHYMELAB_ALLOW_REMOTE=1`;
- browser pages are same-origin by default and local API responses are not broadly CORS-readable;
- ship a restrictive Content Security Policy: local scripts only, no objects, no framing, no arbitrary outbound `connect-src`;
- never reflect unexpected exception details, filesystem paths, tokens, provider responses, or stack traces to untrusted clients;
- bound request-target and request-body sizes before expensive work;
- treat imports, database content, search strings, model output and external content as untrusted data;
- use parameterized database APIs and structured subprocess arguments; never construct executable code or shell commands from user/model text;
- keep runtime telemetry and automatic uploads disabled unless the owner makes a separate architecture decision;
- run public-readiness, tests and security checks in CI.

## Browser and localhost threat model

Loopback is not a security boundary by itself. A hostile website open in the same browser can attempt requests to services on `localhost`. Therefore:

- same-origin is the default for all RhymeLab APIs;
- do not add `Access-Control-Allow-Origin: *` to localhost APIs;
- state-changing and secret-bearing endpoints must validate Origin and method, and must never be enabled through a wildcard CORS policy;
- public/LAN binding is exceptional and must be intentional;
- sensitive future endpoints should use POST with bounded JSON bodies and explicit origin checks;
- HTML is not frameable, reducing clickjacking exposure.

## Future BYOK AI boundary

The user may later supply a provider API key. The key is a credential, not application content.

### Key lifecycle

Mandatory design:

1. The key must never appear in a URL, prompt, document, diagnostic export, analytics payload, console log, exception text, Redux/Zustand-like persisted state, or source control.
2. The default browser workflow should keep a newly entered key only for the current runtime session.
3. Do not persist the key in `localStorage` or IndexedDB as plaintext.
4. Persistent storage, if added, must be a separate explicit opt-in using an OS credential store in desktop builds. Browser-only persistence is not considered equivalent protection.
5. UI code should not receive the key again after handing it to the trusted local secret boundary.
6. Provider calls should go through a narrow local backend/provider adapter. Keeping CSP `connect-src 'self'` prevents arbitrary renderer JavaScript from directly exfiltrating credentials to third-party origins.
7. Redact known secret values from error/log paths before serialization.

An XSS running in the same privileged browser origin can act with the privileges of that origin. Encryption-at-rest alone does not solve that while a key is unlocked. Preventing script injection and minimizing renderer access to secrets are therefore primary controls.

### Model containment

The model must not be treated as trusted code and must not receive ambient authority.

- No arbitrary shell, filesystem, database, browser automation or network tool.
- Every AI capability is an explicit allowlisted operation with a typed schema and deterministic validation.
- Tool execution re-checks authorization and arguments outside the model.
- Untrusted documents/web content are data, never higher-priority instructions.
- Model output is rendered as text or through a sanitizer; never inject raw model HTML/JS.
- Destructive or externally visible actions require explicit user confirmation.
- Apply token, response-size, timeout, concurrency and cost ceilings.
- A model cannot broaden its own permissions, choose arbitrary provider URLs, disable security controls or read the secret store.

For higher-risk agentic features, separate untrusted-content processing from privileged action execution. Prefer a quarantined/read-only analysis stage that produces structured data for a small deterministic action layer.

### Provider egress / SSRF

If the local backend later makes provider or user-requested network calls:

- use provider allowlists or fixed provider adapters;
- reject loopback, private, link-local and cloud metadata destinations for user/model-supplied URLs;
- resolve and re-check destinations across redirects;
- bound redirects, response bytes, MIME types and timeouts;
- never forward the user's provider Authorization header to a redirected or unapproved host.

## Import and local data safety

Portable Studio backups are untrusted input. Import code should maintain schema/version checks and add bounded file size, collection counts and string lengths before materializing large structures. Imported text stays inert text and must not become HTML, script, URL or command input without contextual handling.

SQLite databases are local data artifacts, but SQL identifiers and statements must remain developer-controlled. Values derived from UI/model/imports belong in bound parameters.

## Supply-chain policy

- GitHub Actions are pinned to full commit SHAs.
- Action permissions remain least-privilege.
- React dependencies install from the lockfile with lifecycle scripts disabled in CI unless a dependency explicitly requires otherwise.
- Dependabot tracks GitHub Actions and the React application dependencies.
- Security updates still require tests/parity gates; automated update PRs are not auto-merged.

## Security review triggers

A dedicated security review is required before introducing any of the following:

- authentication or accounts;
- persistent API/provider secrets;
- AI tool use or agentic actions;
- arbitrary external URL fetching;
- cloud sync, telemetry, crash uploads or analytics;
- public/LAN exposure as a normal product mode;
- Electron/Tauri/native filesystem or shell bridges;
- plugins/extensions that can execute code;
- new rendering of user/model supplied HTML or Markdown.

No single header, prompt or filter is the security boundary. The boundary is the combination of isolation, least privilege, validation, explicit authority and regression tests.
