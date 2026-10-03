---
id: backend-request-lifecycle
title: "Backend Request Lifecycle"
summary: Why a perfectly well-formed request can still be an impossible one, and what each step of the pipeline is actually being asked.
objectives:
  - Separate the questions parsing, authentication, authorization and validation each answer
  - Locate a backend failure at the pipeline step whose answer was over-read
  - Weigh the middleware, layering, transaction and streaming decisions a lifecycle forces
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [clients-servers-and-resources, data-fetching]
tags: [backend]
---

## The request that was valid and impossible

A request arrives carrying well-formed JSON. Every field decodes. Every type is
the type the handler expected. The handler runs, and the application ends up in
a state none of its rules would have permitted.

Nothing rejected the request, because nothing had been asked to. Decoding proved
the shape of the message. Whether the message meant something this caller was
allowed to ask for is a different question, asked at a different step — and
trusting decoded JSON before validating meaning is one of the recurring errors
of backend handlers.

## From an untrusted message to a bounded response

The backend request lifecycle converts an untrusted protocol message into an
authorized application operation and then into a bounded response. Three words
there do the work. *Untrusted*, because the message came off the network.
*Authorized*, because something between arrival and execution has to establish
who is asking and whether the effect they want is permitted. *Bounded*, because
the response has limits — on size, on time, and on what it discloses.

The lifecycle begins after a server accepts an HTTP request and ends when
response content is committed or streamed. In between it coordinates
dependencies without making transport details the domain model. An ordered
pipeline is what prevents validation, identity, transactions, and error mapping
from being duplicated inconsistently across handlers; the alternative is not
“no pipeline” but the same pipeline written slightly differently in every
handler.

Cross-cutting middleware surrounds, but should not obscure, the application
behavior.

## Nine steps, and why the order is the argument

```text
parse → establish deadline/trace → authenticate → route
→ authorize → validate → execute use case
→ serialize → observe
```

Some steps overlap, but their responsibilities remain distinct.

Parsing applies size and syntax limits, the first bound placed on an untrusted
message. Request context then carries deadline, cancellation, correlation,
locale, and principal, so nothing downstream re-derives it. Routing selects a
handler.

Then the pair the opening scene got wrong. Authentication establishes identity;
authorization checks the requested effect — adjacent, and not the same question:
who this is, and whether this is allowed. Validation follows, converting
transport data to typed input: meaning rather than shape.

Application code coordinates persistence and dependencies. Error mapping then
produces stable HTTP status semantics without leaking internals, which bounds
the response in the same way size limits bounded the request.

::activity{id="backend-request-lifecycle-ord1"}

## Where the same mistake keeps getting made

Trusting decoded JSON before validating meaning, authorizing only at route
level, swallowing cancellation, returning success before durable work, and
logging credentials are recurring errors.

Listed like that they look unrelated. Read against the pipeline they are one
move repeated: a step's answer taken as the answer to a question it was never
asked. Decoding is not validation. Reaching a route is not permission to affect
the resource that route names. A handler returning is not durable work having
happened.

Catch-all exception handling belongs to the same family and is worse, because it
conceals the others: it can convert programming defects into misleading business
responses, so a defect leaves the building dressed as a rule.

::activity{id="backend-request-lifecycle-mc1"}

## One PATCH, and the two status codes it can produce

`PATCH /profiles/42` verifies content type and size, authenticates the session,
checks permission for profile `42`, parses a constrained display name, invokes
`updateProfile`, commits, and returns the new representation.

Notice permission is checked for profile `42` — for the profile, not the route.
Notice too that the display name is *constrained*, which is validation doing the
job decoding could not.

Two things can go wrong, and they leave by different doors. A uniqueness
conflict becomes a stable `409`: the caller asked for something the application
understands and refuses, and a stable status is what lets them act on it. An
unexpected database error becomes an opaque `500` tied to a trace ID: the caller
learns nothing about the internals, and an operator can still find the request.
That is error mapping producing stable HTTP status semantics without leaking
internals.

::activity{id="backend-request-lifecycle-ms1"}

## The decision each layer forces, and what it costs

Every part of this pipeline is a decision somebody makes, and each has a price
attached.

**How much lives in middleware.** Middleware centralizes repeated policy — the
entire argument for a pipeline. The cost is that order becomes
significant: policy that used to be visible inside a handler is now a position
in a list, and moving it changes behavior.

**How thin the controllers are.** Thin controllers keep HTTP separate from use
cases, so an operation can be reached from somewhere other than a route. Overdo
it and the cost is just as real: excessive layering turns a simple request into
indirection.

**When the transaction opens.** Opening a transaction early simplifies
atomicity — one boundary around everything. It also holds locks during remote
calls, which is that same boundary seen from the database's side.

**Whether the response streams.** Streaming reduces buffering. It also prevents
changing the status after headers are sent, so committing early forecloses the
error mapping above: a `500` cannot replace a status already sent.

The pipeline gets an order, the controller gets a thickness, the transaction
gets a moment, and the response gets committed — whether or not anyone chose.

## Sources

- IETF, [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) (accessed 2026-07-18) — error mapping produces stable HTTP status semantics without leaking internals
