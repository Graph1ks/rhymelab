const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const editor = $('#editor');
const suggestions = $('#suggestions');
const focusWord = $('#focusWord');
const root = document.documentElement;

if (!editor || !suggestions || !focusWord) {
  throw new Error('RhymePad v14 integration target is incomplete');
}

const RHYME_TYPES = [
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
  'assonance',
  'consonance',
];

const TYPE_LABELS = {
  multisyllabic_perfect: 'multi perfect',
  perfect: 'perfect',
  multisyllabic_slant: 'multi slant',
  family: 'family',
  slant: 'slant',
  assonance: 'assonance',
  consonance: 'consonance',
};

const state = {
  abortController: null,
  timer: null,
  lastQueryKey: '',
  data: null,
  filteredRows: [],
  hiddenUsed: 0,
  writePage: 1,
  writePageSize: 30,
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/\s+/g, ' ')
    .trim();
}

function lyricWords() {
  return new Set(
    (editor.value.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [])
      .map(normalize)
      .filter(Boolean),
  );
}

function isAlreadyUsed(row) {
  const candidate = normalize(row.word);
  if (!candidate) return true;
  if (row.resultKind === 'phrase') {
    return normalize(editor.value).includes(candidate);
  }
  return lyricWords().has(candidate);
}

function currentQuery() {
  const start = editor.selectionStart ?? 0;
  const end = editor.selectionEnd ?? start;
  if (end > start) {
    const selected = editor.value.slice(start, end).replace(/\s+/g, ' ').trim();
    if (selected.length >= 2 && selected.length <= 140) return selected;
  }
  const focused = focusWord.textContent?.trim() || '';
  return focused === '—' ? '' : focused.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’\-]+$/gu, '');
}

function languageBasis() {
  const language = $('#lang')?.value || 'auto';
  if (language === 'de' || language === 'en') return language;
  const focused = ($('#focusLang')?.textContent || '').trim().toLocaleLowerCase('en-US');
  return focused === 'en' ? 'en' : 'de';
}

function appMode() {
  return root.dataset.mode || 'write';
}

function relationTypeFromOriginalFilter() {
  const value = $('#relationFilter')?.value || 'all';
  if (value === 'multisyllabic') return 'multisyllabic_perfect';
  return RHYME_TYPES.includes(value) ? value : 'all';
}

function writeRequest() {
  const preset = $('#rhymeLabPreset')?.value || 'best';
  if (preset === 'words') return { scope: 'words', type: 'all' };
  if (preset === 'phrases') return { scope: 'phrases', type: 'all' };
  if (RHYME_TYPES.includes(preset)) return { scope: 'all', type: preset };
  return { scope: 'all', type: 'all' };
}

function rhymeRequest() {
  return {
    scope: $('#rhymeLabDeepScope')?.value || 'all',
    type: $('#rhymeLabDeepType')?.value || relationTypeFromOriginalFilter(),
  };
}

function activeRequest() {
  return appMode() === 'rhyme' ? rhymeRequest() : writeRequest();
}

function rowTypes(row) {
  const types = [];
  const primary = row.primaryType || (RHYME_TYPES.includes(row.type) ? row.type : null);
  if (primary) types.push(primary);
  for (const type of row.relationTypes || []) {
    if (RHYME_TYPES.includes(type) && !types.includes(type)) types.push(type);
  }
  return types;
}

function primaryType(row) {
  return rowTypes(row)[0] || 'slant';
}

function relationScore(row, type) {
  if (type === 'assonance' || type === 'consonance') {
    return Number((row.relations || []).find((relation) => relation.type === type)?.score || 0);
  }
  return Number(row.score || 0);
}

function rowScore(row) {
  return relationScore(row, primaryType(row));
}

function resultMeta(row) {
  const usage = row.resultKind === 'phrase'
    ? (row.usageCount ? `${Number(row.usageCount).toLocaleString()} uses` : 'phrase')
    : (row.usageRank ? `usage #${Number(row.usageRank).toLocaleString()}` : 'usage —');
  const ipa = row.ipa ? `/${row.ipa}/` : '';
  return [
    `${row.syllableCount ?? '—'} syl`,
    usage,
    ipa,
  ].filter(Boolean);
}

function candidateHtml(row) {
  const types = rowTypes(row);
  const badges = types.slice(0, 3)
    .map((type) => `<span class="typeBadge">${esc(TYPE_LABELS[type] || type)}</span>`)
    .join('');
  const score = Math.round(rowScore(row) * 100);
  return `
    <button class="suggestion rhymeLabSuggestion rhymeLabCandidateButton" type="button" data-rhymelab-candidate="${esc(row.word)}">
      <div>
        <div class="suggestionWord">${esc(row.word)}</div>
        <div class="suggestionMeta">
          <span class="resultKind">${row.resultKind === 'phrase' ? 'PHRASE / MOSAIC' : 'WORD'}</span>
          ${badges}
          ${resultMeta(row).map((item) => `<span class="small">${esc(item)}</span>`).join('')}
        </div>
        <div class="score"><span style="width:${score}%"></span></div>
      </div>
      <div class="suggestionScore">${score}%</div>
    </button>`;
}

function groupHtml(label, rows, limit) {
  if (!rows.length) return '';
  const visible = rows.slice(0, limit);
  return `
    <div class="rhymeLabResultGroup">
      <div class="rhymeLabResultGroupHead"><strong>${esc(label)}</strong><span>${rows.length}</span></div>
      ${visible.map(candidateHtml).join('')}
    </div>`;
}

function installSuiteNavigation() {
  const toolbar = $('.toolbar');
  const brand = $('.brand');
  if (!toolbar || !brand || $('.rhymeLabProductNav')) return;

  const brandText = $('.brandText', brand);
  if (brandText) brandText.innerHTML = 'RhymePad<small>RhymeLab · local</small>';

  const nav = document.createElement('nav');
  nav.className = 'rhymeLabProductNav';
  nav.setAttribute('aria-label', 'RhymeLab workspace');
  nav.innerHTML = '<a href="/">SEARCH</a><a href="/pad" class="active" aria-current="page">WRITE</a>';
  brand.insertAdjacentElement('afterend', nav);
}

function installRhymeLabControls() {
  const section = suggestions.closest('.section');
  const title = section?.querySelector('.sectionTitle');
  const head = title?.parentElement;
  if (!section || !title || !head) return;

  title.textContent = 'RhymeLab live suggestions';
  const badge = document.createElement('span');
  badge.className = 'rhymeLabSourceBadge';
  badge.textContent = 'LOCAL / API';
  title.appendChild(document.createTextNode(' · '));
  title.appendChild(badge);

  const presetWrap = document.createElement('span');
  presetWrap.id = 'rhymeLabPresetWrap';
  presetWrap.className = 'selectWrap';
  presetWrap.innerHTML = `
    <select id="rhymeLabPreset" aria-label="RhymeLab result preset">
      <option value="best">Best of everything</option>
      <option value="words">Words only</option>
      <option value="phrases">Phrases / Mosaic only</option>
      <option value="multisyllabic_perfect">Multisyllabic perfect</option>
      <option value="perfect">Perfect rhyme</option>
      <option value="multisyllabic_slant">Multisyllabic slant</option>
      <option value="family">Rhyme family</option>
      <option value="slant">Slant rhyme</option>
      <option value="assonance">Assonance</option>
      <option value="consonance">Consonance</option>
    </select>`;
  const relationWrap = $('#relationFilterWrap');
  if (relationWrap) head.insertBefore(presetWrap, relationWrap);
  else head.appendChild(presetWrap);

  const meta = document.createElement('div');
  meta.id = 'rhymeLabAssistMeta';
  meta.className = 'rhymeLabAssistMeta';
  meta.textContent = 'RhymeLab follows the active word or selected phrase.';
  suggestions.insertAdjacentElement('beforebegin', meta);

  $('#rhymeLabPreset')?.addEventListener('change', () => {
    state.writePage = 1;
    scheduleSearch(0, true);
  });
}

function installDeepResults() {
  const center = $('.centerPanel');
  if (!center || $('.rhymeLabDeepResults')) return;

  const deep = document.createElement('section');
  deep.className = 'rhymeLabDeepResults';
  deep.innerHTML = `
    <div class="rhymeLabDeepHead">
      <strong>RhymeLab results</strong>
      <span id="rhymeLabDeepCount" class="small">—</span>
      <label class="small">Results
        <select id="rhymeLabDeepScope">
          <option value="all">Words + Phrases</option>
          <option value="words">Words</option>
          <option value="phrases">Phrases / Mosaic</option>
        </select>
      </label>
      <label class="small">Relation
        <select id="rhymeLabDeepType">
          <option value="all">All relations</option>
          <option value="multisyllabic_perfect">Multisyllabic perfect</option>
          <option value="perfect">Perfect rhyme</option>
          <option value="multisyllabic_slant">Multisyllabic slant</option>
          <option value="family">Rhyme family</option>
          <option value="slant">Slant rhyme</option>
          <option value="assonance">Assonance</option>
          <option value="consonance">Consonance</option>
        </select>
      </label>
    </div>
    <div id="rhymeLabDeepBody" class="rhymeLabDeepBody">
      <div class="rhymeLabNoResults">Move the cursor to a word to load RhymeLab results.</div>
    </div>`;
  center.appendChild(deep);

  $('#rhymeLabDeepScope')?.addEventListener('change', () => scheduleSearch(0, true));
  $('#rhymeLabDeepType')?.addEventListener('change', () => scheduleSearch(0, true));
}

function setAssistMeta(message, { error = false } = {}) {
  const meta = $('#rhymeLabAssistMeta');
  if (!meta) return;
  meta.textContent = message;
  meta.classList.toggle('error', error);
}

function renderWriteResults() {
  const rows = state.filteredRows;
  const words = rows.filter((row) => row.resultKind !== 'phrase');
  const phrases = rows.filter((row) => row.resultKind === 'phrase');
  const request = writeRequest();
  const perChannel = state.writePageSize * state.writePage;

  let html = '';
  if (request.scope !== 'phrases') html += groupHtml('Words', words, perChannel);
  if (request.scope !== 'words') html += groupHtml('Phrases / Mosaic', phrases, perChannel);

  const visibleWords = request.scope === 'phrases' ? 0 : Math.min(words.length, perChannel);
  const visiblePhrases = request.scope === 'words' ? 0 : Math.min(phrases.length, perChannel);
  const hasMore = visibleWords < words.length || visiblePhrases < phrases.length;

  if (!html) html = '<div class="small">No unused RhymeLab candidates for this filter.</div>';
  if (hasMore) {
    html += `<button id="rhymeLabLoadMore" class="rhymeLabLoadMore" type="button">Show more · ${visibleWords + visiblePhrases} of ${words.length + phrases.length}</button>`;
  }

  suggestions.innerHTML = html;
  $('#rhymeLabLoadMore')?.addEventListener('click', () => {
    state.writePage += 1;
    renderWriteResults();
  });
}

function renderDeepResults() {
  const body = $('#rhymeLabDeepBody');
  const count = $('#rhymeLabDeepCount');
  if (!body || !count) return;

  const words = state.filteredRows.filter((row) => row.resultKind !== 'phrase');
  const phrases = state.filteredRows.filter((row) => row.resultKind === 'phrase');
  count.textContent = `${state.filteredRows.length} unused · ${state.hiddenUsed} used hidden`;

  const sections = [];
  if (words.length) {
    sections.push(`<section class="rhymeLabDeepSection"><div class="rhymeLabDeepSectionHead"><strong>Words</strong><span>${words.length}</span></div>${words.map(candidateHtml).join('')}</section>`);
  }
  if (phrases.length) {
    sections.push(`<section class="rhymeLabDeepSection"><div class="rhymeLabDeepSectionHead"><strong>Phrases / Mosaic</strong><span>${phrases.length}</span></div>${phrases.map(candidateHtml).join('')}</section>`);
  }

  body.innerHTML = sections.length
    ? `<div class="rhymeLabDeepGrid">${sections.join('')}</div>`
    : '<div class="rhymeLabNoResults">No unused RhymeLab candidates for this filter.</div>';
}

function renderResults() {
  if (!state.data) return;
  renderWriteResults();
  renderDeepResults();
  const total = state.data.results?.length || 0;
  setAssistMeta(
    `${state.filteredRows.length} unused candidates from ${total} returned · ${state.hiddenUsed} already used in this lyric hidden`,
  );
}

function replaceCandidate(value) {
  if (typeof window.replaceCurrentWord === 'function') {
    window.replaceCurrentWord(value);
    scheduleSearch(0, true);
    return;
  }

  const start = editor.selectionStart ?? 0;
  const end = editor.selectionEnd ?? start;
  const before = editor.value.slice(0, start);
  const after = editor.value.slice(end);
  const left = before.match(/\S+$/)?.[0] || '';
  const right = after.match(/^\S+/)?.[0] || '';
  const replaceStart = end > start ? start : start - left.length;
  const replaceEnd = end > start ? end : end + right.length;
  editor.value = editor.value.slice(0, replaceStart) + value + editor.value.slice(replaceEnd);
  const caret = replaceStart + value.length;
  editor.setSelectionRange(caret, caret);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.focus();
}

async function runSearch(force = false) {
  const query = currentQuery();
  if (!query || query.length < 2) {
    state.lastQueryKey = '';
    state.data = null;
    state.filteredRows = [];
    state.hiddenUsed = 0;
    suggestions.innerHTML = '<div class="small">No active word yet.</div>';
    const body = $('#rhymeLabDeepBody');
    if (body) body.innerHTML = '<div class="rhymeLabNoResults">Move the cursor to a word to load RhymeLab results.</div>';
    setAssistMeta('RhymeLab follows the active word or selected phrase.');
    return;
  }

  const request = activeRequest();
  const basis = languageBasis();
  const queryKey = JSON.stringify([query, basis, request.scope, request.type, editor.value]);
  if (!force && queryKey === state.lastQueryKey) return;
  state.lastQueryKey = queryKey;

  state.abortController?.abort();
  const controller = new AbortController();
  state.abortController = controller;

  suggestions.innerHTML = '<div class="small">Searching RhymeLab…</div>';
  setAssistMeta(`Searching “${query}” locally…`);

  const params = new URLSearchParams({
    q: query,
    language: basis,
    scope: request.scope,
    type: request.type,
    word_limit: '250',
    word_pool: '1200',
    phrase_limit: '250',
    phrase_pool: '1024',
    phrase_per_channel: '256',
    variants: 'preferred',
    historical: 'current',
  });

  try {
    const response = await fetch(`/api/writer?${params}`, { signal: controller.signal });
    const data = await response.json();
    if (!response.ok) {
      const warning = (data.warnings || []).map((item) => item.message).filter(Boolean).join(' ');
      throw new Error(warning || data.error || data.status || 'RhymeLab search failed');
    }

    const returned = Array.isArray(data.results) ? data.results : [];
    const unused = returned.filter((row) => !isAlreadyUsed(row));
    const filtered = request.type === 'all'
      ? unused
      : unused.filter((row) => rowTypes(row).includes(request.type));
    state.data = data;
    state.filteredRows = filtered;
    state.hiddenUsed = returned.length - unused.length;
    state.writePage = 1;
    renderResults();
  } catch (error) {
    if (error?.name === 'AbortError') return;
    state.data = null;
    state.filteredRows = [];
    suggestions.innerHTML = '<div class="small">RhymeLab results unavailable.</div>';
    const body = $('#rhymeLabDeepBody');
    if (body) body.innerHTML = `<div class="rhymeLabNoResults">${esc(error?.message || error)}</div>`;
    setAssistMeta(error?.message || String(error), { error: true });
  }
}

function scheduleSearch(delay = 180, force = false) {
  clearTimeout(state.timer);
  const query = currentQuery();
  if (query) {
    suggestions.innerHTML = '<div class="small">Searching RhymeLab…</div>';
  }
  state.timer = setTimeout(() => runSearch(force), delay);
}

function installListeners() {
  for (const eventName of ['input', 'click', 'keyup', 'select']) {
    editor.addEventListener(eventName, () => scheduleSearch());
  }

  $('#lang')?.addEventListener('change', () => scheduleSearch(0, true));
  $('#relationFilter')?.addEventListener('change', () => scheduleSearch(0, true));

  $$('.modeTab').forEach((button) => button.addEventListener('click', () => {
    setTimeout(() => scheduleSearch(0, true), 0);
  }));

  const observer = new MutationObserver(() => scheduleSearch());
  observer.observe(focusWord, { childList: true, characterData: true, subtree: true });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-rhymelab-candidate]');
    if (!button) return;
    event.preventDefault();
    replaceCandidate(button.dataset.rhymelabCandidate);
  });
}

installSuiteNavigation();
installRhymeLabControls();
installDeepResults();
installListeners();
document.title = `${$('#songTitle')?.value || 'RhymePad'} — RhymeLab`;
scheduleSearch(0, true);
