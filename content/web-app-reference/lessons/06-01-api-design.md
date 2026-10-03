---
id: api-design
title: "API Design"
summary: Why a partner team ended up branching on a string buried in the response body, and what a contract has to make predictable before anyone can safely build against it.
objectives:
  - Read an API as a contract that lets a client and a provider change independently
  - Design outward from caller intent rather than from tables or controller shapes
  - Weigh coarse against fine operations, additive against versioned change, and strict against tolerant input
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [backend-request-lifecycle, transactions-and-consistency]
tags: [apis-and-integration]
---

## The response that always said 200

A partner team builds against a new order API. Every call comes back `200`. Some
of those calls created an order and some did not, and the only place the
difference is written down is a string buried in the body, so the client code has
grown a branch on that string at every call site.

Nothing is broken, exactly. The service does the right thing inside and never
says so outside, and returning `200` for every outcome
weakens generic tooling — anything reading the status rather than the prose sees
one undifferentiated success.

## A contract is what lets two sides move without asking

An API is a contract for requesting behavior or information across a boundary.
The payoff sits in the second half: contracts let clients and providers change
independently. Without one, every change is a negotiation:
nobody can say which parts of today's behavior somebody already relies on.

Contracts also turn undocumented assumptions into reviewable decisions that can
be tested and observed. An assumption in one engineer's head cannot be argued
with.

Good design makes six things predictable: vocabulary, identity, validation,
errors, evolution, and operational limits. Read it as a checklist for a design
review: the opening scene left one entry blank.

APIs connect frontends, backends, services, partners, and automation. An HTTP
API uses standardized method and status semantics but still defines
application-specific resources, commands, representations, and policies. The
standard supplies the envelope; the design owns what goes inside.

## Start at intent, not at the table

Design from use cases outward: caller intent, then the authorized operation,
then stable domain vocabulary, then transport representation. Do not begin with
database tables or framework controller shapes. Both let an internal accident
become a public promise.

The mechanisms follow that order. Requests identify an operation, carry typed
input, and establish credentials and idempotency where needed. Responses
distinguish success, client correction, conflict, rate limiting, dependency
failure, and unknown server failure: six named outcomes, not two. Pagination
bounds collections. Versioning and compatibility rules govern evolution.
Machine-readable descriptions can support validation, documentation, and client
generation.

Four more failure modes sit alongside the opening scene's. Offset
pagination becomes unstable under concurrent inserts. Unbounded filters or
expansions create denial-of-service paths. Leaking internal exception text
exposes implementation. And changing enum meaning without versioning breaks
clients even if the wire type is still a string.

::activity{id="api-design-mc1"}

## POST /orders, and the three ways it ends

`POST /orders` accepts a documented command and an idempotency key. Success
returns `201`, a canonical order location, and a representation.

Read the success case first; all three parts work. `201` tells the caller
that something now exists rather than leaving it to guess, the canonical location
says where it lives, and the representation says what it became.

Then the two ways it does not succeed, which are not one failure in two labels.
Invalid items produce field errors: the caller can edit the request and try
again. Insufficient inventory produces a conflict: editing the request will
not help, because what refused was the world, not the message. Client
correction and conflict are two of the six outcome classes, and collapsing them
is what the opening API did.

Repeated delivery of the same idempotency key returns the original result,
covering the case that is not an outcome at all — a caller who never learned
which of the three it got.

::activity{id="api-design-ms1"}

## Coarse or fine, additive or versioned, strict or tolerant

Three decisions, each with a bill attached.

Coarse operations reduce round trips but couple more data and behavior.
Fine-grained resources improve composition but create chatty workflows. Neither
is a safe default; the question is which cost a given boundary can better afford.

Backward-compatible additive changes ease rolling adoption. Explicit versions
simplify breaking change boundaries while multiplying supported surfaces —
clarity at the moment of the break, paid for with more surfaces to keep alive
afterward.

Strict input rejection catches mistakes. Tolerant reading helps evolution but
can conceal misspelled fields: a field the provider quietly ignored looks exactly
like one it accepted.

::activity{id="api-design-mat1"}

## The verdict on the response that always said 200

Back to the partner team and their branch on a string.

Was the service wrong about what happened? No — it knew which orders it had
created. Was the client wrong to read the body? Also no — the body was the only
place the answer was written down.

What failed was the errors entry on the checklist. Responses distinguish
success, client correction, conflict, rate limiting, dependency failure, and
unknown server failure, and this API distinguished none of them where generic
tooling could see. A caller who sent a malformed field and one who hit a real
conflict received the same signal, and only one of them had anything to gain
from sending it again.

The repair is not a richer error body. It is those six outcome classes made
visible in the part of the response HTTP already standardizes, plus the
idempotency key that makes a repeated delivery safe once a caller can tell which
outcome it received.

## Sources

- IETF, [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) (accessed 2026-07-18) — standardized method and status semantics under an application-specific design
