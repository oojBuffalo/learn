---
id: rendering-and-the-dom
title: "Rendering and the DOM"
summary: Why a gallery moves under your thumb between the reach and the tap, and how staged work from two inputs decides what a page costs.
objectives:
  - Read rendering as staged work from two inputs rather than one act of drawing
  - Place a symptom at the stage that produced it — parsing, the cascade, layout, paint or compositing
  - Tell which page problems a reserved dimension, a native control or a batched update actually removes
estimatedMinutes: 12
difficulty: beginner
prerequisites: [request-response-lifecycle, clients-servers-and-resources]
tags: [browser-platform]
---

## The gallery that moved under your thumb

A reader opens a photo gallery on a phone, reaches for the control that opens
the next picture, and taps. What opens is the picture that had been sitting
under their thumb a moment earlier. In the gap between the reach and the tap,
two images finished arriving and pushed everything below them down the page.

Nothing errored. Every response was correct and the markup was correct too.
What moved was the geometry, and the geometry was never something the page
declared: the browser worked it out late, once it knew how large those images
were.

## The DOM is an API-facing tree, not the screen

The browser parses HTML into a document model, applies CSS, calculates
geometry, paints visual output, and exposes accessible semantics. JavaScript can
mutate that model, causing some of this work to repeat.

The trap in that sentence is the word model. The DOM is an API-facing tree —
the thing your code addresses — and it is not the screen. Rendering is what
turns network-delivered resources and application state into pixels and into
accessibility information, and those two outputs can disagree while the tree
itself stays perfectly valid. So “I set the element” and “the reader can see it”
are two different claims, and only the first is about the tree.

## From bytes to pixels, in dependency order

Two inputs arrive separately and meet once.

```text
HTML bytes                CSS bytes
   |   parsing               |   the cascade
   v                         v
DOM                       style rules
   |                         |
   +-----------+-------------+
=== join: DOM and style rules converge ===
   |
   v
render-relevant structure
   |   sizes and positions
   v
layout
   |   drawing operations, then layers
   v
paint and composite
```

Read straight down. Parsing creates nodes and relationships; the cascade
resolves which styles apply; together they give the render-relevant structure.
Layout derives sizes and positions from it, paint produces drawing operations,
and compositing combines layers.

That is a dependency order, not a schedule. Browsers may stream and overlap
these stages, and the HTML standard specifies document behavior and offers
default rendering guidance while allowing user agents implementation freedom.
Native elements enter here too: they contribute default semantics and keyboard
behavior that the tree gets without anyone writing it.

::activity{id="rendering-and-the-dom-mat1"}

## What a page invites when it guesses

Mutation can invalidate style, layout, or paint, so anything that changes the
tree can send work back through the stages. Four failures follow, and each one
names its own stage.

Cumulative layout shifts occur when dimensions are unknown until late-loading
resources arrive — the gallery, exactly. Invalid assumptions about element
timing cause null references or flashes, because browsers may stream and
overlap these stages, so the tree a script finds is the tree that exists at that
moment. Content can be visually hidden yet exposed to assistive technology, or
the reverse, because pixels and accessible semantics are two outputs of one
pipeline. And layout thrashing alternates DOM writes and measurements: reading
layout immediately after writing styles may force the browser to synchronize
work.

::activity{id="rendering-and-the-dom-ms1"}

## One gallery, rendered without shifting

Rebuild it and the fixes land on different stages. The gallery reserves width
and height before images load, so layout has the geometry it needs before the
bytes arrive rather than after. It uses buttons for controls, so keyboard
operation comes from the element rather than from code. It batches DOM updates,
and it measures layout after the batch instead of between the writes.

The result is a page that avoids shifting content, with controls that both
pointer and keyboard users can operate. Notice what the rebuild did not do: make
rendering faster in general. It moved three decisions earlier —
declare the size, choose the element, group the writes — and each one removed a
particular repeat of work.

::activity{id="rendering-and-the-dom-mc1"}

## What a custom control and a big tree cost

Two of those decisions have prices worth stating.

Native controls are less customizable but bring robust behavior. Replacing one
buys the design and gives up defaults you then owe the reader yourself.

Large DOMs simplify “render everything” logic while increasing traversal, style,
memory, and accessibility costs.

The same shape governs where the markup comes from. Server-rendered HTML can
expose meaningful content early; client rendering can support rich local
interaction but requires code and data before completion.

## The cheapest thing to check when a page moves

Start with the checks that cost nothing and eliminate the most.

Ask whether the element that moved had declared dimensions. If it did not, and
something late-loading arrived above it, that is the whole answer, and the
repair is a reserved width and height.

Ask next whether code measured anything between writes. Layout thrashing is
visible in the shape of a loop.

Then ask whether the element existed when the script ran. Null references and
flashes are assumptions about element timing, and they are cheaper to spot in
the source than in a recording.

Only after those three is the size of the tree worth asking about, because that
answer is real work and the first three are free. The gallery that moved under a
thumb never needed the fourth question.

## Sources

- WHATWG, [HTML Living Standard: Rendering](https://html.spec.whatwg.org/multipage/rendering.html) (accessed 2026-07-18) — the standard specifies document behavior and offers default rendering guidance while allowing user agents implementation freedom
