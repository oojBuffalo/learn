# Content packages

Authored study packages, kept here in folder form so they are diffable and
reviewable. The app imports them as zips.

## Importing one

The zip must contain the package's files at the **archive root** — zipping the
folder itself produces `mypackage/manifest.json` and the import fails with
`missing manifest.json`.

```
cd matching-and-recommendation
zip -r /tmp/pkg.zip manifest.json lessons items.json quizzes.json
```

Then either drop `/tmp/pkg.zip` on the Library page, or import it headlessly —
the endpoint takes the raw zip bytes as the request body, not multipart:

```
curl --data-binary @/tmp/pkg.zip http://localhost:4321/api/packages/import
```

A `201 {"packageId":"…"}` means it landed. A `422` returns `error.details[]`
naming the file and JSON path of every problem at once, so one round trip finds
them all.

Re-importing a package with the same manifest `id` replaces its content in
place and **keeps your review scheduling and lesson progress** — safe to do
after every edit.

## Layout

```
<package>/
├── manifest.json     required, at the archive root
├── lessons/*.md      required, YAML frontmatter + Markdown, filename order
├── items.json        optional, a JSON array of exercises and flashcards
├── quizzes.json      optional
├── games.json        optional
└── assets/           optional, referenced as assets/… from lesson Markdown
```

## Authoring notes

Constraints the renderer imposes, learned the hard way:

- `::activity{id="x"}` must sit alone on its own line at column 0, with blank
  lines either side. The body is split at those lines, so a directive inside a
  list or code fence breaks the surrounding block.
- No raw HTML and no HTML comments — both render as literal visible text.
- No syntax highlighting. Fenced blocks are plain mono, and they scroll.
- Only `##` and `###` are styled. `#` collides with the page title.
- Table cells never wrap, so keep them to a few words.
- Fill-blank inputs are a fixed 8rem — answers longer than ~12 characters
  scroll inside the box.
- Flashcard fronts render large, bold and centred: one short line. Backs are
  laid out inline, so write them as a single paragraph with no lists.
- Multi-select options can carry `feedback`, but the app only surfaces per-option
  feedback for `multiple-choice` — put anything the reader must see in
  `explanation`.
- Every schema is strict: one unknown key anywhere is a hard import failure.

## Math

Math is KaTeX, which covers a large subset of LaTeX's math mode. Write `$…$` for
inline math and a `$$` block for display math:

```
Hopcroft–Karp runs in about $O(E\sqrt{V})$.

$$
\min_{\sigma} \sum_{i=1}^{n} C_{i,\sigma(i)}
$$
```

A fenced block tagged ` ```math ` is display math too, and is the easier choice
for a long derivation because no dollar signs are involved.

**A literal dollar sign is `\$`, always.** Single-dollar math is on, so
`costs $5 and $10` silently parses as math — an unpaired `$` is refused at
import, but a balanced accident cannot be caught for you.

Display math must be a multi-line `$$` block. On one line, `$$x$$` is inline
math, not a centred block.

Where math works, and where it doesn't:

| Field | Math |
|---|---|
| lesson body, `prompt`, `explanation` | inline and display |
| option `text` and `feedback`, `hints`, ordering `steps`, matching `left`, fill-blank literals, flashcard `front`/`back`/`examples` | inline only |
| matching `right`, `distractors`, `accept` values | none |
| frontmatter `title`/`summary`, manifest `title`/`description` | none |

Matching's right-hand values sit inside a `<select>`, which can only hold text —
so put the notation on the left. Flashcard faces are laid out inline, which is
why display math is refused there. Anything in the "none" rows renders verbatim,
so a lone `$` there is fine and needs no escaping.

Broken math fails the import with the usual `422`, naming the file and path:

```
{ "file": "items.json", "path": "mc1.prompt",
  "message": "KaTeX parse error: Undefined control sequence: \\fracc …" }
```

Two more constraints worth knowing:

- Math cannot span a `{{n}}` fill-blank placeholder — the template is split at the
  blanks before it is parsed, so each literal chunk must close its own math.
- `\href`, `\url` and `\includegraphics` are disabled, and macros do not carry
  between expressions: every formula stands alone.

The fields in the "inline only" row also honour ordinary inline Markdown now, so
`**bold**` and `` `code` `` work in an option — and a stray `*` or `_` will be
read as formatting.

Ordering steps double as screen-reader labels on their move buttons, where math
is read as its source. Keep those short: `$O(n^3)$` reads fine, `$\frac{a}{b}$`
does not.
