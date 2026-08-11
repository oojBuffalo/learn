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
- No `$math$`; there is no KaTeX. Use inline code or words.
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
