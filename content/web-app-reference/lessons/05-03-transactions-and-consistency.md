---
id: transactions-and-consistency
title: "Transactions and Consistency"
summary: Why two people can both be told they claimed the same ticket, and where a correctness boundary stops traveling with the work.
objectives:
  - Read atomicity, isolation and durability as three questions a design has to answer
  - Choose a concurrency mechanism from the failure it is meant to prevent
  - Tell what a concurrency symptom eliminates from what it merely suggests
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [domain-and-application-logic]
tags: [data]
---

## Two agents claim the same ticket

Two agents open the same unassigned ticket and click claim within the same second. Both
screens say it worked. The ticket has one assignee, and one of those two people
is about to spend the morning on work that is not theirs.

Nothing exotic happened. It was two reads, two decisions and two writes, arranged
so that each decision was correct when it was made and wrong by the time it was
written. Read-modify-write without concurrency control loses updates, and the
update lost here was a decision about who is doing the work.

## A boundary, and a set of permitted observations

A transaction groups operations into a correctness boundary. Consistency
describes which states and observations a system permits, especially under
concurrency, replication, and failure — the states data may be in, and what
someone looking is allowed to see.

Between them they prevent lost updates, duplicate effects, partial workflows, and
promises the chosen storage or messaging design cannot keep. Three of those are
things that happen to a system; the fourth, in this lesson's reading, is
something a design said.

Boundaries have edges. Transactions protect local invariants in a data store,
while application workflows coordinate transactions with remote APIs, events,
caches, and user-visible status. Read “local” literally: what a transaction
guarantees, it guarantees inside one store.

## Three questions, and what answers them

Atomicity asks whether these changes commit together. Isolation asks what
concurrent work may observe. Durability asks what survives acknowledged success.
Application consistency adds the actual business rules on top of all three.

Databases implement concurrency control through locks, versions, or combinations.
Isolation levels permit different anomalies and costs; PostgreSQL documents Read
Committed, Repeatable Read, and Serializable behaviors. Three more mechanisms sit
alongside those. Optimistic concurrency compares a version before update.
Idempotency associates repeated commands with one logical effect. Outbox records
connect a committed database change to later message delivery.

::activity{id="transactions-and-consistency-mc1"}

## The ticket, claimed once

Now do it properly. An atomic update succeeds only when `status = 'open'`,
returning the changed row. One agent wins; the other sees a conflict.

Read the condition first. Putting `status = 'open'` in the update moves the check
into the write itself, so testing and changing happen in one operation instead of
two with a gap between them. Read the return second: returning the changed row is
what tells the winner it won. The other agent seeing a conflict is not a failure
to be smoothed over. It is the correct outcome for the second click, and the only
one that does not require inventing an answer about who owns the ticket.

Then the notification, which is placed in an outbox in the same transaction and
delivered idempotently afterward. Two clauses, two jobs. In the same transaction,
because outbox records connect a committed database change to later message
delivery, and a notification about a claim that never committed is a message
about nothing. Idempotently, because retrying a transaction that calls a remote
service duplicates effects, and idempotency associates repeated commands with one
logical effect.

::activity{id="transactions-and-consistency-mat1"}

## Stronger isolation, longer transactions, wider boundaries

Three ways to pay for correctness, and they are not interchangeable.

Stronger isolation simplifies reasoning but may abort or serialize more work. Long
transactions retain resources and increase contention — one reason to prefer a
single conditional update over a read, a pause while somebody decides, and a
write.

Width is the third. Distributed transactions coordinate participants but add
availability and operational costs. Sagas accept intermediate states and define
compensating actions, which are business operations rather than database
rollback: nothing is undone, and a different operation is performed to make up
for what happened.

::activity{id="transactions-and-consistency-ms1"}

## What each concurrency symptom rules out

These faults arrive looking like ordinary outcomes, so the useful question is
what each one eliminates.

**A total that drifts low under load** rules out the write path being broken.
Every write succeeded. Read-modify-write without concurrency control loses
updates, and a lost update is two correct writes where the second read a value
the first had already replaced.

**A duplicated effect on a remote service** rules out the database. Retrying a
transaction that calls a remote service duplicates effects, and the transaction
rolled back exactly as designed. The remote call was never inside the boundary
that rolled back.

**A client that cannot tell whether its request worked** rules out both. A
response can be lost after commit, making the client outcome unknown, so the
record is right, the effect happened, and the acknowledgement is the only thing
missing. That is why the repair is idempotency rather than a more reliable
response.

**“Eventually consistent”** rules out nothing, which is the point. Without a
convergence rule, a time bound, or a user state, it is not a design — it is a
description of what a system does when nobody chose any of the three.

And the two agents? Both clicks were honest and both reads were current. What was
missing was a correctness boundary around the decision, which is this lesson's
first sentence arriving as a support ticket.

## Sources

- PostgreSQL Global Development Group, [Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) (accessed 2026-07-18) — isolation levels permit different anomalies and costs
