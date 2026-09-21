export const STUDIO_UI_LANGUAGES=Object.freeze(['de','en']);

export function normalizeStudioUiLanguage(value){
  return value==='en'?'en':'de';
}

const EN=Object.freeze({
  'Studio':'Studio',
  'Reimsuche':'Rhyme search',
  'Meine Texte':'My texts',
  'Merkliste':'Saved',
  'Einstellungen':'Settings',
  'Zuletzt geöffnet':'Recently opened',
  'Dein Workspace':'Your workspace',
  'Lokal. In deinem Flow.':'Local. In your flow.',
  'Runtime prüfen …':'Checking runtime …',
  'Befehle öffnen':'Open commands',
  'Quickstyles öffnen':'Open quick styles',
  'Klick: gesetzten Light/Dark Style wechseln':'Click: switch configured Light/Dark style',
  'Exportieren ↗':'Export ↗',
  'Titel ändern':'Rename title',
  'ENTWURF':'DRAFT',
  'Lokal gespeichert':'Saved locally',
  'LOCAL WRITING SESSION':'LOCAL WRITING SESSION',
  'Deine Worte. Dein Rhythmus.':'Your words. Your rhythm.',
  'Arbeitsmodus':'Work mode',
  'Schreiben':'Write',
  'Reime':'Rhymes',
  'Perform':'Perform',
  'Versionsverlauf':'Version history',
  'Editor Einstellungen':'Editor settings',
  'Bar Inspector':'Bar Inspector',
  'Verlauf':'History',
  'Darstellung':'Appearance',
  'Design 02':'Design 02',
  'Leeren':'Clear',
  'Neue Zeile':'New bar',
  'Rückgängig':'Undo',
  'Wiederholen':'Redo',
  'Wörter für später':'Words for later',
  'Deine Merkliste.':'Your saved list.',
  'Gute Funde, direkt zurück in deinen Text.':'Good finds, ready to insert back into your text.',
  'Einsetzen':'Insert',
  'Mehr':'More',
  'Filter sichtbar':'Filters visible',
  'Filter öffnen':'Open filters',
  'Alle Beziehungen':'All relations',
  'Reiner Reim':'Perfect rhyme',
  'Naher Klang':'Near rhyme',
  'Alle Reimtypen':'All rhyme types',
  'Mehrsilbiger Vollreim':'Multisyllabic perfect rhyme',
  'Vollreim':'Perfect rhyme',
  'Mehrsilbiger Slant-Reim':'Multisyllabic slant rhyme',
  'Reimfamilie':'Rhyme family',
  'Slant-Reim':'Slant rhyme',
  'Assonanz':'Assonance',
  'Konsonanz':'Consonance',
  'AUSSPRACHE':'PRONUNCIATION',
  'Standard':'Preferred',
  'Alle Varianten':'All variants',
  'ENTITY-KATEGORIEN':'ENTITY CATEGORIES',
  'Alle Entities':'All entities',
  'Verwendete ausblenden':'Hide used',
  'Treffer ausblenden, die bereits im aktuellen Text vorkommen':'Hide results already used in the current text',
  'Historisch':'Historical',
  'veraltete / historische Formen einschließen':'Include obsolete / historical forms',
  'Generated':'Generated',
  'generierte Aussprachedaten einschließen':'Include generated pronunciation data',
  'Nur Generated':'Generated only',
  'kanonische Treffer ausblenden':'Hide canonical results',
  'Filter & Aussprache':'Filters & pronunciation',
  'PRESET':'PRESET',
  'Beste Treffer':'Best results',
  'Nur Wörter':'Words only',
  'Phrasen / Mosaic':'Phrases / Mosaic',
  'Namen / Entities':'Names / Entities',
  'Benutzerdefiniert':'Custom',
  'GENAUER REIMTYP':'EXACT RHYME TYPE',
  'Sprache der Ergebnisse':'Result language',
  'Deutsch':'German',
  'Englisch':'English',
  'DE + EN':'DE + EN',
  'SORTIERUNG':'SORT',
  'Empfohlen':'Recommended',
  'Silbendistanz':'Syllable distance',
  'Klangnähe':'Sound proximity',
  'Häufigkeit':'Frequency',
  'A–Z':'A–Z',
  'Wie Anker':'Same as anchor',
  'Anker ±1':'Anchor ±1',
  'Anker ±2':'Anchor ±2',
  'Anker ±3':'Anchor ±3',
  '1 Silbe':'1 syllable',
  '2 Silben':'2 syllables',
  '3+ Silben':'3+ syllables',
  'TREFFERDETAIL':'RESULT DETAIL',
  'WORT / PHRASE':'WORD / PHRASE',
  'REIM':'RHYME',
  'AKTION':'ACTION',
  'Liste':'List',
  'Kompakt':'Compact',
  'Feld':'Tiles',
  'Live Writer':'Live Writer',
  'Live Writer · lokale Datenbank':'Live Writer · local database',
  'Live Writer · Suche läuft …':'Live Writer · searching …',
  'Live Writer · Runtime-Fehler':'Live Writer · runtime error',
  'Live Writer wird vorbereitet …':'Preparing Live Writer …',
  'Writer durchsucht Wörter, Phrasen und Entities …':'Writer is searching words, phrases and entities …',
  'Erneut versuchen':'Try again',
  'ReimankER':'RHYME ANCHOR',
  'REIMANKER':'RHYME ANCHOR',
  'FOLGT DEINER AUSWAHL':'FOLLOWS YOUR SELECTION',
  'ANKER FIXIERT':'ANCHOR PINNED',
  'Auswahl folgen':'Follow selection',
  'Anker fixiert':'Anchor pinned',
  'Fixieren':'Pin',
  'Fixiert':'Pinned',
  'Studio Appearance':'Studio Appearance',
  'Quickstyles bleiben sofort erreichbar. Eigene Styles werden nur lokal in diesem Browser gespeichert.':'Quick styles stay instantly accessible. Custom styles are stored only in this browser.',
  'Schriftgröße':'Font size',
  'Schrift':'Font',
  'Bewegung':'Motion',
  'System beachten':'Follow system',
  'Aus':'Off',
  'Custom Theme Studio':'Custom Theme Studio',
  'Semantische Farben statt einzelner CSS-Werte. Änderungen werden live auf das Studio vorgespielt.':'Semantic colors instead of isolated CSS values. Changes preview live across the Studio.',
  'Neu':'New',
  'Mein Studio':'My Studio',
  'Light Basis':'Light base',
  'Dark Basis':'Dark base',
  'Light-Style ersetzen':'Replace Light style',
  'Dark-Style ersetzen':'Replace Dark style',
  'Vorschau zurücksetzen':'Reset preview',
  'Style aktualisieren':'Update style',
  'Style speichern':'Save style',
  'Data & Recovery':'Data & Recovery',
  'Backup exportieren':'Export backup',
  'Backup importieren':'Import backup',
  'Recovery-Punkt erstellen':'Create recovery point',
  'Browser & Runtime Diagnostics':'Browser & Runtime Diagnostics',
  'Neu prüfen':'Run again',
  'Diagnostics exportieren':'Export diagnostics',
  'CURRENT ENVIRONMENT':'CURRENT ENVIRONMENT',
  'Studio controls':'Studio controls',
  'IndexedDB API':'IndexedDB API',
  'DocumentStore authority':'DocumentStore authority',
  'Writer runtime':'Writer runtime',
  'Web Audio':'Web Audio',
  'VisualViewport':'VisualViewport',
  'Local preferences storage':'Local preferences storage',
  'Reduced-motion signal':'Reduced-motion signal',
  'Primary pointer':'Primary pointer',
  'Studio Backup importieren':'Import Studio backup',
  'Abbrechen':'Cancel',
  'Backup importieren':'Import backup',
  'Text leeren':'Clear text',
  'Text umbenennen':'Rename text',
  'Text verschieben':'Move text',
  'Endgültig löschen':'Delete permanently',
  'Wiederherstellen':'Restore',
  'Papierkorb':'Trash',
  'Neuer Text':'New text',
  'Neuer Hauptordner':'New root folder',
  'Neuer Ordner':'New folder',
  'Unterordner':'Subfolder',
  'Ordner umbenennen':'Rename folder',
  'Ordnerstruktur löschen':'Delete folder tree',
  'ORDNERSTRUKTUR':'FOLDER TREE',
  'Alle Texte':'All texts',
  'Titel, Text oder Ordner durchsuchen …':'Search title, text or folder …',
  'Nichts gefunden.':'Nothing found.',
  'Suchbegriff oder Ordnerfilter ändern.':'Change the search term or folder filter.',
  'Zuletzt geändert':'Last updated',
  'Titel':'Title',
  'Erstellt':'Created',
  'Bars':'Bars',
  'Kanonisches Reimschema':'Canonical rhyme scheme',
  'Klang, Struktur, Spannung.':'Sound, structure, tension.',
  'Song Analysis':'Song Analysis',
  'Neu analysieren':'Analyze again',
  'Zurück zum Text':'Back to text',
  'Analysesprache':'Analysis language',
  'Primär':'Primary',
  'Alle':'All',
  'Assonanz / Konsonanz':'Assonance / consonance',
  'Relations inside Verse':'Relations inside Verse',
  'Word Laboratory':'Word Laboratory',
  'Stress Fingerprint':'Stress Fingerprint',
  'Rhyme Chain':'Rhyme Chain',
  'Chain ausblenden':'Hide chain',
  'Bar-Dichte':'Bar density',
  'APPROX':'APPROX',
  'Noch keine Reimkette.':'No rhyme chain yet.',
  'Noch keine Wortdaten.':'No word data yet.',
  'Keine Beziehungen in diesem Filter.':'No relations in this filter.',
  'Analyse laden, um Beziehungen im Verse zu sehen.':'Load analysis to inspect relations inside the verse.',
  'Kanonische Analyse laden':'Load canonical analysis',
  'Perform öffnen ↗':'Open Perform ↗',
  'WÖRTER':'WORDS',
  'SILBEN ≈':'SYLLABLES ≈',
  'BAR TIME':'BAR TIME',
  'SYLL./SEC ≈':'SYLL./SEC ≈',
  'CUES':'CUES',
  'BREATH LOAD':'BREATH LOAD',
  'POCKET':'POCKET',
  'PREVIOUS':'PREVIOUS',
  'ENDWORT':'END WORD',
  'STRESS':'STRESS',
  'REIM IM VERSE':'RHYME IN VERSE',
  'FLOW FINGERPRINT':'FLOW FINGERPRINT',
  'Timing & Cues':'Timing & Cues',
  'Straight':'Straight',
  'Triplet':'Triplet',
  'Metronom':'Metronome',
  'Verschieben':'Move',
  'Hit':'Hit',
  'Akzent':'Accent',
  'Pause':'Pause',
  'Atem':'Breath',
  'Halten':'Hold',
  'Löschen':'Erase',
  'Cues leeren':'Clear cues',
  'Als geprüft markieren':'Mark reviewed',
  'Flow sequenzieren.':'Sequence the flow.',
  'Schnell zu deinem nächsten Schritt':'Quickly get to your next step',
  'Dein nächster Treffer.':'Your next result.',
  'Dein Klang. Deine Suche.':'Your sound. Your search.',
  'Ein Gedanke. Ein Takt. Dein nächster Reim.':'One thought. One bar. Your next rhyme.',
  'Wort markieren → Reim finden → gezielt ersetzen.':'Select a word → find a rhyme → replace precisely.',
  'Weitere Ideen':'More ideas',
  'Info':'Info',
  'Fehler':'Error',
  'Nicht verfügbar':'Unavailable',
  'nicht verfügbar':'unavailable',
  'verfügbar':'available',
  'wird vorbereitet':'preparing',
  'Runtime eingeschränkt':'Runtime limited',
  'Backend nicht erreichbar':'Backend unreachable',
  'Speichert in IndexedDB …':'Saving to IndexedDB …',
  'IndexedDB gespeichert':'Saved to IndexedDB',
  'Lokal gespeichert · Fallback':'Saved locally · fallback',
  'Speichern nicht möglich · bitte exportieren':'Unable to save · please export',
});

const PATTERNS=Object.freeze([
  [/^(\d+) Treffer$/u,'$1 results'],
  [/^Bar (\d+) ausgewählt$/u,'Bar $1 selected'],
  [/^Bar (\d+): (.+)$/u,'Bar $1: $2'],
  [/^(\d+) Bars · (\d+) Wörter$/u,'$1 bars · $2 words'],
  [/^(\d+) Bars · (\d+) Wörter · (\d+) Silben≈ · (.+)$/u,'$1 bars · $2 words · $3 syllables≈ · $4'],
  [/^Auto-Scroll: An$/u,'Auto-scroll: On'],
  [/^Auto-Scroll: Aus$/u,'Auto-scroll: Off'],
  [/^Ergebnis: (.+)$/u,'Result: $1'],
  [/^Anker: (.+)$/u,'Anchor: $1'],
  [/^Silben: (.+)$/u,'Syllables: $1'],
  [/^Entity: (.+)$/u,'Entity: $1'],
  [/^Gefunden zu „(.+)“$/u,'Found for “$1”'],
  [/^Bar (\d+) analysieren$/u,'Analyze bar $1'],
  [/^Bar (\d+) auswählen$/u,'Select bar $1'],
  [/^Text Bar (\d+)$/u,'Text bar $1'],
  [/^Ordner (.+) umbenennen$/u,'Rename folder $1'],
  [/^Ordner (.+) löschen$/u,'Delete folder $1'],
  [/^Unterordner in (.+) anlegen$/u,'Create subfolder in $1'],
  [/^(\d+) Texte · (\d+) Bars$/u,'$1 texts · $2 bars'],
]);

const SKIP_SELECTOR=[
  'textarea','input','code','pre','kbd',
  '[data-i18n-skip]',
  '[data-insert]','[data-save]','[data-detail]',
  '.result-word','.songcard h3','.revision p',
  '.analysis-end-word','.analysis-word-title','.analysis-pair-words b',
  '.rhyme-chain-group b','.bar-inspector-head p','.detail-preview',
  '.library-folder-label b','.library-folder-label em',
].join(',');

export function translateStudioUiText(source,language){
  const lang=normalizeStudioUiLanguage(language);
  const input=String(source??'');
  if(lang==='de'||!input)return input;
  const match=input.match(/^(\s*)([\s\S]*?)(\s*)$/u);
  const prefix=match?.[1]||'',core=match?.[2]||input,suffix=match?.[3]||'';
  if(!core.trim())return input;
  const exact=EN[core];
  if(exact!=null)return prefix+exact+suffix;
  for(const [pattern,replacement] of PATTERNS){
    if(pattern.test(core))return prefix+core.replace(pattern,replacement)+suffix;
  }
  return input;
}

function shouldSkip(element){
  if(!element?.closest)return false;
  return Boolean(element.closest(SKIP_SELECTOR));
}

export function createStudioDomLocalizer({
  root=globalThis.document?.body,
  documentElement=globalThis.document?.documentElement,
  initialLanguage='de',
}={}){
  let language=normalizeStudioUiLanguage(initialLanguage);
  const textSources=new WeakMap(),textRendered=new WeakMap();
  const attributeSources=new WeakMap(),attributeRendered=new WeakMap();
  const attrs=['title','aria-label','placeholder'];

  function sourceForAttr(element,name,current){
    let sources=attributeSources.get(element);
    if(!sources){sources=new Map();attributeSources.set(element,sources)}
    let rendered=attributeRendered.get(element);
    if(!rendered){rendered=new Map();attributeRendered.set(element,rendered)}
    if(!sources.has(name)||rendered.get(name)!==current)sources.set(name,current);
    return {source:sources.get(name),rendered};
  }

  function localizeText(node){
    const parent=node.parentElement;
    if(!parent||shouldSkip(parent))return;
    const current=node.nodeValue||'',last=textRendered.get(node);
    if(!textSources.has(node)||last!==current)textSources.set(node,current);
    const source=textSources.get(node);
    const target=translateStudioUiText(source,language);
    textRendered.set(node,target);
    if(current!==target)node.nodeValue=target;
  }

  function localizeAttributes(element){
    if(!element||shouldSkip(element))return;
    for(const name of attrs){
      if(!element.hasAttribute?.(name))continue;
      const current=element.getAttribute(name)||'';
      const {source,rendered}=sourceForAttr(element,name,current);
      const target=translateStudioUiText(source,language);
      rendered.set(name,target);
      if(current!==target)element.setAttribute(name,target);
    }
  }

  function localizeSubtree(node){
    if(!node)return;
    if(node.nodeType===3){localizeText(node);return}
    if(node.nodeType!==1&&node.nodeType!==9&&node.nodeType!==11)return;
    if(node.nodeType===1)localizeAttributes(node);
    const walker=(node.ownerDocument||globalThis.document)?.createTreeWalker?.(
      node,
      globalThis.NodeFilter?.SHOW_ELEMENT|globalThis.NodeFilter?.SHOW_TEXT || 5,
    );
    if(!walker)return;
    let current;
    while((current=walker.nextNode())){
      if(current.nodeType===3)localizeText(current);
      else localizeAttributes(current);
    }
  }

  const observer=typeof MutationObserver!=='undefined'&&root
    ?new MutationObserver((records)=>{
      for(const record of records){
        if(record.type==='characterData')localizeText(record.target);
        else if(record.type==='attributes')localizeAttributes(record.target);
        else for(const node of record.addedNodes)localizeSubtree(node);
      }
    })
    :null;

  observer?.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attrs});
  if(documentElement)documentElement.lang=language;
  localizeSubtree(root);

  return {
    get language(){return language},
    setLanguage(value){
      language=normalizeStudioUiLanguage(value);
      if(documentElement)documentElement.lang=language;
      localizeSubtree(root);
      return language;
    },
    refresh(){localizeSubtree(root)},
    disconnect(){observer?.disconnect()},
  };
}
