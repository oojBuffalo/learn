---
id: javascript-runtime
title: "JavaScript Runtime"
summary: Why a search box can show results for a query you have already replaced, and how to tell what the language owes you from what the browser supplies.
objectives:
  - Separate what the language defines from what the host environment supplies
  - Trace one turn of the event loop and say what each step lets through
  - Diagnose a stalled or stale interface from the shape of the code that produced it
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [request-response-lifecycle, clients-servers-and-resources]
tags: [browser-platform]
---

## The search box that answered in the wrong order

Someone types four letters into a search box and watches results appear for the
first three. They add a letter and the older list comes back. Nothing here is
wrong in the ordinary sense: every request was sent, every response arrived,
every handler ran and wrote what it was given.

What went wrong is that the responses did not arrive in the order the keystrokes
did, and each handler wrote its results as though it were the only one. A slow
answer to an old question overwrote a fast answer to a new one.

## The language brings jobs; the browser brings the loop

JavaScript executes inside a host environment, and the division of labor is
sharp. The language defines values, functions, execution contexts, modules,
promises, and jobs. The browser supplies DOM, timers, networking, events, and an
event loop that schedules host work.

Keeping the two apart is what makes asynchronous code, responsiveness, workers
and server-side JavaScript easier to reason about. The runtime connects frontend
logic to browser capabilities: it translates user and network events into
callbacks that may update state and the DOM. The search box's handlers are
exactly that — host events turned into callbacks, each carrying whatever the
language captured for it.

## One turn of the loop

```text
take a task → run JavaScript to completion → drain eligible microtasks
→ allow rendering/host work → take another task
```

Each arrow is a statement about what cannot interrupt what. ECMAScript jobs run
only when no other execution context is active, and a started job runs to
completion.

The call stack represents active execution contexts. Promises schedule reactions
as jobs; browser tasks deliver events such as timers and network callbacks.
Synchronous code blocks other JavaScript in the same agent — so the
single-threaded UI is not a performance footnote here, it is the scheduling rule
the rest of the model rests on.

::activity{id="javascript-runtime-ord1"}

## What blocks, what starves, and what goes stale

Three failures come straight off that loop.

Long tasks delay input and rendering, because rendering and host work get their
turn only after the running JavaScript finishes. A loop that continually
enqueues microtasks can starve other work: eligible jobs drain before the loop
moves on, and a queue that refills itself never lets it. Stale closures use old
state — closures retain lexical bindings, which is a feature until a callback
runs against the values it captured rather than the current ones.

Two more sit alongside. Unhandled rejections hide asynchronous failure, so a
broken path can look like a quiet one. And shared mutable state creates ordering
bugs even in a single-threaded UI, because callbacks interleave over time. That
last one is the search box, named precisely.

::activity{id="javascript-runtime-sa1"}

## The search box, made to answer in order

The repair is small, and it is entirely about identity.

The search box stores a monotonically increasing request number. Each input
starts a fetch and captures its number. When a response arrives, the handler
updates results only if its number is still current. This prevents an older,
slower response from replacing newer results.

Read that against the loop. Every handler still runs to completion, still
interleaves with the others, still writes to the same shared state. Nothing
about the scheduling changed. What changed is that each callback now carries
enough context to know whether it is still relevant — and the closure that was
the bug is now the mechanism, capturing the number deliberately so the handler
can compare it before writing.

## What promises, `await` and workers each cost

Promises make dependency order explicit but do not cancel underlying work by
themselves. The search box is the proof: nothing stopped the older fetch, so its
answer had to be discarded on arrival instead.

`async`/`await` improves sequential readability while accidentally serializing
independent operations if used carelessly. The readability is real; so is the
bill.

Workers provide separate agents with message-based coordination and constrained
shared memory. They preserve UI responsiveness for CPU-heavy tasks but add
serialization, lifecycle, and coordination overhead. Immutable data can simplify
state reasoning at an allocation cost.

::activity{id="javascript-runtime-mc1"}

## The verdict on the search box

So was the search box a network fault, a threading race, or something else?

Not a network fault. Every request was sent and every response arrived; they
arrived in an order nobody had promised, which is a different complaint. Not a
threading race either — this is one agent, and every handler ran to completion
without interruption.

It was shared mutable state, mutated by callbacks that interleaved over time.
Shared mutable state creates ordering bugs even in a single-threaded UI, and
that is precisely what the loop's guarantees do not buy you.
Run-to-completion protects one job from interruption. It says nothing about
which job runs first, or last, or whether the one writing now still speaks for
the state of the screen.

## Sources

- Ecma International, [ECMAScript Language Specification: Jobs](https://tc39.es/ecma262/#sec-jobs) (accessed 2026-07-18) — jobs run only when no other execution context is active, and a started job runs to completion
