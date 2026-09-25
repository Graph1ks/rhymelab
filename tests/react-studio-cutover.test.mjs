import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('React Studio R8 is the reversible default product shell', async () => {
  const [server, packageJson] = await Promise.all([
    readFile('src/server.mjs', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);
  const pkg = JSON.parse(packageJson);

  assert.match(
    server,
    /const reactStudioAssets=loadReactStudioPreviewAssets\(reactStudioDistDir\);/,
  );
  assert.match(
    server,
    /body: searchDefaultRoute\s*\?writerHtml\s*:\(reactStudioPreview\.defaultRoute\?reactStudioHtml:studioHtml\)/,
  );
  assert.match(
    server,
    /'\/studio': \{ type: 'text\/html; charset=utf-8', body: reactStudioHtml \}/,
  );
  assert.match(
    server,
    /'\/studio\/': \{ type: 'text\/html; charset=utf-8', body: reactStudioHtml \}/,
  );
  assert.match(
    server,
    /'\/studio-legacy': \{ type: 'text\/html; charset=utf-8', body: studioHtml \}/,
  );
  assert.match(server, /reactStudioAlias:'\/studio-react'/);
  assert.match(server, /legacyStudio:'\/studio-legacy'/);

  for (const script of ['dev', 'dev:serving', 'start', 'dev:studio-default']) {
    assert.match(
      pkg.scripts[script],
      /^npm run studio:react:build && node src\/server\.mjs/,
      script,
    );
  }
  assert.equal(
    pkg.scripts['dev:legacy-studio-default'],
    'npm run studio:react:build && node src/server.mjs --legacy-studio-default',
  );
});

test('legacy Studio rollback keeps its absolute asset endpoints available', async () => {
  const [server, legacyHtml] = await Promise.all([
    readFile('src/server.mjs', 'utf8'),
    readFile('src/studio/index.html', 'utf8'),
  ]);

  assert.match(legacyHtml, /href="\/studio\/styles\.css"/);
  assert.match(legacyHtml, /src="\/studio\/app\.js"/);
  assert.match(server, /'\/studio\/styles\.css'/);
  assert.match(server, /'\/studio\/app\.js'/);
});


test('R10 rollback static assets are request-lazy while React remains startup fail-closed', async () => {
  const server = await readFile('src/server.mjs', 'utf8');

  assert.match(server, /function lazyBody\(loader\)/);
  assert.match(server, /const writerHtml = lazyBody\(\(\)=>readFileSync\(resolve\(uiDir, 'index\.html'\)\)\);/);
  assert.match(server, /const padHtml = lazyBody\(\(\)=>Buffer\.from\(materializeRhymePadV14\(\)\.html\)\);/);
  assert.match(server, /const studioHtml=lazyBody\(\(\)=>readFileSync\(resolve\(studioUiDir,'index\.html'\)\)\);/);
  assert.doesNotMatch(server, /const writerHtml = readFileSync/u);
  assert.doesNotMatch(server, /body:\s*readFileSync\(resolve\((?:studioUiDir|uiDir|padUiDir|benchmarkUiDir|queryPronunciationTestDir|markovTestDir)/u);
  assert.match(server, /const body=typeof entry\.body==='function'\?entry\.body\(\):entry\.body;/);
  assert.match(server, /const reactStudioAssets=loadReactStudioPreviewAssets\(reactStudioDistDir\);/);
});
