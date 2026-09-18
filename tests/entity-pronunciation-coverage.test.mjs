import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  cmudictCoverageForSurface,
  normalizeCmudictToken,
  parseCmudictLexicon,
} from '../scripts/entity-pronunciation-coverage-core.mjs';

test('CMUdict probe parser preserves variants while exposing base-token coverage', () => {
  const parsed = parseCmudictLexicon([
    'the DH AH0',
    'love L AH1 V',
    'love(2) L UH1 V',
    "james JH EY1 M Z",
    'brown B R AW1 N',
    '',
  ].join('\n'));

  assert.equal(parsed.uniqueTokens, 4);
  assert.equal(parsed.pronunciations, 5);
  assert.equal(parsed.entries.get('love').length, 2);
  assert.equal(normalizeCmudictToken('James'), 'james');

  const full = cmudictCoverageForSurface('James Brown', parsed.entries);
  assert.equal(full.status, 'full');
  assert.equal(full.matchedCount, 2);
  assert.deepEqual(full.unmatchedTokens, []);

  const partial = cmudictCoverageForSurface('The Unlisted Love', parsed.entries);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.matchedCount, 2);
  assert.deepEqual(partial.unmatchedTokens, ['Unlisted']);
});

test('Entity pronunciation owner workflow pins source provenance and remains probe-only', async () => {
  const [manifest, packageJson, ownerSource, diagnosticSource] = await Promise.all([
    readFile('sources/entity/cmudict-entity-pronunciation-v1.json', 'utf8').then(JSON.parse),
    readFile('package.json', 'utf8').then(JSON.parse),
    readFile('scripts/run-entity-pronunciation-owner.mjs', 'utf8'),
    readFile('scripts/diagnose-entity-pronunciation-coverage.mjs', 'utf8'),
  ]);

  assert.equal(manifest.commit, '74790861f652b15e4ac49015a90074ad62a27690');
  assert.equal(manifest.git_blob_sha1, '2c0411740cce3e2026a80b90b650d5f6a7258164');
  assert.equal(manifest.commercial_use, true);
  assert.equal(manifest.runtime_use, false);
  assert.equal(
    packageJson.scripts['entity:pronunciation:owner'],
    'node --no-warnings scripts/run-entity-pronunciation-owner.mjs',
  );
  assert.match(ownerSource, /pronunciation runtime already complete; skipping rebuild/);
  assert.match(diagnosticSource, /coverage_probe_only_not_de_runtime_eligible/);
  assert.match(diagnosticSource, /coverage_by_category_tier/);
  assert.match(diagnosticSource, /priority_unresolved_preferred_names/);
  assert.match(diagnosticSource, /CMUdict is en-US pronunciation evidence/);
});
