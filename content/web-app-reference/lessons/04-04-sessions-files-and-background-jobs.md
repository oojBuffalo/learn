---
id: sessions-files-and-background-jobs
title: "Sessions, Files, and Background Jobs"
summary: Why a worker can arrive before the record it was told about, and what three mechanisms that outlive a request all demand in return.
objectives:
  - Treat the durable record as the authority and the queue as delivery
  - Weigh the two orderings of commit and enqueue, and name what each one costs
  - Read a background-system symptom back to the handler decision behind it
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [clients-servers-and-resources, data-fetching]
tags: [backend]
---

## The worker that arrived before the record

A video finishes uploading. A transcode worker picks the job up, looks for the
record it was told about, and finds nothing there. A moment later the record
exists, and by then the worker has already failed.

Nothing was lost and nothing was misrouted. The message was delivered faster
than the data it referred to: enqueuing before a transaction commits can let a
worker observe missing data. Two systems learned about the same event in the
wrong order, and only one of them was ever meant to be authoritative.

## Three mechanisms, four demands each

Sessions preserve user-associated state across stateless HTTP requests. File
systems and object stores manage byte objects with lifecycles unlike database
rows. Background jobs move work outside the interactive response while
introducing delivery and progress semantics.

They read like three unrelated features and they are one family: each handles a
need that does not fit a short, isolated request. That is also what makes them
expensive. Each requires explicit ownership, expiration, security, and failure
behavior — four questions an ordinary request handler never had to answer,
because work that starts and ends inside one exchange has an obvious owner, end,
and failure.

Placement follows. Sessions join identity to requests. File
storage usually sits behind signed or authorized access. Jobs connect request
handlers to queues and workers, often updating durable application state.

## The record is often the authority; the queue is delivery

```text
request → durable intent/record
        → enqueue reference → worker effect
        ↘ immediate status response
        ↘ progress/result
```

The database record is often the authority; the queue is a delivery mechanism.
Read the diagram with that in mind and the enqueue step shrinks: it carries a
reference to something that already exists, not the thing itself.

The mechanisms underneath are specific to each. A session identifier maps a
browser credential to server-side state, or a signed token carries selected
claims. Uploads are streamed, type-checked by content and policy, scanned where
appropriate, and stored under generated names. Job queues provide leasing or
acknowledgement, retries, delay, and dead-letter handling.

And workers need idempotent operations, because at-least-once delivery can
repeat work. A worker that cannot safely run twice is a worker that cannot
safely be retried, which removes most of the reason for a queue.

::activity{id="sessions-files-and-background-jobs-ord1"}

## One video, from intent to a status endpoint

A video upload creates an authorized upload intent and object key. Completion
records the object and an outbox event in one transaction. A worker claims the
event, transcodes idempotently, records progress, and exposes status through a
query endpoint.

Every clause answers one of the four demands. The authorized upload intent is
security, settled before a byte moves. The generated object key is ownership.
The single transaction is the repair for the opening scene: the object and the
event become durable together, so there is no window in which one exists without
the other. Transcoding idempotently is failure behavior, because at-least-once
delivery can repeat work. And the status query endpoint is what asynchrony
costs — background work improves response latency while making completion
asynchronous, so somebody has to be able to ask how it is going.

::activity{id="sessions-files-and-background-jobs-mc1"}

## Sessions on the server, or claims in the token

Server-side sessions are revocable and small on the client but require shared
storage. Self-contained tokens reduce lookups but complicate revocation and
claim freshness. The lookup is the trade: a token that answers without asking
anything cannot be told that the answer has changed.

Uploads have the same shape. Direct-to-object-storage uploads save backend
bandwidth but need scoped authorization, because the bytes no longer pass
through the place that would have checked them.

Background work is the third instance: it improves response latency while making
completion asynchronous, so the response gets faster by no longer being the
thing that reports the outcome.

::activity{id="sessions-files-and-background-jobs-ms1"}

## What a missing record, a lost notification and a repeat each rule out

A background system fails where the request that started it cannot see, so the
symptom usually turns up without its cause attached. What each one eliminates:

**A worker that finds no record** rules out the queue. The message arrived —
that is why the worker is running at all. Enqueuing before a transaction commits
can let a worker observe missing data, so the fault is an ordering decision in
the handler rather than a delivery failure.

**A notification that never arrives** rules out the opposite ordering being
free. Committing before enqueue can lose the notification without an outbox or
repair process, which is why the video's completion records the object and an
outbox event in one transaction instead of picking a side.

**Work done twice** rules out a delivery bug. At-least-once delivery can repeat
work, so a repeat is the contract behaving as described, and idempotent
operations are what it asks for in exchange.

**A store full of objects nothing refers to** rules out the job pipeline.
Orphaned uploads are named as a file-storage failure rather than a job failure,
and the reason is in the definition: file systems and object stores manage byte
objects with lifecycles unlike database rows, so expiration has to be arranged
rather than inherited.

## Sources

- OWASP, [Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) (accessed 2026-07-18) — a session identifier maps a browser credential to server-side state, or a signed token carries selected claims
