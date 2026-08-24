---
id: frontend-performance
title: "Frontend Performance"
summary: Why a page can be fast in every test you run and slow for the people using it, and how to find which stage of the path is holding a journey up.
objectives:
  - Read the critical path as seven stages rather than as a bundle size
  - Say what a lab measurement and an average each conceal
  - Decide what to check first when a page feels slow
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [rendering-and-the-dom, javascript-runtime]
tags: [frontend]
---

## Fast in every test we run, slow for the people who use it

The issue page loads in well under a second on the machines the team tests on.
The dashboard says the average has improved two quarters running. The support
queue says the page is slow, and it has said so throughout.

Both sets of numbers are correct: honest measurements of something, and not of
the experience being complained about.

## The critical path is longer than your code

Frontend performance is the user's experience of loading, seeing, and operating
an interface. It includes network latency, resource priority, parsing,
JavaScript execution, rendering stability, and interaction responsiveness.

```text
discover → connect → transfer → parse → execute → render → respond
```

Seven stages, and the reason to name all of them is that performance work should
improve a measured user journey, not merely reduce a bundle or optimize an
isolated function. The critical path often crosses server, network, and browser
boundaries, and the stage holding a journey up need not be one your code is on
at all.

Work not on the current critical path may still consume bandwidth, CPU, memory,
and battery that delay important work. Off the path is not free. It is only not
being waited on.

::activity{id="frontend-performance-fb1"}

## What each stage responds to

Resource hints and document order affect discovery — the earliest stage, and the
one where a mistake costs most, because everything after it waits. Compression
reduces transferred bytes. HTTP caching avoids repeat work altogether.

Then the code. Code splitting defers code by route or capability. Server
rendering can expose content before application hydration, moving render earlier
without moving execute. Image dimensions prevent layout shifts — a stability
problem rather than a speed one. And long JavaScript tasks block input
processing, which is the last stage failing while every earlier one succeeded.

The frontend is where backend latency, caching, resource size, and device
capability become perceptible. Browser rendering and scheduling determine when
content is usable, which is a different question from when it arrived.

::activity{id="frontend-performance-mc1"}

## Why the numbers you have can be wrong

Lab tests on fast machines hide real-device problems. Averages hide slow cohorts
and long tails. Those two are the opening scene, and they fail in the same
direction: each produces a number that is true and unrepresentative.

Three more are about the work rather than the measurement. Third-party scripts
block critical work. Hydration can duplicate server work or make controls appear
before they function — a page that looks finished and is not. And lazy loading
above-the-fold content delays the thing the user came to see, which is the
critical path being optimised in the wrong direction.

::activity{id="frontend-performance-mc2"}

## Measuring one issue page

For an issue page, measure navigation start to meaningful heading, main content,
and first responsive interaction. Inline only critical shell CSS, reserve image
space, stream or render primary content early, defer the editor until requested,
and correlate slow browser traces with backend spans.

Three measurements, because they are three different questions: when did the
reader learn where they are, when could they read the thing they came for, and
when did the page start answering them. A single number cannot separate a page
that renders late from one that renders early and ignores input.

The interventions line up against the path. Reserving image space acts on
rendering stability. Streaming or rendering primary content early moves content
ahead of hydration. Deferring the editor is code splitting by capability. And
correlating browser traces with backend spans is the admission that the critical
path often crosses server, network, and browser boundaries, so a frontend trace
alone tells you half of where the time went.

## Less JavaScript, more requests

Shipping less JavaScript improves many devices, but excessive splitting adds
requests and coordination. Prefetching helps likely navigation while wasting
resources on wrong predictions. Client caching accelerates revisits but
complicates freshness. Skeletons communicate structure, and preserving stale
content may be more useful than replacing it with loading chrome.

## Where to look first when an issue page is slow

The cheapest check is not a measurement at all. It is a question: which stage is
this journey waiting on?

Ask it of the thing you were about to optimise. If you cannot answer, the
optimisation is a guess — and the critical path often crosses server, network,
and browser boundaries, so the guess has more places to be wrong than your code
has stages.

Second cheapest: look at the slowest readers rather than the middle ones.
Averages hide slow cohorts and long tails, and a fix aimed at the average is
aimed at people who were not complaining.

Third: account for what is on the page that you did not write. Third-party
scripts block critical work, and they do it inside your numbers rather than
beside them.

Fourth, and it is a minute's work: check whether anything above the fold is
being lazy loaded. Lazy loading above-the-fold content delays the thing the user
came to see — a performance failure produced by an optimisation.

## Sources

- WHATWG, [HTML event loops](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops) (accessed 2026-07-18) — long JavaScript tasks block input processing
