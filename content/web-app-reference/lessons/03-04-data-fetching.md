---
id: data-fetching
title: "Data Fetching"
summary: Why an empty list is not an answer, and what a frontend copy of server data has to record besides its value.
objectives:
  - Model remote state as a set of outcomes rather than as a promise that resolves
  - Say what a mutation owes that a query does not
  - Choose what to show while a copy you already hold is being rechecked
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [rendering-and-the-dom, javascript-runtime]
tags: [frontend]
---

## The empty list that meant nothing of the kind

A reader with fourteen projects opens their project list and is told they have
none. A moment later the projects appear. Nothing was lost; the screen answered
a question it had not been asked.

An empty array can mean “loaded and empty” or “not loaded.” The screen held one
of those and reported the other, and it had no way to tell them apart, because
its model of remote data had only two positions in it.

## Remote state has two clocks

Frontend data fetching coordinates remote state with UI state. A useful design
represents idle, pending, success, empty, stale, partial, cancelled, and failed
outcomes rather than treating a promise as the data.

Eight outcomes reads like a lot until you notice where they come from. Remote
state has two clocks: the server changes independently, and the frontend's copy
ages. A cache entry therefore needs identity, value, freshness, and
in-flight/error state — four fields, because a value on its own cannot say which
copy it is, how old it is, or whether anyone is currently checking.

Handling that explicitly is what prevents race conditions, misleading spinners,
accidental duplicate effects, and interfaces that collapse every failure into
the same message. Fetching joins browser networking, API contracts, frontend
state, cache policy, identity, and observability, and the Fetch Standard defines
the browser-side request and response model.

## Queries read, mutations do

Queries read representations and can often be deduplicated, cached, revalidated,
or retried. Each is available because a read leaves nothing behind: doing it
twice costs time and nothing else.

Mutations request effects, and none of that transfers. They need explicit
success semantics, idempotency, invalidation, and optimistic rollback — four
obligations that exist because a second delivery is a second effect, and because
anything else on the screen that summarized the old value is now wrong.

Two mechanisms cut across both. Abort signals end local interest. Request
identifiers or cache keys prevent old responses from overwriting newer state.

::activity{id="data-fetching-ms1"}

## Spinners that lie, keys that leak, retries that multiply

An empty array can mean “loaded and empty” or “not loaded.” That is the opening
scene and the clearest case of the general fault: an outcome the model cannot
express becomes one the interface reports wrongly.

Cache keys that omit identity or filters leak incorrect data — the same
ambiguity moved into the key, where it is worse: the interface now shows the
wrong rows rather than none.

Automatic retries can duplicate mutations or prolong overload. A timeout is not
a failure; it is an unknown outcome, and a retry is a decision to treat it as
one.

A loading overlay can erase usable stale content, trading something the reader
could have read for a sign that something is happening. And sequential awaits
create latency even when requests are independent.

::activity{id="data-fetching-mc1"}

## A project page that admits what it knows

A project page begins with cached project data marked stale, starts one
revalidation, and renders an unobtrusive refresh indicator. A save updates the
local title optimistically, sends an idempotency key, rolls back on validation
failure, and invalidates project-list summaries after confirmation.

The first sentence is three admissions in a row: here is a value, here is its
freshness, here is that someone is checking. One revalidation rather than one
per reader of that entry — queries can often be deduplicated, and an entry with
an identity is what makes that possible.

The second sentence is the mutation paying its four debts in order. The
optimistic write is the responsiveness; the idempotency key is what makes a
repeated delivery harmless; the rollback is the reversal that optimism assumed
would be clear; and the invalidation is the admission that a title lives in more
than one place.

::activity{id="data-fetching-mc2"}

## Where to fetch, and how to hear about change

Fetch at route boundaries to avoid nested waterfalls, or near components to
preserve ownership; many systems combine both with a shared query cache. The two
trade the same thing in opposite directions: a route boundary knows what the
whole screen needs before any of it renders; a component knows only what it
needs.

Prefetching trades bandwidth for latency. Optimistic updates improve
responsiveness when rejection is rare and reversal is clear. Polling is simple;
server push is timely but operationally stateful.

## The verdict on the empty list

Back to the reader with fourteen projects and a screen saying none.

Was it a fetching bug? No: the request went, and the projects arrived a moment
later as they should have. Was it a caching bug? No — nothing was
cached. There was no entry carrying an identity, a value, a freshness and an
in-flight state, only a variable holding whatever the promise had produced so
far.

It was an outcome the model could not express. An empty array can mean “loaded
and empty” or “not loaded”, and a design with room for a value and an error has
to choose one of those meanings in advance and be wrong every time the other one
is true. The repair is not a better spinner. It is the fourth field: something
had to be able to say “still finding out”, and nothing could.

## Sources

- WHATWG, [Fetch Standard](https://fetch.spec.whatwg.org/) (accessed 2026-07-18) — the Fetch Standard defines the browser-side request and response model that frontend fetching builds on
