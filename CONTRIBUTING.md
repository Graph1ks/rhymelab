# Contributing to RhymeLab

RhymeLab is a public **owner-controlled / solo-dev** project. Public source visibility is not an invitation for unsolicited code contributions or community governance.

## Feedback and outside contributions

Issues may be used for reproducible bug reports, suggestions, compatibility reports, documentation defects, and other product feedback when enabled.

Outside users should not open unsolicited pull requests. Code or documentation contributions are accepted only when the project owner explicitly invites or authorizes that contribution.

Issues and other community feedback are input channels, not roadmap authority and not an automatic AI-agent work queue. Their presence does not guarantee implementation, prioritization, or maintainer response.

Project mode and durable contribution policy are defined in PROJECT.md.

## Contributor License Agreement

Any explicitly authorized external code or documentation contribution requires acceptance of CLA.md before merge.

The contributor must post this exact statement in the pull request discussion:

    I have read and agree to CLA.md for this contribution.

This preserves Graph1ks' ability to maintain the public source-available licensing model and offer separate commercial licenses for Graph1ks Material.

## License boundary

RhymeLab is source-available, not OSI Open Source.

Graph1ks Material is governed by LICENSE, COMMERCIAL_LICENSE.md, and COPYRIGHT. Third-party material keeps its own license and attribution requirements; the repository root license does not automatically relicense third-party content.

## Third-party material and data

Do not add copied code, corpora, dictionaries, generated datasets, model outputs, fonts, media, or other third-party material without documenting:

- source and canonical URL;
- applicable license/terms;
- required attribution;
- snapshot/version where applicable;
- whether redistribution and modification are permitted;
- any share-alike or notice requirements.

Update THIRD_PARTY_NOTICES.md, DATA_SOURCES.md, and any relevant source/directory manifest when adding licensed external material.

Public web visibility alone is not evidence that material is commercially usable or redistributable.

## Privacy and secrets

Never commit:

- API keys, access tokens, passwords, cookies, credentials, private keys, or environment-secret files;
- personal email addresses or local user/profile paths;
- private URLs or internal infrastructure details;
- local databases, generated reports, benchmark review/reference data, or downloaded raw corpora;
- raw private user/AI conversations or unrelated sensitive conversational content.

Run the public-readiness audit before requesting merge:

    npm run public:audit

## Engineering rules

- Preserve accepted/frozen German, English, Phrase/Mosaic, and Entity baselines unless a concrete regression or a properly benchmarked candidate justifies reopening them.
- Keep runtime local-only unless a hosted architecture is explicitly approved by the owner.
- Keep canonical core search deterministic and locally executable.
- Keep ranking changes isolated from phonology/scorer/relation changes unless the task explicitly requires both.
- Preserve pronunciation/source provenance and keep generated/AI evidence distinguishable from accepted runtime truth.
- Missing usage evidence must not be silently interpreted as linguistic rarity or obsolescence.
- Do not introduce telemetry, advertising, tracking, remote uploads, or hidden network behavior.
- Do not add required paid software, APIs, SaaS, subscriptions, or metered services to the core production path.
- Do not add dependencies without a clear technical need plus cost/license review.
- Do not commit generated bulk data under local/generated data paths, local SQLite, reports, or benchmark review/reference files.

## Validation

Before requesting merge, run at minimum:

    npm run check
    npm test
    npm run public:audit

Changes touching data/source policy must also run the relevant source/provenance checks and update durable documentation.

The public GitHub Actions workflow must pass its required validate job before merge. Branch/merge policy is documented in docs/REPOSITORY_GOVERNANCE.md.

## Pull-request policy

- Public main is updated through pull requests under the repository-governance policy.
- Pull requests are for the owner and explicitly authorized collaborators/contributors.
- Keep one coherent concern per PR.
- Avoid unrelated refactors in feature/bug-fix PRs.
- Do not change licensing, third-party attribution, provenance, privacy behavior, CI permissions, network behavior, or public-data boundaries silently.
- Prefer deterministic tests and reproducible build steps.
- Use GitHub's privacy-protecting noreply commit address if personal email privacy matters.
- Do not rename the required validate CI job without updating the GitHub ruleset and docs/REPOSITORY_GOVERNANCE.md in the same change.
