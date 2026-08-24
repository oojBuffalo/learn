---
id: request-response-lifecycle
title: "Request-Response Lifecycle"
summary: Why a checkout that times out leaves you with no answer at all, and how to find the segment of the path that spent the time.
objectives:
  - Trace one request through client, edge, backend and data store as a single path
  - Place authentication, caching, validation, tracing and timeout budgets at the hop that owns them
  - Read a status, a silence or a slow response for what each one eliminates
estimatedMinutes: 12
difficulty: beginner
prerequisites: [anatomy-of-a-web-app]
tags: [web-foundations]
---

## The checkout that timed out

A customer submits a checkout. Two seconds later the request gives up and the
browser shows a failure. Support asks the only question that matters: did the
order go through?

Nobody in the room can answer it. A timeout is not a refusal. It records that
the client stopped waiting, and says nothing about what the server did with the
work — which it may well have committed after the client walked away.

## Failure accumulates along a path

A request is not an event at a server. It is a message that passes through
client code, browser policy, naming, connections, intermediaries, server
middleware, application logic and dependencies before a response travels back,
and latency and failure accumulate across that entire path.

So “the server is slow” is rarely a finding. It is a summary of a path, and the
useful question is which segment spent the time. Making the lifecycle explicit
turns vague debugging into boundary checks — and tells you where authentication,
caching, validation, tracing and timeout budgets belong, because each has an
owner somewhere along the path.

HTTP itself is modest by comparison: a request carries a method and a target, a
response carries a status and optional content. Everything above is arrangement
around those two messages.

## Four participants, six messages

```text
Frontend
   |   request + credentials + trace context
   v
Edge
   |   routed request
   v
Backend
   |   query or transaction
   v
Data store
=== turn: the response retraces the same hops ===
   |   result
   v
Backend
   |   status + headers + content
   v
Edge
   |   response
   v
Frontend
```

Read straight down. Three hops out to the data store, then the same three hops
retraced in reverse — four participants, six messages, any of which can be
where it stops.

::activity{id="request-response-lifecycle-ord1"}

## What each hop is allowed to do

The client serializes input, attaches headers, and applies origin and credential
rules. DNS and connection establishment can then be reused from caches or pools,
so the earliest work in the path can be work that does not happen at all.

An edge may terminate TLS, reject traffic, serve a cached representation, or
forward the request. Two of those — rejecting and serving from cache — mean the
backend never sees the message at all.

The backend parses the message, establishes request context, authenticates,
authorizes, validates, invokes application behaviour, and maps the result to a
response, in that order. The order is the point: rejection gets cheaper the
earlier it happens.

The browser is not finished when bytes arrive. It applies status, cache, cookie,
redirect and content rules before frontend code updates the UI, which is why a
response can be received and still never reach the screen.

::activity{id="request-response-lifecycle-mat1"}

## What a status and a silence each rule out

The value of a symptom is what it removes from the list.

A `200` establishes that the exchange completed and remarkably little else: a
`200` response can still contain the wrong business result. A response that is
slow while the application's own timing looks fast eliminates application logic
and points before it, at queueing ahead of the code you instrumented. Lost trace
context eliminates nothing at all, which is precisely the damage: it removes
your ability to attribute time to any segment.

A timeout is emptier still. It is an unknown outcome unless the operation is
queryable or idempotent, which makes it less a finding than a question about
what was decided earlier.

::activity{id="request-response-lifecycle-sa1"}

## The decisions that make a timeout answerable

Two of those decisions have to be taken before the request that needs them, and
each has a price.

The first is the budget. Give the checkout a two-second deadline and that budget
is divided, not repeated: a portion for the connection, the edge, the
application, the database, and transferring the response. Deadlines are chosen
end to end, not independently at every hop, and the cost is that no hop may be
generous on its own terms: per-hop timeouts, each reasonable alone, leave a path
with no budget at all. What it buys is a concrete refusal: the application
should not begin a five-second payment call after 1.8 seconds have gone.

The second is retry policy. Decide in advance which operations are safe to retry
and which require an idempotency key. That costs machinery on the server, and
buys a retry that carries the same key and gets the original outcome back
instead of doing the work twice. Skip the decision and the default is a blanket
retry — which is how retry storms start: many callers each behaving reasonably,
seen from the far end.

Both are made long before anyone times out. Which is why the question support
asked — did the order go through? — was settled before the checkout was
submitted, by whoever chose whether that operation would be queryable or
idempotent, or chose not to think about it.

::activity{id="request-response-lifecycle-ms1"}

## Sources

- IETF, [RFC 9110: HTTP message semantics](https://www.rfc-editor.org/rfc/rfc9110.html#name-messages) (accessed 2026-07-18) — a request carries a method and target, a response a status and optional content
