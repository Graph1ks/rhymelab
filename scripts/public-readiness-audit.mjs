#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

const tracked = git(['ls-files', '-z'])
  .split('\0')
  .map((value) => value.trim())
  .filter(Boolean);

const blockedPathPatterns = [
  /^\.env(?:\.|$)/i,
  /^\.npmrc$/i,
  /(^|\/)id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/i,
  /\.(?:pem|p12|pfx|key)$/i,
  /\.(?:sqlite|sqlite3|db)(?:[-.].*)?$/i,
  /(^|\/)reports\//i,
  /(^|\/)data\/(?:raw|work|local|generated|de)\//i,
];

const textPatterns = [
  {
    label: 'email address',
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    allow: (match) => /@users\.noreply\.github\.com$/i.test(match) || /@example\.(?:com|org|net)$/i.test(match),
  },
  {
    label: 'Windows user profile path',
    regex: /\b[A-Za-z]:\\Users\\[^\\\s"']+/g,
  },
  {
    label: 'macOS user profile path',
    regex: /\/Users\/[^/\s"']+/g,
  },
  {
    label: 'Linux user profile path',
    regex: /\/home\/[^/\s"']+/g,
  },
  {
    label: 'private-key marker',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    label: 'GitHub classic/fine-grained token',
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  {
    label: 'AWS access key',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    label: 'OpenAI-style secret key',
    regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    label: 'embedded URL credentials',
    regex: /https?:\/\/[^/\s:@]+:[^@\s/]+@[^\s/]+/gi,
  },
  {
    label: 'legacy 40-hex Git/SHA-1-like identifier',
    regex: /\b[a-f0-9]{40}\b/gi,
    allow: (_match, context) => {
      const start = Math.max(0, context.index - 240);
      const end = Math.min(context.text.length, context.index + 240);
      const nearby = context.text.slice(start, end);
      return /(?:sha-?1|official[_ -]?checksum)/iu.test(nearby);
    },
  },
];

const findings = [];

const requiredRepositoryFiles = [
  'PROJECT.md',
  'CHANGELOG.md',
  '.editorconfig',
  '.gitattributes',
];

for (const requiredPath of requiredRepositoryFiles) {
  if (!tracked.includes(requiredPath)) {
    findings.push(`${requiredPath}: required repository-governance file is missing`);
  }
}

function readTrackedText(path) {
  if (!tracked.includes(path)) return '';
  try {
    return readFileSync(path, 'utf8');
  } catch {
    findings.push(`${path}: required policy file is not readable`);
    return '';
  }
}

const projectText = readTrackedText('PROJECT.md');
for (const marker of [
  '**Collaboration mode:** owner-controlled / solo-dev',
  '**Changelog:** enabled',
  '**Required production cost target:** zero.',
  '## QA / merge gate',
]) {
  if (projectText && !projectText.includes(marker)) {
    findings.push(`PROJECT.md: missing required project-contract marker: ${marker}`);
  }
}

const changelogText = readTrackedText('CHANGELOG.md');
if (changelogText && !changelogText.includes('## Unreleased')) {
  findings.push('CHANGELOG.md: missing Unreleased section');
}

const unresolvedTemplatePatterns = [
  /<project-name>/i,
  /<one sentence describing/i,
  /<project-specific/i,
  /\bYYYY-MM-DD\b/,
];

for (const policyPath of ['PROJECT.md', 'CHANGELOG.md']) {
  const text = readTrackedText(policyPath);
  if (!text) continue;
  for (const pattern of unresolvedTemplatePatterns) {
    if (pattern.test(text)) {
      findings.push(`${policyPath}: unresolved repository-template placeholder`);
      break;
    }
  }
}

for (const path of tracked) {
  if (blockedPathPatterns.some((pattern) => pattern.test(path))) {
    findings.push(`${path}: blocked tracked path/file type`);
    continue;
  }

  let stat;
  try {
    stat = statSync(path);
  } catch {
    findings.push(`${path}: tracked file is not readable from working tree`);
    continue;
  }

  if (!stat.isFile() || stat.size > 10 * 1024 * 1024) continue;

  const buffer = readFileSync(path);
  if (buffer.includes(0)) continue;
  const text = buffer.toString('utf8');

  for (const rule of textPatterns) {
    rule.regex.lastIndex = 0;
    let match;
    while ((match = rule.regex.exec(text)) !== null) {
      if (rule.allow?.(match[0], { path, text, index: match.index })) continue;
      const line = text.slice(0, match.index).split('\n').length;
      const preview = rule.label === 'email address' ? '[redacted email]' : match[0].slice(0, 80);
      findings.push(`${path}:${line}: ${rule.label}: ${preview}`);
      if (match[0].length === 0) rule.regex.lastIndex += 1;
    }
  }
}

if (tracked.includes('.public-root')) {
  let roots = [];
  try {
    roots = git(['rev-list', '--max-parents=0', 'HEAD']).split(/\r?\n/).filter(Boolean);
  } catch {
    findings.push('.public-root exists but Git history could not be inspected');
  }

  if (roots.length !== 1) {
    findings.push(`public history must have exactly one root commit; found ${roots.length}`);
  } else {
    try {
      execFileSync('git', ['cat-file', '-e', `${roots[0]}:.public-root`], { stdio: 'ignore' });
    } catch {
      findings.push('the Git root commit does not contain .public-root; pre-public history may still be reachable');
    }
  }
}

if (findings.length > 0) {
  console.error('PUBLIC READINESS AUDIT FAILED');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`PUBLIC READINESS AUDIT OK (${tracked.length} tracked files checked)`);
console.log(`Root marker: ${tracked.includes('.public-root') ? 'present' : 'not yet created (pre-public preparation state)'}`);
console.log(`Repository: ${basename(process.cwd())}`);
