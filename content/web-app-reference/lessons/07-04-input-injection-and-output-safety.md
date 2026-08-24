---
id: input-injection-and-output-safety
title: "Input, Injection, and Output Safety"
summary: Why a value that renders harmlessly for weeks executes the first time somebody writes it into a page a different way, and where to look first when data starts behaving like syntax.
objectives:
  - Locate injection at the interpreter boundary rather than in the input itself
  - Keep validation and safe construction as two jobs that do not substitute for each other
  - Order the places a value can turn into syntax by how quickly each can be checked
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [anatomy-of-a-web-app, api-design]
tags: [security]
---

## The value that was safe on the public page

A customer sets a display name containing markup. On the public profile it
renders as text, exactly as intended, and nothing happens for weeks.

Then a support agent opens a moderation queue, where the same value is written
into the page a different way, and it runs. Nothing about the value changed.
Stored payloads execute later in an admin interface is the failure mode, and
the public page was never wrong. It was right about its own output context and
had no opinion about anybody else's.

## Data, until a grammar reads it as syntax

All external input is untrusted data. Injection occurs when data is interpreted
as commands or syntax by a downstream language.

That definition does two things. It puts the danger somewhere specific — not in
the input, which is inert, but at the moment another language reads it. And it
unifies a list usually taught as separate topics: SQL injection, cross-site
scripting, shell injection, template injection, path traversal, and unsafe
deserialization, one problem arriving at six different interpreters, with no
deny list needed to explain it.

Safety therefore requires validation for meaning and context-appropriate
construction or encoding at every interpreter boundary. Input crosses HTTP
parsers, application types, database queries, templates, browsers, file paths,
command runners, and third-party APIs, and each boundary has its own grammar.

## Parse, validate, preserve, construct

```text
parse shape
  -> validate allowed meaning
  -> preserve typed data
  -> use a parameterized API, or encode
     for the exact output context
```

Read it downward, and stop at the third step. Preserving typed data keeps the
first two from being undone: a value that stays an enum or a bounded date
cannot be concatenated into somebody else's grammar by accident, because it is
not a string yet.

Validation and encoding are complementary. Validation asks whether data is
allowed; safe construction prevents it from becoming syntax. Neither
substitutes for the other, and the opening scene is what it looks like when
only the second is done, and only once.

The mechanisms sit at the boundaries. Schema validation bounds type, length,
range, cardinality, and permitted values. Parameterized queries separate SQL
structure from values. DOM text APIs preserve text rather than parsing markup.
HTML sanitization is required when a product intentionally accepts a
constrained markup language. Generated filenames and resolved-path checks
isolate uploads.

::activity{id="input-injection-and-output-safety-fb1"}

## One report filter, five boundaries

A report filter accepts a fixed enum and bounded date range. The database query
uses placeholders. The report title is inserted as text, not HTML. An export
filename is generated from an internal ID rather than the title. And response
headers encode it according to their own syntax.

Five decisions, and this lesson reads each as one boundary handled. The enum
and the date range are schema validation where the request is parsed. The
placeholders are a parameterized query at the database. Inserting the title as
text is a DOM text API at the browser. The generated filename is half of a
mechanism; resolved-path checks are the other half, and this example never
resolves a supplied path. The header encoding is the model's last step applied
to a grammar people forget is a grammar.

::activity{id="input-injection-and-output-safety-mc1"}

## Allow lists, unknown fields, rich text, and shell strings

Allow lists are narrow and predictable; free-form content needs specialized
parsers and sanitizers. The first is cheap because it is small, and the second
expensive for the same reason.

Rejecting unknown fields catches client errors but requires compatibility
planning. Rich text creates lasting security maintenance — not a sanitizer you
install once, a commitment that stays open.

Executing operating-system commands is sometimes necessary but should use
argument arrays and fixed executables rather than shell strings. An argument
array never becomes shell grammar, the same move the parameterized query makes
at the database.

## The cheapest place to look when a value turns into syntax

This lesson orders these by how fast each can be answered, not by how bad each
would be.

Start at the destination rather than the source. Ask which grammar the value is
written into, because escaping for HTML text is reused in attributes or
JavaScript, and that question is settled by reading one line of output code.

Then ask whether the server repeated the check. Data is validated in the UI but
not at the server, and the server's own code is a short read.

Then ask what got concatenated. A safe value becomes unsafe after concatenation
into another grammar, so look for the places a typed value was turned back into
a string.

The last two cost more. Stored payloads execute later in an admin interface
means searching data rather than code. Error messages echo secrets or
attacker-controlled markup means reading a path that only runs when something
else has already gone wrong, which is why nobody reads it.

The opening display name sits in that last group, which is the honest finding.
Nothing about it was checkable on the public page. It became a question only at
a second output context, written by different people, weeks later.

::activity{id="input-injection-and-output-safety-ms1"}

## Sources

- OWASP, [Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html) (accessed 2026-07-18) — parameterized queries separating SQL structure from values
