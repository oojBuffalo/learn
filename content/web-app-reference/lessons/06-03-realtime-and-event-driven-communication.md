---
id: realtime-and-event-driven-communication
title: "Realtime and Event-Driven Communication"
summary: Why a page left open on a train comes back telling the truth about its own inbox and nothing about the build, and where a message stops being a fact.
objectives:
  - Separate what a transport delivered from what a system has committed
  - Match polling, streams, sockets, queues and logs to direction, latency, durability, fan-out and recovery
  - Read a delivery symptom for what it eliminates rather than for what it suggests
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [backend-request-lifecycle, transactions-and-consistency]
tags: [apis-and-integration]
---

## The build page that stopped being true

Someone leaves a build page open, loses signal on a train, and comes back to a
page still showing the build as running. It finished while they
were away. Nothing on that page is wrong about any message it received. It never
received the ones that mattered.

A disconnected browser misses transient events and shows stale state. The page is
not lying about the build. It is telling the truth about its own inbox, which is
a different subject.

## A message is not a fact

Realtime communication delivers updates while a client remains interested.
Event-driven communication publishes facts or commands for asynchronous
processing. Both replace a simple call stack with delivery, ordering, replay, and
lifecycle concerns — four concerns a function call never had. A function call
cannot be delivered twice, or arrive after the caller has gone.

So separate transport delivery from application truth. A message says “something
was delivered”; an authoritative record says “this effect is committed.” Two
sentences with two different authors, and the page on the train had quietly
merged them: it read the absence of a message as the absence of a change. The
confusion runs the other way too, when publishing before a database commit
exposes facts that may roll back.

Consumers should be able to reconnect, deduplicate, and reconstruct state.

::activity{id="realtime-and-event-driven-communication-mc1"}

## Five mechanisms, and five questions to put to them

The model helps choose polling, server-sent streams, WebSockets, queues, or logs
based on direction, latency, durability, fan-out, and recovery.

Polling repeatedly queries current state. Server-sent events stream
server-to-browser text updates. WebSocket provides a handshake followed by framed
two-way data transfer. Queues distribute jobs, while append-only logs retain
ordered records for consumer positions — the log holds the order, and the
consumer holds its own place in it.

Acknowledgements, leases, offsets, retry topics, and dead-letter queues express
delivery progress. They exist because these mechanisms connect browser sessions,
backend services, workers, and derived projections outside a single
request-response transaction, where nothing else says how far the work has got.

## A build status that survives a reconnect

A build system commits build status, then publishes an outbox event. Workers and
notification consumers deduplicate by event ID. Browser clients receive hints over
a stream but refetch the current build representation after reconnect, so missed
hints do not corrupt state. Read it downward.

```text
build status committed     (the authoritative record)
  |
  v
outbox event published
  |
  +--> workers            dedupe by event ID
  |
  +--> notifications      dedupe by event ID
  |
  === branch: the browser, which can miss things ===
  |
  v
stream hint arrives, or does not
  |
  v
on reconnect, refetch the representation
```

The order of the first two steps is the entire design. The commit goes first, so
the outbox event describes something that has already happened rather than
something that may still roll back.

Deduplication sits with the consumers rather than the transport: the workers and
the notification consumers each do it by event ID.

Then the browser gets hints rather than truth. A hint says something changed; the
refetch asks the authority what it changed to. That is why a missed hint costs a
delay here, and cost a wrong answer on the train.

::activity{id="realtime-and-event-driven-communication-ord1"}

## What each promise costs before you get to keep it

Polling is simple and self-healing but adds latency and repeated work. Persistent
connections reduce update delay while consuming connection state and requiring
heartbeats and reconnect policy.

Then the promise itself. At-most-once delivery may lose work. At-least-once
requires idempotent consumers. Globally exactly-once business effects usually
require narrower transactional definitions, which is a way of saying the
guarantee is bought by shrinking what “exactly once” is permitted to cover.

::activity{id="realtime-and-event-driven-communication-ms1"}

## What each delivery symptom rules out

These faults all look like the system being generally unwell, so ask what each
one actually eliminates.

**One message retried forever while everything else moves** rules out capacity.
Poison messages retry forever, and consumers that fall permanently behind are a
separate entry on the list — the queue here is not slow, it is stuck on one item.

**A screen behind the record** rules out the record. A disconnected browser
misses transient events and shows stale state, and the authority still says what
is committed. The repair is on the recovery path, not in the data.

**A fact announced and then untrue** rules out the consumer. Publishing before a
database commit exposes facts that may roll back, so the consumer handled a real
message correctly and the message should never have existed.

**Two events handled in the wrong relative order** rules out your ordering
assumption rather than the transport. Consumers assume global order across
partitions, while append-only logs retain ordered records for consumer positions
— read together, ordered within a log is not a promise of order across them.

And the page on the train ruled out nothing at all, because it was never asked.
It sat displaying its last delivered message as though a message were a fact, and
no reconnect ever asked the authority what had actually committed.

## Sources

- IETF, [RFC 6455: The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455.html) (accessed 2026-07-18) — a handshake followed by framed two-way data transfer
