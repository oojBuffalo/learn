# Web App Reference — lesson authoring guide

> Preserved from the SDD workspace after the branch's final review. These 17
> rules were not designed up front: each one was written the moment a review
> caught a defect that the existing rules did not forbid, so the guide is a
> record of how this package's 57 lessons and 498 items actually failed and
> what stopped each failure recurring. Anyone adding a lesson to
> `content/web-app-reference` should hold the new material to the same rules.
>
> Kept verbatim, including the British spellings in two rule headings, so it
> stays an accurate record of what was written at the time.


Read this alongside your task brief. It is the schema and renderer detail the
brief assumes. Every schema is **strict**: one unknown key anywhere is a hard
import failure, so never invent a field.

## Item types — exact permitted keys

Shared optional keys on every type: `hints` (string[]), `explanation` (string),
`difficulty` (`beginner`|`intermediate`|`advanced`), `tags` (string[]),
`media` ({src, alt?}[]), `meta` (object).

All types except `flashcard` also require `prompt` (string).

| type | required | optional |
|---|---|---|
| `multiple-choice` | `options` (≥2) | `shuffle` |
| `multi-select` | `options` (≥2) | `shuffle`, `partialCredit` |
| `fill-blank` | `template`, `blanks` (≥1) | — |
| `short-answer` | `accept` (≥1) | `match`: `exact`\|`fold`\|`regex` |
| `ordering` | `steps` (≥2) | — |
| `matching` | `pairs` (≥2) | `distractors` (string[]) |
| `flashcard` | `front`, `back` | `reverse`, `examples` (string[]) |

`flashcard` takes **no `prompt`**. Adding one fails the import.

An option is `{id, text, correct?, feedback?}` — nothing else.
A blank is `{slot, accept, caseSensitive?}`. A step is `{id, text}`.
A pair is `{left, right}`.

## Type-specific rules the validator enforces

- `multiple-choice`: **exactly one** option with `correct: true`. Option ids unique.
- `multi-select`: **at least one** correct option. Option ids unique.
- `fill-blank`: the `{{n}}` placeholders in `template` must match the declared
  `blanks[].slot` values exactly — same count, same numbers.
- `ordering`: the `steps` array order **is** the correct answer. Step ids unique.
- `matching`: `left` values must be unique.
- `short-answer`: with `match: "regex"`, every `accept` entry must compile.

## Ids

`/^[a-z0-9][a-z0-9_-]*$/i`, max 64 chars, unique across the whole package.
Convention: `<lesson-id>-<kind><n>` — `mc`, `ms`, `fb`, `sa`, `ord`, `mat`, `card`.
Glossary flashcards use `glossary-<term-slug>`.

## Where the renderer will bite you

- `::activity{id="x"}` must sit **alone on its own line at column 0**, with a
  blank line either side. Inside a list or code fence it breaks the block.
- No raw HTML, no HTML comments — both render as literal visible text.
- Only `##` and `###` are styled. Never use `#`; it collides with the page title.
- No syntax highlighting. Fenced blocks are plain mono and scroll.
- **Table cells never wrap.** Keep them to a few words.
- Fill-blank inputs are a fixed 8rem — keep answers under ~12 characters.
- Flashcard `front` renders large, bold, centred: one short line. `back` is laid
  out inline — a single paragraph, no lists, no display math.
- Per-option `feedback` only surfaces for `multiple-choice`. On `multi-select`
  it is accepted but never shown, so anything the reader must see goes in
  `explanation`.
- No footnotes (`[^ref]`) and no mermaid — both render as literal text.

## Math

KaTeX is on, `$…$` inline and a multi-line `$$` block for display. A literal
dollar sign is `\$` **always** — single-dollar math is enabled, so `$5 and $10`
silently parses as math. The source library contains no `$` at all, so this only
matters for notation you add yourself. Display math is refused in flashcard
faces and option text; those fields take inline math only.

## Every item you write

Must carry its unit id in `tags`, or the unit's tag-sourced games find no
compatible items and validation fails.

## Validate before you commit

    npm run validate:content -- content/web-app-reference

Errors come back as `file · path · message`, all of them at once.

---

# Standing rules added after the Task 3 pilot review

These four came out of reviewing the first lesson. Each one caught a real defect
that discipline alone had not prevented.

## 1. The source is the authority — over your brief's examples too

Your brief may contain illustrative prose. **It is a suggestion; the source doc
is the authority.** Never introduce a fact the source does not state:

- no tool names (`ping`, `curl`, `dig`) unless the source names them
- no port numbers, version numbers, or status codes the source does not give
- **no invented quantities** — if the source says "many", write "many", not
  "dozens"

The pilot implementer correctly refused an invented port number in its hook, and
then wrote an invented quantity in its payoff. Watch the whole lesson, not just
the places where the rule feels salient.

## 2. Verify your self-review against the artifact, not your intent

If your report says you softened, removed or fixed something, **grep the file and
confirm it**. The pilot's report claimed an over-absolute sentence had been pulled
back; it had been, in the lesson body — while the original survived in an item
`explanation`, which is the copy the learner actually reads while answering.

A claim in a report that the artifact does not contain is worse than no claim.

## 3. Word count is body-only

The 700–900 band excludes YAML frontmatter. As `summary` and `objectives` grow on
denser lessons, counting the whole file silently shrinks the real prose budget.

## 4. Attach every citation to the claim it backs

The source footnotes a specific sentence. A bare URL list in `## Sources` severs
that link. Write:

    - IETF, [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) (accessed 2026-07-18) — HTTP statelessness

Some source docs carry four or five footnotes; without the trailing clause the
reader cannot tell which claim rests on which reference.

## 5. Activities must test different claims

Before you commit, list what each activity tests. If two test the same insight —
or if an activity restates something a flashcard already covers — you have a
collision, not coverage. A source doc supports a finite number of distinct
questions; writing past that number produces vocabulary checks, not assessments.

Prefer an activity that tests an *elimination* or a *decision* over one that tests
a term.

---

# Standing rules added after the Task 4 pilot-unit review

## 6. Vary the closing move — the elimination frame is not the ending

All four pilot lessons closed the same way: failure modes reframed as
eliminations, three paragraphs, hook payoff, then an elimination-framed activity.
Renaming the headings does not fix this; the *beat* is what repeats, and it had
already leaked into 7 of the unit's 20 quiz items.

Keep the elimination frame — it is the best pedagogy in the pilot — but treat it
as **a move available anywhere in a lesson**, not as the closing section. In
roughly half of lessons the failure-mode material belongs mid-lesson.

Pick a closing move from this repertoire, and **never use the same one in two
consecutive lessons of a unit**:

- (a) what each symptom rules out
- (b) the verdict on the hook — return to the opening scene and settle it
- (c) the decision you now have to make, and what it costs
- (d) the cheapest thing to check first

The closing heading must name **the lesson's own subject**, not the generic
"symptom". "What actually breaks a client" is the model.

## 7. Run a unit-level frame-collision pass

Rule 5 (activities must test different claims) is scoped to one lesson, so it
cannot catch repetition across a unit. Before committing a unit, list every
activity's *frame* — the cognitive move it asks for, not just its claim — and
check for variety across the unit's whole quiz. Two lessons each ending in
"which of these does this symptom eliminate" collide even when their claims
differ.

## 8. Multi-select scoring: two correct options is a sharp edge

The engine scores partial credit as `(right − wrong) / correct`. On a
two-correct item, one right plus one wrong scores **zero** — the same as
answering entirely wrongly.

Prefer three correct options where the source supports three. Where the source
supports only two, keep every distractor unambiguously wrong and refuted in the
body, so a zero is earned rather than unlucky. Never invent a third consequence
the source does not state just to soften the scoring — rule 1 outranks scoring
aesthetics.

## 9. Typography: curly quotes in prose

The source library uses curly quotation marks throughout. Match it. Straight
quotes belong only inside code spans, fenced blocks and JSON. Pin this now —
a mixed convention across 57 lessons is not worth re-litigating later.

## 10. ASCII diagram convention

Where a source carries a mermaid diagram, redraw it as a plain ASCII ladder in a
```text fence: pure ASCII, under ~60 columns, no alignment dependency between
rows. Lifelines are not viable — real participant labels need ~130 columns.

Two things the pilot got wrong and you must not repeat: include an explicit turn
marker where the request half becomes the response half, and make sure the
surrounding prose matches the reading direction. The pilot's prose said "read
down for the request and back up for the response" while its ladder read
downward throughout.

---

# Rule 11 — Activity count scales with the SOURCE doc (supersedes "5 per lesson")

User decision after reviewing the pilot unit. The count is set by the **source
doc's** word count, not your lesson's:

| Source doc words | Inline activities |
| --- | --- |
| under 400 | 3 |
| 400–424 | 4 |
| 425 and over | 5 |

**Flashcards stay at 5 for every lesson**, regardless of source length.

Measured across the library, 54 of the 57 source docs are under 400 words
(median 343, range 304–449), so 3 is the normal case. Exactly three docs clear
the threshold: `anatomy-of-a-web-app` (449 → 5), `urls-dns-http-and-tls`
(406 → 4), `request-response-lifecycle` (400 → 4).

Check the source before you start:

    wc -w /Users/ooj/Documents/web-app-reference/docs/<section>/<doc>.md

The reasoning: a ~340-word source supports roughly six distinct claims, and ten
assessments over-subscribe them. The pilot's visible symptom was one item
collapsing into a vocabulary check that duplicated two others. Fewer, better
activities — each testing an elimination or a decision rather than a term.

Fewer gates also lets the prose breathe: at five, a reader hits an activity every
120–150 words and never carries a thought across a section boundary.

---

# Rule 12 — Lists are where invented terms hide

Rule 1 has two halves. Hedge-hardening is the loud one and reviewers now catch
it. The quiet one is the **invented term**, and it hides in lists.

The `start-here` lesson wrote "a cache, a queue, a migration, a deploy". Three
of those four are source vocabulary — `cache` and `queue` are literal diagram
node labels, `deploy` comes from "deployable unit". `migration` appears nowhere
in that source doc. The sentence read as well-grounded because three quarters of
it was, and a hedge-focused self-review had no reason to look at it.

**Before you commit, grep the source for every concrete noun in every list you
wrote.** Not the hedges — the nouns. One unsourced item in a list of four is the
easiest defect in this project to write and the hardest to notice.

## Rule 12a — Scenario colour is not an invented term

Clarification, ruled after the `browser-platform` review.

Invented **scenario colour in a question stem is fine**, provided the claim being
graded is fully sourced. "The profile, the settings, the notifications" in a
question about `async`/`await` serialising independent work is acceptable: the
nouns are structurally interchangeable — swap in "cart, inventory, shipping" and
the item is unchanged — which is the tell that they do no epistemic work. The
approved lessons already rely on this licence (`shop.example/orders`, "a customer
submits a checkout", "a reader opens a photo gallery").

The rule-12 defect was different in kind. "A cache, a queue, a migration, a
deploy" read as an *enumeration of the domain's own vocabulary*, three real
diagram-node labels beside one invention, so the sentence borrowed an authority
it had not earned.

**The test:** flag an invented noun only when it sits inside what reads as a list
of domain vocabulary. Narrative texture is fine when the graded claim is sourced.

## Rule 13 — Derive counts from files, not from memory

Report arithmetic has now been wrong four times in this project — an item count,
a multi-select tally, a card redundancy attribution, a closing-move tally. Every
one was a number carried in the author's head rather than read back off disk.

Before writing any count into a report, compute it from the artifact. `grep -c`,
a `node -e` over the JSON, `wc -w` on the body. The content has been consistently
better than the reports describing it, which wastes reviewer attention on
phantom problems and — worse — occasionally hides real ones.

**This applies to CLAIMS as well as counts.** The `frontend` report asserted "no
family appears in consecutive lessons" directly above a table showing two that
did. A summary sentence written from intent rather than read back off the table
beneath it is the same defect as a miscounted total. After you build a table,
re-read it and check that every claim you made about it survives.

## Rule 14 — Do not claim source authority for your own categorisation

A third variant of the rule-1 defect, distinct from hedge-hardening and invented
terms, found in the `backend` unit.

The source listed seven failure modes flat and uncategorised. The lesson wrote
that orphaned uploads are "named as a file-storage failure rather than a job
failure, and the reason is **in the definition**" — presenting an authorial
synthesis of two separate sentences as a distinction the source draws.

The inference was defensible. The attribution was not. When you group, rank or
categorise material the source presents flat, **own it**: "this lesson treats it
as…", "read against the map…". Never "the source names it", "the reason is in
the definition", or any phrasing that lends your organising choice the source's
authority.

## Rule 15 — A completeness claim is a promise; check it holds

If you write "every clause answers one of the four demands", "each of these three
maps to…", or "all five interventions line up against the path", then count them
in the artifact before you commit.

Two units have now shipped a completeness claim the passage did not satisfy: a
worked example that mapped four of five interventions, and one that promised four
demands and delivered three, never mapping the fourth at all. Both read as
finished because the frame was good — the frame just was not carried through.

A learner checking themselves against your stated frame will come up short and
assume they missed something. Count, then claim.

## Rule 16 — Counting a completeness claim is not checking it

Rule 15 says count before you claim. That is necessary and it is not sufficient.
A completeness claim asserts a *correspondence*, and the count is only its
cheapest half.

A shipped example: "Three recurring mistakes remain, and this lesson takes each
as one of the choices above made by default", followed by exactly three mistakes.
The count is right. The claim is still false — only one of the three (a cache
promoted to authority) corresponds to a choice named above. The other two are
replication and partitioning issues that the section never raised. Both the
implementer and the controller verified "three", and both missed that "each…one
of" is a claim about mapping, not about arithmetic.

So: for every item in the set, name the thing it maps to. If you cannot name it
without reaching into a different section, the claim does not hold.

**And the trap that produced this one:** the sentence was itself a fix for an
unearned correspondence. Asked to stop asserting a mapping the source did not
draw, the repair reached for a *different* mapping rather than for no mapping.
When a correspondence turns out to be unearned, the first candidate repair is to
drop the framing and let the list stand flat — as two of that same round's three
fixes correctly did. Only assert a replacement mapping if you can walk it item by
item.

## Rule 17 — The frame table covers every activity, not just the graded prose ones

Rule 7 asks you to name the cognitive move each activity demands and check for
collisions. Two units running, that pass has been built over the multiple-choice
and multi-select items only — and both times the collision that shipped was
somewhere else.

The unit that prompted this rule ran a careful ten-row table over its five `mc`
and five `ms` items, caught a real collision in it, and fixed it. Its two
colliding `matching` items were never in the table. Both asked the learner to
retrieve the source's definitional sentence for each listed term; one said "match
each name to what it **is**", the other "match each mechanism to what it **does**".
That is a difference in the answers, not in the move.

So: the table has one row per inline activity — every `matching`, `ordering`,
`fill-blank` and `short-answer` included. Those types collide more easily than
prose items, not less, because their shape constrains what they can ask.

And a `matching` item has a second frame beyond its prompt: what its two columns
*are*. Term→definition is the default and the most collision-prone. Choice→cost,
symptom→repair, and mechanism→guarantee are all available, and a unit that ships
two term→definition matchings has spent the same move twice however different its
terms.

Related: a matching pair whose left and right restate a flashcard's front and back
is a duplicated graded claim (rule 5). Check every pair against the same lesson's
cards before committing.
