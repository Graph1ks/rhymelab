# UI Redesign Parity Contract

## Status

This document is the release gate for the RhymeLab Studio UI/UX rebuild.

The new Studio surface may replace the existing Search and RhymePad entry points only after every required capability below is either READY, ADAPTED, or explicitly owner-approved as deferred. Anything else is a blocker.

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
| Query pronunciation DE | yes | yes | demo select | Inspector direct filters | TODO |
| Query pronunciation EN | yes | yes | demo select | Inspector direct filters | TODO |
| Query pronunciation DE+EN | yes | partial | demo select | Inspector direct filters | TODO |
| Result language DE | yes | current Pad request | demo select | Inspector direct filters | TODO |
| Result language EN | yes | current Pad request | demo select | Inspector direct filters | TODO |
| Result language DE+EN | yes | current Pad request | demo select | Inspector direct filters | TODO |
| Scope: all | yes | yes | yes/demo | Scope tabs | TODO-live |
| Scope: words | yes | yes | yes/demo | Scope tabs | TODO-live |
| Scope: phrases/mosaic | yes | yes | yes/demo | Scope tabs | TODO-live |
| Scope: entities | yes | yes | yes/demo | Scope tabs | TODO-live |
| Multisyllabic perfect | yes | yes | missing | Filter / active chip | TODO |
| Perfect rhyme | yes | yes | simplified | Filter / active chip | TODO |
| Multisyllabic slant | yes | yes | missing | Filter / active chip | TODO |
| Rhyme family | yes | yes | missing | Filter / active chip | TODO |
| Slant rhyme | yes | yes | simplified | Filter / active chip | TODO |
| Assonance | yes | yes | missing | Filter / active chip | TODO |
| Consonance | yes | yes | missing | Filter / active chip | TODO |
| Primary rhyme-class exclusivity | yes | yes | demo only | Search adapter | TODO |
| Overlapping sound relations | yes | yes | demo only | Detail + badges | TODO |
| Syllables: all | yes | partial | yes | Direct filter | TODO-live |
| Syllables: equal | yes | partial | yes/demo | Direct filter | TODO-live |
| Syllables: ±1 | yes | partial | yes/demo | Direct filter | TODO-live |
| Syllables: ±2 | yes | no direct control | missing | Advanced filter | TODO |
| Syllables: ±3 | yes | no direct control | missing | Advanced filter | TODO |
| Sort: recommended | yes | backend ranking | yes/demo | Direct sort | TODO-live |
| Sort: syllable distance | yes | backend ranking | demo approximation | Direct sort | TODO |
| Sort: most common | yes | backend ranking | missing | Advanced/direct sort | TODO |
| Sort: closest rhyme | yes | backend ranking | missing | Advanced/direct sort | TODO |
| Sort: A-Z | yes | no | yes/demo | Direct sort | TODO-live |
| Preferred pronunciation only | yes | yes | missing | Advanced filter | TODO |
| All pronunciation variants | yes | no direct surface | missing | Advanced filter | TODO |
| Historical / obsolete | yes | current only | missing | Advanced toggle + chip | TODO |
| Generated data | capability-driven | current route policy | missing | Capability contextual control | TODO |
| Generated-only | capability-driven | no current Pad control | missing | Advanced origin control | TODO |
| Entity category filter | yes | yes | demo generic only | Contextual Entity controls | TODO |
| Full Entity taxonomy | yes | reviewed subset in Pad | missing | Contextual chips/dialog | TODO |
| Entity multi-select | accepted newer interaction | no | missing | Contextual chips | TODO |
| List density | yes | no | yes | Result toolbar | TODO-live |
| Compact density | yes | compact/live suggestions | yes | Result toolbar | TODO-live |
| Tile/field density | no canonical search | no | yes | Result toolbar | OPTIONAL |
| Infinite loading | yes | load-more integration | demo simulation | Results scroller | TODO |
| Explicit More button | yes | yes | yes/demo | Results footer | TODO-live |
| Stable result order while paging | yes contract | yes | demo | Search adapter | TODO |
| Result detail | yes | limited badges | yes/demo | Detail dock | TODO-live |
| IPA | yes | result metadata | missing in demo detail | Detail dock | TODO |
| Pronunciation variants + provenance | yes | limited | missing | Detail dock | TODO |
| Relation metrics | yes | badges/scores | missing | Detail dock | TODO |
| Part of speech / lemma | yes | no | missing | Detail dock | TODO |
| Usage/commonness | yes | compact usage | missing | Detail dock | TODO |
| Phrase metadata | yes | result kind | missing | Detail dock | TODO |
| Entity identity/category/popularity | yes | badges | missing | Detail dock | TODO |
| Sources/provenance | yes | source badge | missing | Detail / Sources | TODO |
| Dataset stats | yes | no | missing | Settings/Data | TODO |
| Query runtime | yes | no | missing | Diagnostics | TODO |
| rolling AVG 100 runtime | yes | no | missing | Diagnostics | TODO |
| UI language DE | yes | no dedicated Pad UI locale | prototype DE | App setting | TODO |
| UI language EN | yes | no | missing | App setting | TODO |
| Unknown query client IPA resolver | yes | through Writer endpoint | missing | SearchService adapter | TODO |
| query-pronunciation cache/revision invalidation | yes | indirect | missing | SearchService adapter | TODO |
| true zero-result state | yes | yes | demo | Results state | TODO |
| filter-empty state | yes | yes | demo | Results state | TODO |
| runtime unavailable state | yes | yes | missing | Results state | TODO |
| missing data package state | yes | partial | missing | Capability state | TODO |
| loading first page | yes | yes | demo | Results state | TODO |
| loading next page | yes | yes | demo | Results state | TODO |

---

# B. RhymePad / Studio writing parity

| Capability | Existing RhymePad | Studio 02 prototype | Target | Status |
| --- | --- | --- | --- | --- |
| Line/bar editor | yes | yes/demo | Composer | TODO-production |
| One logical newline = one bar | yes | yes/demo | Editor model | TODO |
| Wrapped line does not create bar | yes contract | textarea demo | Editor geometry | TODO |
| Active bar | yes | yes | Composer | TODO-production |
| Current word / selection | yes | yes | shared selection state | TODO-production |
| Replace selected word/range | yes | yes/demo | Result action | TODO-production |
| Multi-word selection | yes | basic browser selection | Editor | TODO |
| Stale-selection protection | partial | yes/demo proof | Selection contract | TODO-production |
| Undo | yes | yes/demo | Editor | TODO-production |
| Redo | yes/original | missing | Editor | TODO |
| Enter/new bar | yes | yes/demo | Editor | TODO-production |
| Backspace empty-bar merge/remove | yes/original | demo removal | Editor | TODO |
| Paste behavior | yes/original | browser default | Editor | TODO |
| IME-safe input | required | not validated | Editor | TODO |
| Font selection | yes | yes/demo | Editor dock | TODO-production |
| Font size | yes | yes/demo | Quick tools + dock | TODO-production |
| Light theme | yes | yes | Shell | READY-visual |
| Dark theme | yes | yes | Shell | READY-visual |
| Clear document | yes | missing | Document action | TODO |
| Song title rename | yes | yes/demo | Doc header | TODO-production |
| Autosave | yes | localStorage demo | DocumentStore | TODO |
| Save status | yes | yes/demo | Doc header | TODO-production |
| Older/newer revision | yes | history demo | Editor dock | TODO |
| Revision restore safeguards current state | yes contract | yes/demo | DocumentStore | TODO |
| Song create/open | yes | yes/demo | Library/sidebar | TODO-production |
| Song search/sort | yes | missing | My texts | TODO |
| Song rename/move | yes | partial | My texts | TODO |
| Folder create/delete | yes | missing | My texts | TODO |
| Trash/restore | yes | yes/demo | My texts | TODO-production |
| Permanent delete | yes | missing | My texts | TODO |
| Bar number | yes | yes | editor rail | TODO-production |
| Syllable count | yes | crude demo only | canonical/labelled metric | TODO |
| Word count / hit / breath / stress per bar | yes | mostly missing | Bar detail | TODO |
| Verse totals and duration estimate | yes | partial | footer/analysis | TODO |
| Live rhyme suggestions | yes | demo results | Inspector | TODO-live |
| Presets | yes | missing | contextual/filter preset | TODO |
| Hide already used words | yes | missing | filter | TODO |
| Auto-scroll opt-in/default OFF | yes | yes/demo | Inspector | TODO-production |
| Auto-scroll loop + manual pause | yes | yes/demo | Inspector | TODO-production |
| Analysis overview | yes | demo approximation | Reime mode | TODO |
| End-rhyme scheme | yes | demo endings only | Reime mode | TODO |
| Word laboratory | yes | missing | Reime/detail dock | TODO |
| Relations inside verse | yes | missing | Reime mode | TODO |
| Stress fingerprint | yes | missing | Reime mode | TODO |
| End-rhyme/all-relations workbench | yes | missing | Reime mode | TODO |
| Same/cross-language controls | present | missing | Reime mode | TODO/SEMANTICS |
| Performance move | yes | missing | Perform | TODO |
| Accent/pause/breath/hold/erase | yes | yes/demo | Perform | TODO-production |
| Cue drag | yes | missing | Perform | TODO |
| Pause length | yes | missing | Perform | TODO |
| Auto-map / clear | yes | yes/demo | Perform | TODO |
| Straight/triplet | yes | missing | Perform settings | TODO |
| Double/half time | yes | missing | Perform settings | TODO |
| 8/16 grid | yes | 16 only | Perform | TODO |
| Bar time / syllables-sec / pocket / breath load / flow fingerprint | yes | mostly missing | Bar inspector | TODO |
| Previous bar / placements | yes | partial | Bar inspector | TODO |

---

# C. Studio 02 capabilities that must be preserved

| Studio 02 capability | Status |
| --- | --- |
| Shared Studio / Search / Library / Saved navigation | READY-visual |
| Resizable desktop assistant | READY-visual |
| Compact desktop direct controls | READY-visual |
| Result List / Compact / Tile modes | READY-visual |
| Result detail dock | READY-visual |
| Editor bottom dock | READY-visual |
| Focus mode | READY-visual |
| Command menu | READY-visual |
| Light/dark theme system | READY-visual |
| Selection-follow / pinned anchor | READY-visual |
| Keyboard result navigation | READY-visual |
| Restrained insert/save/result motion | READY-visual |
| Reduced-motion support | READY-visual |
| Mobile bottom navigation | READY-visual |
| Single-surface mobile editor/results swap | READY-visual |
| Demo local song/library | REFERENCE-ONLY |
| Demo rhyme datasets | REFERENCE-ONLY |
| Demo syllable/rhyme analysis | REFERENCE-ONLY |

REFERENCE-ONLY behavior must be replaced by production adapters, never treated as canonical analysis.

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
