# UI Redesign Parity Contract

## Status

This document is the release gate for the RhymeLab Studio UI/UX rebuild.

The new Studio surface may replace the existing Search and RhymePad entry points only after every required capability below is either READY, ADAPTED, or explicitly owner-approved as deferred. Anything else is a blocker.

**Cutover rule:** visual acceptance is not functional acceptance. Studio 02 is the visual golden master, but the default route must not switch until an exhaustive old-vs-new feature audit confirms no user-facing capability has been lost. Missing legacy capabilities discovered during implementation are added to this document immediately and become blockers by default.

## Golden-master rule

The supplied Studio 02 prototype is the visual and interaction reference.

Current source:

~~~text
src/studio/index.html
route: /studio
~~~

Initial import policy:

- preserve Studio 02 layout, typography hierarchy, spacing, motion, density modes, panel geometry and responsive behavior;
- do not solve missing functionality by restoring the old control wall;
- add capability through contextual controls, docks, detail surfaces, command surfaces and settings;
- old Search/RhymePad semantics remain authoritative until their Studio adapters pass parity;
- / and /pad remain available throughout migration.

## Product-state rule

Studio must converge on one shared state:

~~~text
Song
Bar / selection
Search anchor
Search filters
Saved candidates
Capabilities
Performance cues
Revision history
Appearance/preferences
~~~

The Search workspace and Studio assistant use the same SearchState. Changing surface must not silently reset language, scope, relation, cursor, anchor or result identity.

---

# A. Search / Writer parity

| Capability | Existing Search | Existing Pad | Studio 02 prototype | Target surface | Status |
| --- | --- | --- | --- | --- | --- |
| Query pronunciation DE | yes | yes | demo select | Inspector direct filters | READY |
| Query pronunciation EN | yes | yes | demo select | Inspector direct filters | READY |
| Query pronunciation DE+EN | yes | partial | demo select | Inspector direct filters | READY |
| Result language DE | yes | current Pad request | demo select | Inspector direct filters | READY |
| Result language EN | yes | current Pad request | demo select | Inspector direct filters | READY |
| Result language DE+EN | yes | current Pad request | demo select | Inspector direct filters | READY |
| Scope: all | yes | yes | yes/demo | Scope tabs | READY |
| Scope: words | yes | yes | yes/demo | Scope tabs | READY |
| Scope: phrases/mosaic | yes | yes | yes/demo | Scope tabs | READY |
| Scope: entities | yes | yes | yes/demo | Scope tabs | READY |
| Multisyllabic perfect | yes | yes | missing | Filter / active chip | READY |
| Perfect rhyme | yes | yes | simplified | Filter / active chip | READY |
| Multisyllabic slant | yes | yes | missing | Filter / active chip | READY |
| Rhyme family | yes | yes | missing | Filter / active chip | READY |
| Slant rhyme | yes | yes | simplified | Filter / active chip | READY |
| Assonance | yes | yes | missing | Filter / active chip | READY |
| Consonance | yes | yes | missing | Filter / active chip | READY |
| Primary rhyme-class exclusivity | yes | yes | demo only | Search adapter | READY · Writer canonical |
| Overlapping sound relations | yes | yes | demo only | Detail + badges | READY |
| Syllables: all | yes | partial | yes | Direct filter | READY |
| Syllables: equal | yes | partial | yes/demo | Direct filter | READY |
| Syllables: ±1 | yes | partial | yes/demo | Direct filter | READY |
| Syllables: ±2 | yes | no direct control | missing | Advanced filter | READY |
| Syllables: ±3 | yes | no direct control | missing | Advanced filter | READY |
| Sort: recommended | yes | backend ranking | yes/demo | Direct sort | READY · canonical Writer order |
| Sort: syllable distance | yes | backend ranking | demo approximation | Direct sort | ADAPTED · loaded Writer result set |
| Sort: most common | yes | backend ranking | missing | Advanced/direct sort | ADAPTED · loaded Writer result set |
| Sort: closest rhyme | yes | backend ranking | missing | Advanced/direct sort | ADAPTED · loaded Writer result set |
| Sort: A-Z | yes | no | yes/demo | Direct sort | ADAPTED · loaded Writer result set |
| Preferred pronunciation only | yes | yes | missing | Advanced filter | READY |
| All pronunciation variants | yes | no direct surface | missing | Advanced filter | READY |
| Historical / obsolete | yes | current only | missing | Advanced toggle + chip | READY |
| Generated data | capability-driven | current route policy | missing | Capability contextual control | READY |
| Generated-only | capability-driven | no current Pad control | missing | Advanced origin control | READY |
| Entity category filter | yes | yes | demo generic only | Contextual Entity controls | READY |
| Full Entity taxonomy | yes | reviewed subset in Pad | missing | Contextual chips/dialog | READY · capability-driven taxonomy |
| Entity multi-select | accepted newer interaction | no | missing | Contextual chips | READY · shared SearchState + Writer OR retrieval |
| List density | yes | no | yes | Result toolbar | READY |
| Compact density | yes | compact/live suggestions | yes | Result toolbar | READY |
| Tile/field density | no canonical search | no | yes | Result toolbar | READY · Studio-specific |
| Infinite loading | yes | load-more integration | demo simulation | Results scroller | ADAPTED · stable reveal of loaded Writer set |
| Explicit More button | yes | yes | yes/demo | Results footer | READY |
| Stable result order while paging | yes contract | yes | demo | Search adapter | READY |
| Result metadata tags/badges | yes | yes | simplified demo | Result rows + detail dock | READY |
| Optional rhyme-chain display | legacy capability | legacy capability | missing | Result/analysis display toggle | READY |
| Result detail | yes | limited badges | yes/demo | Detail dock | READY |
| IPA | yes | result metadata | missing in demo detail | Detail dock | READY |
| Pronunciation variants + provenance | yes | limited | missing | Detail dock | READY |
| Relation metrics | yes | badges/scores | missing | Detail dock | READY |
| Part of speech / lemma | yes | no | missing | Detail dock | READY |
| Usage/commonness | yes | compact usage | missing | Detail dock | READY |
| Phrase metadata | yes | result kind | missing | Detail dock | READY |
| Entity identity/category/popularity | yes | badges | missing | Detail dock | READY |
| Sources/provenance | yes | source badge | missing | Detail / Sources | READY |
| Dataset stats | yes | no | missing | Settings/Data | READY |
| Query runtime | yes | no | missing | Diagnostics | READY |
| rolling AVG 100 runtime | yes | no | missing | Diagnostics | READY |
| UI language DE | yes | no dedicated Pad UI locale | prototype DE | App setting + quick switch | READY |
| UI language EN | yes | no | missing | App setting + quick switch | READY · persistent DOM localization |
| Unknown query client IPA resolver | yes | through Writer endpoint | missing | SearchService adapter | READY |
| query-pronunciation cache/revision invalidation | yes | indirect | missing | SearchService adapter | READY |
| true zero-result state | yes | yes | demo | Results state | READY |
| filter-empty state | yes | yes | demo | Results state | READY |
| runtime unavailable state | yes | yes | missing | Results state | READY |
| missing data package state | yes | partial | missing | Capability state | READY |
| loading first page | yes | yes | demo | Results state | READY |
| loading next page | yes | yes | demo | Results state | ADAPTED · client reveal over stable Writer set |

---

# B. RhymePad / Studio writing parity

| Capability | Existing RhymePad | Studio 02 prototype | Target | Status |
| --- | --- | --- | --- | --- |
| Line/bar editor | yes | yes/demo | Composer | READY |
| One logical newline = one bar | yes | yes/demo | Editor model | READY |
| Wrapped line does not create bar | yes contract | textarea demo | Editor geometry | READY |
| Active bar | yes | yes | Composer | READY |
| Current word / selection | yes | yes | shared selection state | READY |
| Replace selected word/range | yes | yes/demo | Result action | READY |
| Multi-word selection | yes | basic browser selection | Editor | READY |
| Stale-selection protection | partial | yes/demo proof | Selection contract | READY |
| Undo | yes | yes/demo | Editor | READY |
| Redo | yes/original | missing | Editor | READY |
| Enter/new bar | yes | yes/demo | Editor | READY |
| Backspace empty-bar merge/remove | yes/original | demo removal | Editor | READY |
| Paste behavior | yes/original | browser default | Editor | READY · multiline paste creates Bars |
| IME-safe input | required | not validated | Editor | ADAPTED · transaction guard; real-device acceptance pending |
| Font selection | yes | yes/demo | Editor dock | READY |
| Font size | yes | yes/demo | Quick tools + dock | READY |
| Light theme | yes | yes | Shell | READY |
| Dark theme | yes | yes | Shell | READY |
| Clear document | yes | missing | Document action | READY · revision + recovery safeguard |
| Song title rename | yes | yes/demo | Doc header | READY |
| Autosave | yes | localStorage demo | DocumentStore | READY · IndexedDB authoritative |
| Save status | yes | yes/demo | Doc header | READY · saving/saved/failure |
| Older/newer revision | yes | history demo | Editor dock | READY · revision list + restore |
| Revision restore safeguards current state | yes contract | yes/demo | DocumentStore | READY |
| Song create/open | yes | yes/demo | Library/sidebar | READY |
| Song search/sort | yes | missing | My texts | READY |
| Song rename/move | yes | partial | My texts | READY |
| Folder tree/sidebar | yes | demo project list only | My texts / sidebar | READY · nested hierarchy |
| Folder create | yes | missing | My texts | READY · root + subfolder |
| Folder rename | legacy capability | missing | My texts | READY · subtree-safe rename |
| Folder move/reorder | legacy capability | missing | My texts | READY · sibling subtree reorder |
| Move song between folders | yes | partial | My texts | READY |
| Folder delete with safe song handling | yes | missing | My texts | READY · subtree delete + parent fallback |
| Trash/restore | yes | yes/demo | My texts | READY |
| Permanent delete | yes | missing | My texts | READY |
| Bar number | yes | yes | editor rail | READY |
| Syllable count | yes | crude demo only | canonical/labelled metric | ADAPTED · explicitly labelled local approximation |
| Word count / hit / breath / stress per bar | yes | mostly missing | Bar detail | READY · Bar Inspector |
| Verse totals and duration estimate | yes | partial | footer/analysis | ADAPTED · timing canonical to Perform config; syllables labelled approximation |
| Live rhyme suggestions | yes | demo results | Inspector | READY · live Writer |
| Presets | yes | missing | contextual/filter preset | READY |
| Hide already used words | yes | missing | filter | READY |
| Auto-scroll opt-in/default OFF | yes | yes/demo | Inspector | READY |
| Auto-scroll loop + manual pause | yes | yes/demo | Inspector | READY |
| Analysis overview | yes | demo approximation | Reime mode | READY · canonical Writer analysis |
| End-rhyme scheme | yes | demo endings only | Reime mode | READY |
| Word laboratory | yes | missing | Reime/detail dock | READY |
| Relations inside verse | yes | missing | Reime mode | READY |
| Stress fingerprint | yes | missing | Reime mode | READY |
| End-rhyme/all-relations workbench | yes | missing | Reime mode | READY |
| Same/cross-language controls | present | missing | Reime mode | READY · DE / EN / Cross DE+EN |
| Performance move | yes | missing | Perform | READY |
| Accent/pause/breath/hold/erase | yes | yes/demo | Perform | READY |
| Cue drag | yes | missing | Perform | READY · drag + click alternative |
| Pause length | yes | missing | Perform | READY |
| Auto-map / clear | yes | yes/demo | Perform | ADAPTED · Auto-map explicitly labelled approximation |
| Straight/triplet | yes | missing | Perform settings | READY |
| Double/half time | yes | missing | Perform settings | READY |
| 8/16 grid | yes | 16 only | Perform | READY |
| Bar time / syllables-sec / pocket / breath load / flow fingerprint | yes | mostly missing | Bar inspector | READY |
| Previous bar / placements | yes | partial | Bar inspector | READY |

---

# C. Studio 02 capabilities that must be preserved

| Studio 02 capability | Status |
| --- | --- |
| Shared Studio / Search / Library / Saved navigation | READY |
| Resizable desktop assistant | READY |
| Compact desktop direct controls | READY |
| Result List / Compact / Tile modes | READY |
| Result detail dock | READY |
| Editor bottom dock | READY |
| Focus mode | READY |
| Command menu | READY |
| Light/dark theme system | READY |
| Reference light palette (#EAE7DC / #D8C3A5 / #8E8D8A / #E98074 / #E85A4F) | READY |
| Reference dark palette (#272727 / #747474 / #FF652F / #FFE400 / #14A76C) | READY |
| Custom semantic color-theme builder | READY |
| Live custom-theme preview + contrast feedback | READY |
| Save/delete local custom themes | READY |
| Custom theme replaces Light or Dark slot | READY |
| Extra custom themes in Quickstyle menu | READY · explicit touch trigger + hover |
| Selection-follow / pinned anchor | READY |
| Keyboard result navigation | READY |
| Restrained insert/save/result motion | READY |
| Reduced-motion support | READY |
| Mobile bottom navigation | READY-engineered · device acceptance pending |
| Single-surface mobile editor/results swap | READY-engineered · device acceptance pending |
| Production local song/library | READY · versioned IndexedDB DocumentStore |
| Production rhyme datasets | READY · live Writer; no demo result fallback |
| Rhyme analysis | READY · canonical Writer |
| UI syllable estimates | ADAPTED · explicitly labelled approximation |

No REFERENCE-ONLY demo behavior remains in the active Studio result, document, or rhyme-analysis paths. Approximate metrics remain explicitly labelled as approximations.

---

# D. Current runtime capabilities beyond the original design snapshot

| Capability | Target Studio placement |
| --- | --- |
| canonical Serving-v1 single DB | CapabilityService / diagnostics only |
| accepted DE Writer | SearchService |
| accepted EN Writer | SearchService |
| Phrase/Mosaic | Search scope + detail |
| reviewed Entity taxonomy | Entity contextual filter + detail |
| Entity category multi-select | contextual Entity controls |
| client unknown-query pronunciation | SearchService |
| generated-data capability | origin controls |
| Markov DE/EN | future Assist/Generate surface; paused |
| Lyric Structure V2 | future multi-line Assist; paused |

Markov work remains intentionally paused and is not a prerequisite for Studio migration.

---

# E. Scroll and geometry contract

Hard release gate:

~~~text
App shell
  no body-level vertical scroll during Studio operation

Composer
  exactly one vertical editor/content scroller

Inspector
  exactly one sibling results scroller

Dialog / bounded dock
  only its own content scrolls

Mobile
  one active main surface scroller at a time
~~~

Bar number, text and syllable/metric rails derive from one line geometry. Wrapped visual lines never create phantom bars. Nested result scrollers are forbidden.

---

# F. Interaction invariants

## Selection replacement

Before insertion, validate song ID, stable bar identity, document revision/range and selected source text. Never blindly reuse stale offsets.

## Search request ordering

- newest request wins;
- superseded responses do not mutate results;
- search work never moves the cursor;
- IME composition does not trigger analysis before compositionend;
- paging never silently reshuffles already visible accepted results.

## Autosave

Visible states: saving, saved, failed. Failure remains visible and exposes export/recovery.

## Capabilities

Unavailable language/channel controls are disabled with a reason. Never replace an unavailable runtime with demo results.

---

# G. Release viewport matrix

Minimum acceptance:

~~~text
360 CSS px
390 CSS px
768 CSS px
1024 CSS px
1440 CSS px
1920×1080-class browser viewport
200% browser zoom
mobile visible viewport with keyboard
prefers-reduced-motion
~~~

Required: no clipped rails, no Studio body scrollbar, no nested result scrollbars, mobile primary targets at least 44×44 CSS px, and the active editing line remains reachable with the mobile keyboard.

---

# H. Migration rule

The old routes remain explicit regression controls until final parity acceptance:

~~~text
/        current Search
/pad     current RhymePad
/studio  Studio 02 migration surface
~~~

Do not switch / to Studio until this document has no unapproved blockers.


---

# I. Exhaustive legacy inventory gate

The parity tables above are a living contract, not a claim that the first inventory is complete.

Before cutover, perform a deliberate old-vs-new audit of every interactive control and persisted workflow in the current Search and RhymePad surfaces.

Minimum audit method:

~~~text
1. enumerate every visible legacy control, menu, toggle, filter, badge/tag and context action;
2. enumerate every keyboard/mouse/touch behavior;
3. enumerate every persisted state and library operation;
4. enumerate every result-row metadata field and optional visualization;
5. map each item to its Studio location;
6. execute the mapped workflow in Studio;
7. mark parity only after behavior, not merely presence, is verified.
~~~

Current unresolved cutover blockers:

~~~text
real browser/device/audio acceptance across the release viewport matrix
final exhaustive old-vs-new interaction audit
~~~

Former owner-added blockers are now implemented in Studio:

~~~text
Library folder hierarchy and folder operations       READY
legacy tags/badges on found words/results            READY
optional rhyme-chain visualization                   READY
~~~

The old routes remain regression controls until the unresolved blockers and real-device acceptance are closed or explicitly owner-approved as deferred.
