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
work — which it may well have committed after the client walked away. Whether
the question is answerable at all was decided long before this afternoon, by
somebody choosing whether the operation would be queryable or idempotent.

## Failure accumulates along a path

A request is not an event at a server. It is a message that passes through
client code, browser policy, naming, connections, intermediaries, server
middleware, application logic and dependencies before a response travels back,
and latency and failure accumulate across that entire path.

So "the server is slow" is rarely a finding. It is a summary of a path, and the
useful question is which segment of it spent the time. Making the lifecycle
explicit is what turns vague debugging into boundary checks — and the same
explicitness tells you where authentication, caching, validation, tracing and
timeout budgets belong, because each of them has an owner somewhere along the
path.

HTTP itself is modest by comparison: a request carries a method and a target, a
response carries a status and optional content. Everything above is arrangement
around those two messages.

::activity{id="request-response-lifecycle-mc1"}

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

Read down for the request and back up for the response: four participants, six
messages, the same three hops travelled twice. Every one of the six is a place
the exchange can stop, and the return half is no safer than the outward one.

::activity{id="request-response-lifecycle-ord1"}

## What each hop is allowed to do

The client serializes input, attaches headers, and applies origin and credential
rules. DNS and connection establishment may then be reused from caches or pools,
so the earliest work in the path is often work that does not happen at all.

An edge may terminate TLS, reject traffic, serve a cached representation, or
forward the request. Two of those — rejecting and serving from cache — mean the
backend never sees the message, which is worth knowing before you go hunting for
it in application logs.

The backend parses the message, establishes request context, authenticates,
authorizes, validates, invokes application behaviour, and maps the result to a
response, in that order. The order is the point: rejection gets cheaper the
earlier it happens.

The browser is not finished when bytes arrive. It applies status, cache, cookie,
redirect and content rules before frontend code updates the UI, which is why a
response can be received and still never reach the screen.

::activity{id="request-response-lifecycle-mat1"}

## Spending a two-second budget

Give the checkout a two-second deadline. That budget is divided, not repeated: a
portion for the connection, a portion for the edge, a portion for the
application, a portion for the database, and a portion for transferring the
response. Deadlines are chosen end to end, not independently at every hop:
timeouts set per hop, each generous on its own terms, are how a path ends up
with no budget at all.

The rule that falls out is uncomfortably concrete. The application should not
begin a five-second payment call after 1.8 seconds have already gone. There is
nothing left to pay for it, and starting it anyway converts a slow request into
the unknown outcome this lesson opened with.

Retries deserve the same discipline. Decide in advance which operations are safe
to retry and which require an idempotency key, because a retry storm is what
many callers each behaving reasonably looks like from the far end.

::activity{id="request-response-lifecycle-ms1"}

## What a status and a silence each rule out

The value of a symptom is what it removes from the list.

A `200` eliminates transport and routing trouble and remarkably little else: a
`200` response can still contain the wrong business result. A response that is
slow while the application's own timing looks fast eliminates application logic
and points before it, at queueing ahead of the code you instrumented. Lost trace
context eliminates nothing at all, which is precisely the damage — it removes
your ability to attribute time to any segment.

Then the silence. A timeout is an unknown outcome unless the operation is
queryable or idempotent, so the customer's question is answerable only if
somebody decided in advance that it should be. A retry carrying the same
idempotency key is that decision made concrete: it lets the server return the
original outcome rather than doing the work twice.

::activity{id="request-response-lifecycle-sa1"}

## Sources

- IETF, [RFC 9110: HTTP message semantics](https://www.rfc-editor.org/rfc/rfc9110.html#name-messages) (accessed 2026-07-18) — a request carries a method and target, a response a status and optional content
