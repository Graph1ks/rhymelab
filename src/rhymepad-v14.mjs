import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

export const RHYMEPAD_V14_SHA256 = '2a7750b76d8011507b7c22bbdb8f4bb315f90c9468f02a880f60756ac6e1f1ee';
export const RHYMEPAD_V14_SOURCE_PATH = 'src/pad/rhymepad-v14-source.b64';

export function materializeRhymePadV14({
  sourcePath = resolve(RHYMEPAD_V14_SOURCE_PATH),
  stylesheetHref = '/pad/assets/styles.css',
  scriptSrc = '/pad/assets/app.js',
} = {}) {
  const encoded = readFileSync(sourcePath, 'utf8').trim();
  const html = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
  const sha256 = createHash('sha256').update(html).digest('hex');

  if (sha256 !== RHYMEPAD_V14_SHA256) {
    throw new Error(`RhymePad v14 source checksum mismatch: expected ${RHYMEPAD_V14_SHA256}, got ${sha256}`);
  }

  const styleTag = `<link rel="stylesheet" href="${stylesheetHref}">`;
  const scriptTag = `<script type="module" src="${scriptSrc}"></script>`;
  const integrated = html
    .replace(/<title>[^<]*<\/title>/, '<title>RhymePad · RhymeLab Local</title>')
    .replace('</head>', `  ${styleTag}\n</head>`)
    .replace('</body>', `  ${scriptTag}\n</body>`);

  return {
    html: integrated,
    sourceHtml: html,
    sha256,
  };
}
