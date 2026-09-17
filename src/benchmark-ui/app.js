const $ = (selector) => document.querySelector(selector);

const PRIMARY = ['none','multisyllabic_perfect','perfect','multisyllabic_slant','family','slant'];
const RELATIONS = ['none','partial','strong'];
const I18N = {
  de: {
    progress:'bearbeitet', pending:'offen', skipped:'übersprungen', completion:'Fortschritt', query:'Suchwort', category:'Sampling-Kategorie',
    showReviewed:'Bereits bewertete anzeigen', nextPending:'Nächste offene', queryWord:'Suchwort', candidate:'Kandidat', engine:'Engine', showEngine:'Engine-Prognose anzeigen',
    rubricTitle:'Bewertungsrubrik', rubricPrimaryTitle:'Primärreim',
    rubricPrimary:'Vollreim = exakter betonter Reimbereich; mehrsilbiger Vollreim = exakt über mindestens zwei Reimsilben; mehrsilbiger Slant = starker mehrsilbiger Näherungsreim; Reimfamilie = klar verwandt, aber lockerer; Slant = loser, noch vertretbarer Näherungsreim; Keiner = kein überzeugender Primärreim.',
    rubricRelationsTitle:'Klangbeziehungen',
    rubricRelations:'Assonanz bewertet Vokalübereinstimmung, Konsonanz das Konsonantengerüst bei sinnvoller Vokalabweichung. Stark = offensichtlich, Partiell = vorhanden aber unvollständig, Keiner = nur zufällige/zu schwache Überlappung. Bei exakten Vollreimen beide als Keiner markieren, damit Relationen Zusatzinformation messen.',
    rubricUsefulnessTitle:'Songwriting-Nutzwert', rubricUsefulness:'0 falsch/unbrauchbar · 1 sehr schwach · 2 brauchbar · 3 stark · 4 exzellent/offensichtlich. Klangklasse und praktische Nutzbarkeit bewusst getrennt bewerten.',
    blindReminder:'Erst selbst urteilen. Die Engine-Prognose unten nur bei Bedarf nach der Bewertung aufklappen.',
    goldPrimary:'Welcher Primärreim ist es wirklich?', goldAssonance:'Assonanz', goldConsonance:'Konsonanz', usefulness:'Songwriting-Nutzwert',
    usefulnessHint:'0 = unbrauchbar/falsch · 2 = brauchbar · 4 = sehr starker Treffer', note:'Notiz (optional)', skip:'Überspringen', saveNext:'Speichern & weiter',
    noQueue:'Keine Benchmark-Queue gefunden. Erst `npm run benchmark:prepare` ausführen.', done:'Für diese Filter sind keine offenen Aufgaben mehr vorhanden.',
    chooseAll:'Bitte Primärreim, Assonanz, Konsonanz und Nutzwert bewerten.', enginePrimary:'Primärreim', engineRelations:'Klangbeziehungen',
    noPrimary:'kein Primärreim', noRelations:'keine', reviewed:'bereits bewertet', rank:'Rang', usage:'Gebrauchsrang', sampling:'Sampling', anchor:'Ankerpaar', overall_top:'Top-Ergebnis',
    none:'Keiner', multisyllabic_perfect:'Mehrsilbiger Vollreim', perfect:'Vollreim', multisyllabic_slant:'Mehrsilbiger Slant-Reim', family:'Reimfamilie', slant:'Slant-Reim',
    assonance:'Assonanz', consonance:'Konsonanz', partial:'Partiell', strong:'Stark', all:'Alle'
  },
  en: {
    progress:'processed', pending:'pending', skipped:'skipped', completion:'completion', query:'Query', category:'Sampling category',
    showReviewed:'Show reviewed tasks', nextPending:'Next pending', queryWord:'Query word', candidate:'Candidate', engine:'Engine', showEngine:'Show engine prediction',
    rubricTitle:'Review rubric', rubricPrimaryTitle:'Primary rhyme',
    rubricPrimary:'Perfect rhyme = exact stressed rhyme domain; multisyllabic perfect = exact across at least two rhyme syllables; multisyllabic slant = strong multisyllabic near rhyme; rhyme family = clearly related but looser; slant = loose but still defensible near rhyme; None = no convincing primary rhyme.',
    rubricRelationsTitle:'Sound relations',
    rubricRelations:'Assonance evaluates vowel agreement; Consonance evaluates the consonant skeleton with meaningful vowel contrast. Strong = obvious, Partial = present but incomplete, None = incidental or too weak. For exact perfect rhymes mark both as None so relations measure additional information.',
    rubricUsefulnessTitle:'Songwriting usefulness', rubricUsefulness:'0 wrong/unusable · 1 very weak · 2 usable · 3 strong · 4 excellent/obvious. Judge phonological class and practical usefulness separately.',
    blindReminder:'Judge the pair yourself first. Expand the engine prediction below only when needed after rating.',
    goldPrimary:'What is the actual primary rhyme class?', goldAssonance:'Assonance', goldConsonance:'Consonance', usefulness:'Songwriting usefulness',
    usefulnessHint:'0 = unusable/wrong · 2 = usable · 4 = very strong result', note:'Note (optional)', skip:'Skip', saveNext:'Save & next',
    noQueue:'No benchmark queue found. Run `npm run benchmark:prepare` first.', done:'No pending tasks remain for these filters.',
    chooseAll:'Please rate primary rhyme, assonance, consonance and usefulness.', enginePrimary:'Primary rhyme', engineRelations:'Sound relations',
    noPrimary:'no primary rhyme', noRelations:'none', reviewed:'already reviewed', rank:'Rank', usage:'Usage rank', sampling:'Sampling', anchor:'Anchor pair', overall_top:'Top result',
    none:'None', multisyllabic_perfect:'Multisyllabic perfect', perfect:'Perfect rhyme', multisyllabic_slant:'Multisyllabic slant', family:'Rhyme family', slant:'Slant rhyme',
    assonance:'Assonance', consonance:'Consonance', partial:'Partial', strong:'Strong', all:'All'
  }
};

const state = {
  lang: localStorage.getItem('rhymelab.language') === 'en' ? 'en' : 'de',
  payload: null,
  reviewMap: new Map(),
  currentId: null,
};
const t = (key) => I18N[state.lang][key] ?? I18N.de[key] ?? key;
const number = (value) => value == null ? '–' : Number(value).toLocaleString(state.lang === 'de' ? 'de-DE' : 'en-US');

function applyLanguage(){
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
  $('#langDe').classList.toggle('active', state.lang === 'de');
  $('#langEn').classList.toggle('active', state.lang === 'en');
  if (state.payload) render();
}

function labelPrimary(value){ return t(value); }
function labelRelation(value){ return t(value); }

function setEmpty(message){
  $('#reviewCard').classList.add('hidden');
  $('#empty').textContent = message;
  $('#empty').classList.remove('hidden');
}

function tasks(){ return state.payload?.queue?.tasks || []; }
function filteredTasks(){
  const query = $('#queryFilter').value;
  const category = $('#categoryFilter').value;
  const showReviewed = $('#showReviewed').checked;
  return tasks().filter((task) => {
    if (query !== 'all' && task.query.word !== query) return false;
    if (category !== 'all' && !(task.engine.sampling_categories || []).includes(category)) return false;
    if (!showReviewed && state.reviewMap.has(task.id)) return false;
    return true;
  });
}

function renderChoices(container, name, values, labels = null){
  container.innerHTML = '';
  for (const value of values) {
    const wrap = document.createElement('div');
    wrap.className = 'choice';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = name; input.value = String(value); input.id = `${name}-${value}`;
    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.textContent = labels?.[value] ?? (name === 'primary' ? labelPrimary(value) : labelRelation(value));
    wrap.append(input, label); container.append(wrap);
  }
}

function populateFilters(){
  const queryFilter = $('#queryFilter');
  const categoryFilter = $('#categoryFilter');
  const currentQuery = queryFilter.value || 'all';
  const currentCategory = categoryFilter.value || 'all';
  const queries = [...new Set(tasks().map((task) => task.query.word))].sort((a,b)=>a.localeCompare(b,'de'));
  const categories = state.payload?.queue?.categories || [];
  queryFilter.innerHTML = `<option value="all">${t('all')}</option>`;
  for (const query of queries) { const option=document.createElement('option'); option.value=query; option.textContent=query; queryFilter.append(option); }
  categoryFilter.innerHTML = `<option value="all">${t('all')}</option>`;
  for (const category of categories) { const option=document.createElement('option'); option.value=category; option.textContent=t(category); categoryFilter.append(option); }
  queryFilter.value = queries.includes(currentQuery) ? currentQuery : 'all';
  categoryFilter.value = categories.includes(currentCategory) ? currentCategory : 'all';
}

function renderSummary(){
  const summary = state.payload?.summary || {};
  $('#progress').textContent = `${number(summary.reviewed_tasks || 0)} / ${number(summary.total_tasks || 0)}`;
  $('#pending').textContent = number(summary.pending_tasks || 0);
  $('#skipped').textContent = number(summary.skipped_tasks || 0);
  $('#completion').textContent = `${Number(summary.completion_pct || 0).toLocaleString(state.lang === 'de' ? 'de-DE' : 'en-US', {maximumFractionDigits:1})}%`;
}

function relationText(relation){
  return `${t(relation.type)} · ${labelRelation(relation.strength)} · ${Math.round(Number(relation.score || 0) * 100)}%`;
}

function renderTask(task){
  if (!task) { setEmpty(t('done')); return; }
  state.currentId = task.id;
  $('#empty').classList.add('hidden');
  $('#reviewCard').classList.remove('hidden');
  $('#engineDetails').open = false;
  $('#queryWord').textContent = task.query.word;
  $('#queryIpa').textContent = `/${task.query.ipa || ''}/`;
  $('#candidateWord').textContent = task.candidate.word;
  $('#candidateIpa').textContent = `/${task.candidate.ipa || ''}/`;
  $('#phenomena').innerHTML = '';
  for (const item of task.query.phenomena || []) { const chip=document.createElement('span'); chip.textContent=item.replaceAll('_',' '); $('#phenomena').append(chip); }

  $('#enginePrimary').innerHTML = '';
  const primaryLabel = document.createElement('span'); primaryLabel.className='muted'; primaryLabel.textContent=`${t('enginePrimary')}: `;
  const primaryBadge = document.createElement('span'); primaryBadge.className='badge'; primaryBadge.textContent=task.engine.primary_type ? `${labelPrimary(task.engine.primary_type)} · ${Math.round(Number(task.engine.primary_score || 0)*100)}%` : t('noPrimary');
  $('#enginePrimary').append(primaryLabel, primaryBadge);
  $('#engineRelations').innerHTML = '';
  const relLabel=document.createElement('span'); relLabel.className='muted'; relLabel.textContent=`${t('engineRelations')}: `; $('#engineRelations').append(relLabel);
  if ((task.engine.relations || []).length) {
    for (const relation of task.engine.relations) { const badge=document.createElement('span'); badge.className='badge relation'; badge.textContent=relationText(relation); $('#engineRelations').append(badge); }
  } else { const none=document.createElement('span'); none.className='muted'; none.textContent=t('noRelations'); $('#engineRelations').append(none); }
  $('#engineMeta').textContent = `${t('rank')}: ${task.engine.overall_rank ?? '–'} · ${t('usage')}: ${task.candidate.usage_rank ? `#${number(task.candidate.usage_rank)}` : '–'} · ${t('sampling')}: ${(task.engine.sampling_categories || []).map((value)=>t(value)).join(', ')}`;

  renderChoices($('#primaryChoices'),'primary',PRIMARY);
  renderChoices($('#assonanceChoices'),'assonance',RELATIONS);
  renderChoices($('#consonanceChoices'),'consonance',RELATIONS);
  renderChoices($('#usefulnessChoices'),'usefulness',[0,1,2,3,4],{0:'0',1:'1',2:'2',3:'3',4:'4'});

  const existing = state.reviewMap.get(task.id);
  $('#note').value = existing?.note || '';
  if (existing && !existing.skip) {
    for (const [name,value] of [['primary',existing.primary],['assonance',existing.assonance],['consonance',existing.consonance],['usefulness',existing.usefulness]]) {
      const input = document.querySelector(`input[name="${name}"][value="${CSS.escape(String(value))}"]`); if(input) input.checked=true;
    }
  }
}

function render(){
  populateFilters();
  renderSummary();
  const visible = filteredTasks();
  const current = visible.find((task) => task.id === state.currentId) || visible[0] || null;
  renderTask(current);
}

async function loadState(){
  try {
    const response = await fetch('/api/benchmark/state');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || response.statusText);
    state.payload = data;
    state.reviewMap = new Map((state.payload.reviews?.reviews || []).map((review) => [review.task_id, review]));
    render();
  } catch (error) {
    setEmpty(error.message.includes('not prepared') ? t('noQueue') : error.message);
  }
}

async function saveReview(payload){
  const response = await fetch('/api/benchmark/review', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Save failed');
  state.currentId = null;
  await loadState();
}

$('#reviewForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const taskId = state.currentId;
  if (!taskId) return;
  const value = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;
  const primary=value('primary'), assonance=value('assonance'), consonance=value('consonance'), usefulness=value('usefulness');
  if (primary == null || assonance == null || consonance == null || usefulness == null) { alert(t('chooseAll')); return; }
  await saveReview({ task_id:taskId, primary, assonance, consonance, usefulness:Number(usefulness), note:$('#note').value });
});
$('#skip').addEventListener('click', async () => { if(state.currentId) await saveReview({ task_id:state.currentId, skip:true, note:$('#note').value }); });
$('#nextPending').addEventListener('click', () => { state.currentId = null; $('#showReviewed').checked=false; render(); });
for (const id of ['queryFilter','categoryFilter','showReviewed']) $(`#${id}`).addEventListener('change',()=>{state.currentId=null;render();});
$('#langDe').addEventListener('click',()=>{state.lang='de';localStorage.setItem('rhymelab.language','de');applyLanguage();});
$('#langEn').addEventListener('click',()=>{state.lang='en';localStorage.setItem('rhymelab.language','en');applyLanguage();});

applyLanguage();
loadState();
