#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createGunzip } from 'node:zlib';
import readline from 'node:readline';

const root = process.cwd();
const sourcePath = resolve('data/work/de-rhyme-core-v1/downloads/dewiktionary-kaikki-raw.jsonl.gz');
const cachePath = resolve('data/local/pronunciation-source-probe.json');
const reportsDir = resolve('reports');
const reportPath = resolve(reportsDir, 'rhymelab-report.json');
const PROBE_VERSION = 1;
const targets = ['er', 'ihr', 'Musik', 'Liebe', 'Leben', 'ist', 'sich', 'so', 'damit', 'dabei'];

const exists = async (path) => {
  try { await access(path); return true; } catch { return false; }
};

function runJsonScript(script, args = []) {
  const result = spawnSync(process.execPath, ['--no-warnings', script, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const message = String(result.stderr || result.stdout || `${script} failed`).trim();
    throw new Error(`${script} failed with exit ${result.status ?? 'unknown'}: ${message.slice(-4000)}`);
  }
  const raw = String(result.stdout || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`${script} did not return JSON`);
  return JSON.parse(raw.slice(start, end + 1));
}

function compactSound(sound) {
  const out = {};
  for (const key of ['ipa', 'tags', 'raw_tags', 'note', 'text', 'audio', 'homophone', 'other']) {
    if (sound?.[key] !== undefined) out[key] = sound[key];
  }
  return out;
}

function compactForm(form) {
  const out = { form: form?.form ?? null };
  for (const key of ['ipa', 'tags', 'raw_tags', 'source']) {
    if (form?.[key] !== undefined) out[key] = form[key];
  }
  return out;
}

function compactEntry(entry) {
  return {
    word: entry.word,
    pos: entry.pos ?? null,
    tags: entry.tags ?? [],
    raw_tags: entry.raw_tags ?? [],
    sounds: (Array.isArray(entry.sounds) ? entry.sounds : [])
      .filter((sound) => sound?.ipa || sound?.tags?.length || sound?.raw_tags?.length || sound?.note || sound?.text)
      .slice(0, 30)
      .map(compactSound),
    forms_with_ipa: (Array.isArray(entry.forms) ? entry.forms : [])
      .filter((form) => form?.ipa)
      .slice(0, 30)
      .map(compactForm),
    senses: (Array.isArray(entry.senses) ? entry.senses : [])
      .slice(0, 20)
      .map((sense) => ({
        tags: sense?.tags ?? [],
        raw_tags: sense?.raw_tags ?? [],
        form_of: sense?.form_of ?? [],
      })),
  };
}

async function loadCachedProbe(sourceStat) {
  if (!await exists(cachePath)) return null;
  try {
    const cached = JSON.parse(await readFile(cachePath, 'utf8'));
    if (cached.probe_version !== PROBE_VERSION) return null;
    if (cached.source_bytes !== sourceStat.size) return null;
    if (cached.source_mtime_ms !== sourceStat.mtimeMs) return null;
    if (JSON.stringify(cached.targets) !== JSON.stringify(targets)) return null;
    return { ...cached, cached: true };
  } catch {
    return null;
  }
}

async function buildProbe() {
  if (!await exists(sourcePath)) {
    return {
      available: false,
      reason: 'local Kaikki cache missing',
      expected_path: sourcePath,
      targets,
    };
  }

  const sourceStat = await stat(sourcePath);
  const cached = await loadCachedProbe(sourceStat);
  if (cached) return cached;

  const wanted = new Set(targets);
  const focus = Object.fromEntries(targets.map((word) => [word, []]));
  let matchingEntries = 0;
  let malformedLines = 0;

  const input = createReadStream(sourcePath).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let candidate = false;
    for (const word of targets) {
      if (line.includes(`\"word\":\"${word}\"`) || line.includes(`\"word\": \"${word}\"`)) {
        candidate = true;
        break;
      }
    }
    if (!candidate) continue;

    let entry;
    try { entry = JSON.parse(line); }
    catch { malformedLines += 1; continue; }
    if (entry?.lang_code !== 'de' || !wanted.has(entry?.word)) continue;
    matchingEntries += 1;
    if (focus[entry.word].length < 20) focus[entry.word].push(compactEntry(entry));
  }

  const soundTagCounts = {};
  const rawSoundTagCounts = {};
  const ipaCounts = {};
  for (const entries of Object.values(focus)) {
    for (const entry of entries) {
      for (const sound of entry.sounds) {
        if (sound.ipa) ipaCounts[sound.ipa] = (ipaCounts[sound.ipa] || 0) + 1;
        for (const tag of sound.tags || []) soundTagCounts[tag] = (soundTagCounts[tag] || 0) + 1;
        for (const tag of sound.raw_tags || []) rawSoundTagCounts[tag] = (rawSoundTagCounts[tag] || 0) + 1;
      }
    }
  }

  const probe = {
    probe_version: PROBE_VERSION,
    available: true,
    cached: false,
    source_path: sourcePath,
    source_bytes: sourceStat.size,
    source_mtime_ms: sourceStat.mtimeMs,
    targets,
    matching_entries: matchingEntries,
    malformed_candidate_lines: malformedLines,
    sound_tag_counts: Object.fromEntries(Object.entries(soundTagCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    raw_sound_tag_counts: Object.fromEntries(Object.entries(rawSoundTagCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    ipa_counts: Object.fromEntries(Object.entries(ipaCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    focus,
  };
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(probe, null, 2) + '\n', 'utf8');
  return probe;
}

let report;
try {
  report = runJsonScript('scripts/qa-report-v3.mjs');
} catch (error) {
  report = {
    schema: 'rhymelab-local-report-error-v1',
    generated_at: new Date().toISOString(),
    status: 'error',
    report_error: error instanceof Error ? error.message : String(error),
  };
}

try {
  report.pronunciation_source_probe = await buildProbe();
} catch (error) {
  report.pronunciation_source_probe = {
    available: false,
    error: error instanceof Error ? error.message : String(error),
  };
  if (report.status === 'ok') report.status = 'attention';
}

try {
  report.pronunciation_audit = runJsonScript('scripts/pronunciation-audit.mjs');
  if (!report.pronunciation_audit.ok && report.status === 'ok') report.status = 'attention';
} catch (error) {
  report.pronunciation_audit = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
  if (report.status === 'ok') report.status = 'attention';
}

try {
  report.modern_lexicon_audit = runJsonScript('scripts/modern-lexicon-audit.mjs');
  if (!report.modern_lexicon_audit.ok && report.status === 'ok') report.status = 'attention';
} catch (error) {
  report.modern_lexicon_audit = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
  if (report.status === 'ok') report.status = 'attention';
}

report.report_file = relative(root, reportPath).replaceAll('\\', '/');
await mkdir(reportsDir, { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

const gates = report.gates || {};
const passed = Object.values(gates).filter(Boolean).length;
const total = Object.keys(gates).length;
console.log(`RhymeLab report: ${String(report.status || 'unknown').toUpperCase()}`);
if (total) console.log(`QA gates: ${passed}/${total}`);
if (report.pronunciation_audit) console.log(`Pronunciation audit: ${report.pronunciation_audit.ok ? 'OK' : 'ATTENTION'}`);
if (report.modern_lexicon_audit) console.log(`Modern lexicon audit: ${report.modern_lexicon_audit.ok ? 'OK' : 'ATTENTION'}`);
console.log(`Saved: ${reportPath}`);
console.log('Upload this file here: reports\\rhymelab-report.json');
