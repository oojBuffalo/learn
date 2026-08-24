---
id: accessibility
title: "Accessibility"
summary: Why a form can reject a submission and leave the person who sent it with no way to know, and what the browser already says before anyone writes a widget.
objectives:
  - Ask the four questions that decide whether a task is usable
  - Say what a native control supplies that a custom one has to supply itself
  - Locate a named accessibility failure in an interface in front of you
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [rendering-and-the-dom, javascript-runtime]
tags: [frontend]
---

## The rejection nobody was told about

Someone submits a form using the keyboard. The server rejects it. A field
further up the page picks up a red outline, focus stays on the submit control,
and nothing is announced. From where the reader is sitting, the button did
nothing at all.

Every part of that interface worked. The submission went, the response came
back, the error was displayed. It was displayed to one sense, in one place, and
the reader was neither looking at that place nor able to see that colour.

## Four questions, asked of every task

Accessibility means people with varied vision, hearing, mobility, cognition,
devices, and input methods can perceive and operate the application. It is a
property of the complete interaction, not a final audit step.

Ask four questions for every task. Can the user perceive the information? Can
they operate it with available input? Can they understand the state and
consequences? Can assistive technologies determine names, roles, values, and
updates?

Four questions rather than one verdict, and the difference does work: an
interface usually fails some of them and not others, and which ones it fails is
what tells you where to look. WCAG 2.2 organizes testable criteria under
perceivable, operable, understandable, and robust principles — testable being
the property that makes accessibility something you check rather than assert.

::activity{id="accessibility-ms1"}

## What the browser already says on your behalf

Semantic HTML communicates structure and control roles. That one sentence is
most of the fourth question answered before you write anything, and it is
exactly what custom interface behavior is at risk of discarding.

The rest builds on it. Accessible names come from visible labels or defined
naming relationships. Keyboard order follows DOM order unless deliberately
managed — the document is the sequence, whatever the layout says. Focus
identifies the active control, which makes moving it a strong act: it changes
where the reader is. Live regions can announce asynchronous status without
stealing focus, which is the weaker act, for news with no claim on attention.
And text alternatives convey the purpose of non-text content — purpose, not
description.

::activity{id="accessibility-mc1"}

## Where interfaces lock people out

The named failures are worth reading as a list, because most of them are
decisions rather than accidents: clickable non-controls, missing labels, low
contrast, focus traps, hidden focus indicators, state conveyed only by color,
inaccessible drag-only actions, and route changes that leave focus in removed
content.

The opening scene holds one of them outright — state conveyed only by color —
and misses the move the next section makes, which is to send focus where the
news is.

Underneath the list sits a failure about the list itself. Automated checks catch
only a subset, so task-based manual testing remains necessary. A clean automated
run is evidence about the subset it covers and silent about everything else.

## One submission, by keyboard, at 200% zoom

After a user submits a form, focus moves to an error summary linked to invalid
fields. Each field retains its label and input. When submission succeeds, a
status message is announced and focus moves to the new page heading. The same
flow works by keyboard alone at 200% zoom.

Read it against the opening scene, clause by clause. Focus moves to the error
summary, so the rejection reaches the reader wherever they were. The summary is
linked to the invalid fields, so perceiving the problem and reaching it become
one action. Each field retains its label and input, so correction is possible
without retyping. Success is announced rather than shown, and focus moves to the
new heading because the task itself moved. The last sentence is the test: one
path, exercised by keyboard alone and at 200% zoom at the same time.

::activity{id="accessibility-mc2"}

## Native controls, density, and motion

Native controls provide behavior and semantics at low cost. Visual density must
coexist with zoom and reflow, which is the constraint the 200% figure stands in
for. Animation can communicate change while respecting reduced-motion
preferences — two clauses describing one design rather than a concession bolted
onto it.

## What a custom widget obliges you to

So: the decision, for the moment a native control will not do what a product
needs.

Custom widgets may meet specialized needs, and they inherit keyboard, focus,
state, and announcement obligations. Four obligations, every one of which the
native control was meeting silently, and none of which appear in the visual
design that made the custom widget look necessary.

That is the price, and it is worth naming because it is deferred. The visible
part is what gets built first. Keyboard order, a focus model, state that
assistive technologies can determine, and announcements that fire at the right
moment are the rest of it, and they are the part that gets discovered late.

Accessible foundations improve reach, robustness, testability, and usability,
and they prevent custom interface behavior from discarding semantics the browser
already provides. Building the widget yourself is a decision to buy all of that
back at full price.

## Sources

- W3C, [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/) (accessed 2026-07-18) — WCAG 2.2 organizes testable criteria under perceivable, operable, understandable, and robust principles
