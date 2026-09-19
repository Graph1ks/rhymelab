import { CLIENT_QUERY_PRONUNCIATION_POLICY, resolveUnknownClientPronunciation } from './query-pronunciation-client.mjs';
import { readGeneratedPronunciationCache, writeGeneratedPronunciationCache } from './query-pronunciation-cache.mjs';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const PRIMARY_RHYME_TYPES = ['multisyllabic_perfect','perfect','multisyllabic_slant','family','slant'];
const SOUND_RELATION_TYPES = ['assonance','consonance'];
const RHYME_TYPES = [...PRIMARY_RHYME_TYPES, ...SOUND_RELATION_TYPES];

const I18N = {
  en: {
    title:'RhymeLab Local',eyebrow:'UNIFIED RHYME WRITER',headline:'Find rhymes across words, phrases and names.',
    intro:'Search German, English or both. RhymeLab combines every locally available channel and still lets you isolate words, Phrase/Mosaic matches or Entities.',
    noteLocal:'Runs locally',notePhonetic:'IPA-based',noteUsage:'Deterministic',navSearch:'SEARCH',navRhymePad:'RHYMEPAD',localRuntime:'LOCAL RUNTIME',browse:'Browse results',resultScope:'Results',languageBasis:'Query pronunciation',resultLanguage:'Result language',searchIn:'Search in',basisGerman:'German',basisEnglish:'English',basisBoth:'Combined',scopeAll:'Words + phrases + entities',scopeAllButton:'All',scopeWords:'Words',scopePhrases:'Phrases / Mosaic',scopePhrasesShort:'Phrases',scopeEntities:'Entities',words:'Words',phrases:'Phrases / Mosaic',entities:'Entities',word:'Word',phrase:'Phrase',entity:'Entity',filters:'Filters',filtersHint:'Rhyme, syllables, sorting and vocabulary',viewList:'List',viewCompact:'Compact',showSearchFilters:'Show search / result filters',rhymeType:'Rhyme / sound relation',
    syllables:'Syllables',sort:'Sort',pronunciation:'Pronunciation',vocabulary:'Vocabulary',all:'All',same:'Same count',plusMinus1:'±1 syllable',plusMinus2:'±2 syllables',plusMinus3:'±3 syllables',
    recommended:'Recommended',syllableDistance:'Closest syllable count',mostCommon:'Most common',closest:'Closest rhyme',alphabetical:'A–Z',standard:'Standard',allVariants:'All variants',
    searching:'Searching…',includeHistorical:'Include historical / obsolete words',scrollMore:'Scroll for more results…',searchPlaceholder:'Search a word, phrase or entity…',search:'Search',
    noResults:'No matching rhymes for these filters.',result:'result',results:'results',syllableCount:'Syllables',primaryStress:'Primary stress',
    partOfSpeech:'Part of speech',lemma:'Lemma',usageRank:'Usage rank',corpusCount:'Corpus count',lexicalTags:'Lexical tags',category:'Category',categories:'Categories',popularity:'Popularity',phraseTypes:'Phrase types',wordBoundaries:'Word boundaries',entityCategory:'Entity category',allEntities:'All entities',sources:'Sources',sourcesTitle:'RhymeLab Sources',sourcesIntro:'Active source families used by the current RhymeLab data and runtime pipelines.',close:'Close',more:'More',loaded:'loaded',searchPool:'candidates in search pool',
    variants:'Pronunciations',standardLabel:'Standard',alternate:'Alternate',unknown:'Unknown',unranked:'No usage rank',dictionary:'Dictionary',
    modern:'Modern lexicon',historical:'Historical',generatedPronunciation:'Generated pronunciation',syllableShort:'syll.',modernEntity:'Modern',historicalEntity:'Historical',inspectWord:'Inspect',
    rhymeAnalysis:'Rhyme analysis',primaryRhyme:'Primary rhyme',soundRelations:'Sound relations',relationOnly:'Sound relation only',
    matchScore:'Primary rhyme score',vowelFit:'Vowel fit',codaFit:'Coda fit',stressFit:'Stress fit',syllableFit:'Syllable fit',
    consonanceFit:'Consonant fit',onsetFit:'Onset fit',relationStrong:'strong',relationPartial:'partial',
    type_multisyllabic_perfect:'Multisyllabic perfect',type_perfect:'Perfect rhyme',type_multisyllabic_slant:'Multisyllabic slant',
    type_family:'Rhyme family',type_slant:'Slant rhyme',type_assonance:'Assonance',type_consonance:'Consonance',type_weak:'No primary rhyme',
    notFound:'Word, phrase or entity not found / not fully pronounceable from the local inventories.',englishUnavailable:'English runtime is not available in this local installation.',bothPartial:'DE+EN is selected, but one language runtime is unavailable locally.',scopePartial:'This channel is available only for part of the selected language basis.',
  },
  de: {
    title:'RhymeLab Lokal',eyebrow:'VEREINHEITLICHTER REIM-WRITER',headline:'Reime für Wörter, Phrasen und Namen finden.',
    intro:'Deutsch, Englisch oder beides durchsuchen. RhymeLab vereint alle lokal verfügbaren Kanäle und lässt Wörter, Phrase/Mosaic-Treffer und Entitäten trotzdem getrennt auswählen.',
    noteLocal:'Läuft lokal',notePhonetic:'IPA-basiert',noteUsage:'Deterministisch',navSearch:'SUCHE',navRhymePad:'RHYMEPAD',localRuntime:'LOKALE RUNTIME',browse:'Ergebnisse',resultScope:'Ergebnisse',languageBasis:'Aussprache der Suche',resultLanguage:'Treffersprache',searchIn:'Suchen in',basisGerman:'Deutsch',basisEnglish:'Englisch',basisBoth:'Kombiniert',scopeAll:'Wörter + Wortgruppen + Entitäten',scopeAllButton:'Alles',scopeWords:'Wörter',scopePhrases:'Wortgruppen / Mosaic',scopePhrasesShort:'Phrasen',scopeEntities:'Entitäten',words:'Wörter',phrases:'Wortgruppen / Mosaic',entities:'Entitäten',word:'Wort',phrase:'Wortgruppe',entity:'Entität',filters:'Filter',filtersHint:'Reim, Silben, Sortierung und Wortschatz',viewList:'Liste',viewCompact:'Kompakt',showSearchFilters:'Ergebnis-Suchfilter anzeigen',rhymeType:'Reim / Klangbeziehung',
    syllables:'Silben',sort:'Sortierung',pronunciation:'Aussprache',vocabulary:'Wortschatz',all:'Alle',same:'Gleiche Anzahl',plusMinus1:'±1 Silbe',plusMinus2:'±2 Silben',plusMinus3:'±3 Silben',
    recommended:'Empfohlen',syllableDistance:'Nächste Silbenzahl',mostCommon:'Am häufigsten',closest:'Ähnlichster Reim',alphabetical:'A–Z',standard:'Standard',allVariants:'Alle Varianten',
    searching:'Suche…',includeHistorical:'Historische / veraltete Wörter einbeziehen',scrollMore:'Weiter scrollen für mehr Ergebnisse…',searchPlaceholder:'Wort, Phrase oder Entität suchen…',search:'Suchen',
    noResults:'Keine passenden Reime für diese Filter.',result:'Ergebnis',results:'Ergebnisse',syllableCount:'Silben',primaryStress:'Hauptbetonung',
    partOfSpeech:'Wortart',lemma:'Lemma',usageRank:'Gebrauchsrang',corpusCount:'Korpus-Treffer',lexicalTags:'Lexikalische Tags',category:'Kategorie',categories:'Kategorien',popularity:'Popularität',phraseTypes:'Phrasentypen',wordBoundaries:'Wortgrenzen',entityCategory:'Entity-Kategorie',allEntities:'Alle Entities',sources:'Sources',sourcesTitle:'RhymeLab Sources',sourcesIntro:'Aktive Quellenfamilien der aktuellen RhymeLab-Daten- und Runtime-Pipelines.',close:'Schließen',more:'Mehr',loaded:'geladen',searchPool:'Kandidaten im Suchpool',
    variants:'Aussprachen',standardLabel:'Standard',alternate:'Variante',unknown:'Unbekannt',unranked:'Kein Gebrauchsrang',dictionary:'Wörterbuch',
    modern:'Modernes Lexikon',historical:'Historisch',generatedPronunciation:'Generierte Aussprache',syllableShort:'Silb.',modernEntity:'Modern',historicalEntity:'Historisch',inspectWord:'Details zu',
    rhymeAnalysis:'Reimanalyse',primaryRhyme:'Primärreim',soundRelations:'Klangbeziehungen',relationOnly:'Nur Klangbeziehung',
    matchScore:'Primärreim-Wert',vowelFit:'Vokal-Übereinstimmung',codaFit:'Endrand-Übereinstimmung',stressFit:'Betonungs-Übereinstimmung',
    syllableFit:'Silben-Übereinstimmung',consonanceFit:'Konsonanten-Übereinstimmung',onsetFit:'Anlaut-Übereinstimmung',relationStrong:'stark',relationPartial:'partiell',
    type_multisyllabic_perfect:'Mehrsilbiger Vollreim',type_perfect:'Vollreim',type_multisyllabic_slant:'Mehrsilbiger Slant-Reim',
    type_family:'Reimfamilie',type_slant:'Slant-Reim',type_assonance:'Assonanz',type_consonance:'Konsonanz',type_weak:'Kein Primärreim',
    notFound:'Wort, Phrase oder Entität nicht gefunden bzw. nicht vollständig aus den lokalen Aussprachebeständen auflösbar.',englishUnavailable:'Die englische Runtime ist in dieser lokalen Installation nicht verfügbar.',bothPartial:'DE+EN ist gewählt, aber eine der beiden Sprach-Runtimes ist lokal nicht verfügbar.',scopePartial:'Dieser Kanal ist nur für einen Teil der gewählten Sprachbasis verfügbar.',
  },
};

const LEXICAL_TAG_LABELS = {
  en:{slang:'Slang',colloquial:'Colloquial',informal:'Informal',vulgar:'Vulgar',offensive:'Offensive',derogatory:'Derogatory',archaic:'Archaic',obsolete:'Obsolete',dated:'Dated',rare:'Rare',regional:'Regional',dialectal:'Dialectal',poetic:'Poetic'},
  de:{slang:'Slang',colloquial:'Umgangssprachlich',informal:'Informell',vulgar:'Vulgär',offensive:'Anstößig',derogatory:'Abwertend',archaic:'Archaisch',obsolete:'Veraltet',dated:'Überholt / veraltet',rare:'Selten',regional:'Regional',dialectal:'Dialektal',poetic:'Poetisch'},
};
const POS_LABELS = {
  en:{noun:'Noun',verb:'Verb',adj:'Adjective',adjective:'Adjective',adv:'Adverb',adverb:'Adverb',name:'Proper name',proper_noun:'Proper noun',pron:'Pronoun',pronoun:'Pronoun',det:'Determiner',determiner:'Determiner',prep:'Preposition',preposition:'Preposition',conj:'Conjunction',conjunction:'Conjunction',interj:'Interjection',interjection:'Interjection',num:'Numeral',numeral:'Numeral',particle:'Particle',article:'Article',prefix:'Prefix',suffix:'Suffix',phrase:'Phrase',abbrev:'Abbreviation',abbreviation:'Abbreviation'},
  de:{noun:'Substantiv',verb:'Verb',adj:'Adjektiv',adjective:'Adjektiv',adv:'Adverb',adverb:'Adverb',name:'Eigenname',proper_noun:'Eigenname',pron:'Pronomen',pronoun:'Pronomen',det:'Determinierer',determiner:'Determinierer',prep:'Präposition',preposition:'Präposition',conj:'Konjunktion',conjunction:'Konjunktion',interj:'Interjektion',interjection:'Interjektion',num:'Numerale',numeral:'Numerale',particle:'Partikel',article:'Artikel',prefix:'Präfix',suffix:'Suffix',phrase:'Phrase',abbrev:'Abkürzung',abbreviation:'Abkürzung'},
};
const ENTITY_LABELS={en:{platform:'Platform',company:'Company',product:'Product',internet:'Internet term',entity:'Named item'},de:{platform:'Plattform',company:'Unternehmen',product:'Produkt',internet:'Internetbegriff',entity:'Eigenname'}};

const ENTITY_CATEGORY_LABELS=Object.freeze({
  'person.artist':{en:'Artist',de:'Künstler/in'},
  'person.rapper':{en:'Rapper',de:'Rapper'},
  'person.singer':{en:'Singer',de:'Sänger/in'},
  'person.musician':{en:'Musician',de:'Musiker/in'},
  'person.dj':{en:'DJ',de:'DJ'},
  'person.producer':{en:'Producer',de:'Produzent/in'},
  'person.actor':{en:'Actor',de:'Schauspieler/in'},
  'person.director':{en:'Director',de:'Regisseur/in'},
  'person.comedian':{en:'Comedian',de:'Comedian'},
  'person.author':{en:'Author',de:'Autor/in'},
  'person.fashion_designer':{en:'Fashion Designer',de:'Modedesigner/in'},
  'person.internet_personality':{en:'Internet Personality',de:'Internet-Persönlichkeit'},
  'group.band':{en:'Band',de:'Band'},
  'group.music_group':{en:'Music Group',de:'Musikgruppe'},
  'organization.brand':{en:'Brand',de:'Marke'},
  'organization.luxury_brand':{en:'Luxury Brand',de:'Luxusmarke'},
  'organization.fashion_house':{en:'Fashion House',de:'Modehaus'},
  'organization.company':{en:'Company',de:'Unternehmen'},
  'organization.automotive_marque':{en:'Car Brand',de:'Automarke'},
  'organization.car_brand':{en:'Car Brand',de:'Automarke'},
  'organization.record_label':{en:'Record Label',de:'Plattenlabel'},
  'organization.sports_team':{en:'Sports Team',de:'Sportteam'},
  'work.film':{en:'Movie',de:'Film'},
  'work.tv_series':{en:'TV Series',de:'TV-Serie'},
  'work.video_game':{en:'Video Game',de:'Videospiel'},
  'work.album':{en:'Album',de:'Album'},
  'work.song':{en:'Song',de:'Song'},
  'work.franchise':{en:'Franchise',de:'Franchise'},
  'fictional.character':{en:'Character',de:'Figur'},
  'fictional.group':{en:'Fictional Group',de:'Fiktive Gruppe'},
  'place.city':{en:'City',de:'Stadt'},
  'place.neighborhood':{en:'Neighborhood',de:'Stadtviertel'},
  'place.venue':{en:'Venue',de:'Veranstaltungsort'},
  'place.landmark':{en:'Landmark',de:'Wahrzeichen'},
  'product.vehicle_model':{en:'Vehicle Model',de:'Fahrzeugmodell'},
  'product.fashion_product':{en:'Fashion Product',de:'Modeprodukt'},
  'product.consumer_product':{en:'Consumer Product',de:'Konsumprodukt'},
});

const ENTITY_CATEGORY_DISPLAY_PRIORITY=Object.freeze([
  'person.rapper','person.singer','person.dj','person.producer','person.actor','person.director',
  'person.comedian','person.author','person.fashion_designer','person.internet_personality',
  'person.musician','person.artist',
  'group.band','group.music_group',
  'fictional.character','fictional.group',
  'work.video_game','work.film','work.tv_series','work.album','work.song','work.franchise',
  'organization.luxury_brand','organization.fashion_house','organization.record_label',
  'organization.automotive_marque','organization.car_brand','organization.sports_team',
  'organization.brand','organization.company',
  'product.vehicle_model','product.fashion_product','product.consumer_product',
  'place.city','place.neighborhood','place.venue','place.landmark',
]);

const SOURCE_CATALOG=Object.freeze([
  {name:'CMU Pronouncing Dictionary',detail:{en:'Source-backed en-US pronunciation overlay and control.',de:'Quellgestützte en-US-Aussprache und Kontrollquelle.'}},
  {name:'Cologne Corpus of Kiezdeutsch 2025 v2',detail:{en:'Additive youth/urban/spoken German register evidence.',de:'Additives Jugend-/Urban-/Sprachregister-Evidenzsignal für Deutsch.'}},
  {name:'English Speller Database / SCOWL v2',detail:{en:'English spelling, dialect, variant and lexical-quality evidence.',de:'Englische Schreibungs-, Dialekt-, Varianten- und Lexikalqualitätsevidenz.'}},
  {name:'English Wiktionary via Kaikki/Wiktextract',detail:{en:'Primary English lexical, form, POS, register and pronunciation source.',de:'Primäre englische Quelle für Lexik, Formen, Wortarten, Register und Aussprache.'}},
  {name:'German Wiktionary via Kaikki/Wiktextract',detail:{en:'Primary German dictionary, lexical and pronunciation source.',de:'Primäre deutsche Wörterbuch-, Lexik- und Aussprachequelle.'}},
  {name:'Leipzig Corpora Collection',detail:{en:'German usage/commonness and phrase-attestation evidence.',de:'Deutsche Gebrauchs-/Häufigkeits- und Phrasen-Attestierungsevidenz.'}},
  {name:'QRank',detail:{en:'Global Wikidata-aligned Entity popularity signal.',de:'Globales, Wikidata-ausgerichtetes Popularitätssignal für Entities.'}},
  {name:'RhymeLab curated modern lexicon',detail:{en:'Reviewed supplemental modern vocabulary for product gaps.',de:'Geprüfte ergänzende moderne Vokabeln für Produktlücken.'}},
  {name:'Wikidata',detail:{en:'Primary structured cultural-Entity identity/category source.',de:'Primäre strukturierte Quelle für kulturelle Entity-Identität und Kategorien.'}},
  {name:'wordfreq',detail:{en:'English commonness/ranking evidence; never lexical truth.',de:'Englische Häufigkeits-/Ranking-Evidenz; keine lexikalische Wahrheit.'}},
]);

const savedBasis=localStorage.getItem('rhymelab.searchBasis');const savedResultLanguage=localStorage.getItem('rhymelab.resultLanguage');const savedUiLanguage=localStorage.getItem('rhymelab.language');const savedResultView=localStorage.getItem('rhymelab.resultView');const detectedUiLanguage=String(navigator.language||'en').toLocaleLowerCase('en-US').startsWith('de')?'de':'en';const initialBasis=['de','en','both'].includes(savedBasis)?savedBasis:'de';const state={lang:['de','en'].includes(savedUiLanguage)?savedUiLanguage:detectedUiLanguage,basis:initialBasis,resultLanguage:['de','en','both'].includes(savedResultLanguage)?savedResultLanguage:initialBasis,view:['list','compact'].includes(savedResultView)?savedResultView:'list',capabilities:null,pronunciationRevision:null,data:null,visibleCount:60,pageSize:60,sectionPageSize:24,sectionVisible:new Map(),query:'',scrollObserver:null,wordCache:new Map(),pronunciationMisses:new Set(),detailRequest:0,inspectedWord:null,inspectedResult:null,inspectedType:null};
let floatingSearchRevealUntilScroll=false;
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=(key)=>I18N[state.lang][key]??I18N.en[key]??key;
const number=(value)=>Number(value).toLocaleString(state.lang==='de'?'de-DE':'en-US');
const normalizeKey=(value,language='de')=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase(language==='en'?'en-US':'de-DE');
const wordCacheKey=(language,value)=>`${language||'de'}:${normalizeKey(value,language||'de')}`;

function humanize(value){return String(value??'').replace(/^wiktionary:/,'').replaceAll('_',' ').replaceAll('-',' ').replace(/\b\p{L}/gu,(char)=>char.toLocaleUpperCase(state.lang==='de'?'de-DE':'en-US'));}
function lexicalTagLabel(tag){return LEXICAL_TAG_LABELS[state.lang]?.[tag]??LEXICAL_TAG_LABELS.en[tag]??humanize(tag);}
function partOfSpeechLabel(value){if(!value)return null;return POS_LABELS[state.lang]?.[value]??POS_LABELS.en[value]??humanize(value);}
function entityLabel(value){if(!value)return null;return ENTITY_LABELS[state.lang]?.[value]??ENTITY_LABELS.en[value]??humanize(value);}
function entityCategoryLabel(category){if(!category)return state.lang==='de'?'Eigenname':'Named item';const mapped=ENTITY_CATEGORY_LABELS[category];if(mapped)return mapped[state.lang]??mapped.en;const tail=String(category).split('.').filter(Boolean).at(-1);return tail?humanize(tail):(state.lang==='de'?'Eigenname':'Named item');}
function entityCategoryCodes(result){const codes=[];if(result?.primaryCategory)codes.push(result.primaryCategory);for(const entry of result?.entityCategories||[]){const category=typeof entry==='string'?entry:entry?.category;if(category&&!codes.includes(category))codes.push(category);}return codes;}
function entityDisplayCategoryCode(result){const codes=entityCategoryCodes(result);if(!codes.length)return null;const primary=result?.primaryCategory||null;const genericPerson=new Set(['person.artist','person.musician']);if(primary&&!genericPerson.has(primary))return primary;for(const category of ENTITY_CATEGORY_DISPLAY_PRIORITY){if(codes.includes(category)&&category!==primary)return category;}return primary||codes[0]||null;}
function entityDisplayLabel(result){return entityCategoryLabel(entityDisplayCategoryCode(result));}
function localeLabel(value){const maps={de:{'de-DE':'Deutsch (Deutschland)','de-AT':'Deutsch (Österreich)','de-CH':'Deutsch (Schweiz)','en-US':'Englisch (USA)','en-GB':'Englisch (Großbritannien)','en-CA':'Englisch (Kanada)','en-AU':'Englisch (Australien)'},en:{'de-DE':'German (Germany)','de-AT':'German (Austria)','de-CH':'German (Switzerland)','en-US':'English (United States)','en-GB':'English (United Kingdom)','en-CA':'English (Canada)','en-AU':'English (Australia)'}};return maps[state.lang]?.[value]??value;}
function dialectLabel(value){const map=state.lang==='de'?{'Austrian German':'Österreichisches Deutsch','Swiss German':'Schweizerdeutsch','General American':'General American','Received Pronunciation':'Received Pronunciation'}:{'Austrian German':'Austrian German','Swiss German':'Swiss German','General American':'General American','Received Pronunciation':'Received Pronunciation'};return map[value]??value;}
function registerLabel(value){const map=state.lang==='de'?{colloquial:'Umgangssprachlich'}:{colloquial:'Colloquial'};return map[value]??humanize(value);}
function typeLabel(type){return t(`type_${type}`);}
function relationFor(row,type){return(row.relations||[]).find((relation)=>relation.type===type)||null;}
function rowTypes(row){const types=new Set();if(row.primaryType&&PRIMARY_RHYME_TYPES.includes(row.primaryType))types.add(row.primaryType);else if(PRIMARY_RHYME_TYPES.includes(row.type))types.add(row.type);for(const type of row.relationTypes||[])if(SOUND_RELATION_TYPES.includes(type))types.add(type);return RHYME_TYPES.filter((type)=>types.has(type));}
function matchesType(row,type){return rowTypes(row).includes(type);}
function displayScore(row,type){return SOUND_RELATION_TYPES.includes(type)?Number(relationFor(row,type)?.score||0):Number(row.score||0);}
function rowSyllableDistance(row,querySyllables=Number(state.data?.query?.syllableCount||0)){const explicit=Number(row?.syllableDistance);if(Number.isFinite(explicit))return Math.abs(explicit);const count=Number(row?.syllableCount);return querySyllables>0&&Number.isFinite(count)?Math.abs(count-querySyllables):Number.MAX_SAFE_INTEGER;}
function updateSyllableLabels(){const querySyllables=Number(state.data?.query?.syllableCount||0),range=(distance)=>querySyllables>0?` · ${Math.max(1,querySyllables-distance)}–${querySyllables+distance}`:'';const labels={all:t('all'),same:querySyllables>0?`${t('same')} · ${querySyllables}`:t('same'),near1:`${t('plusMinus1')}${range(1)}`,near2:`${t('plusMinus2')}${range(2)}`,near3:`${t('plusMinus3')}${range(3)}`};for(const option of $$('#syllableFilter option'))option.textContent=labels[option.value]||option.textContent;}
function syncViewControls(){const results=$('#results');if(results){results.classList.toggle('results-compact',state.view==='compact');results.classList.toggle('results-list',state.view!=='compact');}$$('.view-option').forEach((button)=>{const active=button.dataset.view===state.view;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});}
function syncUiLanguageControls(){$$('.ui-lang-option').forEach((button)=>{const active=button.dataset.uiLang===state.lang;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});}
function basisLanguages(basis){return basis==='both'?['de','en']:[basis];}
function syncResultLanguageControls(){$$('.result-language-option').forEach((button)=>{const target=button.dataset.resultLanguage,active=target===state.resultLanguage,languages=basisLanguages(target),available=languages.some((language)=>state.capabilities?.languages?.[language]?.available!==false);button.disabled=!available;button.classList.toggle('active',active);button.classList.toggle('unavailable',!available);button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-disabled',String(!available));});}
function scopeCapability(scope,basis=state.resultLanguage){const languages=basisLanguages(basis),capabilities=state.capabilities;if(!capabilities)return{available:true,partial:false,supportedLanguages:languages};const flag=scope==='phrases'?'phraseMosaic':scope==='entities'?'entityRhymes':'wordWriter';if(scope==='all'){const supportedLanguages=languages.filter((language)=>{const row=capabilities.languages?.[language];return Boolean(row?.wordWriter||row?.phraseMosaic||row?.entityRhymes);});return{available:supportedLanguages.length>0,partial:supportedLanguages.length>0&&supportedLanguages.length<languages.length,supportedLanguages};}const supportedLanguages=languages.filter((language)=>Boolean(capabilities.languages?.[language]?.[flag]));return{available:supportedLanguages.length>0,partial:supportedLanguages.length>0&&supportedLanguages.length<languages.length,supportedLanguages};}
function syncContextFilters(){const scope=$('#scopeFilter').value;$('#variantFilter')?.classList.toggle('context-hidden',scope==='phrases'||scope==='entities');$('#historicalFilter')?.classList.toggle('context-hidden',scope==='entities');const entityAvailable=Array.isArray(state.capabilities?.entities?.categories)&&state.capabilities.entities.categories.length>0;$('#entityCategoryFilter')?.classList.toggle('context-hidden',!entityAvailable||!(scope==='all'||scope==='entities'));}
function renderAvailabilityBar(){const node=$('#availabilityBar');if(!node)return;const scopes=[['words',t('words')],['phrases',t('phrases')],['entities',t('entities')]];node.innerHTML=scopes.map(([scope,label])=>{const capability=scopeCapability(scope),status=!capability.available?'unavailable':capability.partial?'partial':'available',languages=capability.supportedLanguages.map((language)=>language.toUpperCase()).join('+')||'—';return`<span class="availability-chip ${status}"><span class="availability-dot" aria-hidden="true"></span><strong>${esc(label)}</strong><small>${esc(languages)}</small></span>`;}).join('');}
function setFloatingSearchCollapsed(collapsed){const stage=$('.search-stage');if(!stage)return;stage.classList.toggle('search-collapsed',Boolean(collapsed));if(!collapsed)stage.classList.remove('search-hover-open');}
function revealFloatingSearch(){floatingSearchRevealUntilScroll=true;setFloatingSearchCollapsed(false);}
function syncFloatingSearchState({consumeReveal=false}={}){if(typeof window==='undefined')return;if(consumeReveal)floatingSearchRevealUntilScroll=false;const shouldCollapse=Boolean(state.data)&&window.scrollY>96&&!floatingSearchRevealUntilScroll;setFloatingSearchCollapsed(shouldCollapse);}

function populateEntityCategories(){const select=$('#entityCategory');if(!select)return;const current=select.value||'all',categories=[...(state.capabilities?.entities?.categories||[])].sort((a,b)=>entityCategoryLabel(a).localeCompare(entityCategoryLabel(b),state.lang==='de'?'de':'en',{sensitivity:'base'}));const groups=new Map();for(const category of categories){const [family='other']=String(category).split('.');if(!groups.has(family))groups.set(family,[]);groups.get(family).push(category);}select.innerHTML=`<option value="all">${esc(t('allEntities'))}</option>`+[...groups.entries()].sort(([a],[b])=>humanize(a).localeCompare(humanize(b),state.lang==='de'?'de':'en',{sensitivity:'base'})).map(([family,items])=>`<optgroup label="${esc(humanize(family))}">${items.map((category)=>`<option value="${esc(category)}">${esc(entityCategoryLabel(category))}</option>`).join('')}</optgroup>`).join('');select.value=categories.includes(current)?current:'all';}
function setScope(scope,{rerun=false}={}){const requested=['all','words','phrases','entities'].includes(scope)?scope:'all',capability=scopeCapability(requested),fallback=scopeCapability('all').available?'all':scopeCapability('words').available?'words':scopeCapability('entities').available?'entities':'phrases',next=capability.available?requested:fallback;$('#scopeFilter').value=next;$$('.scope-option').forEach((button)=>{const active=button.dataset.scope===next;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});syncContextFilters();renderAvailabilityBar();if(rerun&&state.query)search(state.query);}
function syncCapabilityControls(){if(!state.capabilities){syncResultLanguageControls();setScope($('#scopeFilter').value);return;}$$('.basis-option').forEach((button)=>{const basis=button.dataset.basis,available=state.capabilities?.bases?.[basis]!==false,partial=basis==='both'&&Boolean(state.capabilities?.partialBases?.both);button.disabled=!available;button.classList.toggle('unavailable',!available);button.classList.toggle('partial',available&&partial);button.setAttribute('aria-disabled',String(!available));});if(state.capabilities?.bases?.[state.basis]===false){state.basis=state.capabilities?.bases?.de!==false?'de':state.capabilities?.bases?.en!==false?'en':'both';localStorage.setItem('rhymelab.searchBasis',state.basis);}syncResultLanguageControls();const targetLanguages=basisLanguages(state.resultLanguage),targetAvailable=targetLanguages.some((language)=>state.capabilities?.languages?.[language]?.available);if(!targetAvailable){state.resultLanguage=state.capabilities?.languages?.de?.available?'de':state.capabilities?.languages?.en?.available?'en':'both';localStorage.setItem('rhymelab.resultLanguage',state.resultLanguage);syncResultLanguageControls();}$$('.scope-option').forEach((button)=>{const capability=scopeCapability(button.dataset.scope);button.disabled=!capability.available;button.classList.toggle('unavailable',!capability.available);button.classList.toggle('partial',capability.partial);button.setAttribute('aria-disabled',String(!capability.available));});populateEntityCategories();setScope($('#scopeFilter').value);}
function renderSources(){const list=$('#sourcesList');if(!list)return;const locale=state.lang==='de'?'de-DE':'en-US';list.innerHTML=[...SOURCE_CATALOG].sort((a,b)=>a.name.localeCompare(b.name,locale,{sensitivity:'base'})).map((source)=>`<article class="source-card"><h3>${esc(source.name)}</h3><p>${esc(source.detail[state.lang]||source.detail.en)}</p></article>`).join('');}
function applyLanguage(){document.documentElement.lang=state.lang;document.title=t('title');$('#searchInput').placeholder=t('searchPlaceholder');$('#searchInput').setAttribute('aria-label',t('searchPlaceholder'));$('#searchButton').textContent=t('search');$$('[data-i18n]').forEach((node)=>{node.textContent=t(node.dataset.i18n);});$$('[data-i18n-option]').forEach((node)=>{node.textContent=t(node.dataset.i18nOption);});$$('[data-i18n-aria-label]').forEach((node)=>{node.setAttribute('aria-label',t(node.dataset.i18nAriaLabel));});$$('.basis-option').forEach((button)=>{const active=button.dataset.basis===state.basis;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});syncResultLanguageControls();$$('.scope-option').forEach((button)=>button.classList.toggle('active',button.dataset.scope===$('#scopeFilter').value));syncUiLanguageControls();syncViewControls();populateEntityCategories();syncContextFilters();updateSyllableLabels();renderAvailabilityBar();renderSources();if(state.data)render();}
function compareRecommended(a,b){if(a.resultKind!==b.resultKind){const rank={word:0,phrase:1,entity:2};return Number(rank[a.resultKind]??9)-Number(rank[b.resultKind]??9);}const ar=Number(a.channelRank||a.writerRank||a.diversifiedPageRank||0),br=Number(b.channelRank||b.writerRank||b.diversifiedPageRank||0);if(ar&&br&&ar!==br)return ar-br;if(Number.isFinite(a.writerRank)&&Number.isFinite(b.writerRank))return a.writerRank-b.writerRank;return Number(a.rhymeTier??99)-Number(b.rhymeTier??99)||Number(a.syllableDistance||0)-Number(b.syllableDistance||0)||(a.usageRank==null)-(b.usageRank==null)||Number(a.usageRank??Number.MAX_SAFE_INTEGER)-Number(b.usageRank??Number.MAX_SAFE_INTEGER)||Number(b.score||0)-Number(a.score||0)||String(a.word||'').localeCompare(String(b.word||''),'de');}
function compareForDisplayType(a,b,type){if(SOUND_RELATION_TYPES.includes(type)){const ar=relationFor(a,type),br=relationFor(b,type);return(Number(ar?.strength!=='strong')-Number(br?.strength!=='strong'))||displayScore(b,type)-displayScore(a,type)||a.syllableDistance-b.syllableDistance||(a.usageRank==null)-(b.usageRank==null)||(a.usageRank??Number.MAX_SAFE_INTEGER)-(b.usageRank??Number.MAX_SAFE_INTEGER)||b.score-a.score;}return compareRecommended(a,b);}
function filteredResults(){if(!state.data)return[];const type=$('#typeFilter').value,syllable=$('#syllableFilter').value,scope=$('#scopeFilter').value,maximumDistance=syllable==='same'?0:syllable==='near1'?1:syllable==='near2'?2:syllable==='near3'?3:null;let rows=state.data.results.filter((row)=>{if(scope==='words'&&row.resultKind!=='word')return false;if(scope==='phrases'&&row.resultKind!=='phrase')return false;if(scope==='entities'&&row.resultKind!=='entity')return false;if(type!=='all'&&!matchesType(row,type))return false;if(maximumDistance!=null&&rowSyllableDistance(row)>maximumDistance)return false;return true;});const mode=$('#sortMode').value;rows=[...rows].sort((a,b)=>{const syllableOrder=(syllable!=='all'||mode==='syllables')?rowSyllableDistance(a)-rowSyllableDistance(b):0;if(syllableOrder)return syllableOrder;if(a.resultKind!==b.resultKind){const rank={word:0,phrase:1,entity:2};return Number(rank[a.resultKind]??9)-Number(rank[b.resultKind]??9);}if(type!=='all'&&mode==='recommended')return compareForDisplayType(a,b,type);if(mode==='common'){if(a.resultKind==='phrase')return Number(b.usageCount||0)-Number(a.usageCount||0)||compareRecommended(a,b);return(a.usageRank==null)-(b.usageRank==null)||Number(a.usageRank??Number.MAX_SAFE_INTEGER)-Number(b.usageRank??Number.MAX_SAFE_INTEGER)||compareRecommended(a,b);}if(mode==='closest')return(type!=='all'?displayScore(b,type)-displayScore(a,type):Number(b.score||0)-Number(a.score||0))||compareRecommended(a,b);if(mode==='alpha')return String(a.word||'').localeCompare(String(b.word||''),state.lang==='de'?'de':'en',{sensitivity:'base'});return compareRecommended(a,b);});return rows;}
function interleaveByType(rows){if(state.data?.schema==='rhymelab-unified-writer-v1')return rows;if(String(state.data?.rankingPolicy||'').startsWith('deterministic_writer_utility_'))return rows;if($('#typeFilter').value!=='all')return rows;const buckets=RHYME_TYPES.map((type)=>rows.filter((row)=>matchesType(row,type)).sort((a,b)=>compareForDisplayType(a,b,type))).filter((bucket)=>bucket.length);if(buckets.length<=1)return rows;const output=[],seen=new Set();for(let index=0;output.length<rows.length;index+=1){let added=false;for(const bucket of buckets){const row=bucket[index];if(row&&!seen.has(row.normalized)){seen.add(row.normalized);output.push(row);added=true;}}if(!added&&buckets.every((bucket)=>index>=bucket.length))break;}for(const row of rows)if(!seen.has(row.normalized)){seen.add(row.normalized);output.push(row);}return output;}
function rhymeAnalysisHtml(result,displayType=null){if(!result)return'';const component=(key,label)=>{const value=result.components?.[key];if(value==null)return'';return`<div class="analysis-metric"><span>${label}</span><strong>${Math.round(value*100)}%</strong></div>`;};const primary=result.primaryType||((PRIMARY_RHYME_TYPES.includes(result.type))?result.type:null);const relations=(result.relations||[]).map((relation)=>`<span class="badge ${esc(relation.type)}${displayType===relation.type?' active-relation':''}">${esc(typeLabel(relation.type))} · ${esc(t(relation.strength==='strong'?'relationStrong':'relationPartial'))} · ${Math.round(relation.score*100)}%</span>`).join('');return`<div class="rhyme-analysis"><h3>${t('rhymeAnalysis')}</h3><div class="analysis-summary"><div><span class="meta-label">${t('primaryRhyme')}</span><strong>${esc(primary?typeLabel(primary):t('relationOnly'))}</strong></div><div><span class="meta-label">${t('matchScore')}</span><strong>${primary?`${Math.round(result.score*100)}%`:'—'}</strong></div></div>${relations?`<div class="relation-summary"><span class="meta-label">${t('soundRelations')}</span><div>${relations}</div></div>`:''}<div class="analysis-grid">${component('vowel',t('vowelFit'))}${component('coda',t('codaFit'))}${component('stress',t('stressFit'))}${component('syllable',t('syllableFit'))}${component('consonance',t('consonanceFit'))}${component('onset',t('onsetFit'))}</div></div>`;}
function renderWordPanel(query,rhymeResult=null,displayType=null){
  const pronunciations=query.pronunciations||[];
  const preferred=pronunciations.find((p)=>p.preferred)||pronunciations[0];
  const layer=query.generatedPronunciation?t('generatedPronunciation'):(query.lexiconLayer==='modern'?t('modern'):t('dictionary'));
  const pronunciationHtml=pronunciations.slice(0,8).map((p)=>{
    const detail=[p.preferred?t('standardLabel'):t('alternate'),p.locale?localeLabel(p.locale):null,p.register?registerLabel(p.register):null,p.dialect?dialectLabel(p.dialect):null].filter(Boolean).join(' · ');
    return `<div class="pronunciation-item"><code>/${esc(p.ipa)}/</code><small>${esc(detail)}</small></div>`;
  }).join('');
  const tags=Array.isArray(query.lexicalTags)?query.lexicalTags:[];
  const tagHtml=tags.length?`<div class="lexical-tags"><span class="meta-label">${t('lexicalTags')}</span><div>${tags.map((tag)=>`<span title="${esc(tag)}">${esc(lexicalTagLabel(tag))}</span>`).join('')}</div></div>`:'';
  const grammaticalLabel=partOfSpeechLabel(query.partOfSpeech)||entityLabel(query.entityKind)||'—';
  $('#wordPanel').innerHTML=`<div class="word-heading"><div><h2>${esc(query.surface)}</h2><div class="ipa">/${esc(query.preferredIpa||preferred?.ipa||'')}/</div></div><div class="layer-badges"><span class="layer-badge ${query.generatedPronunciation?'generated':query.lexiconLayer==='modern'?'modern':''}">${esc(layer)}</span>${query.historical?`<span class="layer-badge historical">${t('historical')}</span>`:''}</div></div><div class="meta-grid"><div class="meta-item"><span class="meta-label">${t('syllableCount')}</span><span class="meta-value">${esc(query.syllableCount??t('unknown'))}</span></div><div class="meta-item"><span class="meta-label">${t('primaryStress')}</span><span class="meta-value">${esc(query.primaryStressSyllable??t('unknown'))}</span></div><div class="meta-item"><span class="meta-label">${t('usageRank')}</span><span class="meta-value">${query.usageRank?`#${number(query.usageRank)}`:t('unranked')}</span></div><div class="meta-item"><span class="meta-label">${t('corpusCount')}</span><span class="meta-value">${query.usageCount!=null?number(query.usageCount):'—'}</span></div><div class="meta-item"><span class="meta-label">${t('partOfSpeech')}</span><span class="meta-value">${esc(grammaticalLabel)}</span></div><div class="meta-item"><span class="meta-label">${t('lemma')}</span><span class="meta-value">${esc(query.lemma||'—')}</span></div></div>${rhymeAnalysisHtml(rhymeResult,displayType)}${tagHtml}<div class="pronunciation-list"><h3>${t('variants')}</h3>${pronunciationHtml||'—'}</div>`;
}
function renderPhrasePanel(query,rhymeResult=null,detail=null,displayType=null){
  const surface=detail?.canonical||query.surface||query.word||'';
  const ipa=detail?.ipa||query.preferredIpa||query.ipa||'';
  const phraseTypes=detail?.phraseTypes||query.phraseTypes||[];
  const occurrences=rhymeResult?.usageCount??(detail?.leipzig||[]).reduce((sum,row)=>sum+Number(row.occurrence_count||0),0);
  $('#wordPanel').innerHTML=`<div class="word-heading"><div><h2>${esc(surface)}</h2><div class="ipa">/${esc(ipa)}/</div></div><div class="layer-badges"><span class="layer-badge modern">${t('phrase')}</span>${query.historical||detail?.historicalState==='historical_only'?`<span class="layer-badge historical">${t('historical')}</span>`:''}</div></div><div class="meta-grid"><div class="meta-item"><span class="meta-label">${t('syllableCount')}</span><span class="meta-value">${esc(detail?.syllableCount??query.syllableCount??'—')}</span></div><div class="meta-item"><span class="meta-label">${t('partOfSpeech')}</span><span class="meta-value">${t('phrase')}</span></div><div class="meta-item"><span class="meta-label">${t('phraseTypes')}</span><span class="meta-value">${esc(phraseTypes.length?phraseTypes.map(humanize).join(', '):'—')}</span></div><div class="meta-item"><span class="meta-label">Leipzig</span><span class="meta-value">${occurrences?number(occurrences):'—'}</span></div>${rhymeResult?.crossedWordBoundaries!=null?`<div class="meta-item"><span class="meta-label">${t('wordBoundaries')}</span><span class="meta-value">${esc(rhymeResult.crossedWordBoundaries)}</span></div>`:''}</div>${rhymeAnalysisHtml(rhymeResult,displayType)}`;
}
function renderEntityPanel(result,displayType=null){
  const categories=entityCategoryCodes(result);
  const displayCategory=entityDisplayLabel(result);
  const popularity=result.popularityPercentile!=null?Math.round(Number(result.popularityPercentile)*100):null;
  $('#wordPanel').innerHTML=`<div class="word-heading"><div><h2>${esc(result.surface||result.word)}</h2><div class="ipa">/${esc(result.ipa||'')}/</div></div><div class="layer-badges"><span class="layer-badge modern">${esc(displayCategory)}</span><span class="layer-badge">${String(result.language||'').toUpperCase()}</span></div></div><div class="meta-grid"><div class="meta-item"><span class="meta-label">${t('syllableCount')}</span><span class="meta-value">${esc(result.syllableCount??'—')}</span></div><div class="meta-item"><span class="meta-label">${t('category')}</span><span class="meta-value">${esc(displayCategory)}</span></div><div class="meta-item"><span class="meta-label">${t('popularity')}</span><span class="meta-value">${popularity==null?'—':`${popularity}% · ${esc(result.popularityTier||'—')}`}</span></div><div class="meta-item"><span class="meta-label">QID</span><span class="meta-value">${esc(result.entityQid||'—')}</span></div><div class="meta-item meta-wide"><span class="meta-label">${t('categories')}</span><span class="meta-value">${esc(categories.length?categories.map(entityCategoryLabel).join(', '):displayCategory)}</span></div></div>${rhymeAnalysisHtml(result,displayType)}`;
}
function resultRow(row,displayType){const isPhrase=row.resultKind==='phrase',isEntity=row.resultKind==='entity',entityCategory=isEntity?entityDisplayLabel(row):null,usage=isEntity?(row.popularityTier||'—'):isPhrase?(row.usageCount?number(row.usageCount):'—'):(row.usageRank?`#${number(row.usageRank)}`:'—'),usageSub=isEntity?entityCategory:isPhrase?'Leipzig':(row.usageCount!=null?number(row.usageCount):t('unranked')),score=displayScore(row,displayType),key=`${row.resultKind||'word'}:${row.resultId||row.windowId||row.normalized||row.word}`,kindClass=isPhrase?'phrase':isEntity?'entity':'word',kindLabel=isPhrase?t('phrase'):isEntity?`${String(row.language||'').toUpperCase()} · ${entityCategory}`:`${String(row.language||'de').toUpperCase()} · ${t('word')}`;return`<div class="result-row ${isPhrase?'phrase-row':isEntity?'entity-row':''}" data-result-key="${esc(key)}" data-display-type="${esc(displayType)}" tabindex="0" aria-label="${esc(`${t('inspectWord')} ${row.word}`)}"><div class="result-word"><div class="result-title-line"><strong>${esc(row.word)}</strong><span class="kind-chip ${kindClass}">${esc(kindLabel)}</span></div><div class="sub"><code>${isPhrase&&row.ipaKind==='matched_mosaic_span'?'span: ':''}/${esc(row.ipa||'')}/</code>${row.historical?`<span class="historical-text">${t('historicalEntity')}</span>`:''}</div></div><div class="type-col"><span class="badge ${esc(displayType)}">${esc(typeLabel(displayType))}</span></div><div class="syllable-col metric">${esc(row.syllableCount??'—')}<span class="muted">${t('syllableShort')}</span></div><div class="usage-col metric">${esc(usage)}<span class="muted">${esc(usageSub)}</span></div><div class="score">${Math.round(score*100)}%</div></div>`;}
function section(type,rows,totalCount,kind,{progressive=false}={}){
  const key=`${kind}:${type}`;
  const visibleLimit=progressive?rows.length:(state.sectionVisible.get(key)||state.sectionPageSize);
  const shown=rows.slice(0,visibleLimit);
  const hasMore=!progressive&&shown.length<rows.length;
  return `<section class="result-section ${esc(type)}" data-section-key="${esc(key)}"><div class="result-section-header"><span class="type-dot"></span><h2>${esc(typeLabel(type))}</h2><span class="count">${number(totalCount)}</span></div><div class="result-items">${shown.map((row)=>resultRow(row,type)).join('')}</div>${hasMore?`<div class="section-more"><button type="button" class="more-button" data-more-section="${esc(key)}" data-more-total="${rows.length}">${t('more')} <span>+${number(Math.min(state.sectionPageSize,rows.length-shown.length))}</span></button></div>`:''}</section>`;
}
function setupInfiniteScroll(hasMore){
  state.scrollObserver?.disconnect();
  state.scrollObserver=null;
  const sentinel=$('#scrollSentinel');
  sentinel.classList.toggle('hidden',!hasMore);
  if(!hasMore)return;
  if(!('IntersectionObserver'in window)){
    state.visibleCount=Number.MAX_SAFE_INTEGER;
    render();
    return;
  }
  state.scrollObserver=new IntersectionObserver((entries)=>{
    if(!entries.some((entry)=>entry.isIntersecting))return;
    state.visibleCount+=state.pageSize;
    render();
  },{rootMargin:'500px 0px'});
  state.scrollObserver.observe(sentinel);
}
function render(){
  if(!state.data)return;
  if(!state.inspectedWord){
    if(state.data.query?.kind==='phrase')renderPhrasePanel(state.data.query);
    else renderWordPanel(state.data.query);
  }

  const rows=filteredResults();
  const orderedAll=interleaveByType(rows);
  const selectedType=$('#typeFilter').value;
  const progressive=selectedType!=='all';
  const visible=progressive?orderedAll.slice(0,state.visibleCount):orderedAll;
  const renderTypes=progressive?[selectedType]:RHYME_TYPES;
  const wordsAll=orderedAll.filter((row)=>row.resultKind==='word');
  const phrasesAll=orderedAll.filter((row)=>row.resultKind==='phrase');
  const entitiesAll=orderedAll.filter((row)=>row.resultKind==='entity');
  const words=visible.filter((row)=>row.resultKind==='word');
  const phrases=visible.filter((row)=>row.resultKind==='phrase');
  const entities=visible.filter((row)=>row.resultKind==='entity');
  const hasMore=progressive&&visible.length<orderedAll.length;

  const pool=state.data.counts?.searchPool||{};
  const poolTotal=Number(pool.germanWords||0)+Number(pool.englishWords||0)+Number(pool.phrases||0)+Number(pool.germanEntities||0)+Number(pool.englishEntities||0);
  const resultParts=[`${number(rows.length)} ${t('loaded')}`];
  if(poolTotal>0)resultParts.push(`${number(poolTotal)} ${t('searchPool')}`);
  resultParts.push(`${number(wordsAll.length)} ${t('words')}`,`${number(phrasesAll.length)} ${t('phrases')}`,`${number(entitiesAll.length)} ${t('entities')}`);
  $('#resultCount').textContent=resultParts.join(' · ');

  const block=(kind,label,items,totalItems)=>{
    if(!items.length)return'';
    const sections=renderTypes.map((type)=>{
      const typed=items.filter((row)=>matchesType(row,type));
      const typedTotal=totalItems.filter((row)=>matchesType(row,type)).length;
      return typed.length?section(type,typed,typedTotal,kind,{progressive}):'';
    }).join('');
    return sections?`<div class="channel-block ${kind}"><div class="channel-header"><strong>${label}</strong><span>${number(totalItems.length)}</span></div>${sections}</div>`:'';
  };

  const html=block('word',t('words'),words,wordsAll)+block('phrase',t('phrases'),phrases,phrasesAll)+block('entity',t('entities'),entities,entitiesAll);
  $('#results').innerHTML=html||`<div class="status">${t('noResults')}</div>`;
  syncViewControls();
  setupInfiniteScroll(progressive&&hasMore);
  renderCapabilityNotice(state.data.warnings||[]);
}
function resultByKey(key){return state.data?.results?.find((row)=>`${row.resultKind||'word'}:${row.resultId||row.windowId||row.normalized||row.word}`===key)||null;}
async function inspectResult(result,displayType=null){if(!result)return;const key=`${result.resultKind||'word'}:${result.resultId||result.windowId||result.normalized||result.word}`;if(!key||!state.data)return;state.inspectedWord=key;state.inspectedResult=result;state.inspectedType=displayType;const token=++state.detailRequest;if(result.resultKind==='entity'){renderEntityPanel(result,displayType);return;}if(result.resultKind==='phrase'){const cacheKey=`phrase:${result.phraseId||result.normalized}`,cached=state.wordCache.get(cacheKey);if(cached){if(token===state.detailRequest&&state.inspectedWord===key)renderPhrasePanel(result,result,cached,displayType);return;}if(!result.phraseId){renderPhrasePanel(result,result,null,displayType);return;}try{const response=await fetch(`/api/phrases/detail?id=${encodeURIComponent(result.phraseId)}`);if(!response.ok){renderPhrasePanel(result,result,null,displayType);return;}const detail=await response.json();state.wordCache.set(cacheKey,detail);if(token===state.detailRequest&&state.inspectedWord===key)renderPhrasePanel(result,result,detail,displayType);}catch{renderPhrasePanel(result,result,null,displayType);}return;}const wordKey=wordCacheKey(result.language||'de',result.normalized||result.word),cached=state.wordCache.get(wordKey);if(cached){if(token===state.detailRequest&&state.inspectedWord===key)renderWordPanel(cached,result,displayType);return;}try{const response=await fetch(`/api/word/${encodeURIComponent(result.word)}?language=${encodeURIComponent(result.language||'de')}`);if(!response.ok)return;const detail=await response.json();state.wordCache.set(wordKey,detail);if(token===state.detailRequest&&state.inspectedWord===key)renderWordPanel(detail,result,displayType);}catch{}}
function restoreQueryPanel(){state.inspectedWord=null;state.inspectedResult=null;state.inspectedType=null;state.detailRequest+=1;if(state.data?.query?.kind==='phrase')renderPhrasePanel(state.data.query);else if(state.data?.query)renderWordPanel(state.data.query);}

function renderCapabilityNotice(warnings=[]){
  const node=$('#capabilityNotice');
  if(!node)return;
  const messages=[];
  if(state.basis==='en'&&state.capabilities?.languages?.en?.available===false)messages.push(t('englishUnavailable'));
  else if(state.basis==='both'&&state.capabilities?.partialBases?.both)messages.push(t('bothPartial'));
  if((state.resultLanguage==='en'||state.resultLanguage==='both')&&state.capabilities?.languages?.en?.available===false)messages.push(t('englishUnavailable'));
  const scopeState=scopeCapability($('#scopeFilter').value);
  if(scopeState.partial)messages.push(t('scopePartial'));
  for(const warning of warnings||[]){
    const message=warning?.code==='english_runtime_unavailable'?t('englishUnavailable'):warning?.message;
    if(message&&!messages.includes(message))messages.push(message);
  }
  node.textContent=messages.join(' ');
  node.classList.toggle('hidden',messages.length===0);
}

async function loadCapabilities(){try{const response=await fetch('/api/health');if(!response.ok)return;const health=await response.json();state.capabilities=health.unified_writer||null;state.pronunciationRevision=health.query_pronunciation_revision||null;syncCapabilityControls();applyLanguage();renderCapabilityNotice();}catch{}}

async function lookupSourceBackedWord(surface,language){
  const key=wordCacheKey(language,surface);
  if(state.wordCache.has(key))return state.wordCache.get(key);
  if(state.pronunciationMisses.has(key))return null;
  try{
    const response=await fetch(`/api/word/${encodeURIComponent(surface)}?language=${encodeURIComponent(language)}`);
    if(response.status===404){
      state.pronunciationMisses.add(key);
      return null;
    }
    if(!response.ok)return null;
    const detail=await response.json();
    if(detail?.preferredIpa){
      state.wordCache.set(key,detail);
      return detail;
    }
  }catch{}
  return null;
}

async function lookupPersistentGeneratedPronunciation(surface,language){
  if(!state.pronunciationRevision)return null;
  return readGeneratedPronunciationCache({
    surface,
    language,
    policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
    databaseRevision:state.pronunciationRevision,
  });
}

async function storePersistentGeneratedPronunciation(detail){
  if(!state.pronunciationRevision)return false;
  return writeGeneratedPronunciationCache(
    detail,
    state.pronunciationRevision,
  );
}

async function resolveMissingQueryPronunciations(data){
  const languages=basisLanguages(state.basis).filter(
    (language)=>state.capabilities?.languages?.[language]?.available!==false,
  );
  const missing=languages.filter((language)=>!data?.queries?.[language]?.preferredIpa);
  const generated={};
  for(const language of missing){
    for(const token of data?.queries?.[language]?.tokens||[]){
      if(!token?.ipa)continue;
      const surface=token.word||token.surface||token.normalized;
      if(!surface)continue;
      state.wordCache.set(wordCacheKey(language,surface),{
        surface,
        normalized:token.normalized||surface,
        preferredIpa:token.ipa,
        ipa:token.ipa,
        syllableCount:Number(token.syllableCount||0),
      });
    }
    generated[language]=await resolveUnknownClientPronunciation(
      state.query,
      language,
      {
        lookupReference:(surface,referenceLanguage)=>
          lookupSourceBackedWord(surface,referenceLanguage),
        lookupCachedPronunciation:(surface,referenceLanguage)=>
          lookupPersistentGeneratedPronunciation(surface,referenceLanguage),
        storeCachedPronunciation:(detail)=>
          storePersistentGeneratedPronunciation(detail),
      },
    );
  }
  return generated;
}

function appendClientPronunciations(params,generated){
  for(const [language,detail] of Object.entries(generated||{})){
    if(!detail?.ipa)continue;
    params.set(`query_ipa_${language}`,detail.ipa);
    params.set(`query_method_${language}`,detail.method||'client_unknown');
    if(detail.sourceBacked)params.set(`query_source_backed_${language}`,'1');
    if(Array.isArray(detail.components)&&detail.components.length){
      params.set(`query_components_${language}`,JSON.stringify(detail.components));
    }
  }
}

async function requestWriter(params){
  const response=await fetch(`/api/writer?${params}`);
  const data=await response.json();
  return {response,data};
}
async function search(word,{revealControls=false}={}){
  state.query=word.trim();
  if(!state.query)return;
  if(revealControls)revealFloatingSearch();
  $('#emptyState').classList.add('hidden');
  $('#workspace').classList.remove('hidden');
  $('#resultsToolbar').classList.remove('hidden');
  $('#loading').classList.remove('hidden');
  $('#error').classList.add('hidden');
  $('#results').innerHTML='';
  state.visibleCount=state.pageSize;
  state.sectionVisible.clear();
  state.inspectedWord=null;
  state.inspectedResult=null;
  state.inspectedType=null;
  state.detailRequest+=1;
  state.scrollObserver?.disconnect();

  try{
    const requestedType=$('#typeFilter').value;
    const backendType=SOUND_RELATION_TYPES.includes(requestedType)?'all':requestedType;
    const params=new URLSearchParams({
      q:state.query,
      language:state.basis,
      result_language:state.resultLanguage,
      scope:$('#scopeFilter').value,
      word_limit:'250',
      word_pool:'800',
      phrase_limit:'250',
      phrase_pool:'512',
      phrase_per_channel:'128',
      entity_limit:'250',
      entity_pool:'512',
      entity_category:$('#entityCategory')?.value||'all',
      variants:$('#variantMode').value,
      historical:$('#historicalMode').checked?'all':'current',
      type:backendType,
    });
    let {response,data}=await requestWriter(params);
    const generated=await resolveMissingQueryPronunciations(data);
    if(Object.values(generated).some((detail)=>detail?.ipa)){
      appendClientPronunciations(params,generated);
      ({response,data}=await requestWriter(params));
    }
    if(!response.ok){
      const warning=(data.warnings||[]).map((entry)=>entry?.code==='english_runtime_unavailable'?t('englishUnavailable'):entry?.message).filter(Boolean).join(' ');
      throw new Error(response.status===404?t('notFound'):(warning||data.error||data.status||'Request failed'));
    }

    state.data=data;
    state.capabilities=data.capabilities||state.capabilities;
    syncCapabilityControls();
    updateSyllableLabels();
    if(data.query?.kind==='word')state.wordCache.set(wordCacheKey(data.query.language||'de',data.query?.surface||state.query),data.query);

    const url=new URL(location.href);
    url.searchParams.set('q',state.query);
    url.searchParams.set('lang',state.basis);
    url.searchParams.set('result_lang',state.resultLanguage);
    url.searchParams.set('scope',$('#scopeFilter').value);
    url.searchParams.set('type',requestedType);
    const entityCategory=$('#entityCategory')?.value||'all';
    if(entityCategory==='all')url.searchParams.delete('entity_category');
    else url.searchParams.set('entity_category',entityCategory);
    history.replaceState(null,'',url);
    render();
    syncFloatingSearchState();
  }catch(error){
    state.data=null;
    setFloatingSearchCollapsed(false);
    $('#wordPanel').innerHTML='';
    $('#scrollSentinel').classList.add('hidden');
    $('#error').textContent=error.message;
    $('#error').classList.remove('hidden');
    renderCapabilityNotice();
  }finally{
    $('#loading').classList.add('hidden');
  }
}

const REQUIRED_SINGLE_CONTROLS=[
  '#searchForm','#searchInput','#scopeFilter','#typeFilter','#variantMode','#syllableFilter','#sortMode',
  '#historicalMode','#entityCategory','#sourcesButton','#sourcesClose','#sourcesDialog','#results',
  '#resultsToolbar','#searchFiltersReveal','.search-stage',
];
const REQUIRED_CONTROL_GROUPS=[
  '.ui-lang-option','.view-option','.basis-option','.result-language-option','.scope-option',
];

function assertInteractiveControlSurface(){
  const missingSingles=REQUIRED_SINGLE_CONTROLS.filter((selector)=>!$(selector));
  const missingGroups=REQUIRED_CONTROL_GROUPS.filter((selector)=>$$(selector).length===0);
  if(missingSingles.length||missingGroups.length){
    throw new Error(`RhymeLab UI control surface incomplete: ${[...missingSingles,...missingGroups].join(', ')}`);
  }
}

function installInteractiveControls(){
  assertInteractiveControlSurface();

  $('#searchForm').addEventListener('submit',(event)=>{event.preventDefault();search($('#searchInput').value,{revealControls:true});});
  const floatingSearchStage=$('.search-stage');
  $('#searchFiltersReveal').addEventListener('click',()=>revealFloatingSearch());
  $('#searchFiltersReveal').addEventListener('pointerenter',()=>floatingSearchStage.classList.add('search-hover-open'));
  $('#searchFiltersReveal').addEventListener('focus',()=>floatingSearchStage.classList.add('search-hover-open'));
  floatingSearchStage.addEventListener('pointerleave',()=>floatingSearchStage.classList.remove('search-hover-open'));
  $$('.ui-lang-option').forEach((button)=>button.addEventListener('click',()=>{const language=button.dataset.uiLang;if(!['de','en'].includes(language))return;state.lang=language;localStorage.setItem('rhymelab.language',language);applyLanguage();}));
  $$('.view-option').forEach((button)=>button.addEventListener('click',()=>{const view=button.dataset.view;if(!['list','compact'].includes(view))return;state.view=view;localStorage.setItem('rhymelab.resultView',view);syncViewControls();if(state.data)render();}));
  $$('.basis-option').forEach((button)=>button.addEventListener('click',()=>{if(button.disabled)return;state.basis=['de','en','both'].includes(button.dataset.basis)?button.dataset.basis:'de';localStorage.setItem('rhymelab.searchBasis',state.basis);syncCapabilityControls();applyLanguage();renderCapabilityNotice();if(state.query)search(state.query);}));
  $$('.result-language-option').forEach((button)=>button.addEventListener('click',()=>{if(button.disabled)return;state.resultLanguage=['de','en','both'].includes(button.dataset.resultLanguage)?button.dataset.resultLanguage:'de';localStorage.setItem('rhymelab.resultLanguage',state.resultLanguage);state.sectionVisible.clear();syncCapabilityControls();applyLanguage();renderCapabilityNotice();if(state.query)search(state.query);}));
  $$('.scope-option').forEach((button)=>button.addEventListener('click',()=>{if(button.disabled)return;setScope(button.dataset.scope,{rerun:true});renderCapabilityNotice();}));
  ['typeFilter','variantMode'].forEach((id)=>$('#'+id).addEventListener('change',()=>{if(state.query)search(state.query);else renderCapabilityNotice();}));
  ['syllableFilter','sortMode'].forEach((id)=>$('#'+id).addEventListener('change',()=>{state.visibleCount=state.pageSize;state.sectionVisible.clear();if(state.data)render();}));
  $('#historicalMode').addEventListener('change',()=>{if(state.query)search(state.query);});
  $('#entityCategory').addEventListener('change',()=>{state.sectionVisible.clear();if(state.query)search(state.query);});
  $('#sourcesButton').addEventListener('click',()=>{$('#sourcesDialog').showModal();});
  $('#sourcesClose').addEventListener('click',()=>{$('#sourcesDialog').close();});
  $('#sourcesDialog').addEventListener('click',(event)=>{if(event.target===$('#sourcesDialog'))$('#sourcesDialog').close();});
  $('#results').addEventListener('click',(event)=>{const button=event.target.closest('[data-more-section]');if(!button)return;const key=button.dataset.moreSection,current=state.sectionVisible.get(key)||state.sectionPageSize;state.sectionVisible.set(key,current+state.sectionPageSize);render();});
  $('#results').addEventListener('pointerover',(event)=>{const row=event.target.closest('.result-row');if(!row||row.contains(event.relatedTarget))return;inspectResult(resultByKey(row.dataset.resultKey),row.dataset.displayType);});
  $('#results').addEventListener('pointerout',(event)=>{const row=event.target.closest('.result-row');if(!row||row.contains(event.relatedTarget))return;restoreQueryPanel();});
  $('#results').addEventListener('focusin',(event)=>{const row=event.target.closest('.result-row');if(row)inspectResult(resultByKey(row.dataset.resultKey),row.dataset.displayType);});
  $('#results').addEventListener('focusout',(event)=>{const row=event.target.closest('.result-row');if(!row||row.contains(event.relatedTarget))return;restoreQueryPanel();});
  if(typeof window!=='undefined')window.addEventListener('scroll',()=>syncFloatingSearchState({consumeReveal:true}),{passive:true});

  document.documentElement.dataset.rhymelabControls='bound';
}

async function bootstrap(){
  const initialUrl=new URL(location.href);
  const initialBasis=initialUrl.searchParams.get('lang');
  const initialResultLanguage=initialUrl.searchParams.get('result_lang');
  const initialScope=initialUrl.searchParams.get('scope');
  const initialType=initialUrl.searchParams.get('type');
  const initialEntityCategory=initialUrl.searchParams.get('entity_category');

  if(['de','en','both'].includes(initialBasis))state.basis=initialBasis;
  if(['de','en','both'].includes(initialResultLanguage))state.resultLanguage=initialResultLanguage;
  if(['all','words','phrases','entities'].includes(initialScope))$('#scopeFilter').value=initialScope;
  if(['all',...RHYME_TYPES].includes(initialType))$('#typeFilter').value=initialType;

  setScope($('#scopeFilter').value);
  applyLanguage();
  await loadCapabilities();

  if(initialEntityCategory&&[...($('#entityCategory')?.options||[])].some((option)=>option.value===initialEntityCategory)){
    $('#entityCategory').value=initialEntityCategory;
  }
  syncContextFilters();

  const initial=initialUrl.searchParams.get('q');
  if(initial){
    $('#searchInput').value=initial;
    await search(initial);
  }
}
function reportUiInitializationFailure(error){
  document.documentElement.dataset.rhymelabControls='failed';
  console.error('RhymeLab UI initialization failed',error);
  const existing=$('#uiRuntimeFailure');
  if(existing)return;
  const banner=document.createElement('div');
  banner.id='uiRuntimeFailure';
  banner.className='ui-runtime-failure';
  banner.setAttribute('role','alert');
  banner.textContent='RhymeLab UI controls failed to initialize. Reload after updating the local app; check the browser console if the problem persists.';
  const shell=$('.shell');
  if(shell)shell.prepend(banner);
  else document.body.prepend(banner);
}

async function initializeUi(){
  installInteractiveControls();
  await bootstrap();
}

initializeUi().catch(reportUiInitializationFailure);
