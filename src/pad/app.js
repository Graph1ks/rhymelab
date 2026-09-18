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
  autoScrollResetAt: 0,
  autoScrollPaused: false,
};

const AUTO_SCROLL_STORAGE_KEY = 'rhymepad:suggestions:auto-scroll';

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

function createDeckField(id, label, target, { compact = false } = {}) {
  const control = document.getElementById(id);
  if (!control || !target) return null;

  const field = document.createElement('label');
  field.className = `rhymePadDeckField${compact ? ' compact' : ''}`;
  const caption = document.createElement('span');
  caption.className = 'rhymePadDeckLabel';
  caption.textContent = label;
  field.append(caption, control);
  target.appendChild(field);
  return field;
}

function createDeckAction(id, target, ariaLabel = '') {
  const control = document.getElementById(id);
  if (!control || !target) return null;
  control.classList.add('rhymePadDeckAction');
  if (ariaLabel && !control.getAttribute('aria-label')) control.setAttribute('aria-label', ariaLabel);
  target.appendChild(control);
  return control;
}

function createDeckToggle(id, label, target) {
  const control = document.getElementById(id);
  if (!control || !target) return null;

  const wrap = document.createElement('label');
  wrap.className = 'rhymePadDeckToggle';
  const text = document.createElement('span');
  text.textContent = label;
  wrap.append(control, text);
  target.appendChild(wrap);
  return wrap;
}

function createMetricTile(id, label, target, { primary = false } = {}) {
  const value = document.getElementById(id);
  if (!value || !target) return null;

  const tile = document.createElement('div');
  tile.className = `rhymePadMetricTile${primary ? ' primary' : ''}`;
  const caption = document.createElement('span');
  caption.className = 'rhymePadMetricLabel';
  caption.textContent = label;
  value.classList.add('rhymePadMetricValue');
  tile.append(caption, value);
  target.appendChild(tile);
  return tile;
}

function syncEditorMetricScale() {
  const computedPx = Number.parseFloat(getComputedStyle(editor).fontSize);
  const controlPx = Number.parseFloat($('#fontSize')?.value || '');
  const editorPx = Number.isFinite(computedPx) && computedPx > 0
    ? computedPx
    : Number.isFinite(controlPx) && controlPx > 0
      ? controlPx
      : 18;
  const metricPx = Math.max(12, Math.min(34, editorPx * 0.72));
  root.style.setProperty('--rhymePadEditorFontPx', `${editorPx.toFixed(2)}px`);
  root.style.setProperty('--rhymePadMetricFontPx', `${metricPx.toFixed(2)}px`);

  const readout = $('#rhymePadFontSizeReadout');
  if (readout) readout.textContent = `${Math.round(editorPx)} px`;
}

function scheduleMetricScaleSync() {
  syncEditorMetricScale();
  requestAnimationFrame(syncEditorMetricScale);
}

function installCommandDeck() {
  if ($('#rhymePadCommandDeck')) return;

  const editorWrap = $('#editorWrap') || editor.closest('.editorWrap') || editor;
  const center = $('.centerPanel') || editorWrap.parentElement;
  if (!center) return;

  const deck = document.createElement('section');
  deck.id = 'rhymePadCommandDeck';
  deck.className = 'rhymePadCommandDeck';
  deck.setAttribute('aria-label', 'RhymePad writing controls');
  deck.innerHTML = `
    <div class="rhymePadDeckPrimary">
      <div class="rhymePadDeckSong"></div>
      <div class="rhymePadDeckMetadata"></div>
      <div class="rhymePadDeckActions"></div>
    </div>
    <div class="rhymePadDeckWorkflow">
      <div class="rhymePadDeckModes"></div>
      <div class="rhymePadDeckTypography"></div>
    </div>
    <div class="rhymePadDeckMetrics">
      <div class="rhymePadMetricStrip"></div>
      <div class="rhymePadDeckStatus"></div>
    </div>`;
  center.insertBefore(deck, editorWrap);

  const song = $('.rhymePadDeckSong', deck);
  const metadata = $('.rhymePadDeckMetadata', deck);
  const actions = $('.rhymePadDeckActions', deck);
  const modes = $('.rhymePadDeckModes', deck);
  const typography = $('.rhymePadDeckTypography', deck);
  const metrics = $('.rhymePadMetricStrip', deck);
  const status = $('.rhymePadDeckStatus', deck);

  createDeckField('songTitle', 'Song', song);
  createDeckField('bpm', 'BPM', metadata, { compact: true });
  createDeckField('lang', 'Language', metadata, { compact: true });

  createDeckAction('libraryOpen', actions, 'Open Library');
  const history = document.createElement('div');
  history.className = 'rhymePadHistoryActions';
  actions.appendChild(history);
  createDeckAction('historyBack', history, 'History back');
  createDeckAction('historyForward', history, 'History forward');
  createDeckAction('themeToggle', actions, 'Toggle theme');

  const modeTabs = $('.modeTabs');
  if (modeTabs) modes.appendChild(modeTabs);

  createDeckField('fontPicker', 'Typeface', typography);
  const sizeField = createDeckField('fontSize', 'Size', typography, { compact: true });
  if (sizeField) {
    const readout = document.createElement('span');
    readout.id = 'rhymePadFontSizeReadout';
    readout.className = 'rhymePadFontSizeReadout';
    sizeField.appendChild(readout);
  }
  createDeckToggle('strict', 'Strict', typography);

  createMetricTile('barNo', 'Bar', metrics, { primary: true });
  createMetricTile('syl', 'Syllables', metrics, { primary: true });
  createMetricTile('words', 'Words', metrics);
  createMetricTile('hits', 'Rhyme hits', metrics);
  createMetricTile('breath', 'Breath', metrics);
  createMetricTile('stressCount', 'Stress', metrics);

  const songStats = $('#songStats');
  if (songStats) status.appendChild(songStats);
  const autosave = $('#autosave');
  if (autosave) status.appendChild(autosave);

  const toolbar = $('.toolbar');
  const brand = $('.brand');
  const productNav = $('.rhymeLabProductNav');
  if (toolbar) {
    [...toolbar.children].forEach((child) => {
      const keep = child === brand
        || child === productNav
        || child.contains(brand)
        || child.contains(productNav);
      if (!keep) child.classList.add('rhymePadLegacyTopHidden');
    });
  }

  const fontSize = $('#fontSize');
  fontSize?.addEventListener('input', scheduleMetricScaleSync);
  fontSize?.addEventListener('change', scheduleMetricScaleSync);
  $('#fontPicker')?.addEventListener('change', scheduleMetricScaleSync);

  const editorStyleObserver = new MutationObserver(scheduleMetricScaleSync);
  editorStyleObserver.observe(editor, { attributes: true, attributeFilter: ['style', 'class'] });
  window.addEventListener('resize', scheduleMetricScaleSync, { passive: true });
  scheduleMetricScaleSync();
}

function stopSuggestionAutoScroll() {
  if (state.autoScrollFrame != null) cancelAnimationFrame(state.autoScrollFrame);
  state.autoScrollFrame = null;
  state.autoScrollLastTs = 0;
  state.autoScrollResetAt = 0;
}

function autoScrollSuggestionFrame(timestamp) {
  if (!state.autoScrollEnabled) {
    stopSuggestionAutoScroll();
    return;
  }

  const maxScroll = Math.max(0, suggestions.scrollHeight - suggestions.clientHeight);
  const previous = state.autoScrollLastTs || timestamp;
  const elapsed = Math.min(80, Math.max(0, timestamp - previous));
  state.autoScrollLastTs = timestamp;

  if (!state.autoScrollPaused && !document.hidden && maxScroll > 2) {
    if (suggestions.scrollTop >= maxScroll - 1) {
      if (!state.autoScrollResetAt) state.autoScrollResetAt = timestamp + 1100;
      if (timestamp >= state.autoScrollResetAt) {
        suggestions.scrollTop = 0;
        state.autoScrollResetAt = 0;
      }
    } else {
      suggestions.scrollTop = Math.min(maxScroll, suggestions.scrollTop + elapsed * 0.026);
      state.autoScrollResetAt = 0;
    }
  }

  state.autoScrollFrame = requestAnimationFrame(autoScrollSuggestionFrame);
}

function startSuggestionAutoScroll({ reset = false } = {}) {
  stopSuggestionAutoScroll();
  if (reset) suggestions.scrollTop = 0;
  if (!state.autoScrollEnabled) return;
  state.autoScrollFrame = requestAnimationFrame(autoScrollSuggestionFrame);
}

function setSuggestionAutoScroll(enabled, { persist = true } = {}) {
  state.autoScrollEnabled = Boolean(enabled);
  const checkbox = $('#rhymeLabAutoScroll');
  if (checkbox) checkbox.checked = state.autoScrollEnabled;
  suggestions.classList.toggle('is-auto-scrolling', state.autoScrollEnabled);

  if (persist) {
    try {
      localStorage.setItem(AUTO_SCROLL_STORAGE_KEY, state.autoScrollEnabled ? '1' : '0');
    } catch {
      // Browser storage is optional; the current session still keeps the preference.
    }
  }

  startSuggestionAutoScroll();
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
  autoScroll.innerHTML = '<input id="rhymeLabAutoScroll" type="checkbox"> <span>Auto-scroll</span>';
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
  suggestions.addEventListener('pointerenter', () => {
    state.autoScrollPaused = true;
  });
  suggestions.addEventListener('pointerleave', () => {
    state.autoScrollPaused = false;
    state.autoScrollLastTs = 0;
  });
  suggestions.addEventListener('focusin', () => {
    state.autoScrollPaused = true;
  });
  suggestions.addEventListener('focusout', () => {
    state.autoScrollPaused = false;
    state.autoScrollLastTs = 0;
  });
  autoScrollInput.addEventListener('change', () => {
    setSuggestionAutoScroll(autoScrollInput.checked);
  });
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
  startSuggestionAutoScroll({ reset: true });
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

  if (basis === 'en') {
    state.abortController?.abort();
    state.lastQueryKey = JSON.stringify([query, basis, 'original-rhymepad-fallback', editor.value]);
    state.data = null;
    state.filteredRows = [];
    state.hiddenUsed = 0;
    setAssistMeta('English · original RhymePad phonetic fallback stays active until the accepted RhymeLab EN runtime ships.');
    const body = $('#rhymeLabDeepBody');
    if (body) body.innerHTML = '<div class="rhymeLabNoResults">RhymeLab deep results currently use the accepted German runtime. Original RhymePad EN analysis remains active.</div>';
    const count = $('#rhymeLabDeepCount');
    if (count) count.textContent = 'EN runtime pending';
    return;
  }

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
  if (query && languageBasis() !== 'en') {
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
installCommandDeck();
installRhymeLabControls();
installDeepResults();
installListeners();
document.title = `${$('#songTitle')?.value || 'RhymePad'} — RhymeLab`;
scheduleSearch(0, true);
