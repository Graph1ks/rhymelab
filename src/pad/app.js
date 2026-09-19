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

const ENTITY_CATEGORY_LABELS = {
  'person.rapper': 'Rapper',
  'person.musician': 'Musician',
  'person.actor': 'Actor',
  'person.director': 'Director',
  'group.music_group': 'Band / group',
  'organization.car_brand': 'Car brand',
  'organization.fashion_house': 'Fashion house',
  'organization.company': 'Company',
  'work.film': 'Film',
  'work.video_game': 'Game',
  'work.album': 'Album',
  'work.song': 'Song',
  'fictional.character': 'Character',
};

const ENTITY_CATEGORY_OPTIONS = `
  <option value="all">All entities</option>
  <optgroup label="People">
    <option value="person.rapper">Rapper</option>
    <option value="person.musician">Musicians</option>
    <option value="person.actor">Actors</option>
    <option value="person.director">Directors</option>
  </optgroup>
  <optgroup label="Music / culture">
    <option value="group.music_group">Bands / groups</option>
    <option value="work.song">Songs</option>
    <option value="work.album">Albums</option>
    <option value="work.film">Films</option>
    <option value="work.video_game">Games</option>
    <option value="fictional.character">Characters</option>
  </optgroup>
  <optgroup label="Brands / organizations">
    <option value="organization.car_brand">Car brands</option>
    <option value="organization.fashion_house">Fashion houses</option>
    <option value="organization.company">Companies</option>
  </optgroup>`;

const state = {
  abortController: null,
  timer: null,
  lastQueryKey: '',
  data: null,
  filteredRows: [],
  hiddenUsed: 0,
  writePage: 1,
  writePageSize: 30,
  autoScrollEnabled: false,
  autoScrollFrame: null,
  autoScrollLastTs: 0,
  autoScrollPauseUntil: 0,
};

const AUTO_SCROLL_STORAGE_KEY = 'rhymepad:suggestions:auto-scroll:v1';

try {
  state.autoScrollEnabled = localStorage.getItem(AUTO_SCROLL_STORAGE_KEY) === '1';
} catch {
  state.autoScrollEnabled = false;
}

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
  if (row.resultKind === 'phrase' || row.resultKind === 'entity') {
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
  if (preset === 'entities') return { scope: 'entities', type: 'all' };
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

function activeEntityCategory() {
  const id = appMode() === 'rhyme' ? '#rhymeLabDeepEntityCategory' : '#rhymeLabEntityCategory';
  return $(id)?.value || 'all';
}

function entityCategoryLabel(category) {
  return ENTITY_CATEGORY_LABELS[category]
    || String(category || 'Entity').replaceAll('.', ' / ');
}

function entityCategoryBadges(row) {
  if (row.resultKind !== 'entity') return '';
  const categories = (row.entityCategories || [])
    .filter((entry) => entry.retained !== false)
    .slice(0, 3);
  return categories
    .map((entry) => `<span class="entityCategoryBadge">${esc(entityCategoryLabel(entry.category))}</span>`)
    .join('');
}

function resultMeta(row) {
  const usage = row.resultKind === 'entity'
    ? (row.popularityTier ? `Tier ${row.popularityTier}` : 'entity')
    : row.resultKind === 'phrase'
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
          <span class="resultKind ${row.resultKind === 'entity' ? 'entity' : ''}">${row.resultKind === 'entity' ? 'ENTITY' : row.resultKind === 'phrase' ? 'PHRASE / MOSAIC' : 'WORD'}</span>
          ${entityCategoryBadges(row)}
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

function stopSuggestionAutoScroll() {
  if (state.autoScrollFrame != null) cancelAnimationFrame(state.autoScrollFrame);
  state.autoScrollFrame = null;
  state.autoScrollLastTs = 0;
}

function suggestionScrollRange() {
  const inspector = suggestions.closest('.inspector');
  const section = suggestions.closest('.section');
  if (!inspector || !section) return null;

  const inspectorRect = inspector.getBoundingClientRect();
  const sectionRect = section.getBoundingClientRect();
  const sectionTop = inspector.scrollTop + sectionRect.top - inspectorRect.top;
  const sectionBottom = sectionTop + section.offsetHeight;
  const maxContainerScroll = Math.max(0, inspector.scrollHeight - inspector.clientHeight);
  const start = Math.max(0, Math.min(maxContainerScroll, sectionTop - 6));
  const end = Math.max(
    start,
    Math.min(maxContainerScroll, sectionBottom - inspector.clientHeight + 10),
  );

  return { inspector, start, end };
}

function suggestionAutoScrollFrame(timestamp) {
  if (!state.autoScrollEnabled) {
    stopSuggestionAutoScroll();
    return;
  }

  const range = suggestionScrollRange();
  const previous = state.autoScrollLastTs || timestamp;
  const elapsed = Math.min(64, Math.max(0, timestamp - previous));
  state.autoScrollLastTs = timestamp;

  if (range && !document.hidden && timestamp >= state.autoScrollPauseUntil && range.end > range.start + 2) {
    const { inspector, start, end } = range;

    if (inspector.scrollTop < start - 2 || inspector.scrollTop > end + 2) {
      inspector.scrollTop = start;
      state.autoScrollPauseUntil = timestamp + 350;
    } else if (inspector.scrollTop >= end - 1) {
      inspector.scrollTop = start;
      state.autoScrollPauseUntil = timestamp + 850;
    } else {
      inspector.scrollTop = Math.min(end, inspector.scrollTop + elapsed * 0.045);
    }
  }

  state.autoScrollFrame = requestAnimationFrame(suggestionAutoScrollFrame);
}

function restartSuggestionAutoScroll({ reset = false } = {}) {
  stopSuggestionAutoScroll();
  const range = suggestionScrollRange();
  if (reset && range) range.inspector.scrollTop = range.start;
  if (!state.autoScrollEnabled) return;
  state.autoScrollPauseUntil = performance.now() + 250;
  state.autoScrollFrame = requestAnimationFrame(suggestionAutoScrollFrame);
}

function setSuggestionAutoScroll(enabled, { persist = true } = {}) {
  state.autoScrollEnabled = Boolean(enabled);
  suggestions.classList.toggle('rhymeLabAutoScrollActive', state.autoScrollEnabled);

  const checkbox = $('#rhymeLabAutoScroll');
  if (checkbox) checkbox.checked = state.autoScrollEnabled;

  if (persist) {
    try {
      localStorage.setItem(AUTO_SCROLL_STORAGE_KEY, state.autoScrollEnabled ? '1' : '0');
    } catch {
      // localStorage is optional; keep the current-session value regardless.
    }
  }

  restartSuggestionAutoScroll({ reset: state.autoScrollEnabled });
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
  nav.innerHTML = '<a href="/">SEARCH</a><a href="/pad" class="active" aria-current="page">RHYMEPAD</a>';
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
      <option value="entities">Entities only</option>
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

  const entityWrap = document.createElement('span');
  entityWrap.id = 'rhymeLabEntityCategoryWrap';
  entityWrap.className = 'selectWrap rhymeLabEntityCategoryWrap';
  entityWrap.innerHTML = `
    <select id="rhymeLabEntityCategory" aria-label="Entity category">
      ${ENTITY_CATEGORY_OPTIONS}
    </select>`;
  if (relationWrap) head.insertBefore(entityWrap, relationWrap);
  else head.appendChild(entityWrap);

  const autoScroll = document.createElement('label');
  autoScroll.className = 'rhymeLabAutoScrollToggle';
  autoScroll.innerHTML = '<input id="rhymeLabAutoScroll" type="checkbox"><span>Auto-scroll</span>';
  const autoScrollInput = $('input', autoScroll);
  autoScrollInput.checked = state.autoScrollEnabled;
  if (relationWrap) head.insertBefore(autoScroll, relationWrap);
  else head.appendChild(autoScroll);

  const meta = document.createElement('div');
  meta.id = 'rhymeLabAssistMeta';
  meta.className = 'rhymeLabAssistMeta';
  meta.textContent = 'RhymeLab follows the active word or selected phrase.';
  suggestions.insertAdjacentElement('beforebegin', meta);
  suggestions.classList.add('rhymeLabAutoScrollSurface');

  autoScrollInput.addEventListener('change', () => {
    setSuggestionAutoScroll(autoScrollInput.checked);
  });

  const inspector = suggestions.closest('.inspector');
  for (const eventName of ['wheel', 'touchstart', 'pointerdown', 'focusin']) {
    inspector?.addEventListener(eventName, () => {
      state.autoScrollPauseUntil = performance.now() + 3000;
    }, { passive: true });
  }

  const suggestionObserver = new MutationObserver(() => {
    restartSuggestionAutoScroll({ reset: state.autoScrollEnabled });
  });
  suggestionObserver.observe(suggestions, { childList: true, subtree: false });
  setSuggestionAutoScroll(state.autoScrollEnabled, { persist: false });

  $('#rhymeLabPreset')?.addEventListener('change', () => {
    state.writePage = 1;
    scheduleSearch(0, true);
  });
  $('#rhymeLabEntityCategory')?.addEventListener('change', () => {
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
          <option value="all">Words + Phrases + Entities</option>
          <option value="words">Words</option>
          <option value="phrases">Phrases / Mosaic</option>
          <option value="entities">Entities</option>
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
      <label class="small">Entity
        <select id="rhymeLabDeepEntityCategory">
          ${ENTITY_CATEGORY_OPTIONS}
        </select>
      </label>
    </div>
    <div id="rhymeLabDeepBody" class="rhymeLabDeepBody">
      <div class="rhymeLabNoResults">Move the cursor to a word to load RhymeLab results.</div>
    </div>`;
  center.appendChild(deep);

  $('#rhymeLabDeepScope')?.addEventListener('change', () => scheduleSearch(0, true));
  $('#rhymeLabDeepType')?.addEventListener('change', () => scheduleSearch(0, true));
  $('#rhymeLabDeepEntityCategory')?.addEventListener('change', () => scheduleSearch(0, true));
}

function setAssistMeta(message, { error = false } = {}) {
  const meta = $('#rhymeLabAssistMeta');
  if (!meta) return;
  meta.textContent = message;
  meta.classList.toggle('error', error);
}

function renderWriteResults() {
  const rows = state.filteredRows;
  const words = rows.filter((row) => row.resultKind === 'word');
  const phrases = rows.filter((row) => row.resultKind === 'phrase');
  const entities = rows.filter((row) => row.resultKind === 'entity');
  const request = writeRequest();
  const perChannel = state.writePageSize * state.writePage;

  let html = '';
  if (request.scope === 'all' || request.scope === 'words') html += groupHtml('Words', words, perChannel);
  if (request.scope === 'all' || request.scope === 'phrases') html += groupHtml('Phrases / Mosaic', phrases, perChannel);
  if (request.scope === 'all' || request.scope === 'entities') html += groupHtml('Entities', entities, perChannel);

  const visibleWords = request.scope === 'all' || request.scope === 'words' ? Math.min(words.length, perChannel) : 0;
  const visiblePhrases = request.scope === 'all' || request.scope === 'phrases' ? Math.min(phrases.length, perChannel) : 0;
  const visibleEntities = request.scope === 'all' || request.scope === 'entities' ? Math.min(entities.length, perChannel) : 0;
  const hasMore = visibleWords < words.length || visiblePhrases < phrases.length || visibleEntities < entities.length;

  if (!html) html = '<div class="small">No unused RhymeLab candidates for this filter.</div>';
  if (hasMore) {
    html += `<button id="rhymeLabLoadMore" class="rhymeLabLoadMore" type="button">Show more · ${visibleWords + visiblePhrases + visibleEntities} of ${words.length + phrases.length + entities.length}</button>`;
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

  const words = state.filteredRows.filter((row) => row.resultKind === 'word');
  const phrases = state.filteredRows.filter((row) => row.resultKind === 'phrase');
  const entities = state.filteredRows.filter((row) => row.resultKind === 'entity');
  count.textContent = `${state.filteredRows.length} unused · ${state.hiddenUsed} used hidden`;

  const sections = [];
  if (words.length) {
    sections.push(`<section class="rhymeLabDeepSection"><div class="rhymeLabDeepSectionHead"><strong>Words</strong><span>${words.length}</span></div>${words.map(candidateHtml).join('')}</section>`);
  }
  if (phrases.length) {
    sections.push(`<section class="rhymeLabDeepSection"><div class="rhymeLabDeepSectionHead"><strong>Phrases / Mosaic</strong><span>${phrases.length}</span></div>${phrases.map(candidateHtml).join('')}</section>`);
  }
  if (entities.length) {
    sections.push(`<section class="rhymeLabDeepSection entitySection"><div class="rhymeLabDeepSectionHead"><strong>Entities</strong><span>${entities.length}</span></div>${entities.map(candidateHtml).join('')}</section>`);
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

  const entityCategory = activeEntityCategory();
  const queryKey = JSON.stringify([query, basis, request.scope, request.type, entityCategory, editor.value]);
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
    word_pool: '800',
    phrase_limit: '250',
    phrase_pool: '1024',
    phrase_per_channel: '256',
    entity_limit: '250',
    entity_pool: '512',
    entity_category: entityCategory,
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

function initializeRhymeLabPad() {
  installSuiteNavigation();
  installRhymeLabControls();
  installDeepResults();
  installListeners();
  document.title = `${$('#songTitle')?.value || 'RhymePad'} — RhymeLab`;
  scheduleSearch(0, true);
}

try {
  initializeRhymeLabPad();
} catch (error) {
  root.dataset.rhymeLabIntegration = 'failed';
  suggestions.innerHTML = '<div class="rhymeLabIntegrationFailure"><strong>RhymeLab integration failed.</strong><span>Live database results are unavailable. Check the browser console.</span></div>';
  console.error('RhymePad / RhymeLab integration failed', error);
}
