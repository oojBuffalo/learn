# Web App Reference — Lesson Package Design

Port the Web App Reference Markdown library (`~/Documents/web-app-reference`)
into a single study-app package: 57 lessons across 12 units, rewritten as
teaching material rather than transcribed as reference prose.

## Overview

The source is a technology-neutral reference library — 71 Markdown files that
follow a user action from the browser, across networks and application code, into
storage and operations, and back. It is unusually uniform: 57 of its topic docs
share an identical 10-heading structure.

That uniformity makes a mechanical port tempting and wrong. The 10 headings are a
*reference* structure, organised for a reader who already knows the shape of the
subject and wants to jump to "Failure modes". A lesson has to build understanding
in order. So the substance is ported; the structure is not.

### Requirements settled during brainstorming

1. **One package, twelve units.** A single `web-app-reference` package whose
   manifest groups lessons with `units`. This keeps one library entry, one
   progress track, and lets `prerequisites` cross section boundaries — which is
   what preserves the source's six-stage learning path.
2. **Rewrite for the lesson format.** Not a transcription. Each lesson is written
   as teaching material, with the source doc as the authority for every technical
   claim.
3. **Heavy activity load.** Five inline activities and five flashcards per lesson.
4. **Pilot first.** Build `01-web-foundations` end to end, validate, review, then
   produce the remaining eleven units.

### Chosen approach

Author the package in folder form under `content/web-app-reference/` so it stays
diffable and reviewable, exactly as `content/matching-and-recommendation/` does.
Build an offline validator harness before writing content, so a 608-item
authoring pass can be checked without running the server.

## 1. Source inventory

All 71 Markdown files are accounted for:

| Source | Count | Becomes |
| --- | --- | --- |
| Topic docs (uniform 10-heading) | 57 | 57 lessons |
| Section `index.md` | 12 | Unit titles in the manifest |
| `learning-path.md` | 1 | Unit ordering and `prerequisites` wiring |
| `glossary.md` (38 terms) | 1 | 38 flashcards tagged `glossary` |

Index prose is deliberately dropped. It is site navigation — "Read this section",
"Continue" — and the app supplies its own. Only the section titles survive, as
unit names.

## 2. Target package

### 2.1 Layout

```
content/web-app-reference/
├── manifest.json      12 units, 57 lessonIds
├── lessons/           57 files, NN-MM-slug.md
├── items.json         608 items
├── quizzes.json       12, one per unit
└── games.json         24+, at least two per unit
```

Lesson filenames are `NN-MM-slug.md` where `NN` is the unit number and `MM` the
position within it — `01-02-urls-dns-http-and-tls.md`. Filename order sets lesson
order; the manifest's `units` set the grouping.

### 2.2 Units

| # | Unit | Lessons |
| --- | --- | --- |
| 00 | Start here | 1 |
| 01 | Web foundations | 4 |
| 02 | Browser platform | 4 |
| 03 | Frontend | 6 |
| 04 | Backend | 5 |
| 05 | Data | 6 |
| 06 | APIs and integration | 5 |
| 07 | Security | 5 |
| 08 | Quality and observability | 5 |
| 09 | Delivery and operations | 6 |
| 10 | Architecture | 5 |
| 11 | Technology landscape | 5 |

Unit 00 holds only `anatomy-of-a-web-app` — the whole-system picture, which is
the source's own recommended entry point.

### 2.3 Lesson structure

Each lesson follows a teaching arc, not the source's headings:

```
---
id, title, summary, objectives, estimatedMinutes, difficulty, tags, prerequisites
---

## <concrete opening>    a situation the reader recognises, that the concept
                         explains — never a definition
## <the core model>      the one idea the lesson turns on, made concrete
::activity{1}
## <how it works>        mechanisms, in dependency order
::activity{2}
::activity{3}
## <worked example>      one trace followed all the way through
::activity{4}
## <choosing>            tradeoffs framed as decisions with consequences
## <when it breaks>      failure modes as diagnosable symptoms
::activity{5}
## Sources
```

Headings are specific to each lesson — "What a certificate actually proves", not
"Key mechanisms". Target length is 700–900 words, up from the source's ~330; the
difference is explanation the reference deliberately omits.

Activities land where understanding is checkable: after the model is introduced,
twice through the mechanism build-up where misconceptions form, after the worked
example, and after the failure modes.

### 2.4 Items

608 items total:

| Kind | Count | Notes |
| --- | --- | --- |
| Inline activities | 285 | 5 per lesson, mixed types |
| Lesson flashcards | 285 | 5 per lesson, for the scheduler |
| Glossary flashcards | 38 | tagged `glossary` |

Item ids are `<lesson-id>-<kind><n>` — `urls-dns-http-and-tls-mc1`. Every item
carries its unit slug as a tag so tag-sourced games resolve.

**Per-unit type constraint:** each unit must contain at least one `matching` item
and at least two `multiple-choice` or `multi-select` items, or its games have no
compatible source and `validatePackage` rejects the package. This binds hardest on
unit 00, which has only five inline activities to work with.

### 2.5 Quizzes

One per unit, `passThreshold` 0.75, drawing on that unit's inline activities.
Flashcards are not quizzable and must be excluded.

### 2.6 Games

Two per unit: a `matching` game sourced by unit tag, and a `timed-round` at 60
seconds. `order-it` is used where a unit has enough `ordering` items to justify a
third.

## 3. Fidelity contract

The risk in a rewrite is that the author's voice displaces the source's hedged,
technology-neutral rigor. Three rules bound it:

1. **Every technical claim traces to its source doc.** The rewrite reorganises and
   expands explanation. It does not add assertions the library does not make.
2. **Footnoted citations survive** into `## Sources` as a Markdown link list. The
   RFC and specification references are the source's primary evidence.
3. **Worked examples are new prose, not new facts.** They make an existing claim
   concrete and stay technology-neutral in the source's style.

Thin source docs are where drift is most likely, and are the ones to review
hardest.

## 4. Renderer constraints

Learned from `content/README.md` and enforced by the validator:

- `::activity{id="x"}` alone on its own line at column 0, blank lines both sides.
- No raw HTML and no HTML comments — both render as literal text.
- Only `##` and `###` are styled. A leading `#` collides with the page title, so
  titles live in frontmatter only.
- No syntax highlighting; fenced blocks are plain mono.
- Table cells never wrap — keep them to a few words.
- Flashcard fronts are one short line; backs are a single paragraph, no lists.
- Per-option `feedback` only surfaces for `multiple-choice`. Anything a reader
  must see goes in `explanation`.
- Every schema is strict: one unknown key is a hard import failure.

Two source-specific consequences:

- **Footnotes are unsupported.** All 57 docs use `[^ref]`; these flatten into
  `## Sources`.
- **Mermaid is unsupported.** Three docs carry flowcharts
  (`anatomy-of-a-web-app`, `request-response-lifecycle`, `rendering-and-the-dom`).
  These are redrawn as ASCII diagrams in fenced blocks, which read correctly in
  mono.

The source contains no `$` characters, so KaTeX's single-dollar math introduces no
escaping burden. Any math added during the rewrite follows the `content/README.md`
field rules.

## 5. Validator harness

`scripts/validate-content.mjs` reads a package folder and validates it offline,
importing the real schemas from `shared` — `manifestSchema`,
`lessonFrontmatterSchema`, `itemSchema`, `quizSchema`, `gameSchema` — and then
`validatePackage` for cross-file references.

It reports every failure at once as `file · path · message`, matching the import
endpoint's `422` shape. This is what makes a 608-item authoring pass tractable: no
zip, no server, no round trip.

Final confirmation still goes through the real path — zip at archive root, POST to
`/api/packages/import`, expect `201`.

## 6. Build sequence

1. **Validator harness.** `scripts/validate-content.mjs` plus a `validate:content`
   npm script. Proven against the existing `matching-and-recommendation` package,
   which must pass clean.
2. **Skeleton.** `manifest.json` with all 12 units and 57 lesson ids; empty
   lessons and item files. Establishes ids and ordering before any prose.
3. **Pilot — unit 01, Web foundations.** 4 lessons, ~40 items, 1 quiz, 2 games.
   Validated, zipped, imported against a running server, reviewed.
4. **Remaining 11 units**, unit by unit, validating after each.
5. **Glossary flashcards** and final whole-package validation.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Rewrite drifts from source claims | Fidelity contract; review thin lessons hardest |
| 5 activities per lesson reads as over-quizzed | Pilot decides; dropping to 3 is a plan-level change |
| Unit 00 cannot satisfy the game type constraint | Verify during skeleton, before prose |
| 608 items is a long tail of small errors | Offline validator reports all failures per run |
