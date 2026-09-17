import { readFile } from 'node:fs/promises';

function lineKey(y) {
  return Math.round(Number(y || 0) * 2) / 2;
}

function joinItems(items) {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let out = '';
  let previous = null;

  for (const item of sorted) {
    const text = String(item.str ?? '');
    if (!text) continue;

    if (!previous) {
      out = text;
      previous = item;
      continue;
    }

    const previousEnd = previous.x + Math.max(previous.width || 0, 0);
    const gap = item.x - previousEnd;
    const needsSpace = gap > 1.5
      && !/[\\s(\\/\\-]$/u.test(out)
      && !/^[,.;:!?%)\\]}]/u.test(text);

    out += needsSpace ? ' ' + text : text;
    previous = item;
  }

  return out.normalize('NFKC').replace(/\\s+/gu, ' ').trim();
}

export async function loadPdfJs() {
  try {
    return await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (error) {
    const wrapped = new Error(
      'pdfjs-dist is required for Cologne transcript extraction. '
      + 'Run npm install --no-save --ignore-scripts pdfjs-dist@6.3.289 or use the bootstrap command.',
    );
    wrapped.cause = error;
    throw wrapped;
  }
}

export async function extractPdfVisualLines(path, { pdfjs = null } = {}) {
  const module = pdfjs || await loadPdfJs();
  const bytes = new Uint8Array(await readFile(path));
  const loadingTask = module.getDocument({
    data: bytes,
    disableWorker: true,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;
  const lines = [];

  try {
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      const byY = new Map();

      for (const item of content.items || []) {
        if (!item || typeof item.str !== 'string' || !item.str.trim()) continue;
        const transform = Array.isArray(item.transform) ? item.transform : [];
        const x = Number(transform[4] || 0);
        const y = Number(transform[5] || 0);
        const key = lineKey(y);
        const bucket = byY.get(key) || [];
        bucket.push({
          str: item.str,
          x,
          width: Number(item.width || 0),
        });
        byY.set(key, bucket);
      }

      const pageLines = [...byY.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, items]) => joinItems(items))
        .filter(Boolean);

      for (const text of pageLines) {
        lines.push({ page: pageNo, text });
      }
    }
  } finally {
    await doc.destroy();
  }

  return lines;
}
