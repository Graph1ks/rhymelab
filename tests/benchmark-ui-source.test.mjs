import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('benchmark review UI is blind by default and keeps review state local', async () => {
  const [html, app, server] = await Promise.all([
    readFile('src/benchmark-ui/index.html','utf8'),
    readFile('src/benchmark-ui/app.js','utf8'),
    readFile('src/server.mjs','utf8'),
  ]);
  assert.match(html,/id="primaryChoices"/);
  assert.match(html,/id="assonanceChoices"/);
  assert.match(html,/id="consonanceChoices"/);
  assert.match(html,/id="usefulnessChoices"/);
  assert.match(html,/class="rubric-card"/);
  assert.match(html,/<details class="engine-card" id="engineDetails">/);
  assert.doesNotMatch(html,/<details[^>]*\sopen(?:\s|>)/);
  assert.match(html,/id="phenomena" class="chips hidden"/);
  assert.match(html,/class="hidden" aria-hidden="true"><span data-i18n="category"/);
  assert.match(app,/multisyllabic_perfect/);
  assert.match(app,/assonance/);
  assert.match(app,/consonance/);
  assert.match(app,/showEngine/);
  assert.match(app,/blindReminder/);
  assert.match(app,/engineDetails'\)\.open = false/);
  assert.match(app,/\/api\/benchmark\/state/);
  assert.match(app,/\/api\/benchmark\/review/);
  assert.match(server,/\/benchmark\/assets\/app\.js/);
  assert.match(server,/isAllowedLocalWriteOrigin/);
  assert.match(server,/Benchmark writes are localhost-only/);
  assert.match(server,/saveBenchmarkReview/);
  assert.match(server,/loadBenchmarkState\(\), 200, false/);
});
