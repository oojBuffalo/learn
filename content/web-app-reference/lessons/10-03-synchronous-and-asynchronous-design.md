---
id: synchronous-and-asynchronous-design
title: "Synchronous and Asynchronous Design"
summary: Why a screen can truthfully report that a request was accepted and still be wrong to say the work is done, and where the authoritative answer lives once acceptance and completion have been pulled apart.
objectives:
  - Separate durable acceptance from completion, and place each one in the asynchronous shape
  - Attach queues, state machines, correlation IDs and idempotency to the question each of them answers
  - Judge which named failure a described flow is committing, and where its authoritative state sits
estimatedMinutes: 12
difficulty: advanced
prerequisites: [monoliths-modules-and-microservices]
tags: [architecture]
---

## The confirmation that arrived before the work did

A customer submits a form and the page reports that the request has been
completed. The work has not been done. It is waiting behind other work, and it
will finish shortly, or fail and be retried, or fail and stop.

Nobody lied. The request really was accepted, durably, and it will probably
finish. The failure named here is narrower than a bug: users receive “success”
when work is only queued. The screen described a state the system had not
reached.

## Acceptance is not completion

Synchronous interaction keeps the caller waiting for a result. Asynchronous
interaction separates acceptance from completion and communicates later through
state, messages, or callbacks.

Both blocks below read downward.

```text
synchronous
  request
    -> outcome, inside one deadline

asynchronous
  request
    -> durable acceptance
    -> processing
    -> query or notification of outcome
```

The synchronous shape has two positions and one deadline. The asynchronous
shape has four, and the second is the one that gets misread: durable acceptance
is a real recorded fact, and it is not the outcome.

A warning comes with the model. “Async” syntax inside a process does not by
itself create durable asynchronous architecture. A call that does not block
while it waits is still a call inside one deadline.

## What buffers, what remembers, and what survives a repeat

Synchronous HTTP calls follow request-response semantics while application
completion can still be asynchronous. Queues buffer asynchronous work and
provide acknowledgement or retry. State machines expose pending and terminal
states. Correlation IDs connect later results. Idempotency and deduplication
handle repeated delivery.

Four of them answer different questions the second shape raises. Where does
work wait: a queue. What does the caller ask later: a state machine, which needs a
name for pending as well as for done. How does an
answer find the request that asked for it: a correlation ID. What happens when
the same work arrives twice: idempotency and deduplication.

The named failures gather at the same distinction. Long synchronous chains
multiply latency and failure. Queues become hidden databases without retention
planning. A system acknowledges before persisting intent. Users receive
“success” when work is only queued. Consumers assume one delivery or global
ordering.
Compensations are treated as exact reversal when external effects cannot be
undone.

::activity{id="synchronous-and-asynchronous-design-ms1"}

## A password reset where the email is not the promise

Password reset request validation is synchronous, but email delivery is
asynchronous. The server commits a reset record and outbox event, returns a
neutral accepted response, and a worker sends idempotently. The reset link's
existence, not email delivery, is the authoritative state.

Four moves, and the order is the argument. Validation runs while the caller
waits, so a malformed request is refused inside one deadline. The record and
the outbox event commit together, which is what stops the system acknowledging
before persisting intent. Only then does the neutral response go back. The
worker sends afterward, idempotently, because the send may be attempted more
than once.

The last sentence relocates the truth. Ask whether a reset exists and the
answer is in the record, not in the delivery. Delivery can be slow, retried, or
lost, and none of that changes whether the reset was issued.

::activity{id="synchronous-and-asynchronous-design-ord1"}

## Waiting, buffering, and the coupling a queue does not remove

Synchronous flows are simple when work is fast and dependencies reliable.
Asynchronous flows absorb bursts and isolate availability but add storage,
workers, delayed feedback, ordering, and repair. Request-reply over a queue
retains much synchronous coupling with more infrastructure. Events reduce
direct knowledge but broaden compatibility obligations.

The third catches people out. Putting a queue between two services does not
make the caller independent of the callee while it still waits for the reply.
It moves the wait and adds infrastructure to hold it.

The fourth trades one kind of knowledge for another. Nobody has to know who
consumes an event, and everybody has to keep it readable by consumers they
cannot name.

::activity{id="synchronous-and-asynchronous-design-mc1"}

## The verdict on the early confirmation

Was the acceptance real? Yes. The request was accepted durably, which is the
second position in the shape and a fact the system can be asked about
afterward.

Was the screen wrong? Yes, and precisely. It reported completion, and
completion is the fourth position. The distance between the second and the
fourth is what the asynchronous shape is for, and a message that collapses them
hands the user a state the system has not reached.

What should it have said? The password reset gives the pattern: a neutral
accepted response, with the authoritative state somewhere that can be consulted
later. Acceptance is reportable the moment it is durable. Completion is
reportable when a query or a notification says so.

Three of the other named failures are not versions of this one. A consumer
that assumes one delivery, a queue with no retention plan, and a compensation
treated as an exact reversal are separate mistakes about delivery, storage, and
reversibility. The claim here is narrow: a report went out for a position the
work had not reached.

## Sources

- IETF, [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) (accessed 2026-07-18) — synchronous HTTP calls following request-response semantics while application completion can still be asynchronous
